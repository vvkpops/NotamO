/**
 * NotamUtils.js
 * 
 * Contains advanced utility functions for parsing, classifying, and handling NOTAM data,
 * adapted from the expert-level example file provided.
 */

// --- Classification and Type Extraction ---

/**
 * Gets specific boolean flags for a NOTAM based on its content.
 * @param {object} notam The NOTAM object.
 * @returns {object} Flags for various NOTAM types.
 */
export const getNotamFlags = (notam) => {
  const text = (notam.summary || '').toUpperCase();
  return {
    isRunway: /\bRWY\b/.test(text) || /\bRUNWAY\b/.test(text),
    isTaxiway: /\bTWY\b/.test(text) || /\bTAXIWAY\b/.test(text),
    isILS: /\bILS\b/.test(text),
    isFuel: /\bFUEL\b/.test(text),
    isCancelled: (notam.type === "C" || /\bCANCELLED\b/.test(text) || /\bCNL\b/.test(text)),
    // Add other specific checks from the example as needed
    isRSC: /\bRSC\b/.test(text), // Runway Surface Condition
    isCRFI: /\bCRFI\b/.test(text), // Canadian Runway Friction Index
  };
};

/**
 * Determines the primary type of a NOTAM for categorization.
 * @param {object} notam The NOTAM object.
 * @returns {string} The category of the NOTAM (e.g., 'rwy', 'twy').
 */
export const getNotamType = (notam) => {
  const flags = getNotamFlags(notam);
  if (flags.isRunway) return 'rwy';
  if (flags.isTaxiway) return 'twy';
  if (flags.isRSC) return 'rsc';
  if (flags.isCRFI) return 'crfi';
  if (flags.isILS) return 'ils';
  if (flags.isFuel) return 'fuel';
  if (flags.isCancelled) return 'cancelled';
  return 'other';
};


// --- UI and Display Helpers ---

/**
 * Returns the appropriate CSS class for the card header based on NOTAM type.
 * @param {object} notam The NOTAM object.
 * @returns {string} The CSS class name.
 */
export const getHeadClass = (notam) => {
  const type = getNotamType(notam);
  return `head-${type}`;
};

/**
 * Returns the title for the card header based on NOTAM type.
 * @param {object} notam The NOTAM object.
 * @returns {string} The header title.
 */
export const getHeadTitle = (notam) => {
  const type = getNotamType(notam);
  const titles = {
    rwy: 'RUNWAY',
    twy: 'TAXIWAY',
    rsc: 'RUNWAY CONDITIONS',
    crfi: 'FRICTION INDEX',
    ils: 'ILS / NAV AID',
    fuel: 'FUEL SERVICES',
    cancelled: 'CANCELLED',
    other: 'GENERAL'
  };
  return titles[type] || 'GENERAL';
};

/**
 * Extracts runway designators from NOTAM text.
 * @param {string} text The NOTAM summary text.
 * @returns {string} A comma-separated string of unique runway designators.
 */
export const extractRunways = (text) => {
  if (!text) return "";
  const upperText = text.toUpperCase();
  const rwyMatches = [];
  const regex = /\bRWY\s*(\d{2,3}(?:[LRC])?(?:\/\d{2,3}(?:[LRC])?)*)/gi;
  let match;
  while ((match = regex.exec(upperText)) !== null) {
    rwyMatches.push(match[1]);
  }
  return [...new Set(rwyMatches)].join(', ');
};

/**
 * Determines if a NOTAM's text is long enough to require an expand button.
 * @param {string} summary The NOTAM summary.
 * @returns {boolean} True if the summary is longer than 250 characters.
 */
export const needsExpansion = (summary) => {
  return summary && summary.length > 250;
};


// --- Time-based Functions ---

/**
 * Parses a date string into a Date object.
 * Handles different formats and ensures UTC context.
 * @param {string} s The date string.
 * @returns {Date|null} A Date object or null if invalid.
 */
export const parseDate = (s) => {
  if (!s || s === 'PERMANENT') return null;
  let iso = s.trim().replace(' ', 'T');
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z'; // Assume UTC if no timezone
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Checks if a NOTAM is currently active.
 * @param {object} notam The NOTAM object.
 * @returns {boolean} True if the NOTAM is current.
 */
export const isNotamCurrent = (notam) => {
  const now = new Date();
  const from = parseDate(notam.validFrom);
  const to = parseDate(notam.validTo);

  // Permanent NOTAMs are always current
  if (notam.validTo === 'PERMANENT') return true;
  
  // No start date means we assume it's current
  if (!from) return true;

  return from <= now && (!to || to >= now);
};

/**
 * Checks if a NOTAM is scheduled for the future.
 * @param {object} notam The NOTAM object.
 * @returns {boolean} True if the NOTAM's start time is in the future.
 */
export const isNotamFuture = (notam) => {
  const from = parseDate(notam.validFrom);
  const now = new Date();
  return from && from > now;
};
