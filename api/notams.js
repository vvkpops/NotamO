import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

/**
 * Parse NOTAM dates to produce the exact same format as FAA API
 * Simplified approach - focus on the format, not complex timezone conversions
 * @param {string | null | undefined} dateString The date string
 * @returns {string|null} ISO 8601 formatted date string, 'PERMANENT', or null if invalid
 */
function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const trimmed = dateString.trim();
    const upperDateString = trimmed.toUpperCase();
    
    // Handle permanent dates
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Handle already-formatted ISO dates
    if (trimmed.includes('T') && trimmed.includes('-') && trimmed.includes(':')) {
        // This is already an ISO format date
        let isoString = trimmed;
        
        // If it doesn't end with Z, add it
        if (!upperDateString.endsWith('Z')) {
            isoString += 'Z';
        }
        
        const d = new Date(isoString);
        if (isNaN(d.getTime())) {
            console.warn(`❌ Invalid ISO date: ${dateString}`);
            return null;
        }
        
        return d.toISOString();
    }
    
    // Handle YYMMDDHHMM format (10 digits with optional timezone)
    const match = upperDateString.match(/^(\d{10})([A-Z]{2,5})?$/);
    if (match) {
        const dateDigits = match[1];
        const timezoneCode = match[2] || '';
        
        console.log(`🔍 Parsing date: ${dateString} -> digits: ${dateDigits}, timezone: ${timezoneCode}`);
        
        // Extract date components from YYMMDDHHMM
        const year = parseInt(`20${dateDigits.substring(0, 2)}`);
        const month = parseInt(dateDigits.substring(2, 4));
        const day = parseInt(dateDigits.substring(4, 6));
        const hour = parseInt(dateDigits.substring(6, 8));
        const minute = parseInt(dateDigits.substring(8, 10));

        // Validate components
        if (month < 1 || month > 12 || day < 1 || day > 31 || 
            hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            console.warn(`❌ Invalid date components: ${dateString}`);
            return null;
        }

        // Create date assuming UTC (we'll let the frontend handle display timezone)
        // The key insight: NOTAMs are aviation-focused, and aviation uses UTC/Zulu time
        // If there's no timezone suffix, it's likely already UTC
        // If there is a timezone suffix (like EST), we'll just note it but treat the time as-is
        const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

        if (isNaN(utcDate.getTime())) {
            console.warn(`❌ Invalid final date: ${dateString}`);
            return null;
        }
        
        const result = utcDate.toISOString();
        console.log(`✅ Converted ${dateString} -> ${result} (treating as UTC)`);
        
        // If the original had a timezone suffix, we could include it in a comment or note
        // but for consistency with FAA format, we return ISO format
        return result;
    }
    
    console.warn(`❓ Unrecognized date format: ${dateString}`);
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

    console.log(`🛩️ Processing NOTAM request for ${icao}`);

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

        // *** FALLBACK LOGIC FOR CANADIAN ICAO ***
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

                    console.log(`📄 Processing NAV CANADA NOTAM PK:${notam.pk}`);
                    
                    // First, let's see what dates the API provides directly
                    console.log(`📅 API dates - Start: "${notam.startValidity}", End: "${notam.endValidity}"`);

                    // Parse raw NOTAM text to extract structured data
                    const parsed = parseRawNotam(originalRawText);
                    
                    if (parsed?.validFromRaw || parsed?.validToRaw) {
                        console.log(`📋 Raw text dates - From: "${parsed.validFromRaw}", To: "${parsed.validToRaw}"`);
                    }

                    // Strategy: Try API dates first, fall back to parsed dates
                    // This avoids complex timezone issues
                    let validFrom = null;
                    let validTo = null;

                    // Check if API dates are already in ISO format
                    if (notam.startValidity && notam.startValidity.includes('T')) {
                        validFrom = parseNotamDate(notam.startValidity);
                    } else if (parsed?.validFromRaw) {
                        validFrom = parseNotamDate(parsed.validFromRaw);
                    } else if (notam.startValidity) {
                        validFrom = parseNotamDate(notam.startValidity);
                    }

                    if (notam.endValidity && notam.endValidity.includes('T')) {
                        validTo = parseNotamDate(notam.endValidity);
                    } else if (parsed?.validToRaw) {
                        validTo = parseNotamDate(parsed.validToRaw);
                    } else if (notam.endValidity) {
                        validTo = parseNotamDate(notam.endValidity);
                    }

                    console.log(`✅ Final dates - From: ${validFrom}, To: ${validTo}`);

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
                
                // FAA dates are already in correct format
                const validFrom = core.effectiveStart || null;
                const validTo = core.effectiveEnd || null;
                
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
        const finalNotams = notamsFromSource
            .filter(n => {
                if (cancelledNotamNumbers.has(n.number)) return false;
                if (n.isCancellation) return true;
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                
                try {
                    const validToDate = new Date(n.validTo);
                    return isNaN(validToDate.getTime()) ? true : validToDate >= now;
                } catch {
                    return true;
                }
            })
            .sort((a, b) => {
                if (a.validFrom === 'PERMANENT') return 1;
                if (b.validFrom === 'PERMANENT') return -1;
                
                try {
                    const dateA = new Date(a.validFrom || 0);
                    const dateB = new Date(b.validFrom || 0);
                    if (isNaN(dateA.getTime())) return 1;
                    if (isNaN(dateB.getTime())) return -1;
                    return dateB - dateA;
                } catch {
                    return 0;
                }
            });

        console.log(`📋 Returning ${finalNotams.length} processed NOTAMs for ${icao}`);
        
        // Log a sample NOTAM for debugging
        if (finalNotams.length > 0) {
            const sample = finalNotams[0];
            console.log(`📄 Sample NOTAM: ${sample.number} | From: ${sample.validFrom} | To: ${sample.validTo} | Source: ${sample.source}`);
        }

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`💥 API ERROR for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
