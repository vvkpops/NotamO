// FIR utility functions for managing FIR data and caching

// In-memory cache for FIR data
const FIR_CACHE = new Map();
const FIR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extract FIR code from NOTAM Q-line
 */
export function getFIRForICAO(icao, notams) {
  // Only extract from Q line in NOTAMs
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

  console.log(`⚠️ No FIR found in Q lines for ${icao}`);
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
