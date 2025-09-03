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
 * **REWRITTEN Date Parser**
 * This function first checks for PERM. If it's not PERM, it tries to parse a date.
 * This prevents PERM from ever being processed as a date.
 * @param {string | null | undefined} dateString The date string to parse.
 * @returns {string|null} ISO 8601 formatted date, the string 'PERM', or null if invalid.
 */
function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const trimmed = dateString.trim();
    const upperDateString = trimmed.toUpperCase();
    
    // **PRIORITY 1: Handle PERM explicitly and return immediately.**
    if (upperDateString.startsWith('PERM')) {
        return 'PERM';
    }

    // **PRIORITY 2: Handle standard ISO date formats.**
    if (trimmed.includes('T') && trimmed.includes('-') && trimmed.includes(':')) {
        let isoString = trimmed;
        if (!upperDateString.endsWith('Z') && !upperDateString.match(/[+-]\d{2}:\d{2}$/)) {
            isoString += 'Z';
        }
        const d = new Date(isoString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    
    // **PRIORITY 3: Handle YYMMDDHHMM format with optional timezone.**
    const match = upperDateString.match(/^(\d{10})\s*([A-Z]{2,5})?.*$/);
    if (match) {
        const dateDigits = match[1];
        const timezoneCode = match[2] || 'UTC';
        
        const year = parseInt(`20${dateDigits.substring(0, 2)}`);
        const month = parseInt(dateDigits.substring(2, 4));
        const day = parseInt(dateDigits.substring(4, 6));
        const hour = parseInt(dateDigits.substring(6, 8));
        const minute = parseInt(dateDigits.substring(8, 10));

        if (month < 1 || month > 12 || day < 1 || day > 31 || 
            hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null; // Invalid date components
        }

        const offsetHours = TIMEZONE_OFFSETS[timezoneCode] !== undefined ? TIMEZONE_OFFSETS[timezoneCode] : 0;
        const offsetMinutes = Math.round(offsetHours * 60);
        const utcMs = Date.UTC(year, month - 1, day, hour, minute) - (offsetMinutes * 60 * 1000);
        const utcDate = new Date(utcMs);

        return isNaN(utcDate.getTime()) ? null : utcDate.toISOString();
    }
    
    // Return null if no format matches
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

        // Fallback for Canadian ICAO
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`🇨🇦 Trying NAV CANADA for Canadian ICAO ${icao}`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                console.log(`✅ NAV CANADA returned ${navNotams.length} NOTAMs for ${icao}`);
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        if (typeof notam.text === 'string') originalRawText = notam.text;
                    }

                    const parsed = parseRawNotam(originalRawText);
                    
                    const validFrom = parseNotamDate(notam.startValidity) || parseNotamDate(parsed?.validFromRaw);
                    // **REWRITTEN LOGIC**: Prioritize the parsed C) field, then the API end date.
                    // The new parseNotamDate handles PERM correctly.
                    const validTo = parseNotamDate(parsed?.validToRaw) || parseNotamDate(notam.endValidity);

                    return {
                        id: notam.pk || `${icao}-navcanada-${Date.now()}`,
                        number: parsed?.notamNumber || 'N/A',
                        validFrom,
                        validTo,
                        validFromRaw: parsed?.validFromRaw || null,
                        validToRaw: parsed?.validToRaw || null,
                        source: 'NAV CANADA',
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                        icao: parsed?.aerodrome?.split(' ')[0] || icao,
                        summary: originalRawText,
                        rawText: originalRawText,
                    };
                }).filter(Boolean);

            } catch (e) {
                console.warn(`❌ NAV CANADA fetch failed for ${icao}: ${e.message}`);
            }
        } else if (faaItems.length > 0) {
            console.log(`🇺🇸 Processing ${faaItems.length} FAA NOTAMs for ${icao}`);
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const text = core.text || 'Full NOTAM text not available from source.';
                const parsed = parseRawNotam(text);
                
                return {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: parseNotamDate(core.effectiveStart),
                    validTo: parseNotamDate(core.effectiveEnd), // Use new parser for consistency
                    validFromRaw: parsed?.validFromRaw || null,
                    validToRaw: parsed?.validToRaw || null,
                    source: 'FAA',
                    isCancellation: parsed?.isCancellation || false,
                    cancels: parsed?.cancelsNotam || null,
                    icao: core.icaoLocation || icao,
                    summary: text,
                    rawText: text,
                };
            });
        }
        
        // Filter out cancelled NOTAMs and expired (keeping PERMANENT)
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
                if (n.validTo === 'PERM' || !n.validTo) return true; // Keep PERM and null validTo
                const validToDate = new Date(n.validTo);
                return isNaN(validToDate.getTime()) ? true : validToDate >= now;
            })
            .sort((a, b) => {
                const dateA = a.validFrom === 'PERM' ? null : new Date(a.validFrom || 0);
                const dateB = b.validFrom === 'PERM' ? null : new Date(b.validFrom || 0);
                if (!dateA) return 1; if (!dateB) return -1;
                if (isNaN(dateA.getTime())) return 1; if (isNaN(dateB.getTime())) return -1;
                return dateB - dateA;
            });

        console.log(`📋 Returning ${finalNotams.length} processed NOTAMs for ${icao}`);
        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`💥 API ERROR for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
