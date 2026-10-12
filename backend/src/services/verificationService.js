/**
 * CareBridge Simulated Verification Service
 * 
 * RESEARCH LIMITATION & AUTHENTICITY DISCLAIMER:
 * These automated checks verify document metadata presence, registration number formatting,
 * and internal clinical consistency (e.g., equipment vs specialty alignment).
 * They do NOT verify legal or physical authenticity. In real-world deployment,
 * authentic verification requires authoritative integration with the Tamil Nadu Clinical
 * Establishments Act portal or the National Health Authority Registry.
 */

/**
 * Runs simulated format and consistency checks on hospital capability submissions.
 * 
 * @param {object} hospital
 * @returns {object} { passedFormatChecks: boolean, warnings: Array<{code: string, message: string, severity: string}> }
 */
function performVerificationConsistencyChecks(hospital) {
  const warnings = [];

  // 1. Format check on registration / license number
  const regNum = (hospital.registrationNumber || '').trim();
  const licNum = (hospital.licenseNumber || '').trim();

  if (!regNum) {
    warnings.push({
      code: 'MISSING_REG_NUMBER',
      message: 'No clinical establishment registration number provided.',
      severity: 'high',
    });
  } else if (!/^[A-Z0-9\-\/]{4,25}$/i.test(regNum)) {
    warnings.push({
      code: 'INVALID_REG_FORMAT',
      message: `Registration number "${regNum}" does not adhere to standard Clinical Establishment ID format (4-25 alphanumeric/hyphen characters).`,
      severity: 'medium',
    });
  }

  if (licNum && !/^[A-Z0-9\-\/]{4,25}$/i.test(licNum)) {
    warnings.push({
      code: 'INVALID_LICENSE_FORMAT',
      message: `Operating license number "${licNum}" does not conform to expected format.`,
      severity: 'low',
    });
  }

  // 2. Required evidence documents check
  const evidenceDocs = Array.isArray(hospital.evidenceDocuments) ? hospital.evidenceDocuments : [];
  const docTypes = new Set(evidenceDocs.map(d => d.type));

  if (!docTypes.has('hospital_license') && !docTypes.has('clinical_establishment_reg')) {
    warnings.push({
      code: 'MISSING_MANDATORY_EVIDENCE',
      message: 'Mandatory establishment proof (hospital_license or clinical_establishment_reg) is missing from evidence documents.',
      severity: 'high',
    });
  }

  // 3. Internal Clinical Consistency Checks
  const specialties = new Set(hospital.specialties || []);
  const departments = new Set((hospital.departments || []).map(d => d.toLowerCase()));
  const equipment = hospital.equipment || {};
  const bedCounts = hospital.bedCounts || {};
  const icuBeds = Number(bedCounts.icu) || 0;
  const emergencyBeds = Number(bedCounts.emergency) || 0;
  const ventCount = equipment.ventilators?.available ? (Number(equipment.ventilators.count) || 0) : 0;

  // Consistency Check 3A: Claims MRI or CT, but no Radiology department or specialist
  const hasCt = equipment.ctScan?.available;
  const hasMri = equipment.mri?.available;
  const hasRadiologyDept = departments.has('radiology') || departments.has('imaging') || departments.has('radiodiagnosis');
  const hasRadiologist = Array.isArray(hospital.specialists) && hospital.specialists.some(s => /radiolog/i.test(s.specialty));

  if ((hasCt || hasMri) && !hasRadiologyDept && !hasRadiologist) {
    warnings.push({
      code: 'IMAGING_WITHOUT_RADIOLOGY',
      message: 'Hospital claims advanced cross-sectional imaging (CT / MRI) but lists neither a Radiology department nor a qualified radiologist.',
      severity: 'high',
    });
  }

  // Consistency Check 3B: Claims ICU beds, but zero ventilators
  if (icuBeds > 0 && ventCount === 0) {
    warnings.push({
      code: 'ICU_WITHOUT_VENTILATORS',
      message: `Hospital reports ${icuBeds} ICU beds but zero mechanical ventilators. Clinical standard requires invasive ventilatory capability in ICU.`,
      severity: 'high',
    });
  }

  // Consistency Check 3C: Claims 24x7 Emergency service, but 0 emergency beds
  if (hospital.has24x7Emergency && emergencyBeds === 0) {
    warnings.push({
      code: 'EMERGENCY_SERVICE_NO_BEDS',
      message: 'Hospital claims 24x7 Emergency Services, but designated emergency bed count is 0.',
      severity: 'medium',
    });
  }

  // Consistency Check 3D: Claims Cardiac Cath Lab, but no Cardiology specialty
  if (equipment.cardiacCathLab?.available && !specialties.has('Cardiology')) {
    warnings.push({
      code: 'CATHLAB_WITHOUT_CARDIOLOGY',
      message: 'Hospital reports an operational Cardiac Cath Lab, but Cardiology is not listed in active medical specialties.',
      severity: 'high',
    });
  }

  // Consistency Check 3E: Claims Dialysis units, but no Nephrology specialty
  if (equipment.dialysis?.available && !specialties.has('Nephrology')) {
    warnings.push({
      code: 'DIALYSIS_WITHOUT_NEPHROLOGY',
      message: 'Hospital reports hemodialysis capability without Nephrology listed among clinical specialties.',
      severity: 'medium',
    });
  }

  // Consistency Check 3F: ICU beds exceed total inpatient capacity
  const totalInpatient = (Number(bedCounts.general) || 0) + emergencyBeds + icuBeds;
  if (icuBeds > totalInpatient) {
    warnings.push({
      code: 'INVALID_BED_RATIO',
      message: `ICU bed count (${icuBeds}) exceeds total inpatient bed sum (${totalInpatient}).`,
      severity: 'high',
    });
  }

  return {
    passedFormatChecks: warnings.filter(w => w.severity === 'high').length === 0,
    warnings,
    authenticityDisclaimer: 'Simulated consistency check only. Verification confirms data formatting and structural capability alignment, NOT regulatory authenticity.',
  };
}

module.exports = {
  performVerificationConsistencyChecks,
};
