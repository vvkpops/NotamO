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
 * ENHANCED C) Line Extraction for Canadian NOTAMs
 * This function handles various NOTAM formats including malformed layouts
 */
function extractCLineFromNotam(notamText) {
    if (!notamText || typeof notamText !== 'string') {
        console.warn('❌ No NOTAM text provided for C) line extraction');
        return null;
    }

    // Method 1: Standard format with optional timezone
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

    // Method 3: Line-by-line extraction for complex formatting
    const lines = notamText.split(/[\n\r]+/);
    for (const line of lines) {
        if (line.includes('C)')) {
            // Extract everything after C) until next field or end
            const afterC = line.split(/C\)/i)[1];
            if (afterC) {
                // Clean up by removing subsequent fields
                const cleaned = afterC.trim().split(/\s+[D-Z]\)/)[0].trim();
                
                // Check if it's a valid datetime or PERM
                if (/^\d{10}[A-Z]{0,4}/.test(cleaned) || /^PERM/i.test(cleaned)) {
                    console.log(`✅ Found C) line (line-by-line): "${cleaned}"`);
                    return cleaned;
                }
            }
        }
    }

    // Method 4: Desperate search for datetime after C)
    const desperateMatch = notamText.match(/C\)[^0-9]*(\d{10}[A-Z]{0,4})/i);
    if (desperateMatch) {
        console.log(`✅ Found C) line (desperate search): "${desperateMatch[1]}"`);
        return desperateMatch[1].trim();
    }

    console.warn('❌ Could not extract C) line from NOTAM');
    return null;
}

/**
 * Enhanced date parsing with timezone support
 * Handles both FAA and Canadian NOTAM date formats
 */
function parseNotamDateEnhanced(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const upperDateString = dateString.toUpperCase().trim();
    
    // Handle PERM/PERMANENT
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Handle standard ISO 8601 format (from FAA or NAV CANADA API)
    if (upperDateString.includes('T')) {
        let isoString = dateString;
        // If no timezone indicator, assume UTC
        if (!upperDateString.endsWith('Z')) {
            isoString += 'Z';
        }
        const d = new Date(isoString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    
    // Handle YYMMDDHHMM format with optional timezone (e.g., 2511051800EST)
    const match = upperDateString.match(/^(\d{10})([A-Z]{0,4})?$/);
    if (match) {
        const dt = match[1];
        const timezoneCode = match[2] || 'UTC'; // Default to UTC if no timezone
        
        const year = parseInt(dt.substring(0, 2));
        const fullYear = year <= 50 ? 2000 + year : 1900 + year;
        const month = parseInt(dt.substring(2, 4));
        const day = parseInt(dt.substring(4, 6));
        const hour = parseInt(dt.substring(6, 8));
        const minute = parseInt(dt.substring(8, 10));

        // Validate date components
        if (month < 1 || month > 12 || day < 1 || day > 31 || 
            hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            console.warn(`Invalid date components in: ${dateString}`);
            return null;
        }

        // Create date in UTC
        const tempDate = new Date(Date.UTC(fullYear, month - 1, day, hour, minute, 0, 0));
        
        if (isNaN(tempDate.getTime())) {
            console.warn(`Invalid date created from: ${dateString}`);
            return null;
        }
        
        // Apply timezone offset if present
        const offsetHours = TIMEZONE_OFFSETS[timezoneCode] || 0;
        if (timezoneCode !== 'UTC' && offsetHours === 0) {
            console.warn(`Unknown timezone: ${timezoneCode}, treating as UTC`);
        }
        
        // Adjust for timezone (if EST is -5, we ADD 5 hours to get UTC)
        const utcTime = tempDate.getTime() - (offsetHours * 60 * 60 * 1000);
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

/**
 * Enhanced parsing for Canadian NOTAMs with better C) line extraction
 */
function parseCanadianNotam(notam, icao) {
    let originalRawText = 'Full NOTAM text not available from source.';
    
    // Safely parse the nested JSON in the 'text' field
    try {
        if (typeof notam.text === 'string') {
            const parsedText = JSON.parse(notam.text);
            originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || notam.text;
        }
    } catch (e) {
        if (typeof notam.text === 'string') {
            originalRawText = notam.text;
        }
        console.warn(`Could not parse nested JSON for NOTAM PK ${notam.pk}`);
    }

    // Parse the raw text to extract structured data
    const parsed = parseRawNotam(originalRawText);
    
    console.log(`\n🍁 Processing Canadian NOTAM ${parsed?.notamNumber || notam.pk}`);

    // Enhanced date parsing with C) line extraction
    let validFrom = null;
    let validTo = null;

    // Parse B) line (valid from) - prioritize raw text, fallback to API
    if (parsed?.validFromRaw) {
        validFrom = parseNotamDateEnhanced(parsed.validFromRaw);
    }
    if (!validFrom && notam.startValidity) {
        validFrom = parseNotamDateEnhanced(notam.startValidity);
    }

    // ENHANCED C) line parsing - especially for null endValidity cases
    if (notam.endValidity === null || notam.endValidity === undefined) {
        console.log('⚠️ API endValidity is null, using enhanced C) line extraction');
        
        // Try direct C) line extraction
        const cLineContent = extractCLineFromNotam(originalRawText);
        if (cLineContent) {
            validTo = parseNotamDateEnhanced(cLineContent);
            console.log(`✅ Extracted C) line: "${cLineContent}" → ${validTo}`);
        } else if (parsed?.validToRaw) {
            // Fallback to parsed validToRaw
            validTo = parseNotamDateEnhanced(parsed.validToRaw);
            console.log(`✅ Used parsed validToRaw: ${parsed.validToRaw} → ${validTo}`);
        }
    } else {
        // API has endValidity, but still prioritize C) line for accuracy
        const cLineContent = extractCLineFromNotam(originalRawText);
        if (cLineContent) {
            validTo = parseNotamDateEnhanced(cLineContent);
        } else if (parsed?.validToRaw) {
            validTo = parseNotamDateEnhanced(parsed.validToRaw);
        } else {
            // Last resort: use API endValidity
            validTo = parseNotamDateEnhanced(notam.endValidity);
        }
    }

    // Log results
    if (!validTo) {
        console.warn(`❌ Failed to parse validTo for NOTAM ${parsed?.notamNumber || notam.pk}`);
        // Try to show what we found in the raw text for debugging
        const cLineMatch = originalRawText.match(/C\)[^\n\r]*/i);
        if (cLineMatch) {
            console.warn(`   C) line found but not parsed: "${cLineMatch[0]}"`);
        }
    } else {
        console.log(`✅ Successfully parsed dates - From: ${validFrom}, To: ${validTo}`);
    }

    return {
        id: notam.pk || `${icao}-navcanada-${Date.now()}`,
        number: parsed?.notamNumber || 'N/A',
        validFrom: validFrom,
        validTo: validTo,
        source: 'NAV CANADA',
        isCancellation: parsed?.isCancellation || false,
        cancels: parsed?.cancelsNotam || null,
        icao: parsed?.aerodrome?.split(' ')[0] || icao,
        summary: originalRawText,
        rawText: originalRawText,
        _debug: {
            apiEndValidityWasNull: notam.endValidity === null,
            extractedCLine: extractCLineFromNotam(originalRawText),
            parsedValidToRaw: parsed?.validToRaw
        }
    };
}

// Function to format dates for ICAO format (kept from original)
const formatToIcaoDate = (isoDate) => {
    if (!isoDate || isoDate === 'PERMANENT' || isoDate === 'PERM') return 'PERM';
    
    const upperDate = isoDate.toString().toUpperCase();
    if (upperDate.includes('PERM') || upperDate.includes('PERMANENT')) return 'PERM';
    
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return isoDate;
        
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

// Main handler function
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
        
        // PRIMARY SOURCE: Always try FAA first for ALL airports
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
            console.log(`✅ FAA returned ${faaItems.length} NOTAMs for ${icao}`);
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}.`);
            // Continue execution, fallback might be triggered
        }

        // FALLBACK LOGIC: If Canadian ICAO AND FAA returned zero results, try NAV CANADA
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`🍁 FAA returned no NOTAMs for Canadian ICAO ${icao}. Falling back to NAV CANADA.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                console.log(`📊 Found ${navNotams.length} NOTAMs from NAV CANADA for ${icao}`);
                
                // Process with enhanced Canadian NOTAM parser
                notamsFromSource = navNotams.map(notam => parseCanadianNotam(notam, icao)).filter(Boolean);
                
                // Log statistics
                const nullEndDates = notamsFromSource.filter(n => n.validTo === null).length;
                const successfulEndDates = notamsFromSource.filter(n => n.validTo !== null).length;
                
                console.log(`✅ Enhanced parsing complete for ${icao}:`);
                console.log(`   Total NOTAMs: ${notamsFromSource.length}`);
                console.log(`   Successful end dates: ${successfulEndDates}`);
                console.log(`   Failed end dates: ${nullEndDates}`);
                
                if (nullEndDates > 0) {
                    console.warn(`⚠️ ${nullEndDates} NOTAMs still have null end dates after enhanced parsing`);
                }

            } catch (e) {
                console.warn(`NAV CANADA fallback fetch for ${icao} also failed: ${e.message}`);
            }
        } else {
            // Process FAA NOTAMs (keep original logic)
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                
                return {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: parseNotamDateEnhanced(core.effectiveStart),
                    validTo: parseNotamDateEnhanced(core.effectiveEnd),
                    source: 'FAA',
                    isCancellation: parseRawNotam(originalRawText)?.isCancellation || false,
                    cancels: parseRawNotam(originalRawText)?.cancelsNotam || null,
                    icao: core.icaoLocation || icao,
                    summary: originalRawText,
                    rawText: originalRawText,
                };
            });
        }
        
        // Filter out cancelled NOTAMs
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
                if (cancelledNotamNumbers.has(n.number)) {
                    console.log(`🗑️ Filtering out cancelled NOTAM: ${n.number}`);
                    return false;
                }
                // Keep cancellation NOTAMs themselves
                if (n.isCancellation) return true;
                // Keep permanent NOTAMs
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                // Filter expired NOTAMs
                const validToDate = new Date(n.validTo);
                const isExpired = !isNaN(validToDate.getTime()) && validToDate < now;
                if (isExpired) {
                    console.log(`⏰ Filtering out expired NOTAM: ${n.number}`);
                    return false;
                }
                return true;
            })
            .sort((a, b) => {
                // Sort by validity date (newest first)
                if (a.validFrom === 'PERMANENT') return 1;
                if (b.validFrom === 'PERMANENT') return -1;
                const dateA = new Date(a.validFrom || 0);
                const dateB = new Date(b.validFrom || 0);
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                return dateB - dateA;
            });

        console.log(`📊 Final results for ${icao}: ${finalNotams.length} active NOTAMs (from ${notamsFromSource.length} total)`);

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
