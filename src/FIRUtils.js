/**
 * FIR (Flight Information Region) Utilities
 * Handles FIR extraction, mapping, and caching
 */

// FIR cache to avoid duplicate fetches
const FIR_CACHE = new Map();
const FIR_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Extract FIR code from Q-line
 * Q-line format: Q) KZXX/... where KZXX is the FIR code
 */
export function extractFIRFromQLine(qLine) {
  if (!qLine || typeof qLine !== 'string') return null;
  
  // Q-line starts with FIR code: Q) CZUL/... or Q)CZUL/...
  const match = qLine.match(/Q\)?\s*([A-Z]{4})\//);
  if (match && match[1]) {
    console.log(`✅ Extracted FIR: ${match[1]} from Q-line`);
    return match[1];
  }
  
  console.log(`❌ Could not extract FIR from Q-line: ${qLine}`);
  return null;
}

/**
 * Extract FIR from NOTAM raw text
 */
export function extractFIRFromNotam(notamText) {
  if (!notamText || typeof notamText !== 'string') return null;
  
  // Look for Q) line in the text
  const qLineMatch = notamText.match(/Q\)?\s*([A-Z]{4})\//);
  if (qLineMatch && qLineMatch[1]) {
    return qLineMatch[1];
  }
  
  return null;
}

/**
 * Get cached FIR data
 */
export function getCachedFIRData(fir) {
  const cached = FIR_CACHE.get(fir);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp > FIR_CACHE_TTL) {
    FIR_CACHE.delete(fir);
    return null;
  }
  
  return cached.data;
}

/**
 * Set FIR data in cache
 */
export function setCachedFIRData(fir, data) {
  FIR_CACHE.set(fir, {
    data: data,
    timestamp: Date.now()
  });
}

/**
 * Clear FIR cache
 */
export function clearFIRCache() {
  FIR_CACHE.clear();
}

/**
 * Common ICAO to FIR mappings (for fallback when Q-line is not available)
 * This is a subset - expand as needed
 */
export const ICAO_TO_FIR_MAP = {
  // US Centers (ARTCC)
  'KJFK': 'KZNY', // New York Center
  'KLGA': 'KZNY',
  'KEWR': 'KZNY',
  'KBOS': 'KZBW', // Boston Center
  'KIAD': 'KZDC', // Washington Center
  'KDCA': 'KZDC',
  'KBWI': 'KZDC',
  'KATL': 'KZTL', // Atlanta Center
  'KORD': 'KZAU', // Chicago Center
  'KMDW': 'KZAU',
  'KDFW': 'KZFW', // Fort Worth Center
  'KDAL': 'KZFW',
  'KLAX': 'KZLA', // Los Angeles Center
  'KSAN': 'KZLA',
  'KSFO': 'KZOA', // Oakland Center
  'KOAK': 'KZOA',
  'KSEA': 'KZSE', // Seattle Center
  'KDEN': 'KZDV', // Denver Center
  'KMIA': 'KZMA', // Miami Center
  'KFLL': 'KZMA',
  'KMSP': 'KZMP', // Minneapolis Center
  'KCLE': 'KZOB', // Cleveland Center
  'KDTW': 'KZOB',
  'KIAH': 'KZHU', // Houston Center
  'KHOU': 'KZHU',
  'KMEM': 'KZME', // Memphis Center
  'KSTL': 'KZKC', // Kansas City Center
  'KMCI': 'KZKC',
  'KIND': 'KZID', // Indianapolis Center
  'KSLC': 'KZLC', // Salt Lake Center
  'KLAS': 'KZLA', // Los Angeles Center
  'KPHX': 'KZAB', // Albuquerque Center
  'KABQ': 'KZAB',
  
  // Canadian FIRs (already good coverage from Q-lines usually)
  'CYYZ': 'CZYZ', // Toronto FIR
  'CYOW': 'CZUL', // Montreal FIR  
  'CYUL': 'CZUL',
  'CYVR': 'CZVR', // Vancouver FIR
  'CYYC': 'CZEG', // Edmonton FIR
  'CYWG': 'CZWG', // Winnipeg FIR
  'CYQM': 'CZQM', // Moncton FIR
  'CYHZ': 'CZQM',
  'CYYT': 'CZQX', // Gander Oceanic
  
  // Add more mappings as needed
};

/**
 * Get FIR for an ICAO either from NOTAM Q-line or fallback mapping
 */
export function getFIRForICAO(icao, notamData) {
  // First, try to extract from actual NOTAM Q-lines
  if (notamData && notamData.length > 0) {
    for (const notam of notamData) {
      const fir = extractFIRFromNotam(notam.rawText || notam.summary);
      if (fir) {
        console.log(`📍 Found FIR ${fir} for ${icao} from NOTAM Q-line`);
        return fir;
      }
    }
  }
  
  // Fallback to static mapping
  const mappedFIR = ICAO_TO_FIR_MAP[icao];
  if (mappedFIR) {
    console.log(`📍 Using mapped FIR ${mappedFIR} for ${icao}`);
    return mappedFIR;
  }
  
  console.log(`❌ No FIR found for ${icao}`);
  return null;
}

/**
 * Separate NOTAMs into Aerodrome and FIR categories
 */
export function categorizeNotams(notams, icao, fir) {
  const aerodromeNotams = [];
  const firNotams = [];
  
  notams.forEach(notam => {
    // Check if this is specifically an aerodrome NOTAM
    // Usually has the ICAO in A) line or is about the specific airport
    const isAerodromeSpecific = 
      notam.icao === icao ||
      (notam.rawText && notam.rawText.includes(`A) ${icao}`)) ||
      (notam.summary && notam.summary.includes(`A) ${icao}`));
    
    if (isAerodromeSpecific) {
      aerodromeNotams.push(notam);
    } else {
      // If it's from the FIR fetch, it's a FIR NOTAM
      firNotams.push(notam);
    }
  });
  
  return { aerodromeNotams, firNotams };
}