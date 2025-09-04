import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

/**
 * ENHANCED DATE PARSING - NO TIMEZONE CONVERSION APPROACH
 * This treats all NOTAM dates as UTC and prioritizes C) line extraction
 */
function parseNotamDateUTC(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    
    const upperDateString = dateString.toUpperCase().trim();
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') {
        return 'PERMANENT';
    }

    // Handle ISO format - ensure UTC
    if (upperDateString.includes('T')) {
        let isoString = dateString;
        if (!upperDateString.endsWith('Z')) {
            isoString += 'Z';
        }
        const d = new Date(isoString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    
    // Handle YYMMDDHHMM format - treat as UTC regardless of timezone suffix
    const match = upperDateString.match(/^(\d{10})([A-Z]{2,4})?$/);
    if (match) {
        const dt = match[1];
        // IMPORTANT: Ignore timezone suffix completely - treat everything as UTC
        
        const year = `20${dt.substring(0, 2)}`;
        const month = dt.substring(2, 4);
        const day = dt.substring(4, 6);
        const hour = dt.substring(6, 8);
        const minute = dt.substring(8, 10);

        // Validate date components
        if (parseInt(month) < 1 || parseInt(month) > 12 || 
            parseInt(day) < 1 || parseInt(day) > 31 || 
            parseInt(hour) < 0 || parseInt(hour) > 23 || 
            parseInt(minute) < 0 || parseInt(minute) > 59) {
            console.warn(`Invalid date components in: ${dateString}`);
            return null;
        }

        // Create UTC date directly without any timezone conversion
        const utcDate = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1, // Month is 0-indexed
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
        ));

        if (isNaN(utcDate.getTime())) {
            console.warn(`Invalid UTC date created from: ${dateString}`);
            return null;
        }
        
        return utcDate.toISOString();
    }
    
    console.warn(`Could not parse date: ${dateString}`);
    return null;
}

/**
 * ENHANCED C) LINE EXTRACTION
 * Specifically for CFPS when end validity comes back as null
 */
function extractValidityFromCLine(rawNotamText, fieldType = 'C') {
    if (!rawNotamText || typeof rawNotamText !== 'string') {
        return null;
    }

    // Create regex for the field (B) for start, C) for end)
    const fieldRegex = new RegExp(`${fieldType}\\)\\s*([^\\n\\r]+)`, 'i');
    const fieldMatch = rawNotamText.match(fieldRegex);
    
    if (!fieldMatch) {
        console.warn(`No ${fieldType}) line found in NOTAM text`);
        return null;
    }
    
    const fieldContent = fieldMatch[1].trim();
    console.log(`📅 Found ${fieldType}) line content: ${fieldContent}`);
    
    // Handle PERM cases
    if (/PERM/i.test(fieldContent)) {
        console.log(`✅ ${fieldType}) line indicates PERMANENT validity`);
        return 'PERMANENT';
    }
    
    // Extract date pattern from the field content
    const dateMatch = fieldContent.match(/(\d{10})([A-Z]{2,4})?/);
    if (dateMatch) {
        const dateString = dateMatch[0];
        const parsedDate = parseNotamDateUTC(dateString);
        if (parsedDate) {
            console.log(`✅ Extracted date from ${fieldType}) line: ${dateString} -> ${parsedDate}`);
            return parsedDate;
        }
    }
    
    console.warn(`❌ Could not extract valid date from ${fieldType}) line: ${fieldContent}`);
    return null;
}

/**
 * HYBRID DATE PARSING with confidence-based fallback chain
 */
function parseNotamDateWithFallback(primarySource, rawText, fieldType, apiDate = null) {
    // Priority 1: Extract from specific ICAO field line (B) or C))
    if (rawText) {
        const fieldResult = extractValidityFromCLine(rawText, fieldType);
        if (fieldResult) {
            console.log(`🎯 Using ${fieldType}) line extraction (highest confidence)`);
            return fieldResult;
        }
    }
    
    // Priority 2: Direct parsing of structured data
    if (primarySource) {
        const directResult = parseNotamDateUTC(primarySource);
        if (directResult) {
            console.log(`📝 Using direct parsing (medium confidence): ${primarySource}`);
            return directResult;
        }
    }
    
    // Priority 3: API fallback
    if (apiDate) {
        const apiResult = parseNotamDateUTC(apiDate);
        if (apiResult) {
            console.log(`🔄 Using API fallback (low confidence): ${apiDate}`);
            return apiResult;
        }
    }
    
    console.warn(`❌ All date parsing methods failed for field ${fieldType}`);
    return null;
}

// Function to format dates for ICAO format (YYMMDDHHMM) - simplified
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

// Function to ensure NOTAM is in proper ICAO format
const formatNotamToIcao = (notam, originalRawText) => {
    // If already in ICAO format, use it
    if (originalRawText && originalRawText.includes('Q)') && originalRawText.includes('A)')) {
        return originalRawText;
    }

    const parsed = parseRawNotam(originalRawText) || {};
    
    let icaoFormatted = '';
    
    if (notam.number && notam.number !== 'N/A') {
        icaoFormatted += `${notam.number}`;
        if (parsed.isCancellation && parsed.cancelsNotam) {
            icaoFormatted += ` NOTAMC ${parsed.cancelsNotam}`;
        }
        icaoFormatted += '\n';
    }
    
    if (parsed.qLine && parsed.qLine.trim() !== '') {
        icaoFormatted += `Q) ${parsed.qLine}\n`;
    } else {
        const airportCode = parsed.aerodrome || notam.icao || 'CZVR';
        icaoFormatted += `Q) ${airportCode}/QXXXX/IV/M/A/000/999/0000N00000W000\n`;
    }
    
    if (parsed.aerodrome && parsed.aerodrome.trim() !== '') {
        icaoFormatted += `A) ${parsed.aerodrome}\n`;
    } else if (notam.icao) {
        icaoFormatted += `A) ${notam.icao}\n`;
    }
    
    if (parsed.validFromRaw && parsed.validFromRaw.trim() !== '') {
        icaoFormatted += `B) ${parsed.validFromRaw}\n`;
    } else if (notam.validFrom) {
        const fromDate = formatToIcaoDate(notam.validFrom);
        icaoFormatted += `B) ${fromDate}\n`;
    }
    
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
    
    if (parsed.schedule && parsed.schedule.trim() !== '') {
        icaoFormatted += `D) ${parsed.schedule}\n`;
    }
    
    if (parsed.body && parsed.body.trim() !== '') {
        icaoFormatted += `E) ${parsed.body}`;
    } else if (originalRawText) {
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

        // FALLBACK FOR CANADIAN ICAO with ENHANCED C) LINE EXTRACTION
        if (icao.startsWith('C') && faaItems.length === 0) {
            console.log(`🍁 FAA returned no NOTAMs for Canadian ICAO ${icao}. Using NAV CANADA with enhanced parsing.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                const navNotams = navRes.data?.data || [];
                
                notamsFromSource = navNotams.map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    
                    // Parse nested JSON in text field
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        if (typeof notam.text === 'string') {
                            originalRawText = notam.text;
                        }
                        console.warn(`Could not parse nested JSON for NOTAM PK ${notam.pk}`);
                    }

                    const parsed = parseRawNotam(originalRawText);

                    // ENHANCED DATE PARSING with C) line priority
                    console.log(`\n🔍 Processing NOTAM ${parsed?.notamNumber || 'unknown'} for ${icao}`);
                    console.log(`   API endValidity: ${notam.endValidity}`);
                    console.log(`   Parsed validToRaw: ${parsed?.validToRaw}`);
                    
                    let validFrom, validTo;
                    
                    // Use hybrid parsing for validFrom (B) line)
                    validFrom = parseNotamDateWithFallback(
                        parsed?.validFromRaw,
                        originalRawText,
                        'B',
                        notam.startValidity
                    );
                    
                    // SPECIAL HANDLING for validTo when API returns null
                    if (notam.endValidity === null || notam.endValidity === undefined) {
                        console.log(`⚠️  End validity is null, extracting from C) line`);
                        validTo = extractValidityFromCLine(originalRawText, 'C');
                        
                        // If C) line extraction fails, try parsing the validToRaw from parser
                        if (!validTo && parsed?.validToRaw) {
                            console.log(`🔄 C) line extraction failed, trying parsed validToRaw`);
                            validTo = parseNotamDateUTC(parsed.validToRaw);
                        }
                    } else {
                        // Normal hybrid parsing
                        validTo = parseNotamDateWithFallback(
                            parsed?.validToRaw,
                            originalRawText,
                            'C',
                            notam.endValidity
                        );
                    }

                    console.log(`✅ Final dates - From: ${validFrom}, To: ${validTo}`);

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
                        // Debug info for troubleshooting
                        _debug: {
                            apiEndValidityWasNull: notam.endValidity === null,
                            extractionMethod: notam.endValidity === null ? 'C_line_extraction' : 'hybrid_parsing',
                            originalApiEndValidity: notam.endValidity,
                            parsedValidToRaw: parsed?.validToRaw
                        }
                    };
                }).filter(Boolean);

                console.log(`🍁 Processed ${notamsFromSource.length} NAV CANADA NOTAMs for ${icao}`);

            } catch (e) {
                console.warn(`NAV CANADA fallback for ${icao} failed: ${e.message}`);
            }
        } else {
            // Process FAA NOTAMs (unchanged)
            notamsFromSource = faaItems.map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                
                return {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: parseNotamDateUTC(core.effectiveStart),
                    validTo: parseNotamDateUTC(core.effectiveEnd),
                    source: 'FAA',
                    isCancellation: parseRawNotam(originalRawText)?.isCancellation || false,
                    cancels: parseRawNotam(originalRawText)?.cancelsNotam || null,
                    icao: core.icaoLocation || icao,
                    summary: originalRawText,
                    rawText: originalRawText,
                };
            });
        }
        
        // Filter cancelled NOTAMs
        const cancelledNotamNumbers = new Set();
        notamsFromSource.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
            }
        });

        const now = new Date();
        const finalNotams = notamsFromSource
            .filter(n => {
                // Remove NOTAMs that are cancelled by other NOTAMs
                if (cancelledNotamNumbers.has(n.number)) {
                    console.log(`🗑️  Filtering out cancelled NOTAM: ${n.number}`);
                    return false;
                }
                
                // Keep cancellation NOTAMs themselves
                if (n.isCancellation) return true;
                
                // Keep permanent NOTAMs
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                
                // Filter out expired NOTAMs
                const validToDate = new Date(n.validTo);
                const isExpired = !isNaN(validToDate.getTime()) && validToDate < now;
                
                if (isExpired) {
                    console.log(`⏰ Filtering out expired NOTAM: ${n.number} (expired: ${n.validTo})`);
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

        // Log summary
        console.log(`📊 NOTAM Processing Summary for ${icao}:`);
        console.log(`   Total fetched: ${notamsFromSource.length}`);
        console.log(`   After filtering: ${finalNotams.length}`);
        console.log(`   Cancelled NOTAMs removed: ${cancelledNotamNumbers.size}`);
        
        // Log any NOTAMs with null end dates for monitoring
        const nullEndDates = finalNotams.filter(n => n.validTo === null);
        if (nullEndDates.length > 0) {
            console.warn(`⚠️  ${nullEndDates.length} NOTAMs still have null end dates after processing`);
            nullEndDates.forEach(n => {
                console.warn(`   - ${n.number}: ${n._debug?.extractionMethod || 'unknown extraction'}`);
            });
        }

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        console.error(err.stack);
        return response.status(500).json({ 
            error: "An internal server error occurred.",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
