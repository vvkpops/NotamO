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

  const lines = rawText.split('\n');
  const result = {
    isCancellation: false,
    cancelsNotam: null,
    qLine: '',
    aerodrome: '',
    validFromRaw: '',
    validToRaw: '',
    schedule: '',
    body: ''
  };

  // Check for NOTAMC (Cancellation) in the first line
  const firstLine = lines[0] || '';
  const notamcMatch = firstLine.match(/NOTAMC\s+([A-Z0-9]+\/[0-9]{2})/);
  if (notamcMatch) {
    result.isCancellation = true;
    result.cancelsNotam = notamcMatch[1];
  }

  const fieldRegex = /^\s*([A-G])\)\s*(.*)/;
  let eLineStarted = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (eLineStarted) {
      result.body += `\n${trimmedLine}`;
      continue;
    }

    const match = trimmedLine.match(fieldRegex);
    if (!match) continue;

    const [, field, value] = match;
    
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
        result.body += `\n${field}) ${value.trim()}`;
        break;
    }
  }

  result.body = result.body.trim();
  
  // Return null if essential parts are missing
  if (!result.aerodrome && !result.body) {
    return null;
  }

  return result;
}
