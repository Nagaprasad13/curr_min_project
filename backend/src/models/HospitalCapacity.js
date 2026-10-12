const mongoose = require('mongoose');

const BedStatusSchema = new mongoose.Schema({
  total: { type: Number, default: 0, min: 0 },
  occupied: { type: Number, default: 0, min: 0 },
  available: { type: Number, default: 0, min: 0 },
  // Raw reported status from hospital telemetry
  reportedStatus: {
    type: String,
    enum: ['available', 'unavailable', 'unknown'],
    default: 'available',
  },
}, { _id: false });

const ServiceStatusSchema = new mongoose.Schema({
  reportedStatus: {
    type: String,
    enum: ['available', 'unavailable', 'unknown'],
    default: 'available',
  },
  diversionActive: { type: Boolean, default: false },
  note: { type: String, default: '' },
}, { _id: false });

const SpecialistOnCallStatusSchema = new mongoose.Schema({
  specialty: { type: String, required: true },
  count: { type: Number, default: 1, min: 0 },
  reportedStatus: {
    type: String,
    enum: ['available', 'unavailable', 'unknown'],
    default: 'available',
  },
}, { _id: false });

const HospitalCapacitySchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Hospital ID is required'],
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true,
  },
  reportedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  // Configurable freshness threshold in minutes (default 120 minutes = 2 hours)
  stalenessThresholdMinutes: {
    type: Number,
    default: 120,
    min: 5,
  },
  beds: {
    general: BedStatusSchema,
    emergency: BedStatusSchema,
    icu: BedStatusSchema,
    ventilators: BedStatusSchema,
  },
  services: {
    emergencyDepartment: ServiceStatusSchema,
    cardiacCathLab: ServiceStatusSchema,
    ctScan: ServiceStatusSchema,
    mri: ServiceStatusSchema,
    operatingTheatre: ServiceStatusSchema,
    dialysis: ServiceStatusSchema,
    bloodBank: ServiceStatusSchema,
  },
  specialistsOnCall: [SpecialistOnCallStatusSchema],
  reportedBy: {
    type: String,
    default: 'system_telemetry',
    trim: true,
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

HospitalCapacitySchema.index({ hospitalId: 1, timestamp: -1 });

/**
 * Checks if this capacity record is stale relative to referenceTime.
 * @param {Date} [referenceTime=new Date()]
 * @param {number} [customThresholdMinutes]
 * @returns {boolean}
 */
HospitalCapacitySchema.methods.isStale = function (referenceTime = new Date(), customThresholdMinutes) {
  const threshold = customThresholdMinutes !== undefined ? customThresholdMinutes : this.stalenessThresholdMinutes;
  const ageMs = referenceTime.getTime() - new Date(this.timestamp).getTime();
  const ageMinutes = ageMs / (1000 * 60);
  return ageMinutes > threshold;
};

/**
 * Resolves effective availability status for all beds and services.
 * CORE RESEARCH LOGIC: If data is older than stalenessThresholdMinutes,
 * any status is marked as 'unknown' rather than 'available'.
 * 
 * @param {Date} [referenceTime=new Date()]
 * @param {number} [customThresholdMinutes]
 * @param {boolean} [assumeAvailableIfStale=false] For baseline comparison experiment
 * @returns {object} Evaluated capacity with effective statuses and freshness metrics
 */
HospitalCapacitySchema.methods.getEvaluatedCapacity = function (
  referenceTime = new Date(),
  customThresholdMinutes,
  assumeAvailableIfStale = false
) {
  const threshold = customThresholdMinutes !== undefined ? customThresholdMinutes : this.stalenessThresholdMinutes;
  const ageMs = Math.max(0, referenceTime.getTime() - new Date(this.timestamp).getTime());
  const ageMinutes = Math.round((ageMs / (1000 * 60)) * 10) / 10;
  const isStale = ageMinutes > threshold;

  const resolveStatus = (rawStatus, availableCount = 0) => {
    if (isStale) {
      if (assumeAvailableIfStale) {
        // Ablation/baseline mode: naive systems assume still available
        return availableCount > 0 ? 'available' : 'unavailable';
      }
      // CareBridge Core Contribution: stale data MUST be treated as unknown
      return 'unknown';
    }
    return rawStatus;
  };

  const evaluateBed = (bed) => {
    if (!bed) return { total: 0, occupied: 0, available: 0, effectiveStatus: 'unknown', rawStatus: 'unknown' };
    const rawStatus = bed.reportedStatus || (bed.available > 0 ? 'available' : 'unavailable');
    const effectiveStatus = resolveStatus(rawStatus, bed.available);
    return {
      total: bed.total,
      occupied: bed.occupied,
      available: bed.available,
      rawStatus,
      effectiveStatus,
    };
  };

  const evaluateService = (service) => {
    if (!service) return { rawStatus: 'unknown', effectiveStatus: 'unknown' };
    const rawStatus = service.reportedStatus || 'unknown';
    const effectiveStatus = resolveStatus(rawStatus, 1);
    return {
      rawStatus,
      effectiveStatus,
      diversionActive: Boolean(service.diversionActive),
      note: service.note || '',
    };
  };

  return {
    hospitalId: this.hospitalId,
    timestamp: this.timestamp,
    ageMinutes,
    thresholdMinutes: threshold,
    isStale,
    evaluationPolicy: assumeAvailableIfStale ? 'assume_available_baseline' : 'freshness_aware_carebridge',
    beds: {
      general: evaluateBed(this.beds.general),
      emergency: evaluateBed(this.beds.emergency),
      icu: evaluateBed(this.beds.icu),
      ventilators: evaluateBed(this.beds.ventilators),
    },
    services: {
      emergencyDepartment: evaluateService(this.services.emergencyDepartment),
      cardiacCathLab: evaluateService(this.services.cardiacCathLab),
      ctScan: evaluateService(this.services.ctScan),
      dialysis: evaluateService(this.services.dialysis),
      bloodBank: evaluateService(this.services.bloodBank),
    },
  };
};

module.exports = mongoose.model('HospitalCapacity', HospitalCapacitySchema);
