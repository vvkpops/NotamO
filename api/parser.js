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

  // Clean up the raw text - handle different line endings and escape sequences
  const cleanText = rawText
    .replace(/\\n/g, '\n')           // Convert escaped newlines
    .replace(/\r\n/g, '\n')          // Normalize Windows line endings
    .replace(/\r/g, '\n')            // Normalize old Mac line endings
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
  
  // Extract NOTAM number (e.g., C3734/25, A1234/25, etc.)
  const notamNumberMatch = firstLine.match(/([A-Z]\d{4}\/\d{2})/);
  if (notamNumberMatch) {
    result.notamNumber = notamNumberMatch[1];
  }

  // Check for NOTAMC (Cancellation)
  const notamcMatch = firstLine.match(/NOTAMC\s+([A-Z0-9]+\/[0-9]{2})/);
  if (notamcMatch) {
    result.isCancellation = true;
    result.cancelsNotam = notamcMatch[1];
  }

  // Look for ICAO field structure (Q), A), B), C), D), E), F), G))
  const fieldRegex = /^([A-G])\)\s*(.*)/;
  let currentField = null;
  let eLineStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip the first line if it contains NOTAM number
    if (i === 0 && (notamNumberMatch || notamcMatch)) {
      continue;
    }

    if (eLineStarted && !fieldRegex.test(line)) {
      // Continue collecting E line content
      result.body += `\n${line}`;
      continue;
    }

    const match = line.match(fieldRegex);
    if (!match) {
      // If we're inside a field continuation, add to current field
      if (currentField && !eLineStarted) {
        switch (currentField) {
          case 'Q':
            result.qLine += ` ${line}`;
            break;
          case 'A':
            result.aerodrome += ` ${line}`;
            break;
          case 'B':
            result.validFromRaw += ` ${line}`;
            break;
          case 'C':
            result.validToRaw += ` ${line}`;
            break;
          case 'D':
            result.schedule += ` ${line}`;
            break;
        }
      } else if (eLineStarted) {
        result.body += `\n${line}`;
      }
      continue;
    }

    const [, field, value] = match;
    currentField = field;
    
    switch (field) {
      case 'Q':
        result.qLine = value.trim();
        break;
      case 'A':
        result.aerodrome = value.trim();
        break;
      case 'B':
        result.validFromRaw = value.trim();
        break;
      case 'C':
        result.validToRaw = value.trim();
        break;
      case 'D':
        result.schedule = value.trim();
        break;
      case 'E':
        result.body = value.trim();
        eLineStarted = true;
        break;
      case 'F':
      case 'G':
        // F and G lines are part of the body in practice
        if (result.body) {
          result.body += `\n${field}) ${value.trim()}`;
        } else {
          result.body = `${field}) ${value.trim()}`;
        }
        eLineStarted = true;
        break;
    }
  }

  // Clean up all fields
  result.qLine = result.qLine.trim();
  result.aerodrome = result.aerodrome.trim();
  result.validFromRaw = result.validFromRaw.trim();
  result.validToRaw = result.validToRaw.trim();
  result.schedule = result.schedule.trim();
  result.body = result.body.trim();
  
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
  const hasELine = /E\)\s*/.test(text);
  
  return hasQLine && hasALine && hasELine;
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
