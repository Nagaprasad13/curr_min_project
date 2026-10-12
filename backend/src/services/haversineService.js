/**
 * CareBridge Haversine Distance Service
 * 
 * Computes straight-line great-circle distance between two geographic coordinates
 * in kilometers using the Haversine formula.
 * 
 * CRITICAL CLINICAL NOTICE:
 * All distances computed by this service represent straight-line geographic distance,
 * NOT road travel time or ambulance transit duration.
 */

const EARTH_RADIUS_KM = 6371.0;
const STRAIGHT_LINE_NOTICE = 'Straight-line distance, not travel time';

/**
 * Calculates straight-line distance in kilometers between two geographic points.
 * 
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers (rounded to 2 decimal places)
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    throw new Error('All latitude and longitude coordinates must be provided.');
  }

  // Exact point identity
  if (lat1 === lat2 && lon1 === lon2) {
    return 0.0;
  }

  const toRadians = (deg) => (deg * Math.PI) / 180.0;

  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  // Clamp 'a' to [0, 1] to avoid floating point precision issues with Math.asin/atan2
  const clampedA = Math.min(1.0, Math.max(0.0, a));
  const c = 2.0 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1.0 - clampedA));

  const distance = EARTH_RADIUS_KM * c;
  return Math.round(distance * 100) / 100;
}

module.exports = {
  calculateHaversineDistance,
  STRAIGHT_LINE_NOTICE,
  EARTH_RADIUS_KM,
};
