// FIXED api/parser.js
/**
 * Enhanced NOTAM Parser with better C) line handling
 */

/**
 * Parses a raw NOTAM string into a structured object with enhanced date parsing.
 */
export function parseRawNotam(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  // Clean up the raw text - handle different line endings and escape sequences
  const cleanText = rawText
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
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
  let hasELine = lines.some(line => line.startsWith('E)'));

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
          case 'Q': result.qLine += ` ${line}`; break;
          case 'A': result.aerodrome += ` ${line}`; break;
          case 'B': result.validFromRaw += ` ${line}`; break;
          case 'C': result.validToRaw += ` ${line}`; break;
          case 'D': result.schedule += ` ${line}`; break;
        }
      } else if (eLineStarted) {
        result.body += `\n${line}`;
      } else if (!hasELine && currentField === 'C') {
        // If there's no E) line, anything after C) is the body
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
        // Enhanced B) line parsing - handle "EST 2511051800" format
        result.validFromRaw = normalizeTimezoneFormat(result.validFromRaw);
        eLineStarted = false;
        break;
      case 'C':
        result.validToRaw = value.trim();
        // Enhanced C) line parsing - handle "EST 2511301800" and "PERM" formats
        result.validToRaw = normalizeTimezoneFormat(result.validToRaw);
        // Handle PERM variations
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
 * NEW: Normalizes timezone format in date strings
 * Converts "EST 2511051800" to "2511051800EST"
 */
function normalizeTimezoneFormat(dateStr) {
  if (!dateStr) return dateStr;
  
  // Handle "TIMEZONE YYMMDDHHMM" format -> "YYMMDDHHMMTIMEZONE"
  const tzMatch = dateStr.match(/^(EST|EDT|PST|PDT|MST|MDT|CST|CDT|AST|ADT|NST|NDT|UTC|GMT|Z)\s+(\d{10})$/i);
  if (tzMatch) {
    return `${tzMatch[2]}${tzMatch[1].toUpperCase()}`;
  }
  
  return dateStr;
}

// ... rest of the parser functions remain the same ...
export function isIcaoFormat(text) {
  if (!text) return false;
  const hasQLine = /Q\)\s*/.test(text);
  const hasALine = /A\)\s*/.test(text);
  return hasQLine && hasALine;
}

export function extractBodyText(rawText) {
  const parsed = parseRawNotam(rawText);
  return parsed ? parsed.body : rawText;
}
