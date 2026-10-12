/**
 * CareBridge Freshness Evaluation Service
 * 
 * Pure, deterministic function that evaluates capacity freshness against urgency thresholds.
 * 
 * CORE RESEARCH LOGIC:
 * If capacity telemetry is older than the max allowable age for the clinical urgency,
 * or if no capacity data was ever reported, effective capacity state is strictly "unknown".
 */

const freshnessConfig = require('../config/freshness.json');

/**
 * Formats duration in minutes into human-readable label (e.g. "35m old" or "2h 15m old").
 * @param {number} minutes
 * @returns {string}
 */
function formatAgeLabel(minutes) {
  if (minutes < 60) {
    return `${Math.round(minutes)}m old`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m old` : `${hours}h old`;
}

/**
 * Evaluates the effective availability state of a hospital's resource snapshot.
 * 
 * @param {object|null} snapshot Capacity snapshot object with timestamp / reportedAt
 * @param {string} resourceName Name of the bed or service (e.g. 'icu', 'emergency', 'ventilators', 'ctScan')
 * @param {string} urgency Urgency level: 'emergency' | 'urgent' | 'routine'
 * @param {string} [capacityMode='unknown_aware'] 'unknown_aware' (CareBridge) or 'assume_available' (naive baseline)
 * @param {Date} [now=new Date()] Reference evaluation time
 * @returns {object} { effectiveState: 'available'|'unavailable'|'unknown', reportedState, ageMinutes, ageLabel, isStale, maxAgeMinutes, count }
 */
function evaluateResourceFreshness(
  snapshot,
  resourceName,
  urgency = 'urgent',
  capacityMode = 'unknown_aware',
  now = new Date()
) {
  const maxAgeMinutes = freshnessConfig.maxAgeMinutes[urgency] || freshnessConfig.maxAgeMinutes.urgent;

  // Case 1: Hospital has never reported capacity telemetry
  if (!snapshot || (!snapshot.timestamp && !snapshot.reportedAt)) {
    const effectiveState = capacityMode === 'assume_available' ? 'available' : 'unknown';
    return {
      resourceName,
      effectiveState,
      reportedState: 'unknown',
      ageMinutes: null,
      ageLabel: capacityMode === 'assume_available'
        ? 'No capacity telemetry ever reported (naive mode: assumed available)'
        : 'No capacity telemetry ever reported (treated as unknown)',
      isStale: true,
      maxAgeMinutes,
      count: capacityMode === 'assume_available' ? 1 : 0,
      freshnessStatus: 'never_reported',
    };
  }

  const timestamp = new Date(snapshot.reportedAt || snapshot.timestamp);
  const ageMs = Math.max(0, now.getTime() - timestamp.getTime());
  const ageMinutes = Math.round((ageMs / (1000 * 60)) * 10) / 10;
  const isStale = ageMinutes > maxAgeMinutes;

  // Extract raw reported status from snapshot (beds, services, or direct resource key)
  let rawState = 'unknown';
  let count = 0;

  if (snapshot.beds && snapshot.beds[resourceName]) {
    const bed = snapshot.beds[resourceName];
    rawState = bed.reportedStatus || (bed.available > 0 ? 'available' : 'unavailable');
    count = bed.available || 0;
  } else if (snapshot.services && snapshot.services[resourceName]) {
    const service = snapshot.services[resourceName];
    rawState = service.reportedStatus || 'unknown';
    count = rawState === 'available' ? 1 : 0;
  } else if (snapshot.equipment && snapshot.equipment[resourceName]) {
    const eq = snapshot.equipment[resourceName];
    rawState = eq.reportedStatus || (eq.available ? 'available' : 'unavailable');
    count = eq.count || 0;
  } else if (snapshot[resourceName]) {
    const res = snapshot[resourceName];
    rawState = typeof res === 'object' ? (res.reportedStatus || (res.available ? 'available' : 'unavailable')) : res;
    count = typeof res === 'object' ? (res.count || res.available || 0) : 0;
  }

  // Determine effective state based on freshness and capacityMode
  let effectiveState = rawState;

  if (isStale) {
    if (capacityMode === 'assume_available') {
      // Naive baseline mode: assumes stale data is available
      effectiveState = 'available';
    } else if (capacityMode === 'trust_last_reported') {
      // Unadjusted historical mode: trusts last reported state without aging adjustment
      effectiveState = rawState;
    } else {
      // CareBridge Core Rule: Stale data MUST be treated as unknown
      effectiveState = 'unknown';
    }
  }

  const resourceTitle = resourceName.toUpperCase();
  let modeTag = 'stale, treated as unknown';
  if (capacityMode === 'assume_available') {
    modeTag = 'stale, assumed available';
  } else if (capacityMode === 'trust_last_reported') {
    modeTag = 'stale, trusted unadjusted';
  }

  const ageLabel = isStale
    ? `${resourceTitle} data ${formatAgeLabel(ageMinutes)} (${modeTag})`
    : `${resourceTitle} data ${formatAgeLabel(ageMinutes)} (fresh)`;

  return {
    resourceName,
    effectiveState,
    reportedState: rawState,
    ageMinutes,
    ageLabel,
    isStale,
    maxAgeMinutes,
    count,
    freshnessStatus: isStale ? 'stale' : 'fresh',
  };
}

module.exports = {
  evaluateResourceFreshness,
  formatAgeLabel,
  freshnessConfig,
};
