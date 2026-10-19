import React, { useState, useEffect } from 'react';
import { apiFetch as fetch } from '../api';
import { EmptyState, Skeleton, Stepper } from '../design-system/components';
import { urgencyConfirmationError } from '../doctorFlow';
import { safeSchemeText } from '../schemeCopy';
import ReferralResultsMap from './ReferralResultsMap';

function getAvailableSpecialties(hospitals) {
  return [...new Set(hospitals.flatMap(({ specialties = [] }) => specialties))]
    .filter((specialty) => typeof specialty === 'string' && specialty.trim())
    .sort((first, second) => first.localeCompare(second));
}

export default function DoctorPortal({ token, doctorUser, initialTab = 'assessment' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [hospital, setHospital] = useState(null);
  const [availableSpecialties, setAvailableSpecialties] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');

  // Assessment Intake State
  const [intakeVitals, setIntakeVitals] = useState({
    age: '',
    gender: '',
    heartRate: '',
    respiratoryRate: '',
    systolicBp: '',
    spo2: '',
    temperature: '',
    chiefComplaint: '',
    chest_pain: false,
    stroke_signs: false,
    altered_consciousness: false,
    symptoms: [],
    comorbidities: [],
  });

  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [insufficientData, setInsufficientData] = useState(false);

  // Urgency Confirmation & Override State
  const [confirmedUrgency, setConfirmedUrgency] = useState('routine');
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [urgencyConfirmed, setUrgencyConfirmed] = useState(false);

  // Referral Engine State
  const [referralParams, setReferralParams] = useState({
    requiredSpecialty: '',
    urgency: 'routine',
    requiredEquipment: [],
    requiredBedType: 'none',
    capacityMode: 'unknown_aware',
    patientLocation: { latitude: '', longitude: '' },
  });
  const [recommendations, setRecommendations] = useState([]);
  const [excludedHospitals, setExcludedHospitals] = useState([]);
  const [referralLoading, setReferralLoading] = useState(false);
  const [selectedHospitalForReferral, setSelectedHospitalForReferral] = useState(null);
  const [currentReferralId, setCurrentReferralId] = useState(null);
  const [referralTimeLeft, setReferralTimeLeft] = useState(null);

  // Consented Records State
  const [records, setRecords] = useState(null);
  const [recordsConsentInfo, setRecordsConsentInfo] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [accessDeniedMsg, setAccessDeniedMsg] = useState(null);

  // Consent Request State
  const [consentRequestForm, setConsentRequestForm] = useState({
    purpose: 'referral',
    recordTypes: ['lab_report', 'prescription', 'discharge_summary'],
    durationDays: 7,
    includeSensitive: false,
  });

  // Schemes State
  const [schemeMatches, setSchemeMatches] = useState(null);
  const [schemeInputs, setSchemeInputs] = useState({
    stateResident: '',
    annualFamilyIncome: '',
    rationCardType: '',
    age: '',
    treatmentCategory: '',
  });

  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const retryPatientContext = async () => {
    const hospitalId = doctorUser?.hospitalId;
    if (!hospitalId) return;
    setErrorMsg(null);
    setPatientsLoading(true);
    try {
      const [patientsResponse, hospitalResponse] = await Promise.all([
        fetch('/api/patients?limit=100', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/hospitals/${hospitalId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [patientsData, hospitalData] = await Promise.all([patientsResponse.json(), hospitalResponse.json()]);
      if (!patientsResponse.ok) throw new Error(patientsData.message || 'Patient list could not be loaded.');
      if (!hospitalResponse.ok) throw new Error(hospitalData.message || 'Hospital profile could not be loaded.');
      setPatients(patientsData.patients || []);
      setHospital(hospitalData.hospital || hospitalData);
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setPatientsLoading(false);
    }
  };

  useEffect(() => {
    const hospitalId = doctorUser?.hospitalId;
    if (!hospitalId) return;
    const controller = new AbortController();
    setPatientsLoading(true);
    Promise.all([
      fetch(`/api/patients?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Patient list could not be loaded.');
        setPatients(data.patients || []);
      }),
      fetch(`/api/hospitals/${hospitalId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Hospital profile could not be loaded.');
        setHospital(data.hospital || data);
      }),
    ])
      .catch((error) => {
        if (error.name !== 'AbortError') setErrorMsg(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPatientsLoading(false);
      });
    return () => controller.abort();
  }, [doctorUser?.hospitalId, token]);

  useEffect(() => {
    if (!doctorUser?.hospitalId) return undefined;
    const controller = new AbortController();
    fetch('/api/hospitals?limit=100', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Verified hospital specialties could not be loaded.');
        setAvailableSpecialties(getAvailableSpecialties(data.hospitals || []));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setErrorMsg(error.message);
      });
    return () => controller.abort();
  }, [doctorUser?.hospitalId, token]);

  useEffect(() => {
    if (patients.length > 0 && !selectedPatientId) setSelectedPatientId(patients[0]._id);
  }, [patients, selectedPatientId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // 30-second Referral Expiry Countdown Timer
  useEffect(() => {
    if (referralTimeLeft === null || referralTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setReferralTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [referralTimeLeft]);

  // Run ML Intake Assessment
  const handleRunAssessment = async (simulateIncomplete = false) => {
    try {
      setAssessmentLoading(true);
      setErrorMsg(null);
      setAssessmentResult(null);
      setInsufficientData(false);

      const payload = simulateIncomplete
        ? { age: intakeVitals.age, gender: intakeVitals.gender } // Missing vitals
        : {
            age: Number(intakeVitals.age),
            gender: intakeVitals.gender,
            heartrate: Number(intakeVitals.heartRate),
            resprate: Number(intakeVitals.respiratoryRate),
            sbp: Number(intakeVitals.systolicBp),
            o2sat: Number(intakeVitals.spo2),
            temperature: Number(intakeVitals.temperature),
            chief_complaint: intakeVitals.chiefComplaint,
            chest_pain: intakeVitals.chest_pain,
            stroke_signs: intakeVitals.stroke_signs,
            altered_consciousness: intakeVitals.altered_consciousness,
          };

      // Detect insufficient data before forced prediction
      const requiredMeasurements = [
        [intakeVitals.age, 0, 125],
        [intakeVitals.heartRate, 20, 260],
        [intakeVitals.respiratoryRate, 4, 70],
        [intakeVitals.systolicBp, 40, 300],
        [intakeVitals.spo2, 50, 100],
        [intakeVitals.temperature, 25, 115],
      ];
      if (simulateIncomplete || !intakeVitals.gender || requiredMeasurements.some(([value, min, max]) => (
        value === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max
      ))) {
        setInsufficientData(true);
        setAssessmentLoading(false);
        return;
      }

      const res = await fetch('/api/referrals/assess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setAssessmentResult(data);
        const suggested = data.urgency || data.fused_urgency || 'urgent';
        setConfirmedUrgency(suggested);
        if (data.specialties && data.specialties.length > 0) {
          setReferralParams((prev) => ({
            ...prev,
            requiredSpecialty: data.specialties[0],
            urgency: suggested,
          }));
        }
      } else {
        setErrorMsg(data.message || 'Assessment failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setAssessmentLoading(false);
    }
  };

  // Confirm Urgency Step
  const handleConfirmUrgency = () => {
    const confirmationError = urgencyConfirmationError(isOverride, overrideReason);
    if (confirmationError) {
      setErrorMsg(confirmationError);
      return;
    }
    setUrgencyConfirmed(true);
    setReferralParams((prev) => ({
      ...prev,
      urgency: confirmedUrgency,
    }));
    setFeedbackMsg(`✓ Clinician confirmed urgency as "${confirmedUrgency.toUpperCase()}". Proceed to referral recommendations.`);
    setActiveTab('referrals');
  };

  // Run Referral Ranking Engine
  const handleQueryReferrals = async () => {
    const selectedPatient = patients.find((patient) => patient._id === selectedPatientId);
    if (!selectedPatient || !referralParams.requiredSpecialty.trim()) {
      setErrorMsg('Select a linked patient and enter a required specialty before ranking.');
      return;
    }
    const latitude = Number(referralParams.patientLocation.latitude);
    const longitude = Number(referralParams.patientLocation.longitude);
    if (
    !Number.isFinite(latitude) || latitude < 8 || latitude > 14
    || !Number.isFinite(longitude) || longitude < 76 || longitude > 81
    ) {
    setErrorMsg('Enter valid patient coordinates within the supported Tamil Nadu service area (latitude 8–14, longitude 76–81).');
    return;
    }
    try {
      setReferralLoading(true);
      setErrorMsg(null);
      setRecommendations([]);
      setExcludedHospitals([]);
      setCurrentReferralId(null);
      setReferralTimeLeft(null);

      const payload = {
        patientId: selectedPatientId,
        patientName: selectedPatient.name,
        requiredSpecialty: referralParams.requiredSpecialty,
        urgency: referralParams.urgency,
        requiredEquipment: referralParams.requiredEquipment,
        capacityMode: referralParams.capacityMode,
        patientLocation: { latitude, longitude },
        modelSuggestedUrgency: assessmentResult?.urgency || null,
        urgencyConfirmedByDoctor: true,
        urgencyOverrideReason: isOverride ? overrideReason : null,
      };

      const res = await fetch('/api/referrals/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        const rankedHospitals = data.recommendations || [];
        if (data.referralId && rankedHospitals.length > 0) {
          setCurrentReferralId(data.referralId);
          setReferralTimeLeft(30);
          setFeedbackMsg(`Referral draft ${data.referralId} created. It is not hospital acceptance or a bed reservation.`);
        } else {
          setFeedbackMsg(null);
        }
        setRecommendations(rankedHospitals);
        setExcludedHospitals(data.excludedHospitals || []);
      } else {
        setErrorMsg(data.message || 'Failed to query referral recommendations');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setReferralLoading(false);
    }
  };

  // Request Records Consent from Patient
  const handleRequestConsent = async (targetHospitalId) => {
    if (!selectedPatientId) return;
    try {
      setErrorMsg(null);
      setFeedbackMsg(null);

      const res = await fetch('/api/consents/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientId: selectedPatientId,
          purpose: 'referral',
          recordTypes: consentRequestForm.recordTypes,
          durationDays: consentRequestForm.durationDays,
          includeSensitiveRecords: consentRequestForm.includeSensitive,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg(`✓ Consent request ${data.consent.consentId} dispatched to patient. Awaiting affirmative patient grant.`);
      } else {
        setErrorMsg(data.message || 'Consent request failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Fetch Consented Records
  const handleFetchRecords = async () => {
    if (!selectedPatientId) return;
    try {
      setRecordsLoading(true);
      setErrorMsg(null);
      setAccessDeniedMsg(null);
      setRecords(null);

      const res = await fetch(`/api/patients/${selectedPatientId}/records`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setRecords(data.records || []);
        setRecordsConsentInfo(data.consent);
      } else if (res.status === 403 || res.status === 404) {
        setAccessDeniedMsg('No active, granted consent found. Access blocked under Zero Client Trust policy.');
      } else {
        setErrorMsg(data.message || 'Failed to retrieve records');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRecordsLoading(false);
    }
  };

  // Match Schemes for Patient
  const handleMatchSchemes = async () => {
    try {
      setErrorMsg(null);
      const res = await fetch('/api/schemes/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inputs: {
            stateResident: schemeInputs.stateResident === '' ? null : schemeInputs.stateResident === 'true',
            annualFamilyIncome: schemeInputs.annualFamilyIncome === '' ? null : Number(schemeInputs.annualFamilyIncome),
            rationCardType: schemeInputs.rationCardType || null,
            age: schemeInputs.age === '' ? null : Number(schemeInputs.age),
            treatmentCategory: schemeInputs.treatmentCategory || null,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSchemeMatches(data);
      } else {
        setErrorMsg(data.message || 'Scheme evaluation failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div id="doctor-portal-view" className="portal-container">
      {patientsLoading && <Skeleton lines={3} />}
      {errorMsg && <div className="clinical-warning-banner" role="alert">⚠️ {errorMsg} <button type="button" className="btn btn-outline btn-sm" onClick={retryPatientContext}>Retry patient and hospital data</button></div>}
      {feedbackMsg && <div className="clinical-notice-box" role="status" style={{ marginBottom: 16 }}>{feedbackMsg}</div>}

      {/* Patient Selector Bar */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label htmlFor="doctor-patient-select" style={{ fontSize: '0.85rem', fontWeight: 600, marginRight: 8 }}>
              Active Patient:
            </label>
            <select
              id="doctor-patient-select"
              className="form-input"
              style={{ display: 'block', width: '100%' }}
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              disabled={patientsLoading || patients.length === 0}
            >
              {patients.length === 0 && <option value="">{patientsLoading ? 'Loading linked patients…' : 'No linked patients available'}</option>}
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}{p.district ? ` (District: ${p.district})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Referring Hospital: <strong>{hospital?.name || (doctorUser?.hospitalId ? 'Loading hospital…' : 'No hospital assigned')}</strong>
          </div>
        </div>
      </div>

      {/* Doctor Tabs */}
      <div className="doctor-section-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          className={`btn ${activeTab === 'assessment' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('assessment')}
        >
          1. Triage & Screening Intake
        </button>
        <button
          className={`btn ${activeTab === 'referrals' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('referrals')}
        >
          2. Referral Ranking Engine
        </button>
        <button
          className={`btn ${activeTab === 'records' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('records')}
        >
          3. Consented Patient Records
        </button>
        <button
          className={`btn ${activeTab === 'schemes' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('schemes')}
        >
          4. Scheme Potential Matches
        </button>
      </div>
      {(activeTab === 'assessment' || activeTab === 'referrals') && (
        <Stepper
          currentStep={activeTab === 'assessment' ? (assessmentResult ? 2 : 1) : 3}
          steps={['Patient details', 'Assessment', 'Confirm urgency', 'Ranked hospitals', 'Send referral']}
        />
      )}

      {/* TAB 1: Structured Patient Input -> Screening & Triage Suggestions */}
      {activeTab === 'assessment' && (
        <div className="grid-2-col">
          {/* Intake Form */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🩺 Clinical Intake & Triage Assessment</h2>
              <p className="card-desc">Structured vitals and symptom flags support decision review. Written complaint is context only.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="form-label" htmlFor="inp-age">Age (years)</label>
                <input
                  id="inp-age"
                  className="form-input"
                  type="number"
                  min="0"
                  max="125"
                  value={intakeVitals.age}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, age: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="inp-gender">Sex recorded for assessment</label>
                <select
                  id="inp-gender"
                  className="form-input"
                  value={intakeVitals.gender}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, gender: e.target.value })}
                >
                  <option value="">Select</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="OTHER">Other / not specified</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="inp-hr">Heart Rate (bpm)</label>
                <input
                  id="inp-hr"
                  className="form-input"
                  type="number"
                  value={intakeVitals.heartRate}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, heartRate: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="inp-rr">Resp Rate (/min)</label>
                <input
                  id="inp-rr"
                  className="form-input"
                  type="number"
                  value={intakeVitals.respiratoryRate}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, respiratoryRate: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="inp-sbp">Systolic BP (mmHg)</label>
                <input
                  id="inp-sbp"
                  className="form-input"
                  type="number"
                  value={intakeVitals.systolicBp}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, systolicBp: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="inp-spo2">SpO2 (%)</label>
                <input
                  id="inp-spo2"
                  className="form-input"
                  type="number"
                  value={intakeVitals.spo2}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, spo2: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="inp-temperature">Temperature (°C or °F)</label>
                <input
                  id="inp-temperature"
                  className="form-input"
                  type="number"
                  min="25"
                  max="115"
                  step="any"
                  value={intakeVitals.temperature}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, temperature: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label" htmlFor="inp-complaint">Chief Complaint & Presentation (context)</label>
              <textarea
                id="inp-complaint"
                className="form-input"
                rows="2"
                value={intakeVitals.chiefComplaint}
                onChange={(e) => setIntakeVitals({ ...intakeVitals, chiefComplaint: e.target.value })}
              />
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
              <legend className="form-label">Reported emergency symptoms</legend>
              {[
                ['chest_pain', 'Chest pain'],
                ['stroke_signs', 'Stroke signs'],
                ['altered_consciousness', 'Altered consciousness'],
              ].map(([field, label]) => (
                <label key={field} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(intakeVitals[field])}
                    onChange={(event) => setIntakeVitals({ ...intakeVitals, [field]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                id="run-assessment-btn"
                className="btn btn-primary"
                onClick={() => handleRunAssessment(false)}
                disabled={assessmentLoading}
                style={{ flex: 1 }}
              >
                {assessmentLoading ? 'Evaluating ML Models...' : '🔍 Run Clinical Triage Assessment'}
              </button>
              <button
                id="run-incomplete-demo-btn"
                className="btn btn-outline"
                onClick={() => handleRunAssessment(true)}
                title="Checks the incomplete-data state without sending a prediction request"
              >
                Simulate Incomplete Vitals
              </button>
            </div>
          </div>

          {/* Assessment Suggestions & Urgency Confirmation Step */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">💡 Decision Support Suggestions & Urgency Confirmation</h2>
              <p className="card-desc">Model suggestions fused with red flag triggers. Clinician review mandatory.</p>
            </div>

            {insufficientData && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16 }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#dc2626' }}>⚠️ Insufficient Intake Data</h3>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#991b1b' }}>
                  Intake vitals are incomplete. CareBridge refuses to produce a forced algorithmic severity prediction. Please record objective vital signs before automated triage ranking.
                </p>
              </div>
            )}

            {assessmentResult && (
              <div>
                {/* Urgency Fusion Box */}
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span>Model Suggested Urgency:</span>
                    <strong>{assessmentResult.triage_urgency || assessmentResult.urgency}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span>Red Flag Clinical Triggers:</span>
                    <span>
                      {(assessmentResult.red_flags || []).length > 0 ? (
                        <span className="badge badge-danger">{(assessmentResult.red_flags || []).length} Detected</span>
                      ) : (
                        <span className="badge badge-success">0 None</span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: 8 }}>
                    <span><strong>Fused Recommended Urgency:</strong></span>
                    <strong style={{ color: '#0284c7', fontSize: '1.05rem' }}>
                      {assessmentResult.urgency?.toUpperCase()}
                    </strong>
                  </div>
                </div>

                {/* Top Contributing Features */}
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.88rem' }}>Top Contributing Clinical Features:</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.82rem', color: '#475569' }}>
                    {(assessmentResult.top_contributing_features || assessmentResult.top_contributors || []).map((feat, idx) => (
                      <li key={idx}>{feat}</li>
                    ))}
                  </ul>
                  {!(assessmentResult.top_contributing_features || assessmentResult.top_contributors || []).length && (
                    <p>No contributing features were returned by the assessment.</p>
                  )}
                </div>

                {/* Missing Tests List */}
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.88rem' }}>Recommended Immediate Diagnostics:</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(assessmentResult.recommended_tests || []).map((t, idx) => (
                      <span key={idx} className="badge badge-secondary">{t}</span>
                    ))}
                  </div>
                  {!(assessmentResult.recommended_tests || []).length && (
                    <p>No diagnostic suggestions were returned by the assessment.</p>
                  )}
                </div>

                {/* Interactive Urgency Confirmation Step */}
                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12 }}>
                  <h4 style={{ margin: '0 0 8px 0' }}>Clinician Urgency Sign-off:</h4>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="urgencyRadio"
                        checked={!isOverride}
                        onChange={() => {
                          setIsOverride(false);
                          setConfirmedUrgency(assessmentResult.urgency);
                        }}
                      />
                      <span>Accept Suggested ({assessmentResult.urgency})</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="urgencyRadio"
                        checked={isOverride}
                        onChange={() => setIsOverride(true)}
                      />
                      <span>Override Urgency</span>
                    </label>
                  </div>

                  {isOverride && (
                    <div style={{ marginBottom: 12 }}>
                      <select
                        className="form-input"
                        value={confirmedUrgency}
                        onChange={(e) => setConfirmedUrgency(e.target.value)}
                        style={{ marginBottom: 8 }}
                      >
                        <option value="emergency">Emergency (Immediate resuscitation required)</option>
                        <option value="urgent">Urgent (Transfer within 2-4 hours)</option>
                        <option value="routine">Routine (Elective specialty consultation)</option>
                      </select>
                      <textarea
                        className="form-input"
                        placeholder="Mandatory clinical justification for override (audit-logged)..."
                        rows="2"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <button
                    id="confirm-urgency-btn"
                    className="btn btn-success"
                    onClick={handleConfirmUrgency}
                    style={{ width: '100%' }}
                  >
                    ✓ Confirm Urgency & Proceed to Referral Engine
                  </button>
                </div>
              </div>
            )}

            {!assessmentResult && !insufficientData && (
              <p style={{ color: '#64748b', fontSize: '0.88rem' }}>
                Enter intake vitals and click "Run Clinical Triage Assessment" to generate decision support recommendations.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Referral View: Ranked Hospitals with Explanations */}
      {activeTab === 'referrals' && (
        <div className="card doctor-referral-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🏥 Capability-Verified Referral Engine Recommendations</h2>
              <p className="card-desc">
                Ranked by verified clinical capability first, then capacity freshness and straight-line distance.
              </p>
            </div>
            <button
              id="query-referrals-btn"
              className="btn btn-primary"
              onClick={handleQueryReferrals}
              disabled={referralLoading}
            >
              {referralLoading ? 'Evaluating Referral Engine...' : '⚡ Generate Ranked Recommendations'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <label className="form-label" htmlFor="required-specialty">Required specialty</label>
              <select
                id="required-specialty"
                className="form-input"
                value={referralParams.requiredSpecialty}
                onChange={(event) => setReferralParams({ ...referralParams, requiredSpecialty: event.target.value })}
                disabled={availableSpecialties.length === 0}
              >
                <option value="">Select an available specialty</option>
                {availableSpecialties.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
              </select>
              {availableSpecialties.length === 0 && (
                <small role="status">No specialties are listed by verified hospitals.</small>
              )}
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Urgency:</span>{' '}
              <span className="badge badge-warning">{referralParams.urgency?.toUpperCase() || 'NOT SET'}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Capacity Mode:</span>{' '}
              <span className="badge badge-secondary">Unknown-Aware (Stale data treated as Unknown)</span>
            </div>
          </div>
          <div className="grid-2-col" style={{ marginBottom: 16 }}>
            <div>
              <label className="form-label" htmlFor="patient-latitude">Patient latitude</label>
              <input id="patient-latitude" type="number" min="8" max="14" step="any" className="form-input" value={referralParams.patientLocation.latitude}
                onChange={(event) => setReferralParams({ ...referralParams, patientLocation: { ...referralParams.patientLocation, latitude: event.target.value } })} />
            </div>
            <div>
              <label className="form-label" htmlFor="patient-longitude">Patient longitude</label>
              <input id="patient-longitude" type="number" min="76" max="81" step="any" className="form-input" value={referralParams.patientLocation.longitude}
                onChange={(event) => setReferralParams({ ...referralParams, patientLocation: { ...referralParams.patientLocation, longitude: event.target.value } })} />
            </div>
          </div>
          <p className="form-hint">Use patient coordinates in the supported Tamil Nadu service area (latitude 8–14, longitude 76–81).</p>

          {currentReferralId && (
            <div
              style={{
                background: referralTimeLeft === 0 ? '#fef2f2' : '#f0fdf4',
                border: referralTimeLeft === 0 ? '1px solid #fca5a5' : '1px solid #86efac',
                borderRadius: 8,
                padding: '14px 18px',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                transition: 'all 0.3s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: referralTimeLeft === 0 ? '#991b1b' : '#166534',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Referral code:
                  </span>
                  <span
                    id="active-referral-id"
                    style={{
                      fontSize: '1.3rem',
                      color: referralTimeLeft === 0 ? '#b91c1c' : '#15803d',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      textDecoration: referralTimeLeft === 0 ? 'line-through' : 'none',
                    }}
                  >
                    {currentReferralId}
                  </span>
                  {referralTimeLeft === 0 ? (
                    <span className="badge badge-danger">Draft window expired</span>
                  ) : (
                    <span
                      className="badge badge-warning"
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      Draft expires in <strong>{referralTimeLeft}s</strong>
                    </span>
                  )}
                </div>
                {referralTimeLeft === 0 ? (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>
                    This referral draft has expired. Generate a fresh draft if needed.
                  </p>
                ) : (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#166534' }}>
                    This is a draft reference only. It is not hospital acceptance or a bed reservation.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {referralTimeLeft === 0 ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleQueryReferrals}
                    disabled={referralLoading}
                  >
                    🔄 Generate New Referral Code
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(currentReferralId);
                        setFeedbackMsg(`✓ Copied referral code ${currentReferralId} to clipboard.`);
                      }}
                      title="Copy referral code to clipboard"
                    >
                      📋 Copy Code
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleQueryReferrals}
                      title="Regenerate fresh referral code"
                    >
                      🔄 Reset 30s
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="doctor-results-layout">
              <div className="doctor-results-list">
              <h3 style={{ margin: '0 0 12px 0' }}>Ranked referral options:</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recommendations.map((h, idx) => (
                  <div
                    key={h.hospitalId || idx}
                    className="card"
                    style={{
                      background: idx === 0 ? '#f0fdf4' : '#f8fafc',
                      borderLeft: idx === 0 ? '6px solid #10b981' : '6px solid #cbd5e1',
                      marginBottom: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div className="facility-title-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            #{h.rank || idx + 1} {h.hospitalName || h.name}
                          </span>
                          <span className="badge badge-secondary">{h.tier} · Simulated verification (synthetic data)</span>
                          {idx === 0 && <span className="badge badge-success">Top-ranked (simulation)</span>}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                                District: <strong>{h.district}</strong> · Straight-line distance:{' '}
                                <strong>{h.distanceKm == null ? 'Not reported' : `${h.distanceKm.toFixed(1)} km`}</strong>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0284c7' }}>
                          Score: {h.score?.toFixed(3)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          Suitability: {h.scoreBreakdown?.clinicalSuitability?.toFixed(2) ?? '—'} | Distance: {h.scoreBreakdown?.distance?.toFixed(2) ?? '—'}
                        </div>
                      </div>
                    </div>

                    {/* Freshness & Telemetry Badges */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {h.capacityAgeMinutes != null && (
                        <span className="badge badge-secondary">
                          ICU data {(h.capacityAgeMinutes / 60).toFixed(1)}h old
                        </span>
                      )}
                      {h.capacityUnknown && (
                        <span className="badge badge-warning">
                          Unknown, confirm by phone
                        </span>
                      )}
                      {h.capacityAgeMinutes == null && (
                        <span className="badge badge-warning">Capacity age unknown · confirm by phone</span>
                      )}
                      {h.capacityState && (
                        <span className="badge badge-secondary">Capacity state: {h.capacityState}</span>
                      )}
                      {h.bedsAvailable?.icu !== undefined && (
                        <span className="badge badge-success">
                          ICU Beds Available: {h.bedsAvailable.icu}
                        </span>
                      )}
                    </div>

                    <div className="facility-evidence">
                      <p><strong>Matched capabilities:</strong> {Array.isArray(h.matchedCapabilities) && h.matchedCapabilities.length ? h.matchedCapabilities.join(', ') : `${referralParams.requiredSpecialty} requested; review the facility profile to confirm.`}</p>
                      {Array.isArray(h.schemeParticipation) && h.schemeParticipation.length > 0 && (
                        <p><strong>Scheme participation:</strong> {h.schemeParticipation.map(safeSchemeText).join(', ')} · hospital-reported, verify with scheme.</p>
                      )}
                      <details>
                        <summary>View ranking score breakdown</summary>
                        <dl>{Object.entries(h.scoreBreakdown || {}).filter(([, value]) => typeof value === 'number').map(([label, value]) => (
                          <div key={label}><dt>{label.replace(/([A-Z])/g, ' $1')}</dt><dd>{value.toFixed(3)}</dd></div>
                        ))}</dl>
                      </details>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155' }}>
                        Rationale: {h.rationale || 'Capability and distance signals contributed to this simulated ranking.'}
                      </p>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setSelectedHospitalForReferral(h);
                          handleRequestConsent(h.hospitalId);
                        }}
                      >
                        Select & Request Consent
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
              <ReferralResultsMap recommendations={recommendations} />
            </div>
          )}
          {!referralLoading && recommendations.length === 0 && (
            <EmptyState title={excludedHospitals.length > 0 ? 'No suitable hospitals found' : 'No referral results yet'}>
              {excludedHospitals.length > 0
                ? 'No verified hospital met the selected specialty, equipment, and service requirements. Review the exclusions and confirm the specialty selection.'
                : 'Select the patient details and requirements, then generate a referral ranking.'}
            </EmptyState>
          )}

          {/* Excluded Hospitals Section */}
          {excludedHospitals.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#991b1b' }}>Excluded facilities (ranking filters not met):</h3>
              <div style={{ overflowX: 'auto' }} role="region" aria-label="Excluded facilities table" tabIndex="0">
                <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                      <th style={{ padding: 8 }}>Hospital</th>
                      <th style={{ padding: 8 }}>District</th>
                      <th style={{ padding: 8 }}>Tier</th>
                      <th style={{ padding: 8 }}>Reason hospital was excluded in this simulation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excludedHospitals.slice(0, 8).map((ex, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #fee2e2' }}>
                        <td style={{ padding: 8 }}><strong>{ex.hospitalName || ex.name}</strong></td>
                        <td style={{ padding: 8 }}>{ex.district}</td>
                        <td style={{ padding: 8 }}>{ex.tier}</td>
                        <td style={{ padding: 8, color: '#b91c1c' }}>{ex.reason || ex.exclusionReason || 'No exclusion reason was returned.'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Consented Records Viewer */}
      {activeTab === 'records' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">📑 Consented Clinical Records Viewer</h2>
              <p className="card-desc">
                Protected retrieval verified by server-side consent state machine. Records older than 6 months flagged.
              </p>
            </div>
            <button
              id="fetch-consented-records-btn"
              className="btn btn-primary btn-sm"
              onClick={handleFetchRecords}
              disabled={recordsLoading}
            >
              {recordsLoading ? 'Verifying Consent...' : '🔓 Fetch Consented Records'}
            </button>
          </div>

          {accessDeniedMsg && (
            <div className="clinical-warning-banner" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
              🔒 {accessDeniedMsg}
            </div>
          )}

          {records && (
            <div>
              <div style={{ marginBottom: 12, padding: 8, background: '#f0fdf4', borderRadius: 6, fontSize: '0.85rem' }}>
                ✓ Server-side consent check passed. Active Consent ID: <strong>{recordsConsentInfo?.consentId}</strong> (Expires in {recordsConsentInfo?.remainingHours || '168'}h).
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                {records.map((r) => (
                  <div key={r.recordId} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="badge badge-secondary">{r.type}</span>
                      {r.isOlderThan6Months && (
                        <span className="badge badge-warning">⚠️ &gt;6 months old ({r.ageMonths}m)</span>
                      )}
                    </div>
                    <h4 style={{ margin: '0 0 4px 0' }}>{r.title || r.type}</h4>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                      Date: {new Date(r.recordDate).toLocaleDateString()} · Provenance: {r.provenance?.submittingDoctor || 'Synthetic Hospital'}
                    </div>
                    <div style={{ fontSize: '0.82rem', background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e2e8f0' }}>
                      {r.summary || 'Clinical investigation report and laboratory parameters.'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Schemes Matching */}
      {activeTab === 'schemes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🛡️ Possible programme matches</h2>
              <p className="card-desc">
                Compares the supplied details with public programme descriptions for CMCHIS, PM-JAY, and Rashtriya Arogya Nidhi.
              </p>
            </div>
          </div>
          <div className="grid-2-col" style={{ marginBottom: 16 }}>
            <label className="form-label">Tamil Nadu resident?
              <select className="form-input" value={schemeInputs.stateResident} onChange={(event) => setSchemeInputs({ ...schemeInputs, stateResident: event.target.value })}>
                <option value="">Not provided</option><option value="true">Yes</option><option value="false">No</option>
              </select>
            </label>
            <label className="form-label">Annual family income (INR)
              <input className="form-input" type="number" value={schemeInputs.annualFamilyIncome} onChange={(event) => setSchemeInputs({ ...schemeInputs, annualFamilyIncome: event.target.value })} />
            </label>
            <label className="form-label">Ration card category
              <select className="form-input" value={schemeInputs.rationCardType} onChange={(event) => setSchemeInputs({ ...schemeInputs, rationCardType: event.target.value })}>
                <option value="">Not provided</option><option value="PHH">PHH</option><option value="AAY">AAY</option><option value="BPL">BPL</option><option value="NPHH">NPHH</option><option value="none">None</option>
              </select>
            </label>
            <label className="form-label">Beneficiary age
              <input className="form-input" type="number" value={schemeInputs.age} onChange={(event) => setSchemeInputs({ ...schemeInputs, age: event.target.value })} />
            </label>
            <label className="form-label">Treatment category
              <input className="form-input" value={schemeInputs.treatmentCategory} onChange={(event) => setSchemeInputs({ ...schemeInputs, treatmentCategory: event.target.value })} />
            </label>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleMatchSchemes}>Check possible programme matches</button>

          {schemeMatches && (
            <div>
              <div className="clinical-notice-box" style={{ marginBottom: 16 }}>
                Possible match only. Not confirmed eligibility.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {(schemeMatches.results || []).map((m) => (
                  <div key={m.schemeId} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <h4 style={{ margin: 0 }}>{safeSchemeText(m.schemeName)}</h4>
                      <span className={`badge ${m.status === 'potential match' ? 'badge-success' : 'badge-warning'}`}>
                        {m.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>
                      Programme information source
                    </p>
                    <div style={{ fontSize: '0.8rem', color: '#0284c7' }}>
                      Programme source: <a href={m.officialPortalUrl} target="_blank" rel="noreferrer">Open information source in a new tab</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
