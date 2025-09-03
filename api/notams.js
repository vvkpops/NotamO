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
 * FINAL CORRECTED: NOTAM date parser with proper timezone handling
 * Fixes the issue where dates like "2509031600EST" were not parsing correctly
 * @param {string | null | undefined} dateString The date string (e.g., "2511051800EST", "2025-09-02T12:08:00Z").
 * @returns {string|null} ISO 8601 formatted date string, 'PERMANENT', or null if invalid.
 */
function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const upperDateString = dateString.toUpperCase().trim();
    
    // Handle permanent dates
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // FIXED: More specific ISO format check - must have dashes and colons, not just 'T'
    // This prevents "EST" from being detected as ISO format since it contains 'T'
    if (upperDateString.includes('T') && upperDateString.includes('-') && upperDateString.includes(':')) {
        let isoString = dateString;
        if (!upperDateString.endsWith('Z')) {
            isoString += 'Z';
        }
        const d = new Date(isoString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    
    // Handle YYMMDDHHMM format with optional timezone (e.g., 2511051800EST, 2509031600EST)
    const match = upperDateString.match(/^(\d{10})([A-Z]{2,5})?$/);
    if (match) {
        const dateDigits = match[1];
        const timezoneCode = match[2] || 'UTC';
        
        console.log(`🕐 Parsing NOTAM date: ${dateString} -> digits: ${dateDigits}, timezone: ${timezoneCode}`);
        
        // Extract date components from YYMMDDHHMM
        const year = parseInt(`20${dateDigits.substring(0, 2)}`);   // "25" -> 2025
        const month = parseInt(dateDigits.substring(2, 4));         // "09" -> 9
        const day = parseInt(dateDigits.substring(4, 6));           // "03" -> 3
        const hour = parseInt(dateDigits.substring(6, 8));          // "16" -> 16
        const minute = parseInt(dateDigits.substring(8, 10));       // "00" -> 0

        console.log(`📅 Date components: ${year}-${month}-${day} ${hour}:${minute}, timezone offset: ${TIMEZONE_OFFSETS[timezoneCode] || 0} hours`);

        // Validate date components
        if (month < 1 || month > 12 || day < 1 || day > 31 || 
            hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            console.warn(`⚠️ Invalid date components in string: ${dateString}`);
            return null;
        }

        // Get timezone offset
        const offsetHours = TIMEZONE_OFFSETS[timezoneCode];
        if (offsetHours === undefined) {
            console.warn(`⚠️ Unknown timezone: ${timezoneCode} in date ${dateString}, treating as UTC`);
        }
        
        const actualOffsetHours = offsetHours !== undefined ? offsetHours : 0;
        
        // CORRECTED: Use Date.UTC to create a UTC timestamp, then adjust for timezone
        // This avoids browser/server timezone interference
        const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
        
        // Adjust for the timezone offset
        // For EST (-5), the local time is 5 hours behind UTC, so we SUBTRACT the offset
        // This means: EST time + 5 hours = UTC time
        // Example: 2509031600EST = Sep 3, 2025 4:00 PM EST = Sep 3, 2025 9:00 PM UTC
        const adjustedTimestamp = utcTimestamp - (actualOffsetHours * 60 * 60 * 1000);
        const utcDate = new Date(adjustedTimestamp);

        if (isNaN(utcDate.getTime())) {
            console.warn(`❌ Invalid UTC date after timezone conversion for: ${dateString}`);
            return null;
        }
        
        console.log(`✅ Final UTC date: ${utcDate.toISOString()}`);
        return utcDate.toISOString();
    }
    
    console.warn(`❓ Could not parse date format: ${dateString}`);
    return null;
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

    console.log(`🛩️ Processing NOTAM request for ${icao}`);

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
            console.log(`✅ FAA returned ${faaItems.length} NOTAMs for ${icao}`);
        } catch (e) {
            console.warn(`❌ FAA fetch for ${icao} failed. Message: ${e.message}.`);
            // Continue execution, fallback might be triggered
        }

        // *** FALLBACK LOGIC FOR CANADIAN ICAO ***
        // If the ICAO is Canadian AND the FAA fetch returned zero results, try NAV CANADA.
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`🇨🇦 FAA returned no NOTAMs for Canadian ICAO ${icao}. Falling back to NAV CANADA.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                console.log(`✅ NAV CANADA returned ${navNotams.length} NOTAMs for ${icao}`);
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    // Safely parse the nested JSON in the 'text' field
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        // If 'text' is not JSON, use it directly as a fallback.
                        if (typeof notam.text === 'string') {
                            originalRawText = notam.text;
                        }
                        console.warn(`⚠️ Could not parse nested JSON in NAV CANADA NOTAM text for PK ${notam.pk}. Fallback to raw text field.`);
                    }

                    console.log(`📄 Processing NAV CANADA NOTAM PK:${notam.pk}`);
                    console.log(`📅 Raw dates - Start: "${notam.startValidity}", End: "${notam.endValidity}"`);

                    // The raw text is the single source of truth for dates.
                    const parsed = parseRawNotam(originalRawText);

                    // **ENHANCED DATE PARSING LOGIC WITH CORRECTED TIMEZONE HANDLING**
                    // 1. Prioritize parsed raw dates with proper timezone handling
                    // 2. Fallback to top-level API dates only if raw parsing fails
                    const validFrom = parseNotamDate(parsed?.validFromRaw) || parseNotamDate(notam.startValidity);
                    const validTo = parseNotamDate(parsed?.validToRaw) || parseNotamDate(notam.endValidity);

                    console.log(`✅ Processed dates - From: ${validFrom}, To: ${validTo}`);

                    const notamObj = {
                        id: notam.pk || `${icao}-navcanada-${notam.startValidity}`,
                        number: parsed?.notamNumber || 'N/A',
                        validFrom: validFrom,
                        validTo: validTo,
                        source: 'NAV CANADA',
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                        icao: parsed?.aerodrome?.split(' ')[0] || icao, // Use parsed aerodrome if available
                        summary: originalRawText,
                        rawText: originalRawText,
                    };
                    
                    return notamObj;
                }).filter(Boolean);

            } catch (e) {
                console.warn(`❌ NAV CANADA fallback fetch for ${icao} also failed: ${e.message}`);
            }
        } else {
            // Default behavior: Process FAA NOTAMs
            console.log(`🇺🇸 Processing ${faaItems.length} FAA NOTAMs for ${icao}`);
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                
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

        console.log(`📋 Returning ${finalNotams.length} processed NOTAMs for ${icao}`);

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`💥 [API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
