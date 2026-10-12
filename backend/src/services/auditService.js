const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');

/**
 * Append-only audit logger for tracking clinical actions, capability modifications,
 * and verification transitions.
 * 
 * @param {object} params
 * @returns {Promise<object>} Created AuditLog document
 */
async function recordAuditLog({
  actorId,
  actorRole = 'system',
  action,
  resourceType,
  resourceId,
  patientId,
  hospitalId,
  accessGranted = true,
  justification,
  ipAddress = '127.0.0.1',
  userAgent,
  meta = {},
}) {
  try {
    const logId = `AUD-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    const logEntry = new AuditLog({
      logId,
      actorId,
      actorRole,
      action,
      resourceType,
      resourceId: String(resourceId || ''),
      patientId,
      hospitalId,
      accessGranted,
      justification,
      ipAddress,
      userAgent,
      meta,
      timestamp: new Date(),
    });

    await logEntry.save();
    return logEntry;
  } catch (err) {
    // Non-blocking log failure warning to preserve API availability
    console.error(`[Audit Log Failure] Failed to record audit log for action ${action}:`, err.message);
    return null;
  }
}

module.exports = {
  recordAuditLog,
};
