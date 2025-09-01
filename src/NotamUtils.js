/**
 * NotamUtils.js
 * 
 * This file contains utility functions for parsing, classifying, and handling NOTAM data.
 * The logic is adapted from the provided example file to fit our application structure.
 */

/**
 * Classifies a NOTAM based on keywords in its summary.
 * This is the core logic for our filtering system.
 * @param {object} notam - The NOTAM object.
 * @returns {object} An object with boolean flags for each category (e.g., isRunway, isTaxiway).
 */
export const getNotamClassification = (notam) => {
  const text = (notam.summary || '').toUpperCase();

  const classifications = {
    isRunway: /\bRWY\b/.test(text),
    isTaxiway: /\bTWY\b/.test(text),
    isILS: /\bILS\b/.test(text),
    isFuel: /FUEL/.test(text),
    isCancelled: /CANCELLED/.test(text),
    // Add more classifications as needed based on common NOTAM patterns
  };

  // If no specific category is matched, classify it as 'other'.
  classifications.isOther = !Object.values(classifications).some(v => v);

  return classifications;
};

/**
 * Checks if a NOTAM is currently active.
 * @param {object} notam - The NOTAM object.
 * @returns {boolean} - True if the NOTAM is current.
 */
export const isNotamCurrent = (notam) => {
  if (!notam.validFrom || notam.validFrom === 'PERMANENT') return true;
  try {
    const from = new Date(notam.validFrom);
    const to = notam.validTo && notam.validTo !== 'PERMANENT' ? new Date(notam.validTo) : null;
    const now = new Date();
    
    return from <= now && (!to || to >= now);
  } catch {
    return true; // Failsafe
  }
};

/**
 * Checks if a NOTAM is scheduled for the future.
 * @param {object} notam - The NOTAM object.
 * @returns {boolean} - True if the NOTAM's start time is in the future.
 */
export const isNotamFuture = (notam) => {
  if (!notam.validFrom || notam.validFrom === 'PERMANENT') return false;
  try {
    const from = new Date(notam.validFrom);
    const now = new Date();
    return from > now;
  } catch {
    return false;
  }
};
