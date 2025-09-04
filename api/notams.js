import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

// Enhanced timezone offset registry with proper DST handling
const TIMEZONE_OFFSETS = {
    // UTC variants
    'UTC': 0, 'GMT': 0, 'Z': 0, 'ZULU': 0,
    
    // North American Standard Time (Winter)
    'EST': -5, 'CST': -6, 'MST': -7, 'PST': -8,
    'AST': -4, 'NST': -3.5, 'AKST': -9, 'HST': -10,
    
    // North American Daylight Time (Summer)
    'EDT': -4, 'CDT': -5, 'MDT': -6, 'PDT': -7,
    'ADT': -3, 'NDT': -2.5, 'AKDT': -8,
    
    // European Time
    'CET': 1, 'EET': 2, 'WET': 0,
    'CEST': 2, 'EEST': 3, 'WEST': 1, 'BST': 1,
    
    // Other aviation timezones
    'JST': 9, 'AEST': 10, 'AEDT': 11, 'AWST': 8,
    'NZST': 12, 'NZDT': 13
};

/**
 * Enhanced date parser with comprehensive format support
 * @param {string} dateString - Date in various NOTAM formats
 * @returns {string|null} - ISO 8601 UTC string, 'PERMANENT', or null
 */
function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const cleanDate = dateString.trim();
    const upperDate = cleanDate.toUpperCase();
    
    // Handle permanent dates
    if (['PERM', 'PERMANENT', 'PERMAMENT'].includes(upperDate)) {
        return 'PERMANENT';
    }
    
    // Handle ISO 8601 format (e.g., 2025-01-15T14:30:00Z or 2025-01-15T14:30:00)
    if (cleanDate.includes('T')) {
        try {
            let isoString = cleanDate;
            // Add Z if no timezone specified (treat as UTC)
            if (!upperDate.match(/Z$|[+-]\d{2}:?\d{2}$/)) {
                isoString += 'Z';
            }
            
            const date = new Date(isoString);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
        } catch (e) {
            console.warn(`Failed to parse ISO date: ${dateString}`);
        }
    }
    
    // Handle YYMMDDHHMM format with optional timezone (e.g., 2501151430EST, 2501151430)
    const ymdMatch = upperDate.match(/^(\d{10})([A-Z]{2,4})?$/);
    if (ymdMatch) {
        const [, digits, tz] = ymdMatch;
        const timezone = tz || 'UTC';
        
        try {
            // Parse date components
            const year = 2000 + parseInt(digits.substring(0, 2));
            const month = parseInt(digits.substring(2, 4));
            const day = parseInt(digits.substring(4, 6));
            const hour = parseInt(digits.substring(6, 8));
            const minute = parseInt(digits.substring(8, 10));
            
            // Validate components
            if (month < 1 || month > 12 || day < 1 || day > 31 || 
                hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                console.warn(`Invalid date components: ${dateString}`);
                return null;
            }
            
            // Get timezone offset
            const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 0;
            if (timezone !== 'UTC' && !(timezone in TIMEZONE_OFFSETS)) {
                console.warn(`Unknown timezone '${timezone}', treating as UTC`);
            }
            
            // Create date in the specified timezone, then convert to UTC
            const localDate = new Date(year, month - 1, day, hour, minute);
            if (isNaN(localDate.getTime())) {
                return null;
            }
            
            // Convert to UTC by subtracting the timezone offset
            const utcTime = localDate.getTime() - (offsetHours * 60 * 60 * 1000);
            const utcDate = new Date(utcTime);
            
            return utcDate.toISOString();
            
        } catch (e) {
            console.warn(`Failed to parse YYMMDDHHMM date: ${dateString}`, e);
        }
    }
    
    // Handle other date formats (fallback)
    try {
        const fallbackDate = new Date(cleanDate);
        if (!isNaN(fallbackDate.getTime())) {
            return fallbackDate.toISOString();
        }
    } catch (e) {
        // Ignore fallback errors
    }
    
    console.warn(`Unable to parse date: ${dateString}`);
    return null;
}

/**
 * Format ISO date to ICAO YYMMDDHHMM format
 * @param {string} isoDate - ISO 8601 date string
 * @returns {string} - YYMMDDHHMM format or 'PERM'
 */
function formatToIcaoDate(isoDate) {
    if (!isoDate || isoDate === 'PERMANENT') return 'PERM';
    
    const upperDate = String(isoDate).toUpperCase();
    if (upperDate.includes('PERM')) return 'PERM';
    
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
}

/**
 * Enhanced ICAO format builder with proper date handling
 */
function formatNotamToIcao(notam, originalRawText) {
    // Use original if already in ICAO format
    if (originalRawText && originalRawText.includes('Q)') && originalRawText.includes('A)')) {
        return originalRawText;
    }

    const parsed = parseRawNotam(originalRawText) || {};
    let icaoFormatted = '';
    
    // NOTAM number and cancellation
    if (notam.number && notam.number !== 'N/A') {
        icaoFormatted += `${notam.number}`;
        if (parsed.isCancellation && parsed.cancelsNotam) {
            icaoFormatted += ` NOTAMC ${parsed.cancelsNotam}`;
        }
        icaoFormatted += '\n';
    }
    
    // Q line with proper construction
    if (parsed.qLine?.trim()) {
        icaoFormatted += `Q) ${parsed.qLine}\n`;
    } else {
        const airportCode = parsed.aerodrome || notam.icao || 'CYVR';
        icaoFormatted += `Q) ${airportCode}/QXXXX/IV/M/A/000/999/0000N00000W000\n`;
    }
    
    // A line - Aerodrome
    const aerodrome = parsed.aerodrome || notam.icao;
    if (aerodrome) {
        icaoFormatted += `A) ${aerodrome}\n`;
    }
    
    // B line - Valid from with proper formatting
    if (parsed.validFromRaw?.trim()) {
        icaoFormatted += `B) ${parsed.validFromRaw}\n`;
    } else if (notam.validFrom) {
        const fromDate = formatToIcaoDate(notam.validFrom);
        if (fromDate) {
            icaoFormatted += `B) ${fromDate}\n`;
        }
    }
    
    // C line - Valid to with proper formatting
    if (parsed.validToRaw?.trim()) {
        icaoFormatted += `C) ${parsed.validToRaw}\n`;
    } else if (notam.validTo) {
        const toDate = formatToIcaoDate(notam.validTo);
        if (toDate) {
            icaoFormatted += `C) ${toDate}\n`;
        }
    }
    
    // D line - Schedule
    if (parsed.schedule?.trim()) {
        icaoFormatted += `D) ${parsed.schedule}\n`;
    }
    
    // E line - Body text
    const bodyText = parsed.body || originalRawText?.replace(/\n/g, ' ').trim() || 'NOTAM content';
    icaoFormatted += `E) ${bodyText}`;
    
    return icaoFormatted.trim();
}

/**
 * Current time status checker with proper timezone handling
 */
function isNotamCurrent(notam, currentTime = new Date()) {
    if (!notam.validFrom) return false;
    if (notam.validTo === 'PERMANENT') return true;
    
    try {
        const validFrom = new Date(notam.validFrom);
        const validTo = notam.validTo ? new Date(notam.validTo) : null;
        
        if (isNaN(validFrom.getTime())) return false;
        if (validTo && isNaN(validTo.getTime())) return true; // Assume current if invalid end date
        
        const isAfterStart = currentTime >= validFrom;
        const isBeforeEnd = !validTo || currentTime <= validTo;
        
        return isAfterStart && isBeforeEnd;
    } catch (e) {
        return false;
    }
}

/**
 * Future status checker
 */
function isNotamFuture(notam, currentTime = new Date()) {
    if (!notam.validFrom) return false;
    
    try {
        const validFrom = new Date(notam.validFrom);
        return !isNaN(validFrom.getTime()) && currentTime < validFrom;
    } catch (e) {
        return false;
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

    const icao = (request.query.icao || '').toUpperCase().trim();
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
        return response.status(400).json({ 
            error: "Invalid ICAO code. Must be 4 alphanumeric characters." 
        });
    }

    console.log(`🔍 Fetching NOTAMs for ${icao}`);

    try {
        let notamsFromSource = [];
        const currentTime = new Date();
        
        // Try FAA first
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            console.log(`📡 Querying FAA API for ${icao}`);
            
            const notamRes = await axios.get(faaUrl, {
                headers: { 
                    'client_id': CLIENT_ID, 
                    'client_secret': CLIENT_SECRET 
                },
                timeout: 12000
            });
            
            const faaItems = notamRes.data?.items || [];
            console.log(`📊 FAA returned ${faaItems.length} NOTAMs for ${icao}`);
            
            if (faaItems.length > 0) {
                notamsFromSource = faaItems.map(item => {
                    const core = item.properties?.coreNOTAMData?.notam || {};
                    const formattedText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                    const originalRawText = formattedText || core.text || 'NOTAM text not available';
                    
                    return {
                        id: core.id || `faa-${core.number}-${icao}`,
                        number: core.number || 'N/A',
                        validFrom: parseNotamDate(core.effectiveStart),
                        validTo: parseNotamDate(core.effectiveEnd),
                        source: 'FAA',
                        isCancellation: parseRawNotam(originalRawText)?.isCancellation || false,
                        cancels: parseRawNotam(originalRawText)?.cancelsNotam || null,
                        icao: core.icaoLocation || icao,
                        summary: originalRawText,
                        rawText: formatNotamToIcao({ 
                            number: core.number, 
                            icao: core.icaoLocation || icao,
                            validFrom: parseNotamDate(core.effectiveStart),
                            validTo: parseNotamDate(core.effectiveEnd)
                        }, originalRawText),
                    };
                }).filter(notam => notam.validFrom || notam.validTo); // Filter invalid dates
            }
        } catch (faaError) {
            console.warn(`⚠️ FAA API failed for ${icao}: ${faaError.message}`);
        }

        // Fallback to NAV CANADA for Canadian ICAOs with no FAA results
        if (icao.startsWith('C') && notamsFromSource.length === 0) {
            console.log(`🇨🇦 Trying NAV CANADA fallback for ${icao}`);
            
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { 
                    timeout: 12000,
                    headers: {
                        'User-Agent': 'NOTAM-Console/2.0'
                    }
                });
                
                const navNotams = navRes.data?.data || [];
                console.log(`📊 NAV CANADA returned ${navNotams.length} NOTAMs for ${icao}`);
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'NOTAM text not available';
                    
                    // Parse nested JSON in text field
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || parsedText.text || notam.text;
                    } catch {
                        originalRawText = typeof notam.text === 'string' ? notam.text : 'NOTAM text not available';
                    }

                    const parsed = parseRawNotam(originalRawText);
                    
                    // Use parsed dates first, fallback to API dates
                    const validFrom = parseNotamDate(parsed?.validFromRaw) || parseNotamDate(notam.startValidity);
                    const validTo = parseNotamDate(parsed?.validToRaw) || parseNotamDate(notam.endValidity);

                    return {
                        id: notam.pk || `navcan-${icao}-${Date.now()}-${Math.random()}`,
                        number: parsed?.notamNumber || notam.number || 'N/A',
                        validFrom,
                        validTo,
                        source: 'NAV CANADA',
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                        icao: parsed?.aerodrome?.split(' ')[0] || icao,
                        summary: originalRawText,
                        rawText: formatNotamToIcao({
                            number: parsed?.notamNumber || notam.number,
                            icao: parsed?.aerodrome?.split(' ')[0] || icao,
                            validFrom,
                            validTo
                        }, originalRawText),
                    };
                }).filter(notam => notam.validFrom || notam.validTo);
                
            } catch (navError) {
                console.warn(`⚠️ NAV CANADA fallback failed for ${icao}: ${navError.message}`);
            }
        }

        // Process cancellations
        const cancelledNotamNumbers = new Set();
        notamsFromSource.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
                console.log(`🚫 NOTAM ${n.cancels} cancelled by ${n.number}`);
            }
        });

        // Filter and sort NOTAMs
        const validNotams = notamsFromSource.filter(n => {
            // Remove cancelled NOTAMs
            if (cancelledNotamNumbers.has(n.number)) {
                console.log(`❌ Filtering out cancelled NOTAM ${n.number}`);
                return false;
            }
            
            // Keep cancellation NOTAMs
            if (n.isCancellation) return true;
            
            // Keep permanent NOTAMs
            if (!n.validTo || n.validTo === 'PERMANENT') return true;
            
            // Filter expired NOTAMs (with 1 hour grace period)
            try {
                const validTo = new Date(n.validTo);
                const graceTime = new Date(currentTime.getTime() - (60 * 60 * 1000)); // 1 hour ago
                return isNaN(validTo.getTime()) || validTo >= graceTime;
            } catch {
                return true; // Keep if we can't determine expiry
            }
        });

        // Sort by validity date (newest first, permanent last)
        const sortedNotams = validNotams.sort((a, b) => {
            if (a.validFrom === 'PERMANENT' && b.validFrom !== 'PERMANENT') return 1;
            if (b.validFrom === 'PERMANENT' && a.validFrom !== 'PERMANENT') return -1;
            
            try {
                const dateA = new Date(a.validFrom || 0);
                const dateB = new Date(b.validFrom || 0);
                
                if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                
                return dateB - dateA;
            } catch {
                return 0;
            }
        });

        console.log(`✅ Returning ${sortedNotams.length} NOTAMs for ${icao}`);

        // Set cache headers
        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(sortedNotams);

    } catch (error) {
        console.error(`💥 API Error for ${icao}:`, error.message);
        return response.status(500).json({ 
            error: "Failed to fetch NOTAMs",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Export utilities for use in other modules
export { parseNotamDate, formatToIcaoDate, isNotamCurrent, isNotamFuture };
