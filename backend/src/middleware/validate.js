const { z } = require('zod');

// Schema for Hospital Registration & Capability Editing
const hospitalValidationSchema = z.object({
  name: z.string().min(3, 'Hospital name must be at least 3 characters'),
  code: z.string().min(3, 'Hospital code must be at least 3 characters').optional(),
  registrationNumber: z.string().min(3, 'Registration number is required and must be at least 3 characters'),
  licenseNumber: z.string().optional(),
  district: z.string().min(2, 'Valid district in Tamil Nadu is required'),
  location: z.object({
    latitude: z.number()
      .min(8.0, 'Latitude must be within Tamil Nadu (>= 8.0)')
      .max(14.0, 'Latitude must be within Tamil Nadu (<= 14.0)'),
    longitude: z.number()
      .min(76.0, 'Longitude must be within Tamil Nadu (>= 76.0)')
      .max(81.0, 'Longitude must be within Tamil Nadu (<= 81.0)'),
  }),
  address: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().email('Valid email is required').optional(),
    emergencyHelpline: z.string().optional(),
  }).optional(),
  ownership: z.enum(['government', 'private_trust', 'private_corporate']).default('government'),
  has24x7Emergency: z.boolean().default(false),
  bedCounts: z.object({
    total: z.number().int().min(0, 'Total bed count cannot be negative').optional(),
    general: z.number().int().min(0, 'General bed count cannot be negative').default(0),
    emergency: z.number().int().min(0, 'Emergency bed count cannot be negative').default(0),
    icu: z.number().int().min(0, 'ICU bed count cannot be negative').default(0),
    nicu: z.number().int().min(0, 'NICU bed count cannot be negative').default(0),
  }).refine((beds) => {
    const total = beds.total !== undefined ? beds.total : (beds.general + beds.emergency + beds.icu);
    return beds.icu <= total;
  }, {
    message: 'ICU beds cannot exceed total beds',
    path: ['icu'],
  }),
  departments: z.array(z.string()).optional().default([]),
  specialties: z.array(z.string()).min(1, 'At least 1 medical specialty is required'),
  specialists: z.array(z.object({
    specialty: z.string(),
    count: z.number().int().min(0).default(1),
    onCall24x7: z.boolean().default(false),
  })).optional().default([]),
  equipment: z.object({
    ventilators: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    ctScan: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    mri: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    xray: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    ultrasound: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    operationTheatres: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    bloodBank: z.object({ available: z.boolean().default(false), licenseValid: z.boolean().default(false) }).optional(),
    dialysis: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    cardiacCathLab: z.object({ available: z.boolean().default(false), count: z.number().int().min(0).default(0) }).optional(),
    lab: z.object({ available: z.boolean().default(false), level: z.enum(['basic', 'advanced', 'reference']).default('basic') }).optional(),
  }).optional().default({}),
  schemeParticipation: z.array(z.object({
    schemeCode: z.enum(['CMCHIS', 'PM-JAY']),
    empaneled: z.boolean().default(false),
    validUntil: z.string().optional(),
    specialtiesCovered: z.array(z.string()).optional(),
  })).optional().default([]),
  evidenceDocuments: z.array(z.object({
    type: z.enum(['hospital_license', 'clinical_establishment_reg', 'fire_safety_noc', 'pollution_control_cert', 'nabh_accreditation', 'radiology_aerb_license']),
    fileReference: z.string(),
    originalFileName: z.string(),
    fileSize: z.number().optional(),
    mimeType: z.string().optional(),
  })).optional().default([]),
});

const hospitalUpdateValidationSchema = hospitalValidationSchema.partial();

/**
 * Express middleware to validate request body using a Zod schema.
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.validatedBody = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues || [];
        return res.status(400).json({
          error: 'Validation Error',
          message: 'The submitted hospital data failed input validation rules.',
          issues: issues.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ error: 'Invalid Request', message: err.message });
    }
  };
}

module.exports = {
  hospitalValidationSchema,
  hospitalUpdateValidationSchema,
  validateBody,
};
