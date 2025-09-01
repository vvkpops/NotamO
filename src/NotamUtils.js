/**
 * NotamUtils.js
 * 
 * Contains advanced utility functions for parsing, classifying, and handling NOTAM data,
 * adapted from expert-level examples.
 */

// --- Classification and Type Extraction ---

export const getNotamFlags = (notam) => {
  const text = (notam.summary || '').toUpperCase();
  return {
    isRunway: /\bRWY\b/.test(text) || /\bRUNWAY\b/.test(text),
    isTaxiway: /\bTWY\b/.test(text) || /\bTAXIWAY\b/.test(text),
    isILS: /\bILS\b/.test(text),
    isFuel: /\bFUEL\b/.test(text),
    isCancelled: (notam.type === "C" || /\bCANCELLED\b/.test(text) || /\bCNL\b/.test(text)),
    isRSC: /\bRSC\b/.test(text), // Runway Surface Condition
    isCRFI: /\bCRFI\b/.test(text), // Canadian Runway Friction Index
  };
};

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
