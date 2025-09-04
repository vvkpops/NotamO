import axios from 'axios';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

// ENHANCED TIMEZONE OFFSETS
const TIMEZONE_OFFSETS = {
    'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5, 'MST': -7, 'MDT': -6,
    'PST': -8, 'PDT': -7, 'AST': -4, 'ADT': -3, 'NST': -3.5, 'NDT': -2.5,
    'AKST': -9, 'AKDT': -8, 'HST': -10, 'UTC': 0, 'Z': 0, 'GMT': 0,
    'BST': 1, 'CET': 1, 'CEST': 2, 'EET': 2, 'EEST': 3
};

/**
 * Parse raw NOTAM text to extract structured fields
 * Enhanced version specifically for Canadian NOTAMs
 */
function parseRawNotamEnhanced(rawText) {
    if (!rawText) return {};
    
    const result = {
        notamNumber: null,
        isCancellation: false,
        cancelsNotam: null,
        qLine: null,
        aerodrome: null,
        validFromRaw: null,
        validToRaw: null,
        schedule: null,
        body: null
    };

    // Extract NOTAM number
    const numberMatch = rawText.match(/([A-Z]\d{4}\/\d{2})/);
    if (numberMatch) {
        result.notamNumber = numberMatch[1];
    }

    // Check if it's a cancellation
    result.isCancellation = /NOTAMC/i.test(rawText);
    if (result.isCancellation) {
        const cancelsMatch = rawText.match(/NOTAMC\s+([A-Z]\d{4}\/\d{2})/);
        if (cancelsMatch) {
            result.cancelsNotam = cancelsMatch[1];
        }
    }

    // Extract Q) line
    const qMatch = rawText.match(/Q\)\s*([^\n\r]+)/);
    if (qMatch) {
        result.qLine = qMatch[1].trim();
    }

    // Extract A) aerodrome
    const aMatch = rawText.match(/A\)\s*([A-Z]{4})/);
    if (aMatch) {
        result.aerodrome = aMatch[1];
    }

    // Extract B) valid from (raw)
    const bMatch = rawText.match(/B\)\s*(\d{10}[A-Z]{0,4})/);
    if (bMatch) {
        result.validFromRaw = bMatch[1];
    }

    // Extract C) valid to (raw) - ENHANCED
    const cMatch = rawText.match(/C\)\s*(\d{10}[A-Z]{0,4}|PERM|PERMANENT)/i);
    if (cMatch) {
        result.validToRaw = cMatch[1].toUpperCase();
    }

    // Extract D) schedule
    const dMatch = rawText.match(/D\)\s*([^\n\r]+?)(?:\s+E\)|$)/);
    if (dMatch) {
        result.schedule = dMatch[1].trim();
    }

    // Extract E) body
    const eMatch = rawText.match(/E\)\s*(.+?)(?:\s+F\)|$)/s);
    if (eMatch) {
        result.body = eMatch[1].trim();
    }

    return result;
}

/**
 * ENHANCED C) Line Extraction - Specifically designed for Canadian NOTAMs
 */
function extractCLineEnhanced(notamText) {
    if (!notamText || typeof notamText !== 'string') {
        console.warn('❌ No NOTAM text provided for C) line extraction');
        return null;
    }

    // Method 1: Standard format with timezone
    const standardMatch = notamText.match(/C\)\s*(\d{10}[A-Z]{0,4})/i);
    if (standardMatch) {
        console.log(`✅ Found C) line (standard): "${standardMatch[1]}"`);
        return standardMatch[1].trim();
    }

    // Method 2: PERM/PERMANENT
    const permMatch = notamText.match(/C\)\s*(PERM|PERMANENT)/i);
    if (permMatch) {
        console.log('✅ Found C) line: PERMANENT');
        return 'PERM';
    }

    // Method 3: Line-by-line extraction for multiline NOTAMs
    const lines = notamText.split(/[\n\r]+/);
    for (const line of lines) {
        if (line.includes('C)')) {
            // Extract everything after C) until next field or end
            const afterC = line.split(/C\)/i)[1];
            if (afterC) {
                const cleaned = afterC.trim().split(/\s+[D-Z]\)/)[0].trim();
                if (/^\d{10}[A-Z]{0,4}/.test(cleaned) || /^PERM/i.test(cleaned)) {
                    console.log(`✅ Found C) line (line-by-line): "${cleaned}"`);
                    return cleaned;
                }
            }
        }
    }

    console.warn('❌ Could not extract C) line from NOTAM');
    return null;
}

/**
 * Parse NOTAM datetime with timezone handling
 */
function parseNotamDateTimeWithTimezone(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }

    const cleanString = dateString.trim().toUpperCase();
    
    // Handle PERM
    if (cleanString === 'PERM' || cleanString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Parse YYMMDDHHMM[TZ] format
    const match = cleanString.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([A-Z]{1,4})?$/);
    if (!match) {
        console.warn(`Invalid datetime format: ${dateString}`);
        return null;
    }

    const [, year, month, day, hour, minute, timezone] = match;

    // Convert 2-digit year
    let fullYear = parseInt(year);
    fullYear = fullYear <= 50 ? 2000 + fullYear : 1900 + fullYear;

    // Validate components
    const monthInt = parseInt(month);
    const dayInt = parseInt(day);
    const hourInt = parseInt(hour);
    const minuteInt = parseInt(minute);

    if (monthInt < 1 || monthInt > 12 || dayInt < 1 || dayInt > 31 || 
        hourInt < 0 || hourInt > 23 || minuteInt < 0 || minuteInt > 59) {
        console.warn(`Invalid date components in: ${dateString}`);
        return null;
    }

    try {
        // Create date in UTC first
        const utcDate = new Date(Date.UTC(fullYear, monthInt - 1, dayInt, hourInt, minuteInt, 0, 0));

        // Apply timezone offset if present
        if (timezone && TIMEZONE_OFFSETS[timezone]) {
            const offsetMs = TIMEZONE_OFFSETS[timezone] * 60 * 60 * 1000;
            utcDate.setTime(utcDate.getTime() - offsetMs);
            console.log(`Applied ${timezone} offset (${TIMEZONE_OFFSETS[timezone]} hours)`);
        }

        return utcDate.toISOString();
    } catch (error) {
        console.error(`Error parsing date ${dateString}:`, error);
        return null;
    }
}

/**
 * Process Canadian NOTAM with enhanced C) line extraction
 */
function processCanadianNotam(notam, icao) {
    let originalRawText = 'Full NOTAM text not available from source.';
    
    // Parse nested JSON in text field
    try {
        if (typeof notam.text === 'string') {
            const parsedText = JSON.parse(notam.text);
            originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || notam.text;
        }
    } catch (e) {
        if (typeof notam.text === 'string') {
            originalRawText = notam.text;
        }
    }

    const parsed = parseRawNotamEnhanced(originalRawText);
    console.log(`\n🍁 Processing Canadian NOTAM ${parsed.notamNumber || notam.pk}`);

    // Enhanced date parsing with better C) line extraction
    let validFrom = null;
    let validTo = null;

    // Parse B) line (valid from)
    if (parsed.validFromRaw) {
        validFrom = parseNotamDateTimeWithTimezone(parsed.validFromRaw);
    } else if (notam.startValidity) {
        validFrom = parseNotamDateTimeWithTimezone(notam.startValidity);
    }

    // ENHANCED C) line parsing - PRIMARY focus
    if (notam.endValidity === null || notam.endValidity === undefined) {
        console.log('⚠️ API endValidity is null, using enhanced C) line extraction');
        
        // Try direct C) line extraction first
        const cLineContent = extractCLineEnhanced(originalRawText);
        if (cLineContent) {
            validTo = parseNotamDateTimeWithTimezone(cLineContent);
            console.log(`✅ Extracted and parsed C) line: ${cLineContent} → ${validTo}`);
        } else if (parsed.validToRaw) {
            // Fallback to parsed validToRaw
            validTo = parseNotamDateTimeWithTimezone(parsed.validToRaw);
            console.log(`✅ Used parsed validToRaw: ${parsed.validToRaw} → ${validTo}`);
        }
    } else {
        // API has endValidity, but still try C) line first for accuracy
        const cLineContent = extractCLineEnhanced(originalRawText);
        if (cLineContent) {
            validTo = parseNotamDateTimeWithTimezone(cLineContent);
        } else if (parsed.validToRaw) {
            validTo = parseNotamDateTimeWithTimezone(parsed.validToRaw);
        } else {
            validTo = parseNotamDateTimeWithTimezone(notam.endValidity);
        }
    }

    console.log(`📊 Final dates - From: ${validFrom}, To: ${validTo}`);

    return {
        id: notam.pk || `${icao}-navcanada-${Date.now()}`,
        number: parsed.notamNumber || 'N/A',
        validFrom: validFrom,
        validTo: validTo,
        source: 'NAV CANADA',
        isCancellation: parsed.isCancellation || false,
        cancels: parsed.cancelsNotam || null,
        icao: parsed.aerodrome || icao,
        summary: originalRawText,
        rawText: originalRawText,
        _debug: {
            apiEndValidityWasNull: notam.endValidity === null,
            parsedValidToRaw: parsed.validToRaw,
            extractedCLine: extractCLineEnhanced(originalRawText),
            enhancedParsingUsed: true
        }
    };
}

/**
 * Main handler function
 */
export default async function handler(request, response) {
    // CORS headers
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
        let notamsFromSource = [];
        
        // Try FAA first for non-Canadian airports
        if (!icao.startsWith('C')) {
            try {
                const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
                const notamRes = await axios.get(faaUrl, {
                    headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                    timeout: 10000
                });
                
                const faaItems = notamRes.data?.items || [];
                
                // Process FAA NOTAMs (simplified - using existing logic)
                notamsFromSource = faaItems.map(item => {
                    const core = item.properties?.coreNOTAMData?.notam || {};
                    const formattedText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                    const rawText = formattedText || core.text || 'Full NOTAM text not available.';
                    
                    return {
                        id: core.id || `${core.number}-${core.icaoLocation}`,
                        number: core.number || 'N/A',
                        validFrom: parseNotamDateTimeWithTimezone(core.effectiveStart),
                        validTo: parseNotamDateTimeWithTimezone(core.effectiveEnd),
                        source: 'FAA',
                        icao: core.icaoLocation || icao,
                        summary: rawText,
                        rawText: rawText,
                    };
                });
            } catch (e) {
                console.warn(`FAA fetch for ${icao} failed: ${e.message}`);
            }
        }

        // Canadian airports - use NAV CANADA with enhanced parsing
        if (icao.startsWith('C') && notamsFromSource.length === 0) {
            console.log(`🍁 Processing Canadian ICAO ${icao} with enhanced parsing`);
            
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                console.log(`📊 Found ${navNotams.length} NOTAMs from NAV CANADA`);
                
                // Process each NOTAM with enhanced parsing
                notamsFromSource = navNotams.map(notam => processCanadianNotam(notam, icao)).filter(Boolean);
                
                // Log statistics
                const nullEndDates = notamsFromSource.filter(n => n.validTo === null).length;
                const successfulEndDates = notamsFromSource.filter(n => n.validTo !== null).length;
                
                console.log(`✅ Enhanced parsing complete for ${icao}:`);
                console.log(`   Total NOTAMs: ${notamsFromSource.length}`);
                console.log(`   Successful end dates: ${successfulEndDates}`);
                console.log(`   Failed end dates: ${nullEndDates}`);
                
                if (nullEndDates > 0) {
                    console.warn(`⚠️ ${nullEndDates} NOTAMs still have null end dates`);
                    notamsFromSource.filter(n => n.validTo === null).forEach(n => {
                        console.warn(`   - ${n.number}: Check raw text for C) line`);
                    });
                }
                
            } catch (e) {
                console.error(`NAV CANADA fetch for ${icao} failed: ${e.message}`);
                return response.status(500).json({ 
                    error: "Failed to fetch Canadian NOTAMs",
                    details: e.message 
                });
            }
        }
        
        // Filter out cancelled and expired NOTAMs
        const cancelledNotamNumbers = new Set();
        notamsFromSource.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
            }
        });

        const now = new Date();
        const finalNotams = notamsFromSource
            .filter(n => {
                // Remove cancelled NOTAMs
                if (cancelledNotamNumbers.has(n.number)) return false;
                
                // Keep cancellation NOTAMs
                if (n.isCancellation) return true;
                
                // Keep permanent NOTAMs
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                
                // Filter expired NOTAMs
                const validToDate = new Date(n.validTo);
                return isNaN(validToDate.getTime()) || validToDate >= now;
            })
            .sort((a, b) => {
                // Sort by validity date (newest first)
                if (a.validFrom === 'PERMANENT') return 1;
                if (b.validFrom === 'PERMANENT') return -1;
                
                const dateA = new Date(a.validFrom || 0);
                const dateB = new Date(b.validFrom || 0);
                
                return dateB - dateA;
            });

        console.log(`📊 Final summary for ${icao}: ${finalNotams.length} active NOTAMs`);
        
        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ 
            error: "An internal server error occurred.",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
