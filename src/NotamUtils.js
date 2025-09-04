/**
 * NotamUtils.js - Fixed with comprehensive date/time handling
 * 
 * Contains advanced utility functions for parsing, classifying, and handling NOTAM data,
 * with proper timezone-aware date parsing and status checking.
 */

// --- Enhanced Date/Time Parsing Functions ---

/**
 * Parse various NOTAM date formats into a standardized Date object
 * @param {string|null|undefined} dateString - Date string in various formats
 * @returns {Date|null} - Parsed Date object or null if invalid
 */
export const parseDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const cleanDate = dateString.trim();
  const upperDate = cleanDate.toUpperCase();

  // Handle permanent dates
  if (['PERM', 'PERMANENT', 'PERMAMENT'].includes(upperDate)) {
    return null; // Permanent dates don't have an end
  }

  // Handle ISO 8601 format
  if (cleanDate.includes('T')) {
    try {
      let isoString = cleanDate;
      // Add Z if no timezone specified (treat as UTC)
      if (!upperDate.match(/Z$|[+-]\d{2}:?\d{2}$/)) {
        isoString += 'Z';
      }
      
      const date = new Date(isoString);
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      console.warn(`Failed to parse ISO date: ${dateString}`);
    }
  }

  // Handle YYMMDDHHMM format (with or without timezone)
  const ymdMatch = upperDate.match(/^(\d{10})([A-Z]{2,4})?$/);
  if (ymdMatch) {
    try {
      const digits = ymdMatch[1];
      const year = 2000 + parseInt(digits.substring(0, 2));
      const month = parseInt(digits.substring(2, 4));
      const day = parseInt(digits.substring(4, 6));
      const hour = parseInt(digits.substring(6, 8));
      const minute = parseInt(digits.substring(8, 10));

      // Validate components
      if (month < 1 || month > 12 || day < 1 || day > 31 || 
          hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
      }

      // Create UTC date (most NOTAM times are in UTC or local time treated as UTC)
      const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      console.warn(`Failed to parse YYMMDDHHMM date: ${dateString}`);
    }
  }

  // Fallback to native Date parsing
  try {
    const fallbackDate = new Date(cleanDate);
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  } catch (e) {
    return null;
  }
};

/**
 * Check if a NOTAM is currently active
 * @param {Object} notam - NOTAM object with validFrom and validTo properties
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {boolean} - True if NOTAM is currently active
 */
export const isNotamCurrent = (notam, currentTime = new Date()) => {
  if (!notam || !notam.validFrom) {
    return false;
  }

  // Handle permanent NOTAMs
  if (notam.validTo === 'PERMANENT' || notam.validTo === 'PERM') {
    const validFrom = parseDate(notam.validFrom);
    return validFrom ? currentTime >= validFrom : true;
  }

  try {
    const validFrom = parseDate(notam.validFrom);
    const validTo = parseDate(notam.validTo);

    if (!validFrom) {
      return false; // Can't determine without start date
    }

    const isAfterStart = currentTime >= validFrom;
    const isBeforeEnd = !validTo || currentTime <= validTo;

    return isAfterStart && isBeforeEnd;
  } catch (e) {
    console.warn(`Error checking NOTAM currency:`, e);
    return false;
  }
};

/**
 * Check if a NOTAM is scheduled for the future
 * @param {Object} notam - NOTAM object with validFrom property
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {boolean} - True if NOTAM starts in the future
 */
export const isNotamFuture = (notam, currentTime = new Date()) => {
  if (!notam || !notam.validFrom) {
    return false;
  }

  try {
    const validFrom = parseDate(notam.validFrom);
    return validFrom ? currentTime < validFrom : false;
  } catch (e) {
    console.warn(`Error checking NOTAM future status:`, e);
    return false;
  }
};

/**
 * Check if a NOTAM has expired
 * @param {Object} notam - NOTAM object with validTo property
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {boolean} - True if NOTAM has expired
 */
export const isNotamExpired = (notam, currentTime = new Date()) => {
  if (!notam || !notam.validTo) {
    return false;
  }

  // Permanent NOTAMs never expire
  if (notam.validTo === 'PERMANENT' || notam.validTo === 'PERM') {
    return false;
  }

  try {
    const validTo = parseDate(notam.validTo);
    return validTo ? currentTime > validTo : false;
  } catch (e) {
    console.warn(`Error checking NOTAM expiry:`, e);
    return false;
  }
};

/**
 * Get comprehensive time status of a NOTAM
 * @param {Object} notam - NOTAM object
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {string} - 'future', 'active', 'expired', or 'unknown'
 */
export const getNotamTimeStatus = (notam, currentTime = new Date()) => {
  if (!notam) return 'unknown';

  try {
    if (isNotamFuture(notam, currentTime)) return 'future';
    if (isNotamCurrent(notam, currentTime)) return 'active';
    if (isNotamExpired(notam, currentTime)) return 'expired';
    return 'unknown';
  } catch (e) {
    console.warn(`Error determining NOTAM time status:`, e);
    return 'unknown';
  }
};

// --- Enhanced Classification Functions ---

export const getNotamFlags = (notam) => {
  const text = (notam.summary || '').toUpperCase();
  const rawText = (notam.rawText || '').toUpperCase();
  const combinedText = `${text} ${rawText}`;
  
  return {
    isILS: /\b(ILS|LOCALIZER|GLIDESLOPE|GS|LOC)\b/.test(combinedText),
    isRunway: /\b(RWY|RUNWAY)\b/.test(combinedText),
    isTaxiway: /\b(TWY|TAXIWAY)\b/.test(combinedText),
    isFuel: /\bFUEL\b/.test(combinedText),
    isCancelled: notam.isCancellation || (notam.type === "C" || /\b(CANCELLED|CNL)\b/.test(combinedText)),
    isRSC: /\bRSC\b/.test(combinedText),
    isCRFI: /\bCRFI\b/.test(combinedText),
    isLighting: /\b(LGT|LIGHTS|LIGHTING|PAPI|VASI|ALS|REIL)\b/.test(combinedText),
    isConstruction: /\b(CONSTRUCTION|CONST|WORK|MAINT|MAINTENANCE)\b/.test(combinedText),
    isObstruction: /\b(OBST|OBSTRUCTION|CRANE|OBSTACLE)\b/.test(combinedText),
  };
};

export const getNotamType = (notam) => {
  const flags = getNotamFlags(notam);
  const text = (notam.summary || '').toUpperCase();
  const rawText = (notam.rawText || '').toUpperCase();
  const combinedText = `${text} ${rawText}`;

  // Prioritize cancellation status
  if (flags.isCancelled) return 'cancelled';
  
  // Check for ILS/Nav aids FIRST (before runway check)
  if (flags.isILS || /\b(VOR|DME|NDB|TACAN|RNAV|GPS|WAAS|APPROACH|APP|PRECISION)\b/.test(combinedText)) {
    return 'ils';
  }
  
  // Surface conditions take priority over runway classification
  if (flags.isRSC) return 'rsc';
  if (flags.isCRFI) return 'crfi';
  
  // Check for runway (after ILS/Nav checks)
  if (flags.isRunway && !/\b(ILS|LOC|GS|GLIDESLOPE|LOCALIZER)\b/.test(combinedText)) {
    return 'rwy';
  }
  
  if (flags.isTaxiway) return 'twy';
  if (flags.isFuel) return 'fuel';
  if (flags.isLighting) return 'lighting';
  if (flags.isConstruction) return 'construction';
  if (flags.isObstruction) return 'obstruction';
  
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
    lighting: 'LIGHTING SYSTEMS',
    construction: 'CONSTRUCTION',
    obstruction: 'OBSTRUCTION',
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

// --- Enhanced Date Formatting Functions ---

/**
 * Format a date for display in the UI
 * @param {string|Date} date - Date to format
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted date string
 */
export const formatDateForDisplay = (date, options = {}) => {
  const {
    showSeconds = false,
    showTimezone = true,
    format = 'standard' // 'standard', 'compact', 'relative'
  } = options;

  if (!date) return 'N/A';
  
  const dateStr = String(date).toUpperCase();
  if (['PERM', 'PERMANENT', 'PERMAMENT'].includes(dateStr)) {
    return 'PERMANENT';
  }

  try {
    const parsedDate = typeof date === 'string' ? parseDate(date) : date;
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return date.toString();
    }

    const formatOptions = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    };

    if (showSeconds) {
      formatOptions.second = '2-digit';
    }

    let formatted = parsedDate.toLocaleString('en-GB', formatOptions);
    
    if (showTimezone) {
      formatted += ' UTC';
    }

    if (format === 'compact') {
      formatted = formatted.replace(/(\d{4})/, "'$1").replace(/,/, '');
    }

    return formatted;
  } catch (e) {
    console.warn(`Error formatting date: ${date}`, e);
    return String(date);
  }
};

/**
 * Get relative time description (e.g., "in 2 hours", "3 days ago")
 * @param {string|Date} date - Date to compare
 * @param {Date} baseDate - Base date for comparison (defaults to now)
 * @returns {string} - Relative time description
 */
export const getRelativeTime = (date, baseDate = new Date()) => {
  if (!date) return '';
  
  const dateStr = String(date).toUpperCase();
  if (['PERM', 'PERMANENT', 'PERMAMENT'].includes(dateStr)) {
    return 'Permanent';
  }

  try {
    const parsedDate = typeof date === 'string' ? parseDate(date) : date;
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return '';
    }

    const diffMs = parsedDate.getTime() - baseDate.getTime();
    const diffMinutes = Math.abs(Math.floor(diffMs / (1000 * 60)));
    const diffHours = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
    const diffDays = Math.abs(Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    const isPast = diffMs < 0;
    const suffix = isPast ? 'ago' : 'from now';

    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? 'now' : `${diffMinutes} min ${suffix}`;
    } else if (diffHours < 24) {
      return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ${suffix}`;
    } else if (diffDays < 30) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ${suffix}`;
    } else {
      return formatDateForDisplay(parsedDate, { showTimezone: false, format: 'compact' });
    }
  } catch (e) {
    console.warn(`Error calculating relative time: ${date}`, e);
    return '';
  }
};

/**
 * Check if two dates represent the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} - True if same day
 */
export const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;
  
  try {
    const d1 = typeof date1 === 'string' ? parseDate(date1) : date1;
    const d2 = typeof date2 === 'string' ? parseDate(date2) : date2;
    
    if (!d1 || !d2) return false;
    
    return d1.getUTCFullYear() === d2.getUTCFullYear() &&
           d1.getUTCMonth() === d2.getUTCMonth() &&
           d1.getUTCDate() === d2.getUTCDate();
  } catch (e) {
    return false;
  }
};

// --- Priority and Severity Functions ---

/**
 * Get priority score for sorting NOTAMs
 * @param {Object} notam - NOTAM object
 * @returns {number} - Priority score (higher = more important)
 */
export const getNotamPriority = (notam) => {
  const type = getNotamType(notam);
  const flags = getNotamFlags(notam);
  const text = (notam.summary || notam.rawText || '').toUpperCase();
  
  let priority = 0;
  
  // Base priority by type
  const typePriority = {
    cancelled: 10,
    rwy: 9,
    ils: 8,
    rsc: 7,
    crfi: 6,
    obstruction: 5,
    lighting: 4,
    twy: 3,
    fuel: 2,
    construction: 1,
    other: 0
  };
  
  priority += typePriority[type] || 0;
  
  // Boost for critical keywords
  if (/\b(CLOSED|CLSD|DANGEROUS|HAZARD|EMERGENCY)\b/.test(text)) {
    priority += 15;
  }
  
  if (/\b(OUT OF SERVICE|U\/S|UNSERVICEABLE)\b/.test(text)) {
    priority += 10;
  }
  
  // Boost for current/active NOTAMs
  if (isNotamCurrent(notam)) {
    priority += 5;
  }
  
  // Slight boost for future NOTAMs
  if (isNotamFuture(notam)) {
    priority += 2;
  }
  
  return priority;
};

/**
 * Get severity level for UI styling
 * @param {Object} notam - NOTAM object
 * @returns {string} - Severity level: 'critical', 'high', 'medium', 'low'
 */
export const getNotamSeverity = (notam) => {
  const priority = getNotamPriority(notam);
  const text = (notam.summary || notam.rawText || '').toUpperCase();
  
  // Critical: Runway closures, dangerous conditions
  if (priority >= 15 || /\b(RWY.*CLOSED|DANGEROUS|HAZARD|EMERGENCY)\b/.test(text)) {
    return 'critical';
  }
  
  // High: ILS/Nav out, major obstructions
  if (priority >= 8 || /\b(ILS.*U\/S|OBSTRUCTION.*RWY)\b/.test(text)) {
    return 'high';
  }
  
  // Medium: Taxiways, lighting, surface conditions
  if (priority >= 3) {
    return 'medium';
  }
  
  // Low: Everything else
  return 'low';
};

// --- Validation Functions ---

/**
 * Validate NOTAM data structure
 * @param {Object} notam - NOTAM object to validate
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
export const validateNotam = (notam) => {
  const errors = [];
  
  if (!notam) {
    errors.push('NOTAM object is null or undefined');
    return { isValid: false, errors };
  }
  
  // Check required fields
  if (!notam.id) errors.push('Missing NOTAM ID');
  if (!notam.summary && !notam.rawText) errors.push('Missing NOTAM text content');
  if (!notam.source) errors.push('Missing NOTAM source');
  
  // Validate dates
  if (notam.validFrom) {
    const fromDate = parseDate(notam.validFrom);
    if (!fromDate && notam.validFrom !== 'PERMANENT') {
      errors.push(`Invalid validFrom date: ${notam.validFrom}`);
    }
  }
  
  if (notam.validTo && notam.validTo !== 'PERMANENT') {
    const toDate = parseDate(notam.validTo);
    if (!toDate) {
      errors.push(`Invalid validTo date: ${notam.validTo}`);
    }
  }
  
  // Check date logic
  if (notam.validFrom && notam.validTo && 
      notam.validFrom !== 'PERMANENT' && notam.validTo !== 'PERMANENT') {
    const fromDate = parseDate(notam.validFrom);
    const toDate = parseDate(notam.validTo);
    
    if (fromDate && toDate && fromDate > toDate) {
      errors.push('validFrom date is after validTo date');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Sanitize NOTAM text for display
 * @param {string} text - Raw NOTAM text
 * @returns {string} - Sanitized text
 */
export const sanitizeNotamText = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};
