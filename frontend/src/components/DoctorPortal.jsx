import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch as fetch } from '../api';
import { EmptyState, Skeleton, Stepper } from '../design-system/components';
import { urgencyConfirmationError } from '../doctorFlow';
import { safeSchemeText } from '../schemeCopy';
import ReferralResultsMap from './ReferralResultsMap';

function getAvailableSpecialties(hospitals) {
  return [...new Set(hospitals.flatMap(({ specialties = [] }) => specialties))]
    .filter((s) => typeof s === 'string' && s.trim())
    .sort((a, b) => a.localeCompare(b));
}

function UrgencyPill({ urgency }) {
  const map = {
    emergency: { bg: '#FEE2E2', color: '#B91C1C', label: 'EMERGENCY' },
    urgent: { bg: '#FEF3C7', color: '#92400E', label: 'URGENT' },
    routine: { bg: '#DBEAFE', color: '#1E40AF', label: 'ROUTINE' },
  };
  const s = map[urgency] || { bg: '#EFF6FF', color: '#1D4ED8', label: (urgency || '?').toUpperCase() };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: 999,
        padding: '3px 12px',
        fontSize: '0.75rem',
        fontWeight: 700,
        border: `1px solid ${s.color}33`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }}></span>
      {s.label}
    </span>
  );
}

function VitalCard({ label, value, unit, normal }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #BFDBFE',
        borderRadius: 10,
        padding: '12px 14px',
        boxShadow: '0 1px 3px rgba(29, 78, 216, 0.05)',
      }}
    >
      <div style={{ fontSize: '0.72rem', color: '#1D4ED8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1E3A8A', marginTop: 2 }}>
        {value ?? '—'} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#3B82F6' }}>{unit}</span>
      </div>
      <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 2 }}>Normal: {normal}</div>
    </div>
  );
}

export default function DoctorPortal({ token, doctorUser, initialTab = 'assessment' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [hospital, setHospital] = useState(null);
  const [availableSpecialties, setAvailableSpecialties] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [sourceNurseSubmission, setSourceNurseSubmission] = useState(null);

  // Triage Queue State
  const [triageQueue, setTriageQueue] = useState([]);
  const [triageQueueLoading, setTriageQueueLoading] = useState(false);
  const [triageQueueMsg, setTriageQueueMsg] = useState(null);
  const [selectedTriageRecord, setSelectedTriageRecord] = useState(null);

  // My Nurses State
  const [myNurses, setMyNurses] = useState([]);
  const [availableNurses, setAvailableNurses] = useState([]);
  const [nursesLoading, setNursesLoading] = useState(false);
  const [nurseMsg, setNurseMsg] = useState(null);
  const [nurseError, setNurseError] = useState(null);

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
  });
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [insufficientData, setInsufficientData] = useState(false);

  // Urgency Confirmation State
  const [confirmedUrgency, setConfirmedUrgency] = useState('routine');
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Referral State
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
  const [currentReferralId, setCurrentReferralId] = useState(null);
  const [referralTimeLeft, setReferralTimeLeft] = useState(null);

  // Records State
  const [records, setRecords] = useState(null);
  const [recordsConsentInfo, setRecordsConsentInfo] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [accessDeniedMsg, setAccessDeniedMsg] = useState(null);
  const [consentRequestForm] = useState({
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

  // ── Data Loaders ────────────────────────────────────────────────────────────
  const loadPatients = useCallback(async (signal) => {
    const hospitalId = doctorUser?.hospitalId;
    if (!hospitalId) return;
    setPatientsLoading(true);
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(`/api/patients?limit=100`, { headers: { Authorization: `Bearer ${token}` }, signal }),
        fetch(`/api/hospitals/${hospitalId}`, { headers: { Authorization: `Bearer ${token}` }, signal }),
      ]);
      const [pData, hData] = await Promise.all([pRes.json(), hRes.json()]);
      if (!pRes.ok) throw new Error(pData.message);
      if (!hRes.ok) throw new Error(hData.message);
      setPatients(pData.patients || []);
      setHospital(hData.hospital || hData);
    } catch (e) {
      if (e.name !== 'AbortError') setErrorMsg(e.message);
    } finally {
      if (!signal?.aborted) setPatientsLoading(false);
    }
  }, [doctorUser?.hospitalId, token]);

  const loadTriageQueue = useCallback(async () => {
    setTriageQueueLoading(true);
    setTriageQueueMsg(null);
    try {
      const res = await fetch('/api/triage/doctor/queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTriageQueue(data.records || []);
        if (data.message) setTriageQueueMsg(data.message);
      } else {
        setTriageQueueMsg(data.message || 'Failed to load triage queue.');
      }
    } catch (e) {
      setTriageQueueMsg(e.message);
    } finally {
      setTriageQueueLoading(false);
    }
  }, [token]);

  const loadNurses = useCallback(async () => {
    setNursesLoading(true);
    setNurseError(null);
    try {
      const [myRes, allRes] = await Promise.all([
        fetch('/api/triage/doctor/my-nurses', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/triage/doctor/available-nurses', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [myData, allData] = await Promise.all([myRes.json(), allRes.json()]);
      setMyNurses(myData.nurses || []);
      setAvailableNurses(allData.nurses || []);
    } catch (e) {
      setNurseError(e.message);
    } finally {
      setNursesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadPatients(ctrl.signal);
    return () => ctrl.abort();
  }, [loadPatients]);

  useEffect(() => {
    if (!doctorUser?.hospitalId) return;
    const ctrl = new AbortController();
    fetch('/api/hospitals?limit=100', {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) setAvailableSpecialties(getAvailableSpecialties(d.hospitals || []));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [doctorUser?.hospitalId, token]);

  useEffect(() => {
    if (patients.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patients[0]._id);
    }
  }, [patients, selectedPatientId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'triage_queue') loadTriageQueue();
    if (activeTab === 'nurses') loadNurses();
  }, [activeTab, loadTriageQueue, loadNurses]);

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

  // ── Nurse Management Actions ────────────────────────────────────────────────
  const handleAddNurse = async (nurseId) => {
    setNurseError(null);
    setNurseMsg(null);
    try {
      const res = await fetch('/api/triage/doctor/add-nurse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nurseId }),
      });
      const data = await res.json();
      if (res.ok) {
        setNurseMsg(data.message);
        loadNurses();
        loadTriageQueue();
      } else {
        setNurseError(data.message || 'Failed to add nurse.');
      }
    } catch (e) {
      setNurseError(e.message);
    }
  };

  const handleRemoveNurse = async (nurseId) => {
    setNurseError(null);
    setNurseMsg(null);
    try {
      const res = await fetch('/api/triage/doctor/remove-nurse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nurseId }),
      });
      const data = await res.json();
      if (res.ok) {
        setNurseMsg(data.message);
        loadNurses();
        loadTriageQueue();
      } else {
        setNurseError(data.message || 'Failed to remove nurse.');
      }
    } catch (e) {
      setNurseError(e.message);
    }
  };

  // ── Action: Treat Patient from Nurse Submission ────────────────────────────
  const handleTreatPatientFromTriage = (record) => {
    if (!record) return;
    const p = record.patientId;
    if (p && p._id) {
      setSelectedPatientId(p._id);
    }
    const v = record.vitals || {};
    const redFlags = record.redFlags || [];

    setIntakeVitals({
      age: p?.age != null ? String(p.age) : (v.age != null ? String(v.age) : ''),
      gender: p?.gender === 'female' || p?.gender === 'F' ? 'F' : p?.gender === 'male' || p?.gender === 'M' ? 'M' : 'OTHER',
      heartRate: v.heartRate != null ? String(v.heartRate) : '',
      respiratoryRate: v.respiratoryRate != null ? String(v.respiratoryRate) : '',
      systolicBp: v.systolicBp != null ? String(v.systolicBp) : '',
      spo2: v.spo2 != null ? String(v.spo2) : '',
      temperature: v.temperature != null ? String(v.temperature) : '',
      chiefComplaint: record.chiefComplaint?.text || record.chiefComplaint?.category || '',
      chest_pain: redFlags.some((f) => /chest/i.test(f)) || Boolean(record.chest_pain),
      stroke_signs: redFlags.some((f) => /stroke|neuro/i.test(f)) || Boolean(record.stroke_signs),
      altered_consciousness: redFlags.some((f) => /conscious|avpu|gcs/i.test(f)) || Boolean(record.altered_consciousness),
    });

    if (record.modelSuggestedUrgency) {
      setConfirmedUrgency(record.modelSuggestedUrgency);
      setReferralParams((prev) => ({
        ...prev,
        urgency: record.modelSuggestedUrgency,
      }));
    }

    setSourceNurseSubmission({
      nurseName: record.recordedBy?.name || 'Assigned Nurse',
      triageId: record.triageId,
      time: record.ageDisplay,
    });

    setFeedbackMsg(`Loaded nurse submission for ${p?.name || 'patient'}. Clinical vitals pre-populated for treatment.`);
    setActiveTab('assessment');
  };

  // ── Assessment Action ───────────────────────────────────────────────────────
  const handleRunAssessment = async (simulateIncomplete = false) => {
    setAssessmentLoading(true);
    setErrorMsg(null);
    setAssessmentResult(null);
    setInsufficientData(false);

    try {
      const required = [
        [intakeVitals.age, 0, 125],
        [intakeVitals.heartRate, 20, 260],
        [intakeVitals.respiratoryRate, 4, 70],
        [intakeVitals.systolicBp, 40, 300],
        [intakeVitals.spo2, 50, 100],
        [intakeVitals.temperature, 25, 115],
      ];

      if (
        simulateIncomplete ||
        !intakeVitals.gender ||
        required.some(([v, min, max]) => v === '' || !Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max)
      ) {
        setInsufficientData(true);
        setAssessmentLoading(false);
        return;
      }

      const payload = {
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

      const res = await fetch('/api/referrals/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setAssessmentResult(data);
        const suggested = data.urgency || 'urgent';
        setConfirmedUrgency(suggested);
        if (data.specialties?.length > 0) {
          setReferralParams((p) => ({ ...p, requiredSpecialty: data.specialties[0], urgency: suggested }));
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

  const handleConfirmUrgency = () => {
    const err = urgencyConfirmationError(isOverride, overrideReason);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setReferralParams((p) => ({ ...p, urgency: confirmedUrgency }));
    setFeedbackMsg(`Urgency confirmed as "${confirmedUrgency.toUpperCase()}". Proceed to referral recommendations.`);
    setActiveTab('referrals');
  };

  // ── Referral Action ─────────────────────────────────────────────────────────
  const handleQueryReferrals = async () => {
    const selPat = patients.find((p) => p._id === selectedPatientId);
    if (!selPat || !referralParams.requiredSpecialty.trim()) {
      setErrorMsg('Select a patient and specialty.');
      return;
    }
    const lat = Number(referralParams.patientLocation.latitude);
    const lon = Number(referralParams.patientLocation.longitude);
    if (!Number.isFinite(lat) || lat < 8 || lat > 14 || !Number.isFinite(lon) || lon < 76 || lon > 81) {
      setErrorMsg('Enter valid coordinates within the Tamil Nadu service area (lat 8–14, lon 76–81).');
      return;
    }

    setReferralLoading(true);
    setErrorMsg(null);
    setRecommendations([]);
    setExcludedHospitals([]);
    setCurrentReferralId(null);
    setReferralTimeLeft(null);

    try {
      const res = await fetch('/api/referrals/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: selectedPatientId,
          patientName: selPat.name,
          requiredSpecialty: referralParams.requiredSpecialty,
          urgency: referralParams.urgency,
          requiredEquipment: referralParams.requiredEquipment,
          capacityMode: referralParams.capacityMode,
          patientLocation: { latitude: lat, longitude: lon },
          modelSuggestedUrgency: assessmentResult?.urgency || null,
          urgencyConfirmedByDoctor: true,
          urgencyOverrideReason: isOverride ? overrideReason : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const ranked = data.recommendations || [];
        if (data.referralId && ranked.length > 0) {
          setCurrentReferralId(data.referralId);
          setReferralTimeLeft(30);
          setFeedbackMsg(`Referral draft ${data.referralId} created.`);
        } else {
          setFeedbackMsg(null);
        }
        setRecommendations(ranked);
        setExcludedHospitals(data.excludedHospitals || []);
      } else {
        setErrorMsg(data.message || 'Failed to query referral recommendations.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setReferralLoading(false);
    }
  };

  const handleRequestConsent = async (targetHospitalId) => {
    if (!selectedPatientId) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/consents/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        setFeedbackMsg(`Consent request ${data.consent.consentId} dispatched.`);
      } else {
        setErrorMsg(data.message || 'Consent request failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleFetchRecords = async () => {
    if (!selectedPatientId) return;
    setRecordsLoading(true);
    setErrorMsg(null);
    setAccessDeniedMsg(null);
    setRecords(null);
    try {
      const res = await fetch(`/api/patients/${selectedPatientId}/records`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRecords(data.records || []);
        setRecordsConsentInfo(data.consent);
      } else if (res.status === 403 || res.status === 404) {
        setAccessDeniedMsg('No active consent found for this patient. Record access blocked.');
      } else {
        setErrorMsg(data.message || 'Failed to retrieve records');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRecordsLoading(false);
    }
  };

  const handleMatchSchemes = async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/schemes/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      if (res.ok) setSchemeMatches(data);
      else setErrorMsg(data.message || 'Scheme evaluation failed');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // ── Blue & White Theme Styles ──────────────────────────────────────────────
  const cardStyle = {
    background: '#FFFFFF',
    border: '1px solid #BFDBFE',
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0 2px 12px rgba(29, 78, 216, 0.06)',
  };
  const inputStyle = {
    width: '100%',
    minHeight: 40,
    padding: '8px 12px',
    border: '1px solid #BFDBFE',
    borderRadius: 8,
    fontSize: '0.875rem',
    outline: 'none',
    background: '#F8FBFF',
    color: '#0F172A',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block',
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#1E3A8A',
    marginBottom: 5,
  };
  const btnPrimary = {
    background: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(29, 78, 216, 0.25)',
    transition: 'all 0.15s ease',
  };
  const btnOutline = {
    background: '#EFF6FF',
    color: '#1D4ED8',
    border: '1px solid #BFDBFE',
    borderRadius: 8,
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: '0.82rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
  const btnDanger = {
    background: '#FEE2E2',
    color: '#B91C1C',
    border: '1px solid #FECACA',
    borderRadius: 8,
    padding: '6px 14px',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
  const tabStyle = (id) => ({
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.82rem',
    transition: 'all 0.18s',
    background: activeTab === id ? '#1D4ED8' : '#EFF6FF',
    color: activeTab === id ? '#FFFFFF' : '#1D4ED8',
    boxShadow: activeTab === id ? '0 2px 8px rgba(29, 78, 216, 0.25)' : 'none',
  });

  const myNurseIds = new Set(myNurses.map((n) => n._id?.toString()));
  const unassignedNurses = availableNurses.filter((n) => !myNurseIds.has(n._id?.toString()));

  return (
    <div id="doctor-portal-view" style={{ background: '#F0F7FF', minHeight: '100vh' }}>
      {/* Blue gradient clinical header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
          padding: '20px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: '0 4px 16px rgba(29, 78, 216, 0.2)',
        }}
      >
        <div>
          <div style={{ color: '#BFDBFE', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Doctor Clinical Workspace
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.35rem', fontWeight: 800, marginTop: 2 }}>
            Dr. {doctorUser?.name || 'Physician'} — CareBridge Clinical Portal
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 16px', color: '#BFDBFE', fontSize: '0.82rem' }}>
            🏥 {hospital?.name || 'Synthetic Hospital'}
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 16px', color: '#E0F2FE', fontSize: '0.82rem', fontWeight: 700 }}>
            👩‍⚕️ {myNurses.length} nurse{myNurses.length !== 1 ? 's' : ''} in charge
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 24px 40px' }}>
        {patientsLoading && <Skeleton lines={2} />}
        {errorMsg && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#B91C1C' }}>
            ⚠️ {errorMsg}
          </div>
        )}
        {feedbackMsg && (
          <div style={{ background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#1E3A8A', fontWeight: 600 }}>
            ✓ {feedbackMsg}
          </div>
        )}

        {/* Active Patient Selector */}
        <div style={{ ...cardStyle, padding: '14px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label htmlFor="doctor-patient-select" style={{ fontWeight: 700, color: '#1E3A8A', fontSize: '0.875rem' }}>
              Active Patient:
            </label>
            <select
              id="doctor-patient-select"
              style={{ ...inputStyle, maxWidth: 360 }}
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              disabled={patientsLoading || patients.length === 0}
            >
              {patients.length === 0 && <option value="">{patientsLoading ? 'Loading patients…' : 'No patients available'}</option>}
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}{p.district ? ` (${p.district})` : ''}
                </option>
              ))}
            </select>
            {sourceNurseSubmission && (
              <span style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontSize: '0.78rem', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>
                📋 Triage Data: Nurse {sourceNurseSubmission.nurseName} ({sourceNurseSubmission.triageId})
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', background: '#DBEAFE', padding: 6, borderRadius: 12, border: '1px solid #BFDBFE' }}>
          {[
            { id: 'assessment', label: '🔍 Clinical Assessment' },
            { id: 'referrals', label: '🏥 Referral Recommendations' },
            { id: 'triage_queue', label: '🩺 Nurse Triage Queue' },
            { id: 'nurses', label: '👩‍⚕️ My In-Charge Nurses' },
            { id: 'records', label: '📑 Consented Records' },
            { id: 'schemes', label: '🛡️ Schemes' },
          ].map((tab) => (
            <button key={tab.id} style={tabStyle(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stepper on Assessment & Referrals */}
        {(activeTab === 'assessment' || activeTab === 'referrals') && (
          <Stepper
            currentStep={activeTab === 'assessment' ? (assessmentResult ? 2 : 1) : 3}
            steps={['Patient details', 'Assessment', 'Confirm urgency', 'Ranked hospitals', 'Send referral']}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: CLINICAL ASSESSMENT (with exact labels and inputs for tests)
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'assessment' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Intake Form */}
            <div style={cardStyle}>
              <div style={{ marginBottom: 14 }}>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: '0 0 4px', fontSize: '1.15rem' }}>
                  🩺 Clinical Intake & Triage Assessment
                </h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: 0 }}>
                  Structured vitals and symptom flags support decision review. Data pre-filled from nurse submission where available.
                </p>
              </div>

              {sourceNurseSubmission && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.8rem', color: '#1D4ED8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>✓ Pre-filled from nurse triage <strong>{sourceNurseSubmission.triageId}</strong> by <strong>{sourceNurseSubmission.nurseName}</strong></span>
                  <button style={{ ...btnOutline, padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setActiveTab('triage_queue')}>View Submission</button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="form-label" htmlFor="inp-age" style={labelStyle}>Age (years)</label>
                  <input
                    id="inp-age"
                    className="form-input"
                    type="number"
                    min="0"
                    max="125"
                    style={inputStyle}
                    value={intakeVitals.age}
                    onChange={(e) => setIntakeVitals({ ...intakeVitals, age: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="inp-gender" style={labelStyle}>Sex recorded for assessment</label>
                  <select
                    id="inp-gender"
                    className="form-input"
                    style={inputStyle}
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
                  <label className="form-label" htmlFor="inp-hr" style={labelStyle}>Heart Rate (bpm)</label>
                  <input
                    id="inp-hr"
                    className="form-input"
                    type="number"
                    style={inputStyle}
                    value={intakeVitals.heartRate}
                    onChange={(e) => setIntakeVitals({ ...intakeVitals, heartRate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="inp-rr" style={labelStyle}>Resp Rate (/min)</label>
                  <input
                    id="inp-rr"
                    className="form-input"
                    type="number"
                    style={inputStyle}
                    value={intakeVitals.respiratoryRate}
                    onChange={(e) => setIntakeVitals({ ...intakeVitals, respiratoryRate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="inp-sbp" style={labelStyle}>Systolic BP (mmHg)</label>
                  <input
                    id="inp-sbp"
                    className="form-input"
                    type="number"
                    style={inputStyle}
                    value={intakeVitals.systolicBp}
                    onChange={(e) => setIntakeVitals({ ...intakeVitals, systolicBp: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="inp-spo2" style={labelStyle}>SpO2 (%)</label>
                  <input
                    id="inp-spo2"
                    className="form-input"
                    type="number"
                    style={inputStyle}
                    value={intakeVitals.spo2}
                    onChange={(e) => setIntakeVitals({ ...intakeVitals, spo2: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="inp-temperature" style={labelStyle}>Temperature (°C or °F)</label>
                  <input
                    id="inp-temperature"
                    className="form-input"
                    type="number"
                    min="25"
                    max="115"
                    step="any"
                    style={inputStyle}
                    value={intakeVitals.temperature}
                    onChange={(e) => setIntakeVitals({ ...intakeVitals, temperature: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="form-label" htmlFor="inp-complaint" style={labelStyle}>Chief Complaint & Presentation (context)</label>
                <textarea
                  id="inp-complaint"
                  className="form-input"
                  rows="2"
                  style={{ ...inputStyle, minHeight: 60 }}
                  value={intakeVitals.chiefComplaint}
                  onChange={(e) => setIntakeVitals({ ...intakeVitals, chiefComplaint: e.target.value })}
                />
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
                <legend className="form-label" style={labelStyle}>Reported emergency symptoms</legend>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {[
                    ['chest_pain', 'Chest pain'],
                    ['stroke_signs', 'Stroke signs'],
                    ['altered_consciousness', 'Altered consciousness'],
                  ].map(([field, label]) => (
                    <label key={field} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: '#1E3A8A', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(intakeVitals[field])}
                        onChange={(e) => setIntakeVitals({ ...intakeVitals, [field]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  id="run-assessment-btn"
                  style={{ ...btnPrimary, flex: 1 }}
                  onClick={() => handleRunAssessment(false)}
                  disabled={assessmentLoading}
                >
                  {assessmentLoading ? 'Evaluating ML Models…' : '⚡ Run Clinical Triage Assessment'}
                </button>
                <button
                  id="run-incomplete-demo-btn"
                  style={btnOutline}
                  onClick={() => handleRunAssessment(true)}
                  title="Checks incomplete data handling"
                >
                  Simulate Incomplete Vitals
                </button>
              </div>
            </div>

            {/* Decision Support & Urgency Confirmation */}
            <div style={cardStyle}>
              <div style={{ marginBottom: 14 }}>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: '0 0 4px', fontSize: '1.15rem' }}>
                  💡 Decision Support Suggestions & Urgency Confirmation
                </h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: 0 }}>
                  Model suggestions fused with red flag triggers. Clinician review mandatory.
                </p>
              </div>

              {insufficientData && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
                  <h3 style={{ margin: '0 0 8px 0', color: '#DC2626', fontSize: '0.95rem' }}>⚠️ Insufficient Intake Data</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#991B1B' }}>
                    Intake vitals are incomplete. CareBridge refuses to produce a forced algorithmic severity prediction. Please record objective vital signs before automated triage ranking.
                  </p>
                </div>
              )}

              {assessmentResult && (
                <div>
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 14, borderRadius: 10, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#1D4ED8', fontWeight: 600 }}>Model Suggested Urgency:</span>
                      <UrgencyPill urgency={assessmentResult.triage_urgency || assessmentResult.urgency} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#1D4ED8', fontWeight: 600 }}>Red Flag Clinical Triggers:</span>
                      <span style={{ fontWeight: 700, color: (assessmentResult.red_flags || []).length > 0 ? '#B91C1C' : '#166534', fontSize: '0.82rem' }}>
                        {(assessmentResult.red_flags || []).length > 0 ? `🚨 ${(assessmentResult.red_flags || []).length} Detected` : '✓ 0 None'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #BFDBFE', paddingTop: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#1E3A8A' }}>Fused Recommended Urgency:</span>
                      <strong style={{ color: '#1D4ED8', fontSize: '1.05rem' }}>{assessmentResult.urgency?.toUpperCase()}</strong>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.88rem', color: '#1E3A8A' }}>Top Contributing Clinical Features:</h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.82rem', color: '#475569' }}>
                      {(assessmentResult.top_contributing_features || assessmentResult.top_contributors || []).map((feat, idx) => (
                        <li key={idx}>{feat}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ borderTop: '2px solid #BFDBFE', paddingTop: 14 }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#1E3A8A' }}>Clinician Urgency Sign-off:</h4>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#1E3A8A' }}>
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
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#1E3A8A' }}>
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
                          style={{ ...inputStyle, marginBottom: 8 }}
                          value={confirmedUrgency}
                          onChange={(e) => setConfirmedUrgency(e.target.value)}
                        >
                          <option value="emergency">Emergency</option>
                          <option value="urgent">Urgent</option>
                          <option value="routine">Routine</option>
                        </select>
                        <textarea
                          style={{ ...inputStyle, minHeight: 60 }}
                          placeholder="Clinical justification for urgency override (required)…"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                        />
                      </div>
                    )}

                    <button id="confirm-urgency-btn" style={{ ...btnPrimary, width: '100%' }} onClick={handleConfirmUrgency}>
                      ✓ Confirm Urgency & Proceed to Referral
                    </button>
                  </div>
                </div>
              )}

              {!assessmentResult && !insufficientData && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 700, color: '#1E3A8A' }}>Awaiting Assessment Input</div>
                  <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    Fill out vital signs manually or load from the <strong>Nurse Triage Queue</strong>, then run assessment.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: REFERRAL RECOMMENDATIONS
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'referrals' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0 }}>🏥 Referral Ranking Engine</h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>
                  Ranked by clinical capability, capacity freshness, and distance.
                </p>
              </div>
              <button
                id="query-referrals-btn"
                style={btnPrimary}
                onClick={handleQueryReferrals}
                disabled={referralLoading}
              >
                {referralLoading ? 'Evaluating Referral Engine…' : '⚡ Generate Ranked Recommendations'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '0 0 260px' }}>
                <label className="form-label" htmlFor="required-specialty" style={labelStyle}>Required specialty</label>
                <select
                  id="required-specialty"
                  style={inputStyle}
                  value={referralParams.requiredSpecialty}
                  onChange={(e) => setReferralParams({ ...referralParams, requiredSpecialty: e.target.value })}
                  disabled={availableSpecialties.length === 0}
                >
                  <option value="">Select an available specialty</option>
                  {availableSpecialties.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {availableSpecialties.length === 0 && (
                  <small role="status" style={{ color: '#64748B', fontSize: '0.75rem' }}>No specialties listed.</small>
                )}
              </div>
              <div>
                <div style={labelStyle}>Urgency</div>
                <UrgencyPill urgency={referralParams.urgency} />
              </div>
              <div>
                <div style={labelStyle}>Capacity Mode</div>
                <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: 999, border: '1px solid #BFDBFE' }}>
                  Unknown-Aware (Stale data treated as Unknown)
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
              <div>
                <label className="form-label" htmlFor="patient-latitude" style={labelStyle}>Patient latitude</label>
                <input
                  id="patient-latitude"
                  type="number"
                  min="8"
                  max="14"
                  step="any"
                  style={inputStyle}
                  value={referralParams.patientLocation.latitude}
                  onChange={(e) => setReferralParams({ ...referralParams, patientLocation: { ...referralParams.patientLocation, latitude: e.target.value } })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="patient-longitude" style={labelStyle}>Patient longitude</label>
                <input
                  id="patient-longitude"
                  type="number"
                  min="76"
                  max="81"
                  step="any"
                  style={inputStyle}
                  value={referralParams.patientLocation.longitude}
                  onChange={(e) => setReferralParams({ ...referralParams, patientLocation: { ...referralParams.patientLocation, longitude: e.target.value } })}
                />
              </div>
            </div>
            <p style={{ color: '#64748B', fontSize: '0.78rem', marginBottom: 16 }}>
              Use patient coordinates in the supported Tamil Nadu service area (latitude 8–14, longitude 76–81).
            </p>

            {currentReferralId && (
              <div
                style={{
                  background: referralTimeLeft === 0 ? '#FEF2F2' : '#EFF6FF',
                  border: referralTimeLeft === 0 ? '1px solid #FECACA' : '1px solid #BFDBFE',
                  borderRadius: 10,
                  padding: '14px 18px',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: referralTimeLeft === 0 ? '#991B1B' : '#1D4ED8', fontWeight: 700 }}>
                      REFERRAL CODE:
                    </span>
                    <span style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 800, color: referralTimeLeft === 0 ? '#B91C1C' : '#1E3A8A' }}>
                      {currentReferralId}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: referralTimeLeft === 0 ? '#B91C1C' : '#3B82F6' }}>
                      {referralTimeLeft === 0 ? 'Draft window expired' : `Expires in ${referralTimeLeft}s`}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    This is a draft reference only. It is not hospital acceptance or a bed reservation.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {referralTimeLeft > 0 && (
                    <button
                      style={btnOutline}
                      onClick={() => {
                        navigator.clipboard?.writeText(currentReferralId);
                        setFeedbackMsg(`Copied ${currentReferralId} to clipboard.`);
                      }}
                    >
                      📋 Copy Code
                    </button>
                  )}
                  <button style={btnPrimary} onClick={handleQueryReferrals} disabled={referralLoading}>
                    🔄 Regenerate Code
                  </button>
                </div>
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="doctor-results-layout">
                <div className="doctor-results-list">
                  <h3 style={{ color: '#1E3A8A', marginBottom: 12 }}>Ranked referral options:</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {recommendations.map((h, idx) => (
                      <div
                        key={h.hospitalId || idx}
                        style={{
                          background: idx === 0 ? '#EFF6FF' : '#FAFCFF',
                          border: `1px solid ${idx === 0 ? '#BFDBFE' : '#E2E8F0'}`,
                          borderLeft: `6px solid ${idx === 0 ? '#1D4ED8' : '#94A3B8'}`,
                          borderRadius: 12,
                          padding: '16px 20px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1E3A8A' }}>
                              #{h.rank || idx + 1} {h.hospitalName || h.name}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: 4 }}>
                              District: <strong>{h.district}</strong> · Distance: <strong>{h.distanceKm == null ? 'Not reported' : `${h.distanceKm.toFixed(1)} km`}</strong>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, color: '#1D4ED8', fontSize: '1.1rem' }}>
                              Score: {h.score?.toFixed(3)}
                            </div>
                            {idx === 0 && (
                              <span style={{ background: '#DBEAFE', color: '#1E3A8A', fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 999 }}>
                                Top-ranked
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#334155' }}>
                          <strong>Matched capabilities:</strong> {Array.isArray(h.matchedCapabilities) && h.matchedCapabilities.length ? h.matchedCapabilities.join(', ') : 'Review facility profile'}
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                          <button style={btnPrimary} onClick={() => handleRequestConsent(h.hospitalId)}>
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

            {/* Excluded facilities */}
            {excludedHospitals.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ margin: '0 0 10px', color: '#B91C1C', fontSize: '1rem' }}>Excluded facilities (ranking filters not met):</h3>
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #FECACA' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#FEF2F2', textAlign: 'left', color: '#991B1B' }}>
                        <th style={{ padding: 10 }}>Hospital</th>
                        <th style={{ padding: 10 }}>District</th>
                        <th style={{ padding: 10 }}>Tier</th>
                        <th style={{ padding: 10 }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excludedHospitals.slice(0, 8).map((ex, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #FEE2E2', background: '#FFF' }}>
                          <td style={{ padding: 10, fontWeight: 700, color: '#1E3A8A' }}>{ex.hospitalName || ex.name}</td>
                          <td style={{ padding: 10 }}>{ex.district}</td>
                          <td style={{ padding: 10 }}>{ex.tier}</td>
                          <td style={{ padding: 10, color: '#B91C1C' }}>{ex.reason || ex.exclusionReason || 'Filters not met.'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 3: NURSE TRIAGE QUEUE (Doctor sees submissions from in-charge nurses)
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'triage_queue' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0 }}>🩺 Nurse Submission Queue</h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>
                  Showing clinical triage intakes submitted exclusively by your supervised nurses.
                </p>
              </div>
              <button style={btnPrimary} onClick={loadTriageQueue} disabled={triageQueueLoading}>
                {triageQueueLoading ? 'Refreshing…' : '↻ Refresh Queue'}
              </button>
            </div>

            {triageQueueLoading && <Skeleton lines={3} />}

            {!triageQueueLoading && triageQueueMsg && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '16px 20px', color: '#1D4ED8', textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>ℹ️ {triageQueueMsg}</div>
                {triageQueue.length === 0 && (
                  <div style={{ marginTop: 10 }}>
                    <button style={btnPrimary} onClick={() => setActiveTab('nurses')}>
                      → Open "My In-Charge Nurses" to assign nurses
                    </button>
                  </div>
                )}
              </div>
            )}

            {!triageQueueLoading && triageQueue.length === 0 && !triageQueueMsg && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748B' }}>
                <div style={{ fontSize: '3rem', marginBottom: 8 }}>🩺</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1E3A8A' }}>No pending nurse submissions</div>
                <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                  All patient submissions from your supervised nurses have been reviewed.
                </div>
              </div>
            )}

            {triageQueue.length > 0 && !selectedTriageRecord && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {triageQueue.map((rec) => {
                  const p = rec.patientId || {};
                  const nurse = rec.recordedBy || {};
                  const urg = rec.modelSuggestedUrgency || 'routine';
                  const v = rec.vitals || {};
                  const borderColor = urg === 'emergency' ? '#EF4444' : urg === 'urgent' ? '#F59E0B' : '#3B82F6';

                  return (
                    <div
                      key={rec._id || rec.triageId}
                      style={{
                        background: '#FFFFFF',
                        border: `1px solid ${borderColor}44`,
                        borderLeft: `6px solid ${borderColor}`,
                        borderRadius: 12,
                        padding: '18px 22px',
                        boxShadow: '0 2px 8px rgba(29, 78, 216, 0.05)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1E3A8A' }}>
                              {p.name || 'Unknown Patient'}
                            </span>
                            <UrgencyPill urgency={urg} />
                            {rec.status && (
                              <span style={{ background: rec.status === 'reviewed' ? '#DCFCE7' : '#DBEAFE', color: rec.status === 'reviewed' ? '#166534' : '#1D4ED8', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                                {rec.status.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: 8 }}>
                            👤 <strong>{p.age || '—'} yrs</strong> · {p.gender || '—'} | 📍 {p.district || '—'} | 👩‍⚕️ Nurse: <strong>{nurse.name || '—'}</strong> | 🕐 {rec.ageDisplay || 'Recently'}
                          </div>
                          <div style={{ fontSize: '0.88rem', color: '#1E293B', fontStyle: 'italic', marginBottom: 8 }}>
                            "{rec.chiefComplaint?.text || rec.chiefComplaint?.category || 'No complaint notes'}"
                          </div>
                          {rec.redFlags?.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              {rec.redFlags.map((f, i) => (
                                <span key={i} style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                                  🚨 {f}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                            <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>HR: {v.heartRate ?? '—'} bpm</span>
                            <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>RR: {v.respiratoryRate ?? '—'} /min</span>
                            <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>BP: {v.systolicBp ?? '—'} mmHg</span>
                            <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>SpO2: {v.spo2 ?? '—'}%</span>
                            <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>NEWS2: {rec.computedScores?.news2 ?? '—'}</span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3B82F6', fontFamily: 'monospace' }}>
                            {rec.triageId}
                          </div>
                          <button
                            style={{ ...btnPrimary, background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)' }}
                            onClick={() => handleTreatPatientFromTriage(rec)}
                          >
                            ⚡ Treat / Evaluate Patient →
                          </button>
                          <button
                            style={btnOutline}
                            onClick={() => setSelectedTriageRecord(rec)}
                          >
                            View Vitals & Review
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedTriageRecord && (
              <div>
                <button style={{ ...btnOutline, marginBottom: 16 }} onClick={() => setSelectedTriageRecord(null)}>
                  ← Back to nurse submission queue
                </button>
                <TriageRecordDetail
                  record={selectedTriageRecord}
                  token={token}
                  cardStyle={cardStyle}
                  inputStyle={inputStyle}
                  btnPrimary={btnPrimary}
                  btnOutline={btnOutline}
                  onTreat={() => handleTreatPatientFromTriage(selectedTriageRecord)}
                  onRefresh={loadTriageQueue}
                />
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: MY IN-CHARGE NURSES
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'nurses' && (
          <div>
            {nurseMsg && (
              <div style={{ background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#1E3A8A', fontWeight: 600 }}>
                ✓ {nurseMsg}
              </div>
            )}
            {nurseError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#B91C1C' }}>
                ⚠️ {nurseError}
              </div>
            )}

            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 20, color: '#1E3A8A' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>👩‍⚕️ Nurse Supervision & In-Charge Roster</div>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#1D4ED8' }}>
                Triage data from nurses in your charge flows directly to your <strong>Nurse Triage Queue</strong>. Add or remove nurses as your shift assignment changes.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Supervised Nurses */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0, fontSize: '1.1rem' }}>
                    👩‍⚕️ Nurses in Your Charge ({myNurses.length})
                  </h2>
                  <button style={btnOutline} onClick={loadNurses} disabled={nursesLoading}>
                    {nursesLoading ? '…' : '↻'}
                  </button>
                </div>

                {nursesLoading && <Skeleton lines={3} />}

                {!nursesLoading && myNurses.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B' }}>
                    <div style={{ fontSize: '2.5rem' }}>👥</div>
                    <div style={{ fontWeight: 700, color: '#1E3A8A', marginTop: 6 }}>No nurses currently assigned</div>
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                      Select nurses from the hospital directory on the right to add them to your charge.
                    </div>
                  </div>
                )}

                {myNurses.map((nurse) => (
                  <div
                    key={nurse._id}
                    style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: 10,
                      padding: '14px 18px',
                      marginBottom: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: '#1E3A8A', fontSize: '0.95rem' }}>{nurse.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                        {nurse.qualification || 'Staff Nurse'} · {nurse.email}
                      </div>
                      {nurse.registrationNumber && (
                        <div style={{ fontSize: '0.72rem', color: '#1D4ED8', fontFamily: 'monospace', marginTop: 2 }}>
                          Reg: #{nurse.registrationNumber}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ background: '#DCFCE7', color: '#166534', fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>
                        Supervised
                      </span>
                      <button style={btnDanger} onClick={() => handleRemoveNurse(nurse._id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hospital Nurses Directory */}
              <div style={cardStyle}>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: '0 0 4px', fontSize: '1.1rem' }}>
                    ➕ Available Hospital Nurses ({unassignedNurses.length})
                  </h2>
                  <p style={{ color: '#64748B', fontSize: '0.82rem', margin: 0 }}>
                    Triage nurses registered at {hospital?.name || 'your hospital'}:
                  </p>
                </div>

                {nursesLoading && <Skeleton lines={3} />}

                {!nursesLoading && unassignedNurses.length === 0 && myNurses.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: '#166534', fontWeight: 700 }}>
                    ✓ All available hospital nurses are in your charge
                  </div>
                )}

                {!nursesLoading && availableNurses.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B' }}>
                    No triage nurses found at this facility.
                  </div>
                )}

                {unassignedNurses.map((nurse) => (
                  <div
                    key={nurse._id}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: 10,
                      padding: '14px 18px',
                      marginBottom: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>{nurse.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                        {nurse.qualification || 'Staff Nurse'} · {nurse.email}
                      </div>
                      {nurse.registrationNumber && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace' }}>
                          Reg: #{nurse.registrationNumber}
                        </div>
                      )}
                    </div>
                    <button style={btnPrimary} onClick={() => handleAddNurse(nurse._id)}>
                      + Add to Charge
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 5: CONSENTED RECORDS VIEWER
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'records' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0 }}>📑 Consented Clinical Records Viewer</h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>
                  Protected by server-side consent state machine. Records older than 6 months flagged.
                </p>
              </div>
              <button
                id="fetch-consented-records-btn"
                style={btnPrimary}
                onClick={handleFetchRecords}
                disabled={recordsLoading}
              >
                {recordsLoading ? 'Verifying Consent…' : '🔓 Fetch Consented Records'}
              </button>
            </div>

            {accessDeniedMsg && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14, color: '#B91C1C', fontWeight: 600, marginBottom: 12 }}>
                🔒 {accessDeniedMsg}
              </div>
            )}

            {records && (
              <div>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#1E3A8A', fontWeight: 600 }}>
                  ✓ Server-side consent check passed. Active Consent ID: <strong>{recordsConsentInfo?.consentId}</strong> (Expires in {recordsConsentInfo?.remainingHours || '168'}h).
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {records.map((r) => (
                    <div key={r.recordId} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                          {r.type}
                        </span>
                        {r.isOlderThan6Months && (
                          <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                            ⚠️ {r.ageMonths}m old
                          </span>
                        )}
                      </div>
                      <h4 style={{ margin: '4px 0 6px', color: '#1E3A8A' }}>{r.title || r.type}</h4>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{new Date(r.recordDate).toLocaleDateString()}</div>
                      <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: 8 }}>{r.summary || 'Clinical investigation report.'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 6: SCHEMES
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'schemes' && (
          <div style={cardStyle}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: '0 0 4px' }}>🛡️ Scheme Potential Matches</h2>
              <p style={{ color: '#64748B', fontSize: '0.82rem', margin: 0 }}>
                Compares patient profile against CMCHIS, PM-JAY, and Rashtriya Arogya Nidhi criteria.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>TN resident?</label>
                <select style={inputStyle} value={schemeInputs.stateResident} onChange={(e) => setSchemeInputs({ ...schemeInputs, stateResident: e.target.value })}>
                  <option value="">Not provided</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Annual income (INR)</label>
                <input type="number" style={inputStyle} value={schemeInputs.annualFamilyIncome} onChange={(e) => setSchemeInputs({ ...schemeInputs, annualFamilyIncome: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Ration card</label>
                <select style={inputStyle} value={schemeInputs.rationCardType} onChange={(e) => setSchemeInputs({ ...schemeInputs, rationCardType: e.target.value })}>
                  <option value="">Not provided</option>
                  <option value="PHH">PHH</option>
                  <option value="AAY">AAY</option>
                  <option value="BPL">BPL</option>
                  <option value="NPHH">NPHH</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Beneficiary age</label>
                <input type="number" style={inputStyle} value={schemeInputs.age} onChange={(e) => setSchemeInputs({ ...schemeInputs, age: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Treatment category</label>
                <input type="text" style={inputStyle} value={schemeInputs.treatmentCategory} onChange={(e) => setSchemeInputs({ ...schemeInputs, treatmentCategory: e.target.value })} />
              </div>
            </div>
            <button style={btnPrimary} onClick={handleMatchSchemes}>
              Check Scheme Matches
            </button>
            {schemeMatches && (
              <div style={{ marginTop: 20 }}>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', color: '#1E3A8A', fontWeight: 600, marginBottom: 14 }}>
                  ℹ️ Possible match only — not confirmed eligibility. Official verification required.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {(schemeMatches.results || []).map((m) => (
                    <div key={m.schemeId} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <h4 style={{ margin: 0, color: '#1E3A8A', fontSize: '0.9rem' }}>{safeSchemeText(m.schemeName)}</h4>
                        <span style={{ background: m.status === 'potential match' ? '#DCFCE7' : '#FEF3C7', color: m.status === 'potential match' ? '#166534' : '#92400E', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                          {m.status}
                        </span>
                      </div>
                      <a href={m.officialPortalUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#1D4ED8' }}>
                        Open programme info →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Triage Record Detail Component ───────────────────────────────────────────
function TriageRecordDetail({ record, token, cardStyle, inputStyle, btnPrimary, btnOutline, onTreat, onRefresh }) {
  const [urgencyInput, setUrgencyInput] = useState(record.modelSuggestedUrgency || 'routine');
  const [overrideReason, setOverrideReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const p = record.patientId || {};
  const nurse = record.recordedBy || {};
  const v = record.vitals || {};

  const handleConfirmUrgency = async () => {
    const isOv = urgencyInput !== record.modelSuggestedUrgency;
    if (isOv && !overrideReason.trim()) {
      setErr('Clinical justification required for urgency override.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/triage/records/${record.triageId}/confirm-urgency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmedUrgency: urgencyInput, overrideReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg('Urgency confirmed successfully.');
        onRefresh();
      } else {
        setErr(data.message || 'Failed to confirm urgency.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {msg && <div style={{ background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 14, color: '#1E3A8A', fontWeight: 600 }}>✓ {msg}</div>}
      {err && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 14, color: '#B91C1C' }}>⚠️ {err}</div>}

      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #1E3A8A, #1D4ED8)', color: '#FFFFFF', marginBottom: 16, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{p.name || 'Unknown Patient'}</div>
            <div style={{ fontSize: '0.85rem', color: '#BFDBFE', marginTop: 4 }}>
              {p.age || '—'} yrs · {p.gender || '—'} · {p.district || '—'}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#93C5FD', marginTop: 8, fontStyle: 'italic' }}>
              "{record.chiefComplaint?.text || record.chiefComplaint?.category || '—'}"
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 800, color: '#93C5FD' }}>{record.triageId}</div>
            <div style={{ fontSize: '0.8rem', color: '#BFDBFE', marginTop: 4 }}>Recorded {record.ageDisplay || 'Recently'}</div>
            <div style={{ fontSize: '0.8rem', color: '#BFDBFE', marginTop: 2 }}>By nurse: {nurse.name || '—'} ({nurse.qualification || 'RN'})</div>
            <button
              style={{ ...btnPrimary, background: '#10B981', marginTop: 10, fontSize: '0.82rem', padding: '8px 16px' }}
              onClick={onTreat}
            >
              ⚡ Treat & Evaluate Patient Now →
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ color: '#1E3A8A', marginBottom: 12 }}>📊 Vitals (Nurse-Recorded)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <VitalCard label="Heart Rate" value={v.heartRate} unit="bpm" normal="60–100" />
            <VitalCard label="Resp Rate" value={v.respiratoryRate} unit="/min" normal="12–20" />
            <VitalCard label="Systolic BP" value={v.systolicBp} unit="mmHg" normal="90–140" />
            <VitalCard label="SpO2" value={v.spo2} unit="%" normal="≥94" />
            <VitalCard label="Temperature" value={v.temperature} unit="°C" normal="36.1–37.2" />
            <VitalCard label="Blood Glucose" value={v.bloodGlucose} unit="mg/dL" normal="70–140" />
          </div>
          <div style={{ marginTop: 14, padding: 12, background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#1E3A8A', fontSize: '0.85rem' }}>NEWS2 Score</span>
              <span style={{ fontWeight: 800, color: '#1D4ED8', fontSize: '1.1rem' }}>{record.computedScores?.news2 ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#1E3A8A', fontSize: '0.85rem' }}>AI Suggested Urgency</span>
              {record.modelSuggestedUrgency ? <UrgencyPill urgency={record.modelSuggestedUrgency} /> : <span>—</span>}
            </div>
          </div>
          {record.redFlags?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, color: '#B91C1C', fontSize: '0.85rem', marginBottom: 6 }}>🚨 Red Flags:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {record.redFlags.map((f, i) => (
                  <span key={i} style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: '1px solid #FECACA' }}>
                    🚨 {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: '#1E3A8A', marginBottom: 12 }}>🩺 Clinical Review & Sign-Off</h3>
          <div style={{ marginBottom: 12, padding: 12, background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: 4, fontWeight: 700 }}>CHIEF COMPLAINT</div>
            <div style={{ fontWeight: 700, color: '#1E293B' }}>{record.chiefComplaint?.category || 'General'}</div>
            <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: 4 }}>{record.chiefComplaint?.text || '—'}</div>
          </div>
          <div style={{ marginBottom: 12, padding: 12, background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: 6, fontWeight: 700 }}>ARRIVAL & PRESENTATION</div>
            <div style={{ fontSize: '0.85rem', color: '#334155' }}>Duration: <strong>{record.symptomDuration || '—'}</strong></div>
            <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: 4 }}>Mode: <strong>{record.arrivalMode || '—'}</strong></div>
          </div>
          {record.notes && (
            <div style={{ marginBottom: 14, padding: 12, background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
              <div style={{ fontSize: '0.78rem', color: '#1D4ED8', fontWeight: 700, marginBottom: 4 }}>NURSE NOTES</div>
              <div style={{ fontSize: '0.85rem', color: '#1E3A8A' }}>{record.notes}</div>
            </div>
          )}

          {record.status !== 'reviewed' ? (
            <div style={{ borderTop: '2px solid #BFDBFE', paddingTop: 14 }}>
              <div style={{ fontWeight: 700, color: '#1E3A8A', marginBottom: 8 }}>Confirm or Adjust Urgency:</div>
              <select style={{ ...inputStyle, marginBottom: 8 }} value={urgencyInput} onChange={(e) => setUrgencyInput(e.target.value)}>
                <option value="emergency">Emergency</option>
                <option value="urgent">Urgent</option>
                <option value="routine">Routine</option>
              </select>
              {urgencyInput !== record.modelSuggestedUrgency && (
                <textarea
                  style={{ ...inputStyle, minHeight: 56, marginBottom: 8 }}
                  placeholder="Clinical justification for urgency override (required)…"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...btnPrimary, flex: 1 }} onClick={handleConfirmUrgency} disabled={loading}>
                  {loading ? 'Confirming…' : '✓ Confirm Urgency'}
                </button>
                <button style={{ ...btnPrimary, background: '#10B981' }} onClick={onTreat}>
                  ⚡ Treat Patient →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontWeight: 800, color: '#166534' }}>✓ Already Reviewed</div>
              <div style={{ color: '#166534', fontSize: '0.85rem', marginTop: 2 }}>
                Confirmed Urgency: <strong>{record.confirmedUrgency?.toUpperCase()}</strong>
              </div>
              <button style={{ ...btnPrimary, marginTop: 10, background: '#10B981', fontSize: '0.82rem' }} onClick={onTreat}>
                ⚡ Re-open for Treatment & Referrals
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
