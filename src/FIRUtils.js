// FIR utility functions for managing FIR data and caching

// In-memory cache for FIR data
const FIR_CACHE = new Map();
const FIR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Canadian FIR mapping database
export const CANADIAN_FIR_DATABASE = {
  // Eastern Canada
  'CZUL': ['CYUL', 'CYOW', 'CYQB', 'CYMX', 'CYND', 'CYHU', 'CYVO'], // Montreal FIR
  'CZYZ': ['CYYZ', 'CYTZ', 'CYHM', 'CYKF', 'CYXU', 'CYKZ', 'CYOO'], // Toronto FIR
  'CZQM': ['CYHZ', 'CYSJ', 'CYFC', 'CYQM', 'CYYT', 'CYAW', 'CYCH'], // Moncton FIR
  'CZQX': ['CYQX', 'CYDF', 'CYYT', 'CYJT', 'CYYR', 'CYAY'], // Gander FIR
  
  // Central Canada  
  'CZWG': ['CYWG', 'CYQR', 'CYXE', 'CYPA', 'CYMM', 'CYTH', 'CYBR'], // Winnipeg FIR
  'CZEG': ['CYEG', 'CYQF', 'CYQL', 'CYOD', 'CYOJ', 'CYYC', 'CYCA'], // Edmonton FIR
  'CZVR': ['CYVR', 'CYXX', 'CYLW', 'CYCD', 'CYYJ', 'CYBL'], // Vancouver FIR
  
  // Arctic
  'CZYZ': ['CYFB', 'CYEV', 'CYFS'], // Extended for Arctic coverage
};

// US FIR mapping database
export const US_FIR_DATABASE = {
  'KZNY': ['KJFK', 'KLGA', 'KEWR', 'KISP', 'KHPN'], // New York
  'KZBW': ['KBOS', 'KBDL', 'KPVD', 'KMHT'], // Boston
  'KZDC': ['KDCA', 'KIAD', 'KBWI', 'KRIC'], // Washington
  'KZTL': ['KATL', 'KCLT', 'KRDU', 'KGSO'], // Atlanta
  'KZJX': ['KJAX', 'KTPA', 'KMCO', 'KRSW'], // Jacksonville
  'KZMA': ['KMIA', 'KFLL', 'KPBI', 'KEYW'], // Miami
  'KZAU': ['KORD', 'KMDW', 'KMKE', 'KGRR'], // Chicago
  'KZOB': ['KCLE', 'KPIT', 'KCVG', 'KCMH'], // Cleveland
  'KZID': ['KIND', 'KSDF', 'KLEX'], // Indianapolis
  'KZME': ['KMEM', 'KBNA', 'KTYS'], // Memphis
  'KZFW': ['KDFW', 'KDAL', 'KHOU', 'KIAH'], // Fort Worth
  'KZKC': ['KMCI', 'KSTL', 'KTUL', 'KICT'], // Kansas City
  'KZMP': ['KMSP', 'KMKE', 'KDSM', 'KFAR'], // Minneapolis
  'KZDV': ['KDEN', 'KCOS', 'KPHX', 'KTUS'], // Denver
  'KZAB': ['KABQ', 'KELP', 'KTUS'], // Albuquerque
  'KZLA': ['KLAX', 'KSAN', 'KLAS', 'KSFO'], // Los Angeles
  'KZOA': ['KSFO', 'KOAK', 'KSJC', 'KSMF'], // Oakland
  'KZSE': ['KSEA', 'KPDX', 'KGEG', 'KBOI'], // Seattle
  'KZLC': ['KSLC', 'KBOI', 'KBIL'], // Salt Lake City
  'PAZA': ['PANC', 'PAFA', 'PAJN'], // Alaska
  'TJZS': ['TJSJ', 'TIST', 'TISX'], // San Juan
};

// Combined reverse mapping: ICAO -> FIR
const ICAO_TO_FIR_MAP = {};

// Build US mappings
for (const [fir, icaos] of Object.entries(US_FIR_DATABASE)) {
  for (const icao of icaos) {
    ICAO_TO_FIR_MAP[icao] = fir;
  }
}

// Build Canadian mappings
for (const [fir, icaos] of Object.entries(CANADIAN_FIR_DATABASE)) {
  for (const icao of icaos) {
    ICAO_TO_FIR_MAP[icao] = fir;
  }
}

/**
 * Get Canadian FIR based on prefix and location
 */
function getCanadianFIR(icao) {
  // Direct lookup first
  if (ICAO_TO_FIR_MAP[icao]) {
    return ICAO_TO_FIR_MAP[icao];
  }
  
  // Regional mapping based on second letter for Canadian airports
  const regionalMap = {
    'CY': { // Major airports starting with CY
      'YU': 'CZUL', // Montreal region
      'YO': 'CZUL', // Ottawa region  
      'YQ': 'CZUL', // Quebec region
      'YY': 'CZYZ', // Toronto region
      'YH': 'CZQM', // Halifax/Maritime
      'YS': 'CZQM', // Saint John region
      'YT': 'CZQX', // St. John's
      'YW': 'CZWG', // Winnipeg region
      'YE': 'CZEG', // Edmonton region
      'YV': 'CZVR', // Vancouver region
      'YC': 'CZEG', // Calgary (Edmonton FIR)
    }
  };
  
  // Try to match by first 2 letters after C
  const prefix = icao.substring(1, 3);
  if (regionalMap.CY && regionalMap.CY[prefix]) {
    return regionalMap.CY[prefix];
  }
  
  // Fallback based on geographic regions (third letter)
  const thirdLetter = icao.charAt(2);
  const geographicMap = {
    'U': 'CZUL', // Quebec
    'O': 'CZUL', // Ontario East
    'Y': 'CZYZ', // Ontario Central
    'H': 'CZQM', // Maritime
    'Q': 'CZUL', // Quebec
    'T': 'CZQX', // Newfoundland
    'W': 'CZWG', // Manitoba
    'E': 'CZEG', // Alberta
    'V': 'CZVR', // BC
    'C': 'CZEG', // Alberta (Calgary)
    'R': 'CZWG', // Saskatchewan
    'X': 'CZWG', // Saskatchewan
  };
  
  return geographicMap[thirdLetter] || null;
}

/**
 * Extract FIR code from ICAO and NOTAM data
 */
export function getFIRForICAO(icao, notams) {
  // Canadian ICAOs - use mapping
  if (icao.startsWith('C')) {
    const canadianFIR = getCanadianFIR(icao);
    if (canadianFIR) {
      console.log(`🍁 Found Canadian FIR ${canadianFIR} for ${icao}`);
      return canadianFIR;
    }
    console.log(`⚠️ No Canadian FIR mapping found for ${icao}`);
    return null;
  }

  // US ICAOs - Try to extract from Q line in NOTAMs first (most accurate)
  if (notams && notams.length > 0) {
    for (const notam of notams) {
      if (notam.rawText) {
        const qLineMatch = notam.rawText.match(/Q\)\s*([A-Z]{4})\//);
        if (qLineMatch) {
          const fir = qLineMatch[1];
          console.log(`🔍 Found FIR ${fir} in Q line for ${icao}`);
          return fir;
        }
      }
    }
  }

  // Check direct mapping for US
  if (ICAO_TO_FIR_MAP[icao]) {
    console.log(`📍 Found FIR ${ICAO_TO_FIR_MAP[icao]} from mapping for ${icao}`);
    return ICAO_TO_FIR_MAP[icao];
  }

  // For US airports without direct mapping, try regional detection
  if (icao.startsWith('K')) {
    console.log(`⚠️ No FIR mapping found for ${icao}, would need extended database`);
  }
  
  // Alaska
  if (icao.startsWith('PA')) return 'PAZA';
  // Caribbean
  if (icao.startsWith('TJ')) return 'TJZS';

  return null;
}

/**
 * Check if FIR code is Canadian
 */
export function isCanadianFIR(firCode) {
  return firCode && firCode.startsWith('CZ');
}

/**
 * Extract FIR from NOTAM text directly
 */
export function extractFIRFromNotam(notamText) {
  if (!notamText) return null;
  
  const qLineMatch = notamText.match(/Q\)\s*([A-Z]{4})\//);
  if (qLineMatch) {
    return qLineMatch[1];
  }
  
  return null;
}

/**
 * Get cached FIR data
 */
export function getCachedFIRData(firCode) {
  const cached = FIR_CACHE.get(firCode);
  
  if (!cached) {
    return null;
  }
  
  const age = Date.now() - cached.timestamp;
  if (age > FIR_CACHE_TTL) {
    FIR_CACHE.delete(firCode);
    return null;
  }
  
  console.log(`📦 Using cached FIR data for ${firCode} (${Math.round(age / 1000)}s old)`);
  return cached.data;
}

/**
 * Set cached FIR data
 */
export function setCachedFIRData(firCode, data) {
  FIR_CACHE.set(firCode, {
    data: data,
    timestamp: Date.now()
  });
  console.log(`💾 Cached FIR data for ${firCode}`);
}

/**
 * Clear FIR cache
 */
export function clearFIRCache() {
  FIR_CACHE.clear();
  console.log('🗑️ FIR cache cleared');
}

/**
 * Check if FIR needs refresh
 */
export function shouldRefreshFIR(firCode) {
  const cached = FIR_CACHE.get(firCode);
  
  if (!cached) {
    return true;
  }
  
  const age = Date.now() - cached.timestamp;
  return age > FIR_CACHE_TTL;
}

/**
 * Get all FIRs from a list of ICAOs
 */
export function getAllFIRsForICAOs(icaosWithData) {
  const firs = new Set();
  
  for (const { icao, notams } of icaosWithData) {
    const fir = getFIRForICAO(icao, notams);
    if (fir) {
      firs.add(fir);
    }
  }
  
  return Array.from(firs);
}