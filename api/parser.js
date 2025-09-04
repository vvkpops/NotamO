/**
 * NOTAM Parser Utility
 * 
 * This module contains functions to parse raw ICAO-formatted NOTAM text
 * into a structured JavaScript object. It can handle standard fields (Q, A, B, C, E)
 * and identify cancellation NOTAMs (NOTAMC).
 */

/**
 * Parses a raw NOTAM string into a structured object.
 * @param {string} rawText The full raw NOTAM text.
 * @returns {object|null} A structured NOTAM object or null if parsing fails.
 */
export function parseRawNotam(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  // Clean up the raw text - handle different line endings, escape sequences, and brackets
  const cleanText = rawText
    .replace(/\\n/g, '\n')           // Convert escaped newlines
    .replace(/\\r\n/g, '\n')          // Normalize Windows line endings
    .replace(/\\r/g, '\n')            // Normalize old Mac line endings
    .replace(/\\\(/g, '(')            // Unescape opening parenthesis
    .replace(/\\\)/g, ')')            // Unescape closing parenthesis
    .replace(/\\"/g, '"')             // Unescape quotes
    .replace(/\\t/g, '\t')            // Convert escaped tabs
    .trim();

  const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const result = {
    isCancellation: false,
    cancelsNotam: null,
    qLine: '',
    aerodrome: '',
    validFromRaw: '',
    validToRaw: '',
    schedule: '',
    body: '',
    notamNumber: ''
  };

  // Check for NOTAM number and cancellation in the first line
  const firstLine = lines[0] || '';
  
  // Enhanced NOTAM number extraction - handle parentheses
  // Look for patterns like (H3902/25 or H3902/25
  const notamNumberMatch = firstLine.match(/\(?([A-Z]\d{4}\/\d{2})/);
  if (notamNumberMatch) {
    result.notamNumber = notamNumberMatch[1];
  }

  // Check for NOTAMC (Cancellation)
  const notamcMatch = firstLine.match(/NOTAMC\s+([A-Z0-9]+\/[0-9]{2})/);
  if (notamcMatch) {
    result.isCancellation = true;
    result.cancelsNotam = notamcMatch[1];
  }

  // Enhanced field parsing to handle multiple fields on same line
  // This regex matches field markers anywhere in the text
  const allFieldsRegex = /([A-G])\)\s*([^A-G]*?)(?=(?:[A-G]\)|$))/gs;
  
  // First, extract all fields from the entire text
  const fieldMap = {};
  let allFieldMatches;
  const fullText = lines.join('\n');
  
  while ((allFieldMatches = allFieldsRegex.exec(fullText)) !== null) {
    const [, field, value] = allFieldMatches;
    const cleanValue = value.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    fieldMap[field] = cleanValue;
  }

  // Alternatively, parse line by line for better control
  let currentField = null;
  let eLineStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip the first line if it contains NOTAM number (might have parentheses)
    if (i === 0 && (notamNumberMatch || notamcMatch || line.startsWith('('))) {
      continue;
    }

    // Check if this line contains multiple fields (like "A) CZQX B) 2508070901 C) 2511051800EST")
    const multiFieldRegex = /([A-G])\)\s*([^A-G)]*?)(?=(?:[A-G]\)|$))/g;
    let multiFieldMatch;
    let foundFieldsOnLine = false;
    
    while ((multiFieldMatch = multiFieldRegex.exec(line)) !== null) {
      const [, field, value] = multiFieldMatch;
      const cleanValue = value.trim();
      foundFieldsOnLine = true;
      
      switch (field) {
        case 'Q':
          result.qLine = cleanValue;
          break;
        case 'A':
          result.aerodrome = cleanValue;
          break;
        case 'B':
          result.validFromRaw = cleanValue;
          break;
        case 'C':
          result.validToRaw = cleanValue;
          // Handle PERM variations
          if (result.validToRaw.toUpperCase() === 'PERM' || result.validToRaw.toUpperCase() === 'PERMANENT') {
            result.validToRaw = 'PERM';
          }
          break;
        case 'D':
          result.schedule = cleanValue;
          break;
        case 'E':
          result.body = cleanValue;
          eLineStarted = true;
          currentField = 'E';
          break;
        case 'F':
        case 'G':
          // F and G lines are part of the body in practice
          if (result.body) {
            result.body += ` ${field}) ${cleanValue}`;
          } else {
            result.body = `${field}) ${cleanValue}`;
          }
          break;
      }
    }

    // If no fields were found on this line and we're in E) section, append to body
    if (!foundFieldsOnLine && eLineStarted && currentField === 'E') {
      // Continue collecting E line content
      result.body += ` ${line}`;
    }
  }

  // Clean up all fields - remove any lingering brackets or escape sequences
  result.qLine = result.qLine.trim();
  result.aerodrome = result.aerodrome.trim();
  result.validFromRaw = result.validFromRaw.trim();
  result.validToRaw = result.validToRaw.trim();
  result.schedule = result.schedule.trim();
  result.body = result.body.trim();
  
  // Additional cleanup for body text that might have closing parenthesis at the end
  if (result.body.endsWith(')') && !result.body.includes('(')) {
    // Likely a stray closing parenthesis from the NOTAM wrapper
    result.body = result.body.slice(0, -1).trim();
  }
  
  return result;
}

/**
 * Checks if a NOTAM text appears to be in ICAO format
 * @param {string} text The NOTAM text to check
 * @returns {boolean} True if the text appears to be in ICAO format
 */
export function isIcaoFormat(text) {
  if (!text) return false;
  
  // Look for the characteristic ICAO field markers
  const hasQLine = /Q\)\s*/.test(text);
  const hasALine = /A\)\s*/.test(text);
  // E line is not always present, so A and Q are better indicators
  return hasQLine && hasALine;
}

/**
 * Extracts just the body text (E line content) from an ICAO NOTAM
 * @param {string} rawText The full ICAO NOTAM text
 * @returns {string} The body text content
 */
export function extractBodyText(rawText) {
  const parsed = parseRawNotam(rawText);
  return parsed ? parsed.body : rawText;
}
