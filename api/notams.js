import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

// A more robust date parser
const parseDate = (s) => {
    if (!s || s === 'PERMANENT') return null;
    let iso = s.trim().replace(' ', 'T');
    if (!/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
};

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
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}.`);
        }

        let combinedNotams = faaItems.map(item => {
            const core = item.properties?.coreNOTAMData?.notam || {};
            
            // Use the formatted ICAO text if available, otherwise fall back to the raw text
            const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
            const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
            
            const parsed = parseRawNotam(originalRawText);

            // Create the NOTAM object
            const notamObj = {
                id: core.id || `${core.number}-${core.icaoLocation}`,
                number: core.number || 'N/A',
                validFrom: core.effectiveStart,
                validTo: core.effectiveEnd,
                source: 'FAA',
                isCancellation: parsed?.isCancellation || false,
                cancels: parsed?.cancelsNotam || null,
                icao: core.icaoLocation || icao
            };

            // If we have the formatted ICAO text, use it directly
            if (formattedIcaoText) {
                notamObj.summary = formattedIcaoText;
                notamObj.rawText = formattedIcaoText;
            } else if (originalRawText && originalRawText.includes('Q)') && originalRawText.includes('A)') && originalRawText.includes('E)')) {
                // Already in ICAO format, use as-is
                notamObj.summary = originalRawText;
                notamObj.rawText = originalRawText;
            } else {
                // Format to ICAO standard and set both summary and rawText
                const formattedRawText = formatNotamToIcao(notamObj, originalRawText);
                notamObj.summary = formattedRawText;
                notamObj.rawText = formattedRawText;
            }

            return notamObj;
        });

        // Handle NAV CANADA data for Canadian airports
        if (icao.startsWith('C')) {
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 5000 });
                const navNotams = navRes.data?.Alpha?.notam || [];
                
                const navParsed = navNotams.map(notam => {
                    const originalRawText = notam.text?.replace(/\\n/g, '\n') || 'Full NOTAM text not available from source.';
                    const parsed = parseRawNotam(originalRawText);

                    const notamObj = {
                        id: notam.id || `${icao}-navcanada-${notam.start}`,
                        number: notam.id || 'N/A',
                        validFrom: notam.start,
                        validTo: notam.end,
                        source: 'NAV CANADA',
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                        icao: icao
                    };

                    // Format to ICAO standard and set both summary and rawText
                    const formattedRawText = formatNotamToIcao(notamObj, originalRawText);
                    notamObj.summary = formattedRawText;
                    notamObj.rawText = formattedRawText;

                    return notamObj;
                });
                
                // Only add NAV CANADA NOTAMs that aren't already in FAA data
                const faaNumbers = new Set(combinedNotams.map(n => n.number));
                const uniqueNavNotams = navParsed.filter(n => !faaNumbers.has(n.number));
                combinedNotams.push(...uniqueNavNotams);

            } catch (e) {
                console.warn(`NAV CANADA fetch for ${icao} failed: ${e.message}`);
            }
        }
        
        // Filter out cancelled NOTAMs
        const cancelledNotamNumbers = new Set();
        combinedNotams.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
            }
        });

        const now = new Date();
        const finalNotams = combinedNotams
            .filter(n => {
                if (cancelledNotamNumbers.has(n.number)) {
                    return false;
                }
                if (n.isCancellation) return true;
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                const validToDate = parseDate(n.validTo);
                return validToDate ? validToDate >= now : true;
            })
            .sort((a, b) => {
                const dateA = parseDate(a.validFrom);
                const dateB = parseDate(b.validFrom);
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateB - dateA;
            });

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
