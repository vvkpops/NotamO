import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

/**
 * Parses a date string from a NOTAM, which can be in YYMMDDHHMM format,
 * potentially with a timezone like EST. Defaults to UTC if no timezone is found.
 * Also handles standard ISO 8601 strings from the FAA API.
 * @param {string} dateString The date string from the NOTAM (e.g., "2509122359EST" or "2025-09-02T12:08:00Z").
 * @returns {string|null} ISO 8601 formatted date string or 'PERMANENT' or null.
 */
function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    
    const upperDateString = dateString.toUpperCase();
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Check if it's already a valid ISO-like format from FAA
    if (upperDateString.includes('T') && upperDateString.includes('Z')) {
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    
    // Match YYMMDDHHMM and an optional timezone (like EST, EDT, UTC, GMT, Z)
    const match = upperDateString.match(/^(\d{10})([A-Z]{3,4})?$/);
    if (!match) {
        // Fallback for dates that might already be ISO but missing 'Z'
        const d = new Date(upperDateString.endsWith('Z') ? upperDateString : upperDateString + 'Z');
        return isNaN(d.getTime()) ? null : d.toISOString();
    }

    const [, dt, tz] = match;
    const year = `20${dt.substring(0, 2)}`;
    const month = dt.substring(2, 4);
    const day = dt.substring(4, 6);
    const hour = dt.substring(6, 8);
    const minute = dt.substring(8, 10);

    let isoString = `${year}-${month}-${day}T${hour}:${minute}:00`;

    // Handle timezones. Default to UTC (Z) if not specified or not recognized.
    if (tz === 'EST') {
        isoString += '-05:00'; // Eastern Standard Time
    } else if (tz === 'EDT') {
        isoString += '-04:00'; // Eastern Daylight Time
    } else {
        isoString += 'Z'; // Assume UTC for Z, UTC, GMT, or unspecified
    }

    const date = new Date(isoString);
    return isNaN(date.getTime()) ? null : date.toISOString();
}


// Function to format dates for ICAO format (YYMMDDHHMM)
const formatToIcaoDate = (isoDate) => {
    if (!isoDate || isoDate === 'PERMANENT' || isoDate === 'PERM') return 'PERM';
    
    // Handle various permanent indicators
    const upperDate = isoDate.toString().toUpperCase();
    if (upperDate.includes('PERM') || upperDate.includes('PERMANENT')) return 'PERM';
    
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return isoDate; // Return original if not a valid date
        
        const year = date.getUTCFullYear().toString().slice(-2);
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        const hour = date.getUTCHours().toString().padStart(2, '0');
        const minute = date.getUTCMinutes().toString().padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}`;
    } catch (e) {
        return isoDate;
    }
};

// Function to ensure NOTAM is in proper ICAO format
const formatNotamToIcao = (notam, originalRawText) => {
    // First, try to use the original raw text if it's already in ICAO format
    if (originalRawText && originalRawText.includes('Q)') && originalRawText.includes('A)')) {
        return originalRawText;
    }

    // Parse the raw text to extract structured data
    const parsed = parseRawNotam(originalRawText) || {};
    
    // Build ICAO format manually if parsing succeeded
    let icaoFormatted = '';
    
    // Add NOTAM number if available
    if (notam.number && notam.number !== 'N/A') {
        icaoFormatted += `${notam.number}`;
        if (parsed.isCancellation && parsed.cancelsNotam) {
            icaoFormatted += ` NOTAMC ${parsed.cancelsNotam}`;
        }
        icaoFormatted += '\n';
    }
    
    // Q line - use parsed data or construct basic one
    if (parsed.qLine && parsed.qLine.trim() !== '') {
        icaoFormatted += `Q) ${parsed.qLine}\n`;
    } else {
        // Construct basic Q line if missing - try to use airport code from notam
        const airportCode = parsed.aerodrome || notam.icao || 'CZVR';
        icaoFormatted += `Q) ${airportCode}/QXXXX/IV/M/A/000/999/0000N00000W000\n`;
    }
    
    // A line - Aerodrome
    if (parsed.aerodrome && parsed.aerodrome.trim() !== '') {
        icaoFormatted += `A) ${parsed.aerodrome}\n`;
    } else if (notam.icao) {
        icaoFormatted += `A) ${notam.icao}\n`;
    }
    
    // B line - Valid from
    if (parsed.validFromRaw && parsed.validFromRaw.trim() !== '') {
        icaoFormatted += `B) ${parsed.validFromRaw}\n`;
    } else if (notam.validFrom) {
        const fromDate = formatToIcaoDate(notam.validFrom);
        icaoFormatted += `B) ${fromDate}\n`;
    }
    
    // C line - Valid to
    if (parsed.validToRaw && parsed.validToRaw.trim() !== '') {
        icaoFormatted += `C) ${parsed.validToRaw}\n`;
    } else if (notam.validTo) {
        const toDate = formatToIcaoDate(notam.validTo);
        if (toDate && toDate !== 'PERM') {
            icaoFormatted += `C) ${toDate}\n`;
        } else if (toDate === 'PERM') {
            icaoFormatted += `C) PERM\n`;
        }
    }
    
    // D line - Schedule (if available)
    if (parsed.schedule && parsed.schedule.trim() !== '') {
        icaoFormatted += `D) ${parsed.schedule}\n`;
    }
    
    // E line - Body text
    if (parsed.body && parsed.body.trim() !== '') {
        icaoFormatted += `E) ${parsed.body}`;
    } else if (originalRawText) {
        // Fallback to original text for E line
        icaoFormatted += `E) ${originalRawText.replace(/\n/g, ' ').trim()}`;
    }
    
    return icaoFormatted.trim();
};

export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Vary', 'Origin');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    const icao = (request.query.icao || '').toUpperCase();
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
        return response.status(400).json({ error: "Invalid ICAO code provided" });
    }

    try {
        let faaItems = [];
        let notamsFromSource = [];
        
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}.`);
            // Continue execution, fallback might be triggered
        }

        // *** FALLBACK LOGIC FOR CANADIAN ICAO ***
        // If the ICAO is Canadian AND the FAA fetch returned zero results, try NAV CANADA.
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`FAA returned no NOTAMs for Canadian ICAO ${icao}. Falling back to NAV CANADA.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                // Correctly access the data array
                const navNotams = navRes.data?.data || [];
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    // The 'text' field is a stringified JSON, so we must parse it first.
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        console.warn(`Could not parse nested JSON in NAV CANADA NOTAM text for PK ${notam.pk}`);
                    }

                    const parsed = parseRawNotam(originalRawText);

                    const notamObj = {
                        id: notam.pk || `${icao}-navcanada-${notam.startValidity}`,
                        // Extract number from the raw text itself using the parser
                        number: parsed.notamNumber || 'N/A',
                        // Prioritize dates parsed from raw text as they contain timezones
                        validFrom: parseNotamDate(parsed.validFromRaw) || parseNotamDate(notam.startValidity),
                        validTo: parseNotamDate(parsed.validToRaw) || parseNotamDate(notam.endValidity),
                        source: 'NAV CANADA', // Set source to NAV CANADA
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                        icao: icao
                    };
                    
                    // The raw text is already in ICAO format, so we can use it directly.
                    notamObj.summary = originalRawText;
                    notamObj.rawText = originalRawText;

                    return notamObj;
                }).filter(Boolean); // Filter out any potential nulls from failed parsing

            } catch (e) {
                console.warn(`NAV CANADA fallback fetch for ${icao} also failed: ${e.message}`);
                // If fallback also fails, notamsFromSource remains an empty array.
            }
        } else {
            // Default behavior: Process FAA NOTAMs
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                const parsed = parseRawNotam(originalRawText);

                const notamObj = {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: parseNotamDate(core.effectiveStart),
                    validTo: parseNotamDate(core.effectiveEnd),
                    source: 'FAA', // Set source to FAA
                    isCancellation: parsed?.isCancellation || false,
                    cancels: parsed?.cancelsNotam || null,
                    icao: core.icaoLocation || icao
                };

                if (formattedIcaoText) {
                    notamObj.summary = formattedIcaoText;
                    notamObj.rawText = formattedIcaoText;
                } else if (originalRawText && originalRawText.includes('Q)') && originalRawText.includes('A)') && originalRawText.includes('E)')) {
                    notamObj.summary = originalRawText;
                    notamObj.rawText = originalRawText;
                } else {
                    const formattedRawText = formatNotamToIcao(notamObj, originalRawText);
                    notamObj.summary = formattedRawText;
                    notamObj.rawText = formattedRawText;
                }
                return notamObj;
            });
        }
        
        // Identify which NOTAMs are cancelled by another NOTAM
        const cancelledNotamNumbers = new Set();
        notamsFromSource.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
            }
        });

        const now = new Date();
        const finalNotams = notamsFromSource
            .filter(n => {
                // Remove NOTAMs that have been explicitly cancelled
                if (cancelledNotamNumbers.has(n.number)) {
                    return false;
                }
                // Keep cancellation NOTAMs for now; they will be filtered on the client
                if (n.isCancellation) {
                    return true;
                }
                // Keep NOTAMs that are permanent or have no end date
                if (!n.validTo || n.validTo === 'PERMANENT') {
                    return true;

                }
                // Keep NOTAMs that have not expired yet
                const validToDate = new Date(n.validTo);
                return isNaN(validToDate.getTime()) ? true : validToDate >= now;
            })
            .sort((a, b) => {
                // Handle permanent NOTAMs during sorting
                if (a.validFrom === 'PERMANENT') return 1;
                if (b.validFrom === 'PERMANENT') return -1;
                const dateA = new Date(a.validFrom || 0);
                const dateB = new Date(b.validFrom || 0);
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                return dateB - dateA;
            });

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
