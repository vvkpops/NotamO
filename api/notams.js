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
    'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5, 'MST': -7, 'MDT': -6, 
    'PST': -8, 'PDT': -7, 'UTC': 0, 'GMT': 0, 'Z': 0, 'ZULU': 0,
    'AST': -4, 'NST': -3.5, 'AKST': -9, 'HST': -10, 'ADT': -3, 'NDT': -2.5, 'AKDT': -8,
    'CET': 1, 'EET': 2, 'WET': 0, 'CEST': 2, 'EEST': 3, 'WEST': 1, 'BST': 1,
    'JST': 9, 'AEST': 10, 'AEDT': 11, 'AWST': 8, 'NZST': 12, 'NZDT': 13
};

/**
 * FINAL CORRECTED: Parse NOTAM dates to match FAA API output format exactly
 * @param {string | null | undefined} dateString The date string
 * @returns {string|null} ISO 8601 formatted date string, 'PERMANENT', or null if invalid
 */
function parseNotamDate(dateString) {
    try {
        if (!dateString || typeof dateString !== 'string') {
            return null;
        }
        
        const upperDateString = dateString.toUpperCase().trim();
        
        // Handle permanent dates
        if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
            return 'PERMANENT';
        }

        // Handle ISO format (FAA and NAV CANADA API format)
        // FIXED: More specific check to prevent "EST" from being detected as ISO
        if (upperDateString.includes('T') && upperDateString.includes('-') && upperDateString.includes(':')) {
            let isoString = dateString;
            if (!upperDateString.endsWith('Z')) {
                isoString += 'Z'; // Add Z if missing (NAV CANADA API format)
            }
            const d = new Date(isoString);
            if (isNaN(d.getTime())) {
                console.warn(`❌ Invalid ISO date: ${dateString}`);
                return null;
            }
            return d.toISOString(); // Returns format like "2025-11-26T21:00:00.000Z"
        }
        
        // Handle YYMMDDHHMM format with timezone suffix (NAV CANADA raw format)
        const match = upperDateString.match(/^(\d{10})([A-Z]{2,5})?$/);
        if (match) {
            const dateDigits = match[1];
            const timezoneCode = match[2] || 'UTC';
            
            // Extract date components from YYMMDDHHMM
            const year = parseInt(`20${dateDigits.substring(0, 2)}`);
            const month = parseInt(dateDigits.substring(2, 4));
            const day = parseInt(dateDigits.substring(4, 6));
            const hour = parseInt(dateDigits.substring(6, 8));
            const minute = parseInt(dateDigits.substring(8, 10));

            // Validate components
            if (month < 1 || month > 12 || day < 1 || day > 31 || 
                hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                console.warn(`❌ Invalid date components: ${dateString} -> ${year}-${month}-${day} ${hour}:${minute}`);
                return null;
            }

            // Get timezone offset
            const offsetHours = TIMEZONE_OFFSETS[timezoneCode];
            if (offsetHours === undefined) {
                console.warn(`⚠️ Unknown timezone: ${timezoneCode} in ${dateString}, treating as UTC`);
            }
            
            const actualOffsetHours = offsetHours !== undefined ? offsetHours : 0;
            
            // Create UTC timestamp and adjust for timezone
            const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
            const adjustedTimestamp = utcTimestamp - (actualOffsetHours * 60 * 60 * 1000);
            const utcDate = new Date(adjustedTimestamp);

            if (isNaN(utcDate.getTime())) {
                console.warn(`❌ Invalid final date after timezone conversion: ${dateString}`);
                return null;
            }
            
            return utcDate.toISOString(); // Returns format like "2025-11-26T21:00:00.000Z"
        }
        
        console.warn(`❓ Unrecognized date format: ${dateString}`);
        return null;
        
    } catch (error) {
        console.error(`💥 Error parsing date "${dateString}":`, error);
        return null;
    }
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

    console.log(`🛩️ Processing NOTAM request for ${icao} at ${new Date().toISOString()}`);

    try {
        let faaItems = [];
        let notamsFromSource = [];
        
        // Try FAA API first
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
            console.log(`✅ FAA returned ${faaItems.length} NOTAMs for ${icao}`);
        } catch (e) {
            console.warn(`❌ FAA fetch failed for ${icao}: ${e.message}`);
        }

        // Fallback to NAV CANADA for Canadian ICAOs with no FAA results
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`🇨🇦 Trying NAV CANADA for Canadian ICAO ${icao}`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                console.log(`✅ NAV CANADA returned ${navNotams.length} NOTAMs for ${icao}`);
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    
                    // Parse the nested JSON in the 'text' field
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        if (typeof notam.text === 'string') {
                            originalRawText = notam.text;
                        }
                        console.warn(`⚠️ Could not parse JSON for NOTAM PK ${notam.pk}`);
                    }

                    // Parse raw text to extract structured data
                    const parsed = parseRawNotam(originalRawText);

                    // Parse dates with priority: raw text dates > API dates
                    const validFrom = parseNotamDate(parsed?.validFromRaw) || parseNotamDate(notam.startValidity);
                    const validTo = parseNotamDate(parsed?.validToRaw) || parseNotamDate(notam.endValidity);

                    // Create NOTAM object in same format as FAA
                    const notamObj = {
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
                    };
                    
                    // Log date parsing results for debugging
                    console.log(`📋 NOTAM ${notamObj.number}: validFrom=${validFrom}, validTo=${validTo}`);
                    
                    return notamObj;
                }).filter(Boolean);

            } catch (e) {
                console.warn(`❌ NAV CANADA fetch failed for ${icao}: ${e.message}`);
            }
        } else if (faaItems.length > 0) {
            // Process FAA NOTAMs
            console.log(`🇺🇸 Processing ${faaItems.length} FAA NOTAMs for ${icao}`);
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                
                // FAA dates are already in proper ISO format
                const validFrom = parseNotamDate(core.effectiveStart);
                const validTo = parseNotamDate(core.effectiveEnd);
                
                return {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: validFrom,
                    validTo: validTo,
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

        // Filter and sort NOTAMs
        const now = new Date();
        console.log(`📊 Filtering ${notamsFromSource.length} NOTAMs (current time: ${now.toISOString()})`);
        
        const finalNotams = notamsFromSource
            .filter(n => {
                // Remove cancelled NOTAMs
                if (cancelledNotamNumbers.has(n.number)) {
                    console.log(`🗑️ Filtered out cancelled NOTAM: ${n.number}`);
                    return false;
                }
                
                // Always include cancellation NOTAMs
                if (n.isCancellation) return true;
                
                // Include NOTAMs with no end date or PERMANENT
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                
                // Filter out expired NOTAMs
                try {
                    const validToDate = new Date(n.validTo);
                    if (isNaN(validToDate.getTime())) {
                        console.warn(`⚠️ Invalid validTo date for NOTAM ${n.number}: ${n.validTo}`);
                        return true; // Include if date is unparseable
                    }
                    
                    const isExpired = validToDate < now;
                    if (isExpired) {
                        console.log(`⏰ Filtered out expired NOTAM: ${n.number} (expired: ${n.validTo})`);
                        return false;
                    }
                    
                    return true;
                } catch (error) {
                    console.error(`💥 Error checking expiration for NOTAM ${n.number}:`, error);
                    return true; // Include if there's an error
                }
            })
            .sort((a, b) => {
                // Sort by validity date (newest first)
                if (a.validFrom === 'PERMANENT') return 1;
                if (b.validFrom === 'PERMANENT') return -1;
                
                try {
                    const dateA = new Date(a.validFrom || 0);
                    const dateB = new Date(b.validFrom || 0);
                    
                    if (isNaN(dateA.getTime())) return 1;
                    if (isNaN(dateB.getTime())) return -1;
                    
                    return dateB - dateA; // Newest first
                } catch (error) {
                    console.error(`💥 Error sorting NOTAMs:`, error);
                    return 0;
                }
            });

        console.log(`📋 Returning ${finalNotams.length} processed NOTAMs for ${icao}`);
        
        // Log sample NOTAM for debugging
        if (finalNotams.length > 0) {
            const sample = finalNotams[0];
            console.log(`📄 Sample NOTAM: ${sample.number} | From: ${sample.validFrom} | To: ${sample.validTo} | Source: ${sample.source}`);
        }

        // Set cache headers
        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`💥 API ERROR for ${icao}:`, err.message);
        console.error(err.stack);
        return response.status(500).json({ 
            error: "An internal server error occurred.",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
