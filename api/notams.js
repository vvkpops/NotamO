import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

// Comprehensive timezone offset registry (in hours from UTC)
const TIMEZONE_OFFSETS = {
    // Standard North American Timezones
    'EST': -5,   // Eastern Standard Time
    'CST': -6,   // Central Standard Time
    'MST': -7,   // Mountain Standard Time
    'PST': -8,   // Pacific Standard Time
    'AST': -4,   // Atlantic Standard Time
    'NST': -3.5, // Newfoundland Standard Time
    'AKST': -9,  // Alaska Standard Time
    'HST': -10,  // Hawaii Standard Time
    
    // Daylight Saving Time variants
    'EDT': -4,   // Eastern Daylight Time
    'CDT': -5,   // Central Daylight Time
    'MDT': -6,   // Mountain Daylight Time
    'PDT': -7,   // Pacific Daylight Time
    'ADT': -3,   // Atlantic Daylight Time
    'NDT': -2.5, // Newfoundland Daylight Time
    'AKDT': -8,  // Alaska Daylight Time
    
    // UTC variants
    'UTC': 0,
    'GMT': 0,
    'Z': 0,
    'ZULU': 0,
    
    // European Timezones
    'CET': 1,    // Central European Time
    'EET': 2,    // Eastern European Time
    'WET': 0,    // Western European Time
    'CEST': 2,   // Central European Summer Time
    'EEST': 3,   // Eastern European Summer Time
    'WEST': 1,   // Western European Summer Time
    'BST': 1,    // British Summer Time
    
    // Other common aviation timezones
    'JST': 9,    // Japan Standard Time
    'AEST': 10,  // Australian Eastern Standard Time
    'AEDT': 11,  // Australian Eastern Daylight Time
    'AWST': 8,   // Australian Western Standard Time
    'NZST': 12,  // New Zealand Standard Time
    'NZDT': 13,  // New Zealand Daylight Time
};

/**
 * Parses a date string from various NOTAM formats into a standard ISO 8601 string (UTC).
 * This function is the single source of truth for date parsing.
 * @param {string | null | undefined} dateString The date string (e.g., "2511051800EST", "2025-09-02T12:08:00Z").
 * @returns {string|null} ISO 8601 formatted date string, 'PERMANENT', or null if invalid.
 */
function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const upperDateString = dateString.toUpperCase().trim();
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Handle standard ISO 8601 format (e.g., from FAA or ambiguous NAVCAN)
    if (upperDateString.includes('T')) {
        let isoString = dateString;
        // If 'Z' is missing, append it to treat the date as UTC.
        // This is crucial for handling NAV CANADA's ambiguous date format like "2025-08-26T17:31:00"
        if (!upperDateString.endsWith('Z')) {
            isoString += 'Z';
        }
        const d = new Date(isoString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    
    // Handle YYMMDDHHMM format with optional timezone (e.g., 2511051800EST, 2511051800PST)
    const match = upperDateString.match(/^(\d{10})([A-Z]{2,4})?$/);
    if (match) {
        const dt = match[1];
        const timezoneCode = match[2] || 'UTC'; // Default to UTC if no timezone specified
        
        const year = `20${dt.substring(0, 2)}`;
        const month = dt.substring(2, 4);
        const day = dt.substring(4, 6);
        const hour = dt.substring(6, 8);
        const minute = dt.substring(8, 10);

        // Validate date components
        if (parseInt(month) < 1 || parseInt(month) > 12 || parseInt(day) < 1 || parseInt(day) > 31 || 
            parseInt(hour) < 0 || parseInt(hour) > 23 || parseInt(minute) < 0 || parseInt(minute) > 59) {
            console.warn(`Invalid date components in string: ${dateString}`);
            return null;
        }

        const offsetHours = TIMEZONE_OFFSETS[timezoneCode];
        if (offsetHours === undefined) {
            console.warn(`Unknown timezone: ${timezoneCode}, treating as UTC`);
        }
        
        const actualOffsetHours = offsetHours || 0;
        
        // Construct a UTC date by applying the offset manually
        // This avoids issues with the server's local timezone
        const tempDate = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1, // Month is 0-indexed
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
        ));

        if (isNaN(tempDate.getTime())) {
            console.warn(`Could not form a valid temporary date from: ${dateString}`);
            return null;
        }
        
        // Adjust for the timezone offset. If EST (-5), we ADD 5 hours to get to UTC.
        const utcTime = tempDate.getTime() - (actualOffsetHours * 60 * 60 * 1000);
        const utcDate = new Date(utcTime);

        if (isNaN(utcDate.getTime())) {
            console.warn(`Invalid UTC date after conversion for: ${dateString}`);
            return null;
        }
        
        return utcDate.toISOString();
    }
    
    console.warn(`Could not parse date: ${dateString}`);
    return null;
}


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
        
        // --- Step 1: Always fetch from FAA first ---
        try {
            console.log(`Primary fetch for ${icao} from FAA.`);
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
            console.log(`FAA returned ${faaItems.length} NOTAMs for ${icao}.`);
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}.`);
            // Continue execution, fallback might be triggered
        }

        // --- Step 2: Process FAA NOTAMs ---
        notamsFromSource = faaItems.map(item => {
            const core = item.properties?.coreNOTAMData?.notam || {};
            const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
            const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
            
            // The raw text is the single source of truth for dates.
            const parsed = parseRawNotam(originalRawText);

            // **DEFINITIVE DATE PARSING LOGIC**
            // 1. Prioritize parsed raw dates from C) line if API date is null.
            // 2. Fallback to top-level API dates.
            const validFrom = parseNotamDate(parsed?.validFromRaw) || parseNotamDate(core.effectiveStart);
            let validTo = parseNotamDate(core.effectiveEnd);

            // If API end date is null, try to parse from C) line
            if (core.effectiveEnd === null && parsed?.validToRaw) {
                console.log(`FAA effectiveEnd is null for ${core.number}. Attempting to parse C) line: "${parsed.validToRaw}"`);
                validTo = parseNotamDate(parsed.validToRaw);
            }
            
            return {
                id: core.id || `${core.number}-${core.icaoLocation}`,
                number: core.number || 'N/A',
                validFrom: validFrom,
                validTo: validTo,
                source: 'FAA',
                isCancellation: parsed?.isCancellation || false,
                cancels: parsed?.cancelsNotam || null,
                icao: core.icaoLocation || icao,
                summary: originalRawText, // Summary is the full text for consistency
                rawText: originalRawText,
            };
        });
        
        // --- Step 3: Fallback to NAV CANADA if FAA returns no results AND it's a Canadian ICAO ---
        if (notamsFromSource.length === 0 && icao.startsWith('C')) {
            console.log(`FAA returned no NOTAMs for Canadian ICAO ${icao}. Falling back to NAV CANADA.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    // Safely parse the nested JSON in the 'text' field
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        if (typeof notam.text === 'string') {
                            originalRawText = notam.text;
                        }
                        console.warn(`Could not parse nested JSON in NAV CANADA NOTAM text for PK ${notam.pk}. Fallback to raw text field.`);
                    }

                    // The raw text is the single source of truth for dates.
                    const parsed = parseRawNotam(originalRawText);

                    // **DEFINITIVE DATE PARSING LOGIC**
                    const validFrom = parseNotamDate(parsed?.validFromRaw) || parseNotamDate(notam.startValidity);
                    let validTo = parseNotamDate(notam.endValidity);

                    // If API end date is null, try to parse from C) line
                    if (notam.endValidity === null && parsed?.validToRaw) {
                        console.log(`NAV CANADA endValidity is null for ${parsed.notamNumber}. Attempting to parse C) line: "${parsed.validToRaw}"`);
                        validTo = parseNotamDate(parsed.validToRaw);
                    }
                    
                    return {
                        id: notam.pk || `${icao}-navcanada-${notam.startValidity}`,
                        number: parsed?.notamNumber || 'N/A',
                        validFrom: validFrom,
                        validTo: validTo,
                        source: 'NAV CANADA',
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                        icao: parsed?.aerodrome?.split(' ')[0] || icao,
                        summary: originalRawText,
                        rawText: originalRawText,
                    };
                }).filter(Boolean);

            } catch (e) {
                console.warn(`NAV CANADA fallback fetch for ${icao} also failed: ${e.message}`);
            }
        }
        
        const cancelledNotamNumbers = new Set();
        notamsFromSource.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
            }
        });

        const now = new Date();
        const finalNotams = notamsFromSource
            .filter(n => {
                if (cancelledNotamNumbers.has(n.number)) return false;
                if (n.isCancellation) return true;
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                const validToDate = new Date(n.validTo);
                return isNaN(validToDate.getTime()) ? true : validToDate >= now;
            })
            .sort((a, b) => {
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
