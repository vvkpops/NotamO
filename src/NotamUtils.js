/**
 * NotamUtils.js
 * 
 * Contains advanced utility functions for parsing, classifying, and handling NOTAM data,
 * adapted from expert-level examples.
 */

// --- Classification and Type Extraction ---

export const getNotamFlags = (notam) => {
  const text = (notam.summary || '').toUpperCase();
  const rawText = (notam.rawText || '').toUpperCase();
  const combinedText = `${text} ${rawText}`;
  
  return {
    isILS: /\bILS\b/.test(combinedText) || /\bLOCALIZER\b/.test(combinedText) || /\bGLIDESLOPE\b/.test(combinedText) || /\bGS\b/.test(combinedText) || /\bLOC\b/.test(combinedText),
    isRunway: /\bRWY\b/.test(combinedText) || /\bRUNWAY\b/.test(combinedText),
    isTaxiway: /\bTWY\b/.test(combinedText) || /\bTAXIWAY\b/.test(combinedText),
    isFuel: /\bFUEL\b/.test(combinedText),
    isCancelled: (notam.type === "C" || /\bCANCELLED\b/.test(combinedText) || /\bCNL\b/.test(combinedText)),
    isRSC: /\bRSC\b/.test(combinedText), // Runway Surface Condition
    isCRFI: /\bCRFI\b/.test(combinedText), // Canadian Runway Friction Index
  };
};

export const getNotamType = (notam) => {
  const flags = getNotamFlags(notam);
  const text = (notam.summary || '').toUpperCase();
  const rawText = (notam.rawText || '').toUpperCase();
  const combinedText = `${text} ${rawText}`;
  
  // Check for ILS/Nav aids FIRST (before runway check)
  // This handles cases like "ILS RWY 09" which should be classified as ILS, not runway
  if (flags.isILS) {
    return 'ils';
  }
  
  // Check for navigation aids and approach systems
  if (/\b(VOR|DME|NDB|TACAN|RNAV|GPS|WAAS)\b/.test(combinedText)) {
    return 'ils'; // Group all nav aids under ILS category
  }
  
  // Check for approach-related NOTAMs
  if (/\b(APPROACH|APP|PRECISION|NON-PRECISION|CIRCLING)\b/.test(combinedText)) {
    return 'ils';
  }
  
  // Check for lighting systems that are approach-related
  if (/\b(PAPI|VASI|ALS|ALSF|MALSR|ODALS|RAIL|REIL)\b/.test(combinedText)) {
    return 'ils';
  }
  
  // Surface conditions take priority over runway classification
  if (flags.isRSC) return 'rsc';
  if (flags.isCRFI) return 'crfi';
  
  // Now check for runway (after ILS/Nav checks)
  if (flags.isRunway) {
    // Double-check it's not actually an ILS-related runway NOTAM
    if (/\b(ILS|LOC|GS|GLIDESLOPE|LOCALIZER)\b/.test(combinedText)) {
      return 'ils';
    }
    return 'rwy';
  }
  
  if (flags.isTaxiway) return 'twy';
  if (flags.isFuel) return 'fuel';
  if (flags.isCancelled) return 'cancelled';
  
  return 'other';
};

// --- UI and Display Helpers ---

export const getHeadClass = (notam) => {
  const type = getNotamType(notam);
  return `head-${type}`;
};

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

export const needsExpansion = (summary) => {
  return summary && summary.length > 250;
};

// --- Time-based Functions ---

export const parseDate = (s) => {
  if (!s || s === 'PERMANENT') return null;
  let iso = s.trim().replace(' ', 'T');
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

export const isNotamCurrent = (notam) => {
  const now = new Date();
  const from = parseDate(notam.validFrom);
  const to = parseDate(notam.validTo);
  if (notam.validTo === 'PERMANENT') return true;
  if (!from) return true;
  return from <= now && (!to || to >= now);
};

export const isNotamFuture = (notam) => {
  const from = parseDate(notam.validFrom);
  const now = new Date();
  return from && from > now;
};
