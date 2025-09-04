/**
 * NotamUtils.js
 * 
 * This file acts as a bridge to the shared utility functions. It imports from
 * the shared utils file and re-exports them, allowing the frontend components
 * to continue using their existing import paths without modification.
 */

// Import all shared functions
import {
  parseDate,
  isNotamCurrent,
  isNotamFuture,
  getTimeStatus,
  getNotamFlags,
  getNotamType,
  getHeadClass,
  getHeadTitle,
  extractRunways
} from '../../api/notam-shared-utils.js';

// Re-export the shared functions for use in the frontend
export {
  parseDate,
  isNotamCurrent,
  isNotamFuture,
  getTimeStatus,
  getNotamFlags,
  getNotamType,
  getHeadClass,
  getHeadTitle,
  extractRunways
};

// --- Frontend-Only Utilities ---

export const needsExpansion = (summary) => {
  return summary && summary.length > 250;
};