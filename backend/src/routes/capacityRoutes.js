const express = require('express');
const router = express.Router({ mergeParams: true });
const HospitalCapacity = require('../models/HospitalCapacity');
const { authenticate, authorizeRoles, requireHospitalOwnership } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

/**
 * PUT /api/hospitals/:id/capacity
 * Submit a timestamped capacity telemetry snapshot for a hospital.
 * Restricted to: hospital_admin (for their own hospital only)
 * RULE: Append-only telemetry history; never overwrites existing records.
 */
router.put(
  '/',
  authenticate,
  authorizeRoles('hospital_admin'),
  requireHospitalOwnership,
  async (req, res) => {
    try {
      const hospital = req.targetHospital;
      const { reportedAt, beds = {}, services = {}, specialistsOnCall = [], reportedBy, stalenessThresholdMinutes } = req.body;

      const snapshotTime = reportedAt ? new Date(reportedAt) : new Date();

      const newSnapshot = new HospitalCapacity({
        hospitalId: hospital._id,
        timestamp: snapshotTime,
        reportedAt: snapshotTime,
        stalenessThresholdMinutes: Number(stalenessThresholdMinutes) || 120,
        beds: {
          general: {
            total: Number(beds.general?.total) || hospital.bedCounts.general,
            occupied: Number(beds.general?.occupied) || 0,
            available: Number(beds.general?.available) || 0,
            reportedStatus: beds.general?.reportedStatus || (Number(beds.general?.available) > 0 ? 'available' : 'unavailable'),
          },
          emergency: {
            total: Number(beds.emergency?.total) || hospital.bedCounts.emergency,
            occupied: Number(beds.emergency?.occupied) || 0,
            available: Number(beds.emergency?.available) || 0,
            reportedStatus: beds.emergency?.reportedStatus || (Number(beds.emergency?.available) > 0 ? 'available' : 'unavailable'),
          },
          icu: {
            total: Number(beds.icu?.total) || hospital.bedCounts.icu,
            occupied: Number(beds.icu?.occupied) || 0,
            available: Number(beds.icu?.available) || 0,
            reportedStatus: beds.icu?.reportedStatus || (Number(beds.icu?.available) > 0 ? 'available' : 'unavailable'),
          },
          ventilators: {
            total: Number(beds.ventilators?.total) || hospital.equipment.ventilators?.count || 0,
            occupied: Number(beds.ventilators?.occupied) || 0,
            available: Number(beds.ventilators?.available) || 0,
            reportedStatus: beds.ventilators?.reportedStatus || (Number(beds.ventilators?.available) > 0 ? 'available' : 'unavailable'),
          },
        },
        services: {
          emergencyDepartment: {
            reportedStatus: services.emergencyDepartment?.reportedStatus || (hospital.has24x7Emergency ? 'available' : 'unavailable'),
            diversionActive: Boolean(services.emergencyDepartment?.diversionActive),
            note: services.emergencyDepartment?.note || '',
          },
          cardiacCathLab: {
            reportedStatus: services.cardiacCathLab?.reportedStatus || (hospital.equipment.cardiacCathLab?.available ? 'available' : 'unavailable'),
          },
          ctScan: {
            reportedStatus: services.ctScan?.reportedStatus || (hospital.equipment.ctScan?.available ? 'available' : 'unavailable'),
          },
          mri: {
            reportedStatus: services.mri?.reportedStatus || (hospital.equipment.mri?.available ? 'available' : 'unavailable'),
          },
          operatingTheatre: {
            reportedStatus: services.operatingTheatre?.reportedStatus || (hospital.equipment.operationTheatres?.available ? 'available' : 'unavailable'),
          },
          dialysis: {
            reportedStatus: services.dialysis?.reportedStatus || (hospital.equipment.dialysis?.available ? 'available' : 'unavailable'),
          },
          bloodBank: {
            reportedStatus: services.bloodBank?.reportedStatus || (hospital.equipment.bloodBank?.available ? 'available' : 'unavailable'),
          },
        },
        specialistsOnCall: Array.isArray(specialistsOnCall) ? specialistsOnCall : [],
        reportedBy: reportedBy || req.user.name,
        isSynthetic: true,
      });

      const saved = await newSnapshot.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_CAPACITY',
        resourceType: 'HospitalCapacity',
        resourceId: saved._id.toString(),
        hospitalId: hospital._id,
        accessGranted: true,
        justification: `Capacity telemetry recorded for ${hospital.name} at ${snapshotTime.toISOString()}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: {
          reportedAt: snapshotTime,
          icuAvailable: saved.beds.icu.available,
          ventilatorsAvailable: saved.beds.ventilators.available,
        },
      });

      return res.status(201).json({
        message: 'Capacity telemetry snapshot recorded successfully into append-only history.',
        snapshotId: saved._id,
        hospitalId: hospital._id,
        reportedAt: saved.reportedAt,
        beds: saved.beds,
        services: saved.services,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/hospitals/:id/capacity/latest
 * Fetch the latest capacity telemetry snapshot for a hospital.
 */
router.get('/latest', authenticate, async (req, res) => {
  try {
    const latest = await HospitalCapacity.findOne({ hospitalId: req.params.id })
      .sort({ timestamp: -1, reportedAt: -1 })
      .lean();

    if (!latest) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No capacity telemetry snapshots found for this hospital.',
      });
    }

    return res.json({ snapshot: latest });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

module.exports = router;
