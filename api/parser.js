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
  
  // Extract NOTAM number (e.g., C3734/25, A1234/25, H4517/25, etc.)
  const notamNumberMatch = firstLine.match(/([A-Z]\d{4}\/\d{2})/);
  if (notamNumberMatch) {
    result.notamNumber = notamNumberMatch[1];
  }

  // Check for NOTAMC (Cancellation) or NOTAMR (Replacement)
  const notamcMatch = firstLine.match(/NOTAM[CR]\s+([A-Z0-9]+\/[0-9]{2})/);
  if (notamcMatch) {
    if (firstLine.includes('NOTAMC')) {
      result.isCancellation = true;
      result.cancelsNotam = notamcMatch[1];
    }
    // NOTAMR is a replacement, not a cancellation
  }

  // Look for ICAO field structure (Q), A), B), C), D), E), F), G))
  const fieldRegex = /^([A-G])\)\s*(.*)/;
  let currentField = null;
  let eLineStarted = false;
  let hasELine = lines.some(line => line.match(/^E\)/));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip the first line if it contains NOTAM number
    if (i === 0 && (notamNumberMatch || notamcMatch)) {
      continue;
    }

    // Check if this line starts a new field
    const match = line.match(fieldRegex);
    
    if (!match && eLineStarted) {
      // Continue collecting E line content
      result.body += `\n${line}`;
      continue;
    }

    if (!match && currentField && !eLineStarted) {
      // This is a continuation of the current field
      switch (currentField) {
        case 'Q': result.qLine += ` ${line}`; break;
        case 'A': result.aerodrome += ` ${line}`; break;
        case 'B': result.validFromRaw += ` ${line}`; break;
        case 'C': result.validToRaw += ` ${line}`; break;
        case 'D': result.schedule += ` ${line}`; break;
      }
      continue;
    }

    if (!match) {
      // If we've passed C) and there's no E) field, everything else is body
      if (!hasELine && currentField === 'C') {
        result.body += `${line}\n`;
        eLineStarted = true;
      }
      continue;
    }

    const [, field, value] = match;
    currentField = field;
    
    switch (field) {
      case 'Q':
        result.qLine = value.trim();
        eLineStarted = false;
        break;
      case 'A':
        result.aerodrome = value.trim();
        eLineStarted = false;
        break;
      case 'B':
        result.validFromRaw = value.trim();
        eLineStarted = false;
        break;
      case 'C':
        result.validToRaw = value.trim();
        // Handle PERM variations properly
        if (result.validToRaw.toUpperCase().includes('PERM')) {
          result.validToRaw = 'PERM';
        }
        eLineStarted = false;
        break;
      case 'D':
        result.schedule = value.trim();
        eLineStarted = false;
        break;
      case 'E':
        result.body = value.trim();
        eLineStarted = true;
        break;
      case 'F':
      case 'G':
        // F and G lines are part of the body
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
  
  // Log extracted dates for debugging
  if (result.validFromRaw || result.validToRaw) {
    console.log(`📋 Parsed NOTAM ${result.notamNumber}: From="${result.validFromRaw}", To="${result.validToRaw}"`);
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
