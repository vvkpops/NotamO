import axios from 'axios';
import { parseRawNotam } from './parser.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

// INLINE ENHANCED PARSER - to avoid import issues
const TIMEZONE_OFFSETS = {
    'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5, 'MST': -7, 'MDT': -6,
    'PST': -8, 'PDT': -7, 'AST': -4, 'ADT': -3, 'NST': -3.5, 'NDT': -2.5,
    'AKST': -9, 'AKDT': -8, 'HST': -10, 'UTC': 0, 'Z': 0, 'GMT': 0,
    'BST': 1, 'CET': 1, 'CEST': 2, 'EET': 2, 'EEST': 3
};

function extractCLineFromFullNotamInline(notamText, fieldType = 'C') {
    if (!notamText || typeof notamText !== 'string') {
        console.warn(`❌ No NOTAM text provided for ${fieldType}) line extraction`);
        return null;
    }

    console.log(`🔍 Extracting ${fieldType}) line from NOTAM text (${notamText.length} chars)`);
    
    // Method 1: Direct regex
    const directRegex = new RegExp(`${fieldType}\\)\\s*(\\d{10}[A-Z]{0,4})`, 'i');
    const directMatch = notamText.match(directRegex);
    
    if (directMatch) {
        console.log(`✅ Method 1 SUCCESS: Found ${fieldType}) line via direct regex: "${directMatch[1]}"`);
        return directMatch[1].trim();
    }
    
    // Method 2: PERM pattern
    const permRegex = new RegExp(`${fieldType}\\)\\s*(PERM|PERMANENT)`, 'i');
    const permMatch = notamText.match(permRegex);
    
    if (permMatch) {
        console.log(`✅ Method 2 SUCCESS: Found ${fieldType}) line with PERM: "${permMatch[1]}"`);
        return 'PERM';
    }
    
    // Method 3: Pattern matching
    const patterns = [
        new RegExp(`${fieldType}\\)\\s*([^\\s]+)`, 'i'),
        new RegExp(`${fieldType}\\)\\s*(.+?)(?:\\s+[D-Z]\\)|\\n|\\r|$)`, 'i'),
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        const patternMatch = notamText.match(patterns[i]);
        if (patternMatch && patternMatch[1]) {
            const extracted = patternMatch[1].trim();
            if (/^\d{10}/.test(extracted) || /PERM/i.test(extracted)) {
                console.log(`✅ Method 3.${i + 1} SUCCESS: Valid pattern found: "${extracted}"`);
                return extracted;
            }
        }
    }
    
    // Method 4: Line by line parsing
    const lines = notamText.split(/[\n\r]+/);
    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        const lineRegex = new RegExp(`${fieldType}\\)`, 'i');
        if (lineRegex.test(trimmedLine)) {
            const fieldParts = trimmedLine.split(lineRegex);
            if (fieldParts.length > 1) {
                let fieldContent = fieldParts[1].trim();
                fieldContent = fieldContent.split(/\s+[D-Z]\)/i)[0].trim();
                
                if (/PERM/i.test(fieldContent)) {
                    console.log(`✅ Method 4 SUCCESS: Found ${fieldType}) line with PERM: "${fieldContent}"`);
                    return 'PERM';
                }
                
                if (/^\d{10}[A-Z]{0,4}/.test(fieldContent)) {
                    console.log(`✅ Method 4 SUCCESS: Found ${fieldType}) line via line parsing: "${fieldContent}"`);
                    return fieldContent;
                }
            }
        }
    }
    
    console.warn(`❌ ALL METHODS FAILED: No ${fieldType}) line found in NOTAM text`);
    return null;
}

function parseNotamDateTimeEnhancedInline(notamString) {
    if (!notamString || typeof notamString !== 'string') {
        console.warn('❌ Invalid notamString provided to parseNotamDateTimeEnhanced');
        return null;
    }
    
    const originalString = notamString.trim();
    const upperString = originalString.toUpperCase();
    
    console.log(`🔧 Enhanced parsing starting for: "${originalString}"`);
    
    if (upperString === 'PERM' || upperString === 'PERMANENT' || upperString.includes('PERM')) {
        console.log('✅ Detected PERMANENT validity');
        return 'PERMANENT';
    }
    
    let cleanString = originalString.replace(/^[A-G]\)\s*/i, '').replace(/[\)\"\'\`]+$/, '').trim();
    
    console.log(`🔧 Cleaned string: "${cleanString}"`);
    
    const regex = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([A-Z]{1,4})?/;
    const match = cleanString.match(regex);
    
    if (!match) {
        console.warn(`❌ Invalid NOTAM date/time format: "${cleanString}"`);
        return null;
    }
    
    const [, year, month, day, hour, minute, timezone] = match;
    
    let fullYear = parseInt(year);
    if (fullYear <= 50) {
        fullYear = 2000 + fullYear;
    } else {
        fullYear = 1900 + fullYear;
    }
    
    const monthInt = parseInt(month);
    const dayInt = parseInt(day);
    const hourInt = parseInt(hour);
    const minuteInt = parseInt(minute);
    
    // Validation
    const validationErrors = [];
    if (monthInt < 1 || monthInt > 12) validationErrors.push(`Invalid month: ${monthInt}`);
    if (dayInt < 1 || dayInt > 31) validationErrors.push(`Invalid day: ${dayInt}`);
    if (hourInt < 0 || hourInt > 23) validationErrors.push(`Invalid hour: ${hourInt}`);
    if (minuteInt < 0 || minuteInt > 59) validationErrors.push(`Invalid minute: ${minuteInt}`);
    
    if (validationErrors.length > 0) {
        console.warn(`❌ Date validation failed: ${validationErrors.join(', ')}`);
        return null;
    }
    
    let offsetHours = 0;
    let timezoneUsed = 'UTC';
    
    if (timezone && TIMEZONE_OFFSETS.hasOwnProperty(timezone.toUpperCase())) {
        offsetHours = TIMEZONE_OFFSETS[timezone.toUpperCase()];
        timezoneUsed = timezone.toUpperCase();
        console.log(`🌍 Timezone detected: ${timezoneUsed} (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours})`);
    } else if (timezone) {
        console.warn(`⚠️ Unknown timezone "${timezone}", defaulting to UTC`);
    }
    
    try {
        const localDate = new Date(Date.UTC(fullYear, monthInt - 1, dayInt, hourInt, minuteInt, 0, 0));
        const utcTimestamp = localDate.getTime() - (offsetHours * 60 * 60 * 1000);
        const utcDate = new Date(utcTimestamp);
        
        if (isNaN(utcDate.getTime())) {
            console.warn('❌ Invalid UTC date created during timezone conversion');
            return null;
        }
        
        const isoString = utcDate.toISOString();
        console.log(`✅ Successfully parsed "${originalString}" → "${isoString}"`);
        return isoString;
        
    } catch (error) {
        console.error(`❌ Error creating date from "${cleanString}": ${error.message}`);
        return null;
    }
}

function extractValidityFromCLineEnhancedInline(rawNotamText, fieldType = 'C') {
    if (!rawNotamText || typeof rawNotamText !== 'string') {
        console.warn(`❌ No rawNotamText provided for ${fieldType}) line extraction`);
        return null;
    }

    console.log(`🚀 Enhanced ${fieldType}) line extraction starting`);
    
    const fieldContent = extractCLineFromFullNotamInline(rawNotamText, fieldType);
    
    if (!fieldContent) {
        console.warn(`❌ Enhanced ${fieldType}) line extraction failed - no field content found`);
        return null;
    }
    
    console.log(`✅ Enhanced ${fieldType}) line content extracted: "${fieldContent}"`);
    
    const parsedDate = parseNotamDateTimeEnhancedInline(fieldContent);
    
    if (parsedDate) {
        console.log(`✅ Enhanced ${fieldType}) line parsing successful: "${fieldContent}" → "${parsedDate}"`);
        return parsedDate;
    } else {
        console.warn(`❌ Enhanced ${fieldType}) line parsing failed for content: "${fieldContent}"`);
        return null;
    }
}

function parseNotamDateWithFallbackEnhancedInline(primarySource, rawText, fieldType, apiDate = null) {
    console.log(`\n🔄 === Enhanced Hybrid Date Parsing for ${fieldType}) field ===`);
    console.log(`   Primary source: ${primarySource}`);
    console.log(`   API date: ${apiDate}`);
    console.log(`   Has raw text: ${!!rawText} (${rawText ? rawText.length : 0} chars)`);
    
    // Priority 1: Enhanced field line extraction (highest confidence)
    if (rawText) {
        console.log(`🎯 Trying enhanced ${fieldType}) line extraction (HIGHEST CONFIDENCE)`);
        const fieldResult = extractValidityFromCLineEnhancedInline(rawText, fieldType);
        if (fieldResult) {
            console.log(`✅ SUCCESS: Enhanced ${fieldType}) line extraction returned: "${fieldResult}"`);
            return fieldResult;
        } else {
            console.log(`❌ FAILED: Enhanced ${fieldType}) line extraction unsuccessful`);
        }
    }
    
    // Priority 2: Direct parsing of structured data (medium confidence)
    if (primarySource) {
        console.log(`📝 Trying direct enhanced parsing (MEDIUM CONFIDENCE): "${primarySource}"`);
        const directResult = parseNotamDateTimeEnhancedInline(primarySource);
        if (directResult) {
            console.log(`✅ SUCCESS: Direct enhanced parsing returned: "${directResult}"`);
            return directResult;
        } else {
            console.log(`❌ FAILED: Direct enhanced parsing unsuccessful`);
        }
    }
    
    // Priority 3: API fallback with enhanced parsing (lowest confidence)
    if (apiDate !== null && apiDate !== undefined) {
        console.log(`🔄 Trying API fallback with enhanced parsing (LOWEST CONFIDENCE): "${apiDate}"`);
        const apiResult = parseNotamDateTimeEnhancedInline(apiDate);
        if (apiResult) {
            console.log(`✅ SUCCESS: Enhanced API fallback returned: "${apiResult}"`);
            return apiResult;
        } else {
            console.log(`❌ FAILED: Enhanced API fallback unsuccessful`);
        }
    }
    
    console.error(`❌ === ALL ENHANCED PARSING METHODS FAILED for ${fieldType}) field ===`);
    return null;
}

/**
 * LEGACY DATE PARSING - Keep for FAA NOTAMs compatibility
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
            parseInt(month) - 1,
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

// Function to format dates for ICAO format (YYMMDDHHMM)
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

    const parsed = parseRawNotamInline(originalRawText) || {};
    
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
            console.log(`🍁 FAA returned no NOTAMs for Canadian ICAO ${icao}. Using NAV CANADA with ENHANCED parsing.`);
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

                    // ENHANCED DATE PARSING with improved C) line extraction
                    console.log(`\n🔍 Processing NOTAM ${parsed?.notamNumber || 'unknown'} for ${icao}`);
                    console.log(`   API endValidity: ${notam.endValidity}`);
                    console.log(`   Parsed validToRaw: ${parsed?.validToRaw}`);
                    
                    let validFrom, validTo;
                    
                    // Use enhanced parsing for validFrom (B) line)
                    validFrom = parseNotamDateWithFallbackEnhancedInline(
                        parsed?.validFromRaw,
                        originalRawText,
                        'B',
                        notam.startValidity
                    );
                    
                    // ENHANCED HANDLING for validTo when API returns null
                    if (notam.endValidity === null || notam.endValidity === undefined) {
                        console.log(`⚠️  End validity is null, using ENHANCED C) line extraction`);
                        validTo = extractValidityFromCLineEnhancedInline(originalRawText, 'C');
                        
                        // If enhanced C) line extraction fails, try fallback chain
                        if (!validTo && parsed?.validToRaw) {
                            console.log(`🔄 Enhanced C) line extraction failed, trying fallback chain`);
                            validTo = parseNotamDateWithFallbackEnhancedInline(
                                parsed.validToRaw,
                                originalRawText,
                                'C',
                                null
                            );
                        }
                    } else {
                        // Normal enhanced hybrid parsing
                        validTo = parseNotamDateWithFallbackEnhancedInline(
                            parsed?.validToRaw,
                            originalRawText,
                            'C',
                            notam.endValidity
                        );
                    }

                    console.log(`✅ Final enhanced dates - From: ${validFrom}, To: ${validTo}`);

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
                        // Enhanced debug info
                        _debug: {
                            apiEndValidityWasNull: notam.endValidity === null,
                            extractionMethod: notam.endValidity === null ? 'enhanced_C_line_extraction' : 'enhanced_hybrid_parsing',
                            originalApiEndValidity: notam.endValidity,
                            parsedValidToRaw: parsed?.validToRaw,
                            enhancedParsingUsed: true
                        }
                    };
                }).filter(Boolean);

                console.log(`🍁 Processed ${notamsFromSource.length} NAV CANADA NOTAMs with ENHANCED parsing for ${icao}`);

            } catch (e) {
                console.warn(`NAV CANADA fallback for ${icao} failed: ${e.message}`);
            }
        } else {
            // Process FAA NOTAMs (using legacy parsing for compatibility)
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

        // Enhanced logging
        console.log(`📊 ENHANCED NOTAM Processing Summary for ${icao}:`);
        console.log(`   Total fetched: ${notamsFromSource.length}`);
        console.log(`   After filtering: ${finalNotams.length}`);
        console.log(`   Cancelled NOTAMs removed: ${cancelledNotamNumbers.size}`);
        
        // Log enhanced parsing statistics
        const enhancedParsedCount = finalNotams.filter(n => n._debug?.enhancedParsingUsed).length;
        const nullEndDateCount = finalNotams.filter(n => n._debug?.apiEndValidityWasNull).length;
        
        if (enhancedParsedCount > 0) {
            console.log(`🚀 Enhanced parsing statistics:`);
            console.log(`   NOTAMs processed with enhanced parsing: ${enhancedParsedCount}`);
            console.log(`   NOTAMs with null API end validity: ${nullEndDateCount}`);
        }
        
        // Log any NOTAMs that still have null end dates for monitoring
        const stillNullEndDates = finalNotams.filter(n => n.validTo === null);
        if (stillNullEndDates.length > 0) {
            console.warn(`⚠️  ${stillNullEndDates.length} NOTAMs still have null end dates after enhanced processing:`);
            stillNullEndDates.forEach(n => {
                console.warn(`   - ${n.number}: ${n._debug?.extractionMethod || 'unknown extraction'}`);
                
                // Additional debugging: show the raw text snippet around C) line
                if (n.rawText) {
                    const cLineMatch = n.rawText.match(/C\)[^\n\r]*/i);
                    if (cLineMatch) {
                        console.warn(`     C) line found: "${cLineMatch[0]}"`);
                    } else {
                        console.warn(`     No C) line pattern found in raw text`);
                    }
                }
            });
        }
        
        // Enhanced success metrics
        const successfullyParsedEndDates = finalNotams.filter(n => 
            n.validTo !== null && n.validTo !== undefined
        ).length;
        
        const permanentNotams = finalNotams.filter(n => 
            n.validTo === 'PERMANENT' || n.validTo === 'PERM'
        ).length;
        
        console.log(`✅ Enhanced parsing success rate:`);
        console.log(`   NOTAMs with valid end dates: ${successfullyParsedEndDates}/${finalNotams.length}`);
        console.log(`   Permanent NOTAMs: ${permanentNotams}`);
        console.log(`   Success rate: ${((successfullyParsedEndDates / Math.max(finalNotams.length, 1)) * 100).toFixed(1)}%`);

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[ENHANCED API ERROR] for ${icao}:`, err.message);
        console.error(`[ENHANCED API ERROR] Stack trace:`, err.stack);
        return response.status(500).json({ 
            error: "An internal server error occurred during enhanced NOTAM processing.",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
