/**
 * enhanced-parser.js
 * 
 * Enhanced NOTAM parsing specifically designed to handle CFPS (Canadian Flight Planning System)
 * NOTAMs with better C) line extraction and timezone handling.
 * 
 * Based on the HTML parser testing tool and designed to solve the null endValidity issue
 * when CFPS API returns null for end validity dates.
 */

// Comprehensive timezone offset mapping (hours from UTC)
export const TIMEZONE_OFFSETS = {
    // North American Timezones
    'EST': -5,   // Eastern Standard Time
    'EDT': -4,   // Eastern Daylight Time
    'CST': -6,   // Central Standard Time
    'CDT': -5,   // Central Daylight Time
    'MST': -7,   // Mountain Standard Time
    'MDT': -6,   // Mountain Daylight Time
    'PST': -8,   // Pacific Standard Time
    'PDT': -7,   // Pacific Daylight Time
    'AST': -4,   // Atlantic Standard Time
    'ADT': -3,   // Atlantic Daylight Time
    'NST': -3.5, // Newfoundland Standard Time
    'NDT': -2.5, // Newfoundland Daylight Time
    'AKST': -9,  // Alaska Standard Time
    'AKDT': -8,  // Alaska Daylight Time
    'HST': -10,  // Hawaii Standard Time
    
    // European Timezones
    'UTC': 0,    // Coordinated Universal Time
    'Z': 0,      // Zulu time (UTC)
    'GMT': 0,    // Greenwich Mean Time
    'BST': 1,    // British Summer Time
    'CET': 1,    // Central European Time
    'CEST': 2,   // Central European Summer Time
    'EET': 2,    // Eastern European Time
    'EEST': 3,   // Eastern European Summer Time
    'WET': 0,    // Western European Time
    'WEST': 1,   // Western European Summer Time
    
    // Additional common timezones
    'IST': 5.5,  // India Standard Time
    'JST': 9,    // Japan Standard Time
    'AEST': 10,  // Australian Eastern Standard Time
    'AEDT': 11,  // Australian Eastern Daylight Time
    'NZST': 12,  // New Zealand Standard Time
    'NZDT': 13,  // New Zealand Daylight Time
};

/**
 * Enhanced C) line extraction with multiple robust fallback methods
 * This function is specifically designed to handle various NOTAM formats
 * including malformed or non-standard layouts.
 */
export function extractCLineFromFullNotam(notamText, fieldType = 'C') {
    if (!notamText || typeof notamText !== 'string') {
        console.warn(`❌ No NOTAM text provided for ${fieldType}) line extraction`);
        return null;
    }

    console.log(`🔍 Extracting ${fieldType}) line from NOTAM text`);
    console.log(`   Text length: ${notamText.length} characters`);
    console.log(`   Preview: "${notamText.substring(0, 100)}..."`);
    
    // Method 1: Direct regex for field followed by datetime pattern
    // This catches the most common format: C) 2511051800EST
    const directRegex = new RegExp(`${fieldType}\\)\\s*(\\d{10}[A-Z]{0,4})`, 'i');
    const directMatch = notamText.match(directRegex);
    
    if (directMatch) {
        console.log(`✅ Method 1 SUCCESS: Found ${fieldType}) line via direct regex: "${directMatch[1]}"`);
        return directMatch[1].trim();
    }
    console.log(`❌ Method 1 failed: Direct regex did not match`);
    
    // Method 2: Field followed by PERM pattern
    const permRegex = new RegExp(`${fieldType}\\)\\s*(PERM|PERMANENT)`, 'i');
    const permMatch = notamText.match(permRegex);
    
    if (permMatch) {
        console.log(`✅ Method 2 SUCCESS: Found ${fieldType}) line with PERM: "${permMatch[1]}"`);
        return 'PERM';
    }
    console.log(`❌ Method 2 failed: PERM pattern did not match`);
    
    // Method 3: Field followed by any content until next field or end
    // This handles cases where there might be extra spaces or formatting issues
    const patterns = [
        new RegExp(`${fieldType}\\)\\s*([^\\s]+)`, 'i'),  // Field followed by non-whitespace
        new RegExp(`${fieldType}\\)\\s*(.+?)(?:\\s+[D-Z]\\)|\\n|\\r|$)`, 'i'),  // Until next field, newline, or end
        new RegExp(`${fieldType}\\)\\s*(.+?)(?=\\s+[A-Z]\\)|$)`, 'i'),  // Until next ICAO field
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const patternMatch = notamText.match(pattern);
        if (patternMatch && patternMatch[1]) {
            const extracted = patternMatch[1].trim();
            console.log(`🔧 Method 3.${i + 1}: Extracted candidate: "${extracted}"`);
            
            // Check if it looks like a NOTAM datetime or PERM
            if (/^\d{10}/.test(extracted) || /PERM/i.test(extracted)) {
                console.log(`✅ Method 3.${i + 1} SUCCESS: Valid pattern found: "${extracted}"`);
                return extracted;
            }
            console.log(`❌ Method 3.${i + 1}: Candidate did not match datetime/PERM pattern`);
        }
    }
    console.log(`❌ Method 3 failed: Pattern matching unsuccessful`);
    
    // Method 4: Line by line parsing (most robust for malformed NOTAMs)
    console.log(`🔧 Method 4: Attempting line-by-line parsing`);
    const lines = notamText.split(/[\n\r]+/);
    console.log(`   Found ${lines.length} lines to process`);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (trimmedLine.length === 0) continue;
        
        // Look for lines containing the field
        const lineRegex = new RegExp(`${fieldType}\\)`, 'i');
        if (lineRegex.test(trimmedLine)) {
            console.log(`📍 Method 4: Found line ${i + 1} containing ${fieldType}): "${trimmedLine}"`);
            
            // Extract everything after the field marker
            const fieldParts = trimmedLine.split(lineRegex);
            if (fieldParts.length > 1) {
                let fieldContent = fieldParts[1].trim();
                console.log(`🔧 Method 4: Raw field content: "${fieldContent}"`);
                
                // Remove any trailing fields (D), E), etc.) and other noise
                fieldContent = fieldContent.split(/\s+[D-Z]\)/i)[0].trim();
                fieldContent = fieldContent.split(/\s+E\s*\)/i)[0].trim(); // Special handling for E)
                
                console.log(`🔧 Method 4: Cleaned field content: "${fieldContent}"`);
                
                // Handle PERM cases
                if (/PERM/i.test(fieldContent)) {
                    console.log(`✅ Method 4 SUCCESS: Found ${fieldType}) line with PERM: "${fieldContent}"`);
                    return 'PERM';
                }
                
                // Check if it looks like a datetime (with optional timezone)
                if (/^\d{10}[A-Z]{0,4}/.test(fieldContent)) {
                    console.log(`✅ Method 4 SUCCESS: Found ${fieldType}) line via line parsing: "${fieldContent}"`);
                    return fieldContent;
                }
                
                console.log(`❌ Method 4: Field content did not match expected patterns`);
            }
        }
    }
    
    // Method 5: Desperate search - look for any 10-digit sequence after field marker
    console.log(`🔧 Method 5: Desperate search for any datetime after ${fieldType})`);
    const desperateRegex = new RegExp(`${fieldType}\\)[^\\d]*?(\\d{10}[A-Z]{0,4})`, 'i');
    const desperateMatch = notamText.match(desperateRegex);
    
    if (desperateMatch) {
        console.log(`✅ Method 5 SUCCESS: Desperate search found: "${desperateMatch[1]}"`);
        return desperateMatch[1].trim();
    }
    
    console.warn(`❌ ALL METHODS FAILED: No ${fieldType}) line found in NOTAM text`);
    console.warn(`   Full text was: "${notamText}"`);
    return null;
}

/**
 * Enhanced NOTAM date/time parsing with comprehensive timezone handling
 * This function handles various NOTAM datetime formats and converts them to UTC ISO strings
 */
export function parseNotamDateTimeEnhanced(notamString) {
    if (!notamString || typeof notamString !== 'string') {
        console.warn('❌ Invalid notamString provided to parseNotamDateTimeEnhanced');
        return null;
    }
    
    const originalString = notamString.trim();
    const upperString = originalString.toUpperCase();
    
    console.log(`🔧 Enhanced parsing starting for: "${originalString}"`);
    
    // Handle PERM cases
    if (upperString === 'PERM' || upperString === 'PERMANENT' || upperString.includes('PERM')) {
        console.log('✅ Detected PERMANENT validity');
        return 'PERMANENT';
    }
    
    // Clean the input string
    let cleanString = originalString;
    
    // Remove field prefix if present (A), B), C), etc.)
    cleanString = cleanString.replace(/^[A-G]\)\s*/i, '');
    
    // Remove any trailing parentheses, quotes, or extra characters
    cleanString = cleanString.replace(/[\)\"\'\`]+$/, '');
    cleanString = cleanString.trim();
    
    console.log(`🔧 Cleaned string: "${cleanString}"`);
    
    // Extract date, time, and timezone using enhanced regex
    // Format: YYMMDDHHMM[TZ] where TZ can be 1-4 letters
    const regex = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([A-Z]{1,4})?/;
    const match = cleanString.match(regex);
    
    if (!match) {
        console.warn(`❌ Invalid NOTAM date/time format: "${cleanString}"`);
        console.warn(`   Expected format: YYMMDDHHMM[TZ] (e.g., 2511051800EST)`);
        return null;
    }
    
    const [fullMatch, year, month, day, hour, minute, timezone] = match;
    console.log(`🔧 Regex match results:`, { year, month, day, hour, minute, timezone });
    
    // Convert 2-digit year to 4-digit year
    let fullYear = parseInt(year);
    // Assume years 00-50 are 2000-2050, years 51-99 are 1951-1999
    if (fullYear <= 50) {
        fullYear = 2000 + fullYear;
    } else {
        fullYear = 1900 + fullYear;
    }
    
    // Validate date components
    const monthInt = parseInt(month);
    const dayInt = parseInt(day);
    const hourInt = parseInt(hour);
    const minuteInt = parseInt(minute);
    
    // Enhanced validation
    const validationErrors = [];
    if (monthInt < 1 || monthInt > 12) validationErrors.push(`Invalid month: ${monthInt}`);
    if (dayInt < 1 || dayInt > 31) validationErrors.push(`Invalid day: ${dayInt}`);
    if (hourInt < 0 || hourInt > 23) validationErrors.push(`Invalid hour: ${hourInt}`);
    if (minuteInt < 0 || minuteInt > 59) validationErrors.push(`Invalid minute: ${minuteInt}`);
    
    // Additional validation for day based on month (rough check)
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Allow Feb 29 for simplicity
    if (monthInt >= 1 && monthInt <= 12 && dayInt > daysInMonth[monthInt - 1]) {
        validationErrors.push(`Invalid day ${dayInt} for month ${monthInt}`);
    }
    
    if (validationErrors.length > 0) {
        console.warn(`❌ Date validation failed:`, validationErrors);
        console.warn(`   Input: ${fullYear}-${month}-${day} ${hour}:${minute}`);
        return null;
    }
    
    // Determine timezone offset
    let offsetHours = 0;
    let timezoneUsed = 'UTC';
    
    if (timezone && TIMEZONE_OFFSETS.hasOwnProperty(timezone.toUpperCase())) {
        offsetHours = TIMEZONE_OFFSETS[timezone.toUpperCase()];
        timezoneUsed = timezone.toUpperCase();
        console.log(`🌍 Timezone detected: ${timezoneUsed} (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours})`);
    } else if (timezone) {
        console.warn(`⚠️  Unknown timezone "${timezone}", defaulting to UTC`);
        console.warn(`   Known timezones: ${Object.keys(TIMEZONE_OFFSETS).join(', ')}`);
    } else {
        console.log(`🌍 No timezone specified, assuming UTC`);
    }
    
    try {
        // Create date in the specified timezone first
        const localDate = new Date(Date.UTC(
            fullYear,
            monthInt - 1,  // Month is 0-indexed in JavaScript
            dayInt,
            hourInt,
            minuteInt,
            0,
            0
        ));
        
        if (isNaN(localDate.getTime())) {
            console.warn(`❌ Invalid date created: ${fullYear}-${monthInt}-${dayInt} ${hourInt}:${minuteInt}`);
            return null;
        }
        
        // Adjust to UTC by subtracting the timezone offset
        // If timezone is EST (-5), we add 5 hours to convert to UTC
        const utcTimestamp = localDate.getTime() - (offsetHours * 60 * 60 * 1000);
        const utcDate = new Date(utcTimestamp);
        
        if (isNaN(utcDate.getTime())) {
            console.warn(`❌ Invalid UTC date created during timezone conversion`);
            return null;
        }
        
        const isoString = utcDate.toISOString();
        
        console.log(`✅ Successfully parsed "${originalString}"`);
        console.log(`   Local time: ${fullYear}-${String(monthInt).padStart(2, '0')}-${String(dayInt).padStart(2, '0')}T${String(hourInt).padStart(2, '0')}:${String(minuteInt).padStart(2, '0')}:00 ${timezoneUsed}`);
        console.log(`   UTC time: ${isoString}`);
        console.log(`   Conversion: ${timezoneUsed} (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}) → UTC`);
        
        return isoString;
        
    } catch (error) {
        console.error(`❌ Error creating date from "${cleanString}":`, error.message);
        console.error(`   Full error:`, error);
        return null;
    }
}

/**
 * Enhanced validity extraction that combines field extraction with enhanced parsing
 * This is the main function that replaces extractValidityFromCLine
 */
export function extractValidityFromCLineEnhanced(rawNotamText, fieldType = 'C') {
    if (!rawNotamText || typeof rawNotamText !== 'string') {
        console.warn(`❌ No rawNotamText provided for ${fieldType}) line extraction`);
        return null;
    }

    console.log(`\n🚀 Enhanced ${fieldType}) line extraction starting`);
    console.log(`   NOTAM text length: ${rawNotamText.length} characters`);
    console.log(`   Preview: "${rawNotamText.substring(0, 150)}..."`);
    
    // Step 1: Extract the field content using enhanced extraction
    const fieldContent = extractCLineFromFullNotam(rawNotamText, fieldType);
    
    if (!fieldContent) {
        console.warn(`❌ Enhanced ${fieldType}) line extraction failed - no field content found`);
        return null;
    }
    
    console.log(`✅ Enhanced ${fieldType}) line content extracted: "${fieldContent}"`);
    
    // Step 2: Parse the extracted content using enhanced parsing
    const parsedDate = parseNotamDateTimeEnhanced(fieldContent);
    
    if (parsedDate) {
        console.log(`✅ Enhanced ${fieldType}) line parsing successful!`);
        console.log(`   Input: "${fieldContent}"`);
        console.log(`   Output: "${parsedDate}"`);
        return parsedDate;
    } else {
        console.warn(`❌ Enhanced ${fieldType}) line parsing failed for content: "${fieldContent}"`);
        return null;
    }
}

/**
 * Enhanced hybrid date parsing with comprehensive fallback chain
 * This replaces parseNotamDateWithFallback with better logic and logging
 */
export function parseNotamDateWithFallbackEnhanced(primarySource, rawText, fieldType, apiDate = null) {
    console.log(`\n🔄 === Enhanced Hybrid Date Parsing for ${fieldType}) field ===`);
    console.log(`   Primary source: ${primarySource}`);
    console.log(`   API date: ${apiDate}`);
    console.log(`   Has raw text: ${!!rawText} (${rawText ? rawText.length : 0} chars)`);
    
    let attemptNumber = 1;
    
    // Priority 1: Enhanced field line extraction (highest confidence)
    if (rawText) {
        console.log(`\n🎯 Attempt ${attemptNumber++}: Enhanced ${fieldType}) line extraction (HIGHEST CONFIDENCE)`);
        const fieldResult = extractValidityFromCLineEnhanced(rawText, fieldType);
        if (fieldResult) {
            console.log(`✅ SUCCESS: Enhanced ${fieldType}) line extraction returned: "${fieldResult}"`);
            return fieldResult;
        } else {
            console.log(`❌ FAILED: Enhanced ${fieldType}) line extraction unsuccessful`);
        }
    } else {
        console.log(`⚠️  Skipping enhanced field extraction - no raw text available`);
    }
    
    // Priority 2: Direct parsing of structured data (medium confidence)
    if (primarySource) {
        console.log(`\n📝 Attempt ${attemptNumber++}: Direct enhanced parsing (MEDIUM CONFIDENCE)`);
        console.log(`   Input: "${primarySource}"`);
        const directResult = parseNotamDateTimeEnhanced(primarySource);
        if (directResult) {
            console.log(`✅ SUCCESS: Direct enhanced parsing returned: "${directResult}"`);
            return directResult;
        } else {
            console.log(`❌ FAILED: Direct enhanced parsing unsuccessful`);
        }
    } else {
        console.log(`⚠️  Skipping direct parsing - no primary source available`);
    }
    
    // Priority 3: API fallback with enhanced parsing (lowest confidence)
    if (apiDate !== null && apiDate !== undefined) {
        console.log(`\n🔄 Attempt ${attemptNumber++}: API fallback with enhanced parsing (LOWEST CONFIDENCE)`);
        console.log(`   API date: "${apiDate}"`);
        const apiResult = parseNotamDateTimeEnhanced(apiDate);
        if (apiResult) {
            console.log(`✅ SUCCESS: Enhanced API fallback returned: "${apiResult}"`);
            return apiResult;
        } else {
            console.log(`❌ FAILED: Enhanced API fallback unsuccessful`);
        }
    } else {
        console.log(`⚠️  Skipping API fallback - API date is null/undefined`);
    }
    
    // All methods failed
    console.error(`\n❌ === ALL ENHANCED PARSING METHODS FAILED for ${fieldType}) field ===`);
    console.error(`   This indicates a serious parsing issue that may need manual investigation`);
    console.error(`   Primary source: "${primarySource}"`);
    console.error(`   API date: "${apiDate}"`);
    if (rawText) {
        console.error(`   Raw text snippet: "${rawText.substring(0, 200)}..."`);
        // Try to find ANY occurrence of the field for debugging
        const debugRegex = new RegExp(`${fieldType}\\)`, 'gi');
        const debugMatches = rawText.match(debugRegex);
        if (debugMatches) {
            console.error(`   Found ${debugMatches.length} occurrence(s) of "${fieldType})" in text`);
        } else {
            console.error(`   No occurrence of "${fieldType})" found in text`);
        }
    }
    
    return null;
}

/**
 * Utility function to test the enhanced parsing with debug output
 * This can be used for development and troubleshooting
 */
export function testEnhancedParsing(notamText, fieldType = 'C') {
    console.log(`\n🧪 === TESTING ENHANCED PARSING ===`);
    console.log(`Field: ${fieldType})`);
    console.log(`Text: "${notamText}"`);
    
    const result = extractValidityFromCLineEnhanced(notamText, fieldType);
    
    console.log(`Result: ${result}`);
    console.log(`Success: ${result !== null}`);
    console.log(`=== END TEST ===\n`);
    
    return result;
}
