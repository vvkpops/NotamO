// FIXED api/notams.js - Enhanced date parsing
// ============================================

// Enhanced parseNotamDate function with better error handling and logging
function parseNotamDate(dateString, context = 'unknown') {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const upperDateString = dateString.toUpperCase().trim();
    
    // Handle PERMANENT variations
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Handle standard ISO 8601 format (e.g., from API or ambiguous formats)
    if (upperDateString.includes('T')) {
        let isoString = dateString;
        // If 'Z' is missing, append it to treat the date as UTC
        if (!upperDateString.endsWith('Z')) {
            isoString += 'Z';
        }
        const d = new Date(isoString);
        if (isNaN(d.getTime())) {
            console.warn(`Failed to parse ISO date: ${dateString} (context: ${context})`);
            return null;
        }
        return d.toISOString();
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
            console.warn(`Invalid date components in string: ${dateString} (context: ${context})`);
            return null;
        }

        const offsetHours = TIMEZONE_OFFSETS[timezoneCode];
        if (offsetHours === undefined) {
            console.warn(`Unknown timezone: ${timezoneCode} in ${dateString}, treating as UTC (context: ${context})`);
        }
        
        const actualOffsetHours = offsetHours || 0;
        
        // Construct a UTC date by applying the offset manually
        const tempDate = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1, // Month is 0-indexed
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
        ));

        if (isNaN(tempDate.getTime())) {
            console.warn(`Could not form a valid temporary date from: ${dateString} (context: ${context})`);
            return null;
        }
        
        // Adjust for the timezone offset. If EST (-5), we ADD 5 hours to get to UTC.
        const utcTime = tempDate.getTime() - (actualOffsetHours * 60 * 60 * 1000);
        const utcDate = new Date(utcTime);

        if (isNaN(utcDate.getTime())) {
            console.warn(`Invalid UTC date after conversion for: ${dateString} (context: ${context})`);
            return null;
        }
        
        return utcDate.toISOString();
    }
    
    console.warn(`Could not parse date: ${dateString} (context: ${context})`);
    return null;
}

// Enhanced NOTAM processing for NAV CANADA
function processNavCanadaNotam(notam, icao) {
    let originalRawText = 'Full NOTAM text not available from source.';
    
    // Safely parse the nested JSON in the 'text' field
    try {
        const parsedText = JSON.parse(notam.text);
        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
    } catch (e) {
        // If 'text' is not JSON, use it directly as a fallback
        if (typeof notam.text === 'string') {
            originalRawText = notam.text;
        }
        console.warn(`Could not parse nested JSON in NAV CANADA NOTAM text for PK ${notam.pk}. Using raw text field.`);
    }

    // Parse the raw text to extract structured data
    const parsed = parseRawNotam(originalRawText);
    
    console.log(`Processing NAV CANADA NOTAM ${notam.pk}:`, {
        hasRawText: !!originalRawText,
        parsed: !!parsed,
        validFromRaw: parsed?.validFromRaw,
        validToRaw: parsed?.validToRaw,
        apiStart: notam.startValidity,
        apiEnd: notam.endValidity
    });

    // **ENHANCED DATE PARSING LOGIC**
    // 1. Prioritize parsed raw dates from B) and C) lines
    // 2. Fallback to top-level API dates only if raw parsing fails
    const validFrom = parseNotamDate(parsed?.validFromRaw, 'B-line') || 
                     parseNotamDate(notam.startValidity, 'API-start');
                     
    const validTo = parseNotamDate(parsed?.validToRaw, 'C-line') || 
                   parseNotamDate(notam.endValidity, 'API-end');

    console.log(`Final dates for NOTAM ${notam.pk}:`, {
        validFrom, 
        validTo,
        fromSource: parsed?.validFromRaw ? 'B-line' : 'API',
        toSource: parsed?.validToRaw ? 'C-line' : (notam.endValidity ? 'API' : 'null')
    });

    const notamObj = {
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
    
    return notamObj;
}

// Update the main handler to use the enhanced processing
export default async function handler(request, response) {
    // ... CORS headers same as before ...

    const icao = (request.query.icao || '').toUpperCase();
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
        return response.status(400).json({ error: "Invalid ICAO code provided" });
    }

    try {
        let faaItems = [];
        let notamsFromSource = [];
        
        // Try FAA first
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed: ${e.message}`);
        }

        // Enhanced fallback logic for Canadian ICAOs
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`FAA returned no NOTAMs for Canadian ICAO ${icao}. Falling back to NAV CANADA.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                // Use the enhanced processing function
                notamsFromSource = navNotams.map(notam => processNavCanadaNotam(notam, icao)).filter(Boolean);

            } catch (e) {
                console.warn(`NAV CANADA fallback fetch for ${icao} also failed: ${e.message}`);
            }
        } else {
            // Process FAA NOTAMs (same as before)
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                
                return {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: parseNotamDate(core.effectiveStart, 'FAA-start'),
                    validTo: parseNotamDate(core.effectiveEnd, 'FAA-end'),
                    source: 'FAA',
                    isCancellation: parseRawNotam(originalRawText)?.isCancellation || false,
                    cancels: parseRawNotam(originalRawText)?.cancelsNotam || null,
                    icao: core.icaoLocation || icao,
                    summary: originalRawText,
                    rawText: originalRawText,
                };
            });
        }
        
        // Filter and sort logic remains the same...
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

// Timezone offset registry
const TIMEZONE_OFFSETS = {
    // Standard North American Timezones
    'EST': -5,   'CST': -6,   'MST': -7,   'PST': -8,   'AST': -4,   'NST': -3.5, 'AKST': -9,  'HST': -10,
    // Daylight Saving Time variants
    'EDT': -4,   'CDT': -5,   'MDT': -6,   'PDT': -7,   'ADT': -3,   'NDT': -2.5, 'AKDT': -8,
    // UTC variants
    'UTC': 0,    'GMT': 0,    'Z': 0,      'ZULU': 0,
    // European Timezones
    'CET': 1,    'EET': 2,    'WET': 0,    'CEST': 2,   'EEST': 3,   'WEST': 1,   'BST': 1,
    // Other common aviation timezones
    'JST': 9,    'AEST': 10,  'AEDT': 11,  'AWST': 8,   'NZST': 12,  'NZDT': 13,
};
