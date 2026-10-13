import React, { useState, useEffect } from 'react';

export default function DoctorPortal({ token, doctorUser, patients = [] }) {
  const [activeTab, setActiveTab] = useState('assessment'); // 'assessment' | 'referrals' | 'records' | 'schemes'
  const [selectedPatientId, setSelectedPatientId] = useState('');

  // Assessment Intake State
  const [intakeVitals, setIntakeVitals] = useState({
    age: 54,
    gender: 'M',
    heartRate: 118,
    respiratoryRate: 28,
    systolicBp: 92,
    spo2: 89,
    temperature: 38.6,
    chiefComplaint: 'Severe shortness of breath, bilateral crackles, fever',
    symptoms: ['shortness of breath', 'fever', 'cough'],
    comorbidities: ['hypertension', 'type 2 diabetes'],
  });

  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [insufficientData, setInsufficientData] = useState(false);

  // Urgency Confirmation & Override State
  const [confirmedUrgency, setConfirmedUrgency] = useState('emergency');
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [urgencyConfirmed, setUrgencyConfirmed] = useState(false);

  // Referral Engine State
  const [referralParams, setReferralParams] = useState({
    requiredSpecialty: 'Pulmonology',
    urgency: 'emergency',
    requiredEquipment: ['ventilators'],
    requiredBedType: 'icu',
    capacityMode: 'unknown_aware',
    patientLocation: { latitude: 11.6643, longitude: 78.146 }, // Salem Centroid
  });
  const [recommendations, setRecommendations] = useState([]);
  const [excludedHospitals, setExcludedHospitals] = useState([]);
  const [referralLoading, setReferralLoading] = useState(false);
  const [selectedHospitalForReferral, setSelectedHospitalForReferral] = useState(null);

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

  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (patients.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patients[0]._id);
    }
  }, [patients]);

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
            vitals: {
              heart_rate: Number(intakeVitals.heartRate),
              respiratory_rate: Number(intakeVitals.respiratoryRate),
              systolic_bp: Number(intakeVitals.systolicBp),
              spo2: Number(intakeVitals.spo2),
              temperature: Number(intakeVitals.temperature),
            },
            symptoms: intakeVitals.symptoms,
            comorbidities: intakeVitals.comorbidities,
            chief_complaint: intakeVitals.chiefComplaint,
          };

      // Detect insufficient data before forced prediction
      if (simulateIncomplete || (!payload.vitals?.heart_rate && !payload.vitals?.spo2)) {
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
    if (isOverride && !overrideReason.trim()) {
      setErrorMsg('A clinical justification is required when overriding model suggested urgency.');
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
    try {
      setReferralLoading(true);
      setErrorMsg(null);
      setRecommendations([]);
      setExcludedHospitals([]);

      const payload = {
        patientId: selectedPatientId,
        patientName: 'Kavitha R. (Patient 1)',
        requiredSpecialty: referralParams.requiredSpecialty,
        urgency: referralParams.urgency,
        requiredEquipment: referralParams.requiredEquipment,
        capacityMode: referralParams.capacityMode,
        patientLocation: referralParams.patientLocation,
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
        setRecommendations(data.recommendations || []);
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
            stateResident: true,
            annualFamilyIncome: 95000,
            rationCardType: 'PHH',
            age: 54,
            treatmentCategory: referralParams.requiredSpecialty,
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
      {errorMsg && <div className="clinical-warning-banner" role="alert">⚠️ {errorMsg}</div>}
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
              style={{ display: 'inline-block', width: 'auto' }}
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} (District: {p.district}, Age: {p.age})
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Referring Hospital: <strong>Salem Mohan Kumaramangalam Medical College</strong>
          </div>
        </div>
      </div>

      {/* Doctor Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
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

      {/* TAB 1: Structured Patient Input -> Screening & Triage Suggestions */}
      {activeTab === 'assessment' && (
        <div className="grid-2-col">
          {/* Intake Form */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🩺 Clinical Intake & Triage Assessment</h2>
              <p className="card-desc">Structured patient input for ML-assisted risk triage and specialty screening.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
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
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label" htmlFor="inp-complaint">Chief Complaint & Presentation</label>
              <textarea
                id="inp-complaint"
                className="form-input"
                rows="2"
                value={intakeVitals.chiefComplaint}
                onChange={(e) => setIntakeVitals({ ...intakeVitals, chiefComplaint: e.target.value })}
              />
            </div>

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
                title="Demo: Tests incomplete intake data fallback"
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
                    {(assessmentResult.top_contributing_features || [
                      'SpO2 < 90% (Severe hypoxemia)',
                      'Tachypnea (Resp Rate 28/min)',
                      'Tachycardia (Heart Rate 118 bpm)',
                    ]).map((feat, idx) => (
                      <li key={idx}>{feat}</li>
                    ))}
                  </ul>
                </div>

                {/* Missing Tests List */}
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.88rem' }}>Recommended Immediate Diagnostics:</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(assessmentResult.recommended_tests || [
                      'Arterial Blood Gas (ABG)',
                      'Chest Radiograph / High-Resolution CT',
                      '12-lead Electrocardiogram',
                      'Serum Lactate & Inflammatory Markers',
                    ]).map((t, idx) => (
                      <span key={idx} className="badge badge-secondary">{t}</span>
                    ))}
                  </div>
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
        <div className="card">
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
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Required Specialty:</span>{' '}
              <strong>{referralParams.requiredSpecialty}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Urgency:</span>{' '}
              <span className="badge badge-warning">{referralParams.urgency?.toUpperCase()}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Capacity Mode:</span>{' '}
              <span className="badge badge-secondary">Unknown-Aware (Stale data treated as Unknown)</span>
            </div>
          </div>

          {recommendations.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px 0' }}>Ranked Eligible Facilities:</h3>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            #{idx + 1} {h.hospitalName}
                          </span>
                          <span className="badge badge-secondary">{h.tier}</span>
                          {idx === 0 && <span className="badge badge-success">Top Recommended</span>}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                          District: <strong>{h.district}</strong> · Straight-line Haversine distance:{' '}
                          <strong>{h.distanceKm?.toFixed(1) || '0'} km</strong>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0284c7' }}>
                          Score: {h.score?.toFixed(3)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          Capability: {h.scoreBreakdown?.capabilityScore?.toFixed(2)} | Dist: {h.scoreBreakdown?.distanceScore?.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Freshness & Telemetry Badges */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {h.capacityAgeHours !== undefined && (
                        <span className="badge badge-secondary">
                          ICU Telemetry: {h.capacityAgeHours.toFixed(1)}h old
                        </span>
                      )}
                      {h.capacityUnknown && (
                        <span className="badge badge-warning">
                          ⚠️ Capacity unknown, confirm by phone prior to transfer
                        </span>
                      )}
                      {h.bedsAvailable?.icu !== undefined && (
                        <span className="badge badge-success">
                          ICU Beds Available: {h.bedsAvailable.icu}
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155' }}>
                        Rationale: {h.rationale || 'Verified clinical specialty match and regional proximity.'}
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
          )}

          {/* Excluded Hospitals Section */}
          {excludedHospitals.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#991b1b' }}>Excluded Facilities (Clinical Criteria Not Met):</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                      <th style={{ padding: 8 }}>Hospital</th>
                      <th style={{ padding: 8 }}>District</th>
                      <th style={{ padding: 8 }}>Tier</th>
                      <th style={{ padding: 8 }}>Reason for Clinical Exclusion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excludedHospitals.slice(0, 8).map((ex, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #fee2e2' }}>
                        <td style={{ padding: 8 }}><strong>{ex.hospitalName || ex.name}</strong></td>
                        <td style={{ padding: 8 }}>{ex.district}</td>
                        <td style={{ padding: 8 }}>{ex.tier}</td>
                        <td style={{ padding: 8, color: '#b91c1c' }}>{ex.exclusionReason || 'Missing required specialty or equipment'}</td>
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
              <h2 className="card-title">🛡️ Patient Healthcare Scheme Potential Matches</h2>
              <p className="card-desc">
                Evaluates CMCHIS, PM-JAY, and Rashtriya Arogya Nidhi against patient criteria.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleMatchSchemes}>
              🔍 Check Potential Scheme Matches
            </button>
          </div>

          {schemeMatches && (
            <div>
              <div className="clinical-notice-box" style={{ marginBottom: 16 }}>
                {schemeMatches.mandatoryNotice}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                {(schemeMatches.results || []).map((m) => (
                  <div key={m.schemeId} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <h4 style={{ margin: 0 }}>{m.schemeName}</h4>
                      <span className={`badge ${m.status === 'potential match' ? 'badge-success' : 'badge-warning'}`}>
                        {m.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>
                      Authority: {m.authority}
                    </p>
                    <div style={{ fontSize: '0.8rem', color: '#0284c7' }}>
                      Official Portal: <a href={m.officialPortalUrl} target="_blank" rel="noreferrer">{m.officialPortalUrl}</a>
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
