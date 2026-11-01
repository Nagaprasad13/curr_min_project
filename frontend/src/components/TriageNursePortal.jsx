import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch as fetch } from '../api';

/* ────────────────────────────────────────────────────────────────────────── *
 * TriageNursePortal — Phase 8.4c                                            *
 * All data is SYNTHETIC. Research prototype, NOT a clinical product.        *
 * Decision support only. A clinician must review.                           *
 * ────────────────────────────────────────────────────────────────────────── */

const URGENCY_COLORS = {
  'Immediate (P1)': { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  'Urgent (P2)': { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  'Less Urgent (P3)': { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  'Non-Urgent (P4)': { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
};

const CHIEF_COMPLAINT_CATEGORIES = [
  'Cardiovascular', 'Respiratory', 'Neurological', 'Gastrointestinal',
  'Musculoskeletal', 'Trauma / Injury', 'Obstetric / Gynaecological',
  'Paediatric', 'Psychiatric / Mental Health', 'Skin / Dermatological',
  'ENT / Head & Neck', 'Urological', 'Ophthalmological', 'General',
];

const VITAL_FIELDS = [
  { key: 'systolicBp', label: 'Systolic BP', unit: 'mmHg', min: 50, max: 300, redFlagLow: 90, redFlagHigh: 180, normalRange: '90 – 120 mmHg' },
  { key: 'diastolicBp', label: 'Diastolic BP', unit: 'mmHg', min: 30, max: 200, redFlagLow: 60, redFlagHigh: 120, normalRange: '60 – 80 mmHg' },
  { key: 'heartRate', label: 'Heart Rate', unit: 'bpm', min: 20, max: 300, redFlagLow: 40, redFlagHigh: 130, normalRange: '60 – 100 bpm' },
  { key: 'respiratoryRate', label: 'Resp. Rate', unit: '/min', min: 5, max: 60, redFlagLow: 8, redFlagHigh: 30, normalRange: '12 – 20 /min' },
  { key: 'spo2', label: 'SpO₂ (Oxygen)', unit: '%', min: 50, max: 100, redFlagLow: 92, normalRange: '95 – 100%' },
  { key: 'temperature', label: 'Temperature', unit: '°C', min: 30, max: 45, redFlagLow: 35, redFlagHigh: 39, normalRange: '36.5 – 37.5 °C' },
  { key: 'painScore', label: 'Pain Score', unit: '/10', min: 0, max: 10, redFlagHigh: 8, normalRange: '0 – 3 (Mild)' },
  { key: 'bloodGlucose', label: 'Blood Glucose', unit: 'mg/dL', min: 10, max: 1000, redFlagLow: 54, redFlagHigh: 250, normalRange: '70 – 140 mg/dL' },
];

function isRedFlag(key, val) {
  const field = VITAL_FIELDS.find((f) => f.key === key);
  if (!field || val === '' || val == null) return false;
  const v = Number(val);
  if (field.redFlagLow != null && v < field.redFlagLow) return true;
  if (field.redFlagHigh != null && v > field.redFlagHigh) return true;
  return false;
}

function VitalInput({ field, value, onChange }) {
  const flag = isRedFlag(field.key, value);
  const numVal = value !== '' && value != null ? Number(value) : null;
  const isFilled = numVal !== null && !isNaN(numVal);
  const isNormal = isFilled && !flag;

  return (
    <div className={`tn-vital-card ${flag ? 'tn-vital-card--flag' : isNormal ? 'tn-vital-card--normal' : ''}`} data-redflag={flag ? 'true' : undefined}>
      <div className="tn-vital-card-top">
        <label htmlFor={`vital-${field.key}`} className="tn-vital-label">
          {field.label}
        </label>
        <span className="tn-vital-unit-tag">{field.unit}</span>
      </div>

      <div className="tn-vital-range-pill">
        <span className="tn-vital-range-prefix">Normal range:</span>
        <strong className="tn-vital-range-value">{field.normalRange}</strong>
      </div>

      <div className="tn-vital-input-row">
        <input
          id={`vital-${field.key}`}
          type="number"
          className={`tn-vital-input${flag ? ' tn-vital-input--redflag' : ''}`}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          min={field.min}
          max={field.max}
          step={field.key === 'temperature' || field.key === 'bloodGlucose' ? '0.1' : '1'}
          placeholder="Enter value"
        />
      </div>

      <div className="tn-vital-status-area">
        {flag && (
          <span className="tn-redflag-badge" role="alert" aria-label={`${field.label} is outside normal range`}>
            ⚠ Red Flag: Outside normal
          </span>
        )}
        {isNormal && (
          <span className="tn-normal-badge" aria-label={`${field.label} is in normal range`}>
            ✓ In normal range
          </span>
        )}
        {!isFilled && (
          <span className="tn-vital-placeholder-note">Expected: {field.normalRange}</span>
        )}
      </div>
    </div>
  );
}

function UrgencyBadge({ urgency }) {
  const style = URGENCY_COLORS[urgency] || { bg: '#F5F7FB', text: '#475569', border: '#E2E8F0' };
  return (
    <span
      className="tn-urgency-badge"
      style={{ background: style.bg, color: style.text, borderColor: style.border }}
    >
      {urgency || 'Pending'}
    </span>
  );
}

function formatAge(recordedAt) {
  if (!recordedAt) return '';
  const minutes = Math.round((Date.now() - new Date(recordedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}



/* ──────────────────────────────── OVERVIEW ─────────────────────────────── */
function OverviewTab({ records, patients, loading }) {
  const submitted = records.filter((r) => r.status === 'submitted' || r.status === 'reviewed');
  const drafts = records.filter((r) => r.status === 'draft');
  const redFlags = records.filter((r) => r.redFlags?.length > 0);

  return (
    <div className="tn-overview">
      <div className="tn-page-header">
        <h1 className="tn-page-title">Triage Overview</h1>
        <span className="tn-page-subtitle">Synthetic data · Research prototype only</span>
      </div>

      <div className="tn-stat-grid">
        <div className="tn-stat-card tn-stat-card--blue">
          <div className="tn-stat-value">{loading ? '…' : submitted.length}</div>
          <div className="tn-stat-label">Submitted records</div>
        </div>
        <div className="tn-stat-card tn-stat-card--slate">
          <div className="tn-stat-value">{loading ? '…' : drafts.length}</div>
          <div className="tn-stat-label">Draft records</div>
        </div>
        <div className="tn-stat-card tn-stat-card--red">
          <div className="tn-stat-value">{loading ? '…' : redFlags.length}</div>
          <div className="tn-stat-label">Red flag alerts</div>
        </div>
        <div className="tn-stat-card tn-stat-card--green">
          <div className="tn-stat-value">{loading ? '…' : patients.length}</div>
          <div className="tn-stat-label">Patients on file</div>
        </div>
      </div>

      {redFlags.length > 0 && (
        <div className="tn-alert-banner" role="alert">
          <span className="tn-alert-icon" aria-hidden="true">⚠</span>
          <div>
            <strong>{redFlags.length} record{redFlags.length > 1 ? 's' : ''} with red flags</strong>
            <span> — Review and escalate immediately. Decision support only. A clinician must review.</span>
          </div>
        </div>
      )}

      <div className="tn-recent-table-wrap">
        <div className="tn-section-header">
          <h2 className="tn-section-title">Latest records</h2>
        </div>
        {loading ? (
          <div className="tn-loading">Loading records…</div>
        ) : records.length === 0 ? (
          <div className="tn-empty">No triage records yet. Start a new intake.</div>
        ) : (
          <table className="tn-table" aria-label="Recent triage records">
            <thead>
              <tr>
                <th>Triage ID</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Recorded</th>
                <th>Red Flags</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 8).map((rec) => (
                <tr key={rec._id}>
                  <td className="tn-table-mono">{rec.triageId}</td>
                  <td><span className={`tn-status-badge tn-status-badge--${rec.status}`}>{rec.status}</span></td>
                  <td><UrgencyBadge urgency={rec.modelSuggestedUrgency || rec.confirmedUrgency} /></td>
                  <td className="tn-table-muted">{formatAge(rec.recordedAt)}</td>
                  <td>{rec.redFlags?.length > 0
                    ? <span className="tn-redflag-dot" aria-label={`${rec.redFlags.length} red flags`}>⚠ {rec.redFlags.length}</span>
                    : <span className="tn-table-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────── INTAKE QUEUE ─────────────────────────── */
function IntakeQueueTab({ records, loading, onRefresh }) {
  const pending = records.filter((r) => r.status === 'submitted');
  const [selectedRecord, setSelectedRecord] = useState(null);
  return (
    <div className="tn-intake">
      <div className="tn-page-header">
        <h1 className="tn-page-title">Intake Queue</h1>
        <button type="button" className="tn-btn tn-btn--ghost" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="tn-loading">Loading intake queue…</div>
      ) : pending.length === 0 ? (
        <div className="tn-empty">No pending submissions in queue.</div>
      ) : (
        <table className="tn-table" aria-label="Intake queue">
          <thead>
            <tr>
              <th>Triage ID</th>
              <th>Patient</th>
              <th>Chief Complaint</th>
              <th>BP / HR</th>
              <th>SpO₂</th>
              <th>Urgency</th>
              <th>Recorded</th>
              <th>Red Flags</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((rec) => {
              const hasFlag = rec.redFlags?.length > 0;
              return (
                <tr key={rec._id} className={hasFlag ? 'tn-row--redflag' : ''}>
                  <td className="tn-table-mono">{rec.triageId}</td>
                  <td style={{ fontWeight: 600 }}>{rec.patientId?.name || '—'}</td>
                  <td>{rec.chiefComplaint?.category || '—'}</td>
                  <td className="tn-table-mono">
                    {rec.vitals?.systolicBp && rec.vitals?.diastolicBp
                      ? `${rec.vitals.systolicBp}/${rec.vitals.diastolicBp}`
                      : '—'}
                    {rec.vitals?.heartRate ? ` · ${rec.vitals.heartRate}` : ''}
                  </td>
                  <td className="tn-table-mono">
                    {rec.vitals?.spo2 != null
                      ? <span className={rec.vitals.spo2 < 92 ? 'tn-text-danger' : ''}>{rec.vitals.spo2}%</span>
                      : '—'}
                  </td>
                  <td><UrgencyBadge urgency={rec.modelSuggestedUrgency || rec.confirmedUrgency} /></td>
                  <td className="tn-table-muted">{formatAge(rec.recordedAt)}</td>
                  <td>
                    {hasFlag
                      ? <span className="tn-redflag-dot">⚠ {rec.redFlags.length}</span>
                      : <span className="tn-table-muted">—</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="tn-btn tn-btn--ghost"
                      style={{ fontSize: '0.72rem', padding: '3px 8px', whiteSpace: 'nowrap' }}
                      onClick={() => setSelectedRecord(rec)}
                    >
                      📋 View Report
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {selectedRecord && <TriageReportModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
    </div>
  );
}

/* ──────────────────────────────── NEW TRIAGE ───────────────────────────── */
const EMPTY_VITALS = {
  systolicBp: '', diastolicBp: '', heartRate: '', respiratoryRate: '',
  spo2: '', temperature: '', painScore: '', bloodGlucose: '', consciousness: 'alert',
};

function NewTriageTab({ patients, token, nurseUser, onCreated }) {
  const [step, setStep] = useState(0); // 0=Patient 1=Vitals 2=Symptoms 3=Review
  const [patientId, setPatientId] = useState('');
  const [vitals, setVitals] = useState(EMPTY_VITALS);
  const [chiefComplaint, setChiefComplaint] = useState({ category: '', text: '' });
  const [arrivalMode, setArrivalMode] = useState('walk-in');
  const [symptomDuration, setSymptomDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const redFlagKeys = VITAL_FIELDS.filter((f) => isRedFlag(f.key, vitals[f.key])).map((f) => f.label);
  const hasRedFlags = redFlagKeys.length > 0;

  const handleVitalChange = (key, val) => setVitals((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (asDraft) => {
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        patientId,
        chiefComplaint: {
          category: chiefComplaint.category || 'General',
          text: chiefComplaint.text?.trim() || `Patient presenting with ${chiefComplaint.category || 'general'} symptoms.`,
        },
        vitals: Object.fromEntries(
          Object.entries(vitals)
            .filter(([, v]) => v !== '' && v != null)
            .map(([k, v]) => [k, k === 'consciousness' ? v : Number(v)])
        ),
        arrivalMode: arrivalMode || 'walk-in',
        symptomDuration: symptomDuration || undefined,
        notes: notes || undefined,
        status: asDraft ? 'draft' : 'submitted',
      };
      const res = await fetch('/api/triage/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Triage record could not be saved.');
      setSuccess(data.record?.triageId || 'Saved');
      onCreated?.();
      // Reset
      setTimeout(() => {
        setStep(0); setPatientId(''); setVitals(EMPTY_VITALS);
        setChiefComplaint({ category: '', text: '' }); setArrivalMode('walk-in');
        setSymptomDuration(''); setNotes(''); setSuccess(null);
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = ['Patient', 'Vitals', 'Symptoms', 'Review & Handover'];
  const canNext0 = Boolean(patientId);
  const canNext1 = Boolean(chiefComplaint.category);

  return (
    <div className="tn-new-triage">
      <div className="tn-page-header">
        <h1 className="tn-page-title">New Triage Intake</h1>
        <span className="tn-clinical-notice">Decision support only. A clinician must review.</span>
      </div>

      {/* 4 Separate Interactive Step Buttons */}
      <div className="tn-step-buttons-grid" role="tablist" aria-label="Triage intake steps">
        {STEPS.map((label, i) => {
          const isDone = i < step;
          const isActive = i === step;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              id={`tn-step-btn-${i}`}
              aria-selected={isActive}
              className={`tn-step-tab-btn ${isActive ? 'tn-step-tab-btn--active' : ''} ${isDone ? 'tn-step-tab-btn--done' : ''}`}
              onClick={() => setStep(i)}
            >
              <span className="tn-step-tab-badge">
                {isDone ? '✓' : i + 1}
              </span>
              <div className="tn-step-tab-text">
                <span className="tn-step-tab-label">Step {i + 1}</span>
                <strong className="tn-step-tab-title">{label}</strong>
              </div>
            </button>
          );
        })}
      </div>

      {/* Red flag escalation banner */}
      {hasRedFlags && (
        <div className="tn-alert-banner tn-alert-banner--urgent" role="alert">
          <span className="tn-alert-icon" aria-hidden="true">⚠</span>
          <div>
            <strong>Red flag vitals detected:</strong>
            {' '}{redFlagKeys.join(', ')} — Notify supervising doctor immediately.
            <br /><em>Decision support only. A clinician must review.</em>
          </div>
        </div>
      )}

      <div className="tn-step-body">
        {/* Step 0: Patient */}
        {step === 0 && (
          <div className="tn-step-panel" aria-labelledby="step-patient-heading">
            <h2 id="step-patient-heading" className="tn-step-heading">Select Patient</h2>
            <div className="tn-form-group">
              <label htmlFor="tn-patient-select" className="tn-form-label">Patient</label>
              <select
                id="tn-patient-select"
                className="tn-form-control"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
              >
                <option value="">— Select patient —</option>
                {patients.map((p) => {
                  const idVal = p._id || p.id || p.patientId;
                  return (
                    <option key={idVal} value={idVal}>
                      {p.name} ({p.district || 'Unknown district'})
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="tn-form-group">
              <label htmlFor="tn-arrival-mode" className="tn-form-label">Arrival Mode</label>
              <select id="tn-arrival-mode" className="tn-form-control" value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value)}>
                <option value="walk-in">Walk-in</option>
                <option value="ambulance">Ambulance</option>
                <option value="referral_transfer">Referral from another facility</option>
                <option value="wheelchair">Wheelchair / Assisted</option>
                <option value="police_escort">Police escort</option>
                <option value="self_referral">Self-referral</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="tn-step-actions">
              <button type="button" className="tn-btn tn-btn--primary" disabled={!canNext0} onClick={() => setStep(1)}>
                Next: Vitals →
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Vitals */}
        {step === 1 && (
          <div className="tn-step-panel" aria-labelledby="step-vitals-heading">
            <h2 id="step-vitals-heading" className="tn-step-heading">Record Vitals</h2>
            <div className="tn-vital-grid">
              {VITAL_FIELDS.map((field) => (
                <VitalInput key={field.key} field={field} value={vitals[field.key]} onChange={handleVitalChange} />
              ))}
            </div>
            <div className="tn-form-group">
              <label htmlFor="tn-consciousness" className="tn-form-label">Consciousness (AVPU)</label>
              <select id="tn-consciousness" className="tn-form-control" value={vitals.consciousness} onChange={(e) => handleVitalChange('consciousness', e.target.value)}>
                <option value="alert">Alert</option>
                <option value="voice">Responds to Voice</option>
                <option value="pain">Responds to Pain</option>
                <option value="unresponsive">Unresponsive</option>
              </select>
            </div>
            <div className="tn-step-actions">
              <button type="button" className="tn-btn tn-btn--ghost" onClick={() => setStep(0)}>← Back</button>
              <button type="button" className="tn-btn tn-btn--primary" onClick={() => setStep(2)}>Next: Symptoms →</button>
            </div>
          </div>
        )}

        {/* Step 2: Symptoms */}
        {step === 2 && (
          <div className="tn-step-panel" aria-labelledby="step-symptoms-heading">
            <h2 id="step-symptoms-heading" className="tn-step-heading">Chief Complaint & History</h2>
            <div className="tn-form-group">
              <label htmlFor="tn-complaint-cat" className="tn-form-label">Complaint Category <span aria-hidden="true">*</span></label>
              <select
                id="tn-complaint-cat"
                className="tn-form-control"
                value={chiefComplaint.category}
                onChange={(e) => setChiefComplaint((prev) => ({ ...prev, category: e.target.value }))}
                required
              >
                <option value="">— Select category —</option>
                {CHIEF_COMPLAINT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="tn-form-group">
              <label htmlFor="tn-complaint-text" className="tn-form-label">Complaint Description</label>
              <textarea
                id="tn-complaint-text"
                className="tn-form-control tn-form-textarea"
                rows={3}
                value={chiefComplaint.text}
                onChange={(e) => setChiefComplaint((prev) => ({ ...prev, text: e.target.value }))}
                placeholder="Patient's own description of presenting symptoms…"
              />
            </div>
            <div className="tn-form-group">
              <label htmlFor="tn-duration" className="tn-form-label">Symptom Duration</label>
              <input
                id="tn-duration"
                type="text"
                className="tn-form-control"
                value={symptomDuration}
                onChange={(e) => setSymptomDuration(e.target.value)}
                placeholder="e.g. 2 hours, since yesterday"
              />
            </div>
            <div className="tn-form-group">
              <label htmlFor="tn-notes" className="tn-form-label">Nurse Notes</label>
              <textarea
                id="tn-notes"
                className="tn-form-control tn-form-textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, context…"
              />
            </div>
            <div className="tn-step-actions">
              <button type="button" className="tn-btn tn-btn--ghost" onClick={() => setStep(1)}>← Back</button>
              <button type="button" className="tn-btn tn-btn--primary" disabled={!canNext1} onClick={() => setStep(3)}>
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Handover */}
        {step === 3 && (
          <div className="tn-step-panel" aria-labelledby="step-review-heading">
            <h2 id="step-review-heading" className="tn-step-heading">Review & Handover</h2>

            {success && (
              <div className="tn-success-banner" role="status">
                ✓ Record saved: <strong>{success}</strong>
              </div>
            )}
            {error && (
              <div className="tn-error-banner" role="alert">
                {error}
              </div>
            )}

            <div className="tn-review-grid">
              {(() => {
                const selectedPatient = patients.find((p) => String(p._id || p.id || p.patientId) === String(patientId));
                return (
                  <div className="tn-review-section">
                    <h3 className="tn-review-heading">Patient</h3>
                    <div className="tn-review-row">
                      <span>Name</span>
                      <strong>{selectedPatient?.name || 'Selected patient'}</strong>
                    </div>
                    <div className="tn-review-row">
                      <span>District</span>
                      <span>{selectedPatient?.district || '—'}</span>
                    </div>
                    <div className="tn-review-row">
                      <span>Patient ID</span>
                      <span className="tn-table-mono">
                        {String(patientId).length > 8 ? String(patientId).slice(-8).toUpperCase() : patientId || '—'}
                      </span>
                    </div>
                    <div className="tn-review-row">
                      <span>Arrival</span>
                      <span style={{ textTransform: 'capitalize' }}>{arrivalMode?.replace('_', ' ')}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="tn-review-section">
                <h3 className="tn-review-heading">Chief Complaint</h3>
                <div className="tn-review-row">
                  <span>Category</span>
                  <span>{chiefComplaint.category || '—'}</span>
                </div>
                <div className="tn-review-row">
                  <span>Duration</span>
                  <span>{symptomDuration || '—'}</span>
                </div>
              </div>

              <div className="tn-review-section">
                <h3 className="tn-review-heading">Vitals Snapshot</h3>
                {VITAL_FIELDS.filter((f) => vitals[f.key] !== '').map((f) => (
                  <div key={f.key} className={`tn-review-row${isRedFlag(f.key, vitals[f.key]) ? ' tn-review-row--flag' : ''}`}>
                    <span>{f.label}</span>
                    <span className="tn-table-mono">
                      {vitals[f.key]} {f.unit}
                      {isRedFlag(f.key, vitals[f.key]) && ' ⚠'}
                    </span>
                  </div>
                ))}
                <div className="tn-review-row">
                  <span>Consciousness</span>
                  <span>{vitals.consciousness}</span>
                </div>
              </div>
            </div>

            <p className="tn-clinical-notice" style={{ marginTop: '1rem' }}>
              Decision support only. A clinician must review all triage records before clinical decisions are made.
              Synthetic data — not for real patient care.
            </p>

            <div className="tn-step-actions">
              <button type="button" className="tn-btn tn-btn--ghost" onClick={() => setStep(2)}>← Back</button>
              <button
                type="button"
                className="tn-btn tn-btn--secondary"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
              >
                {submitting ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                type="button"
                className="tn-btn tn-btn--primary tn-btn--confirm"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
              >
                {submitting ? 'Submitting…' : 'Submit to Doctor ↗'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────── TRIAGE REPORT MODAL ─────────────────── */
function TriageReportModal({ record, onClose }) {
  if (!record) return null;
  const v = record.vitals || {};
  const p = record.patientId || {};
  const nurse = record.recordedBy || {};
  const confirmedBy = record.confirmedBy || {};
  const urg = record.modelSuggestedUrgency || record.confirmedUrgency || 'routine';
  const urgColors = { emergency: '#EF4444', urgent: '#F59E0B', routine: '#3B82F6' };
  const urgColor = urgColors[urg] || '#3B82F6';

  const sectionStyle = {
    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
    padding: '14px 16px', marginBottom: 12,
  };
  const labelStyle = { fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 };
  const valueStyle = { fontSize: '0.88rem', color: '#1E293B', fontWeight: 600 };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detailed Triage Report"
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: 16, maxWidth: 720, width: '100%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, #1E3A8A, ${urgColor})`,
          color: '#FFF', padding: '20px 24px', borderRadius: '16px 16px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{p.name || 'Patient'}</div>
            <div style={{ fontSize: '0.85rem', color: '#BFDBFE', marginTop: 4 }}>
              {p.age || '—'} yrs · {p.gender || '—'} · 📍 {p.district || '—'}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#93C5FD', marginTop: 6 }}>
              Triage ID: {record.triageId}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 999,
              fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase',
            }}>
              {urg}
            </span>
            <button
              onClick={onClose}
              aria-label="Close report"
              style={{
                display: 'block', marginTop: 8, background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, color: '#FFF',
                cursor: 'pointer', padding: '4px 10px', fontSize: '0.78rem',
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Chief Complaint & Arrival */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Chief Complaint</div>
            <div style={valueStyle}>{record.chiefComplaint?.category || 'General'}</div>
            <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 4, fontStyle: 'italic' }}>
              "{record.chiefComplaint?.text || 'No additional notes'}"
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: '0.82rem', color: '#64748B' }}>
              <span>🚑 Arrival: <strong>{record.arrivalMode || 'Walk-in'}</strong></span>
              <span>⏱ Duration: <strong>{record.symptomDuration || '—'}</strong></span>
            </div>
          </div>

          {/* Physiological Vitals Grid */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Physiological Vital Signs</div>
            <div style={gridStyle}>
              {VITAL_FIELDS.map((f) => {
                const val = v[f.key];
                if (val == null || val === '') return null;
                const flagged = isRedFlag(f.key, val);
                return (
                  <div key={f.key} style={{
                    background: flagged ? '#FEF2F2' : '#FFFFFF',
                    border: `1px solid ${flagged ? '#FECACA' : '#E2E8F0'}`,
                    borderRadius: 8, padding: '8px 10px',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: flagged ? '#B91C1C' : '#64748B', fontWeight: 600 }}>
                      {flagged && '⚠ '}{f.label}
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: flagged ? '#DC2626' : '#1E293B', fontFamily: 'monospace' }}>
                      {val} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#94A3B8' }}>{f.unit}</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: 2 }}>Normal: {f.normalRange}</div>
                  </div>
                );
              })}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Consciousness (AVPU)</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E293B', textTransform: 'capitalize' }}>
                  {v.consciousness || 'Alert'}
                </div>
              </div>
            </div>
          </div>

          {/* Safety Scores & Red Flags */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{
              ...sectionStyle, marginBottom: 0,
              background: (record.computedScores?.news2 ?? 0) >= 5 ? '#FEF2F2' : '#F0FDF4',
              border: `1px solid ${(record.computedScores?.news2 ?? 0) >= 5 ? '#FECACA' : '#BBF7D0'}`,
            }}>
              <div style={labelStyle}>NEWS2 Score</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: (record.computedScores?.news2 ?? 0) >= 5 ? '#DC2626' : '#166534' }}>
                {record.computedScores?.news2 ?? '—'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                {(record.computedScores?.news2 ?? 0) >= 7 ? 'Clinical Emergency' : (record.computedScores?.news2 ?? 0) >= 5 ? 'Urgent Response' : 'Low / Routine'}
              </div>
            </div>
            <div style={{
              ...sectionStyle, marginBottom: 0,
              background: record.redFlags?.length > 0 ? '#FEF2F2' : '#F0FDF4',
              border: `1px solid ${record.redFlags?.length > 0 ? '#FECACA' : '#BBF7D0'}`,
            }}>
              <div style={labelStyle}>Red Flags</div>
              {record.redFlags?.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {record.redFlags.map((f, i) => (
                    <span key={i} style={{
                      background: '#FEE2E2', color: '#B91C1C', fontSize: '0.72rem',
                      fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: '1px solid #FECACA',
                    }}>
                      🚨 {f}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>None ✓</div>
              )}
            </div>
          </div>

          {/* Clinical Urgency Assessment */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Clinical Urgency Assessment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>ML Model Suggestion</div>
                <div style={{ marginTop: 2 }}><UrgencyBadge urgency={record.modelSuggestedUrgency} /></div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Doctor Confirmed</div>
                <div style={{ marginTop: 2 }}>
                  {record.confirmedUrgency
                    ? <UrgencyBadge urgency={record.confirmedUrgency} />
                    : <span style={{ fontSize: '0.82rem', color: '#94A3B8', fontStyle: 'italic' }}>Awaiting review</span>}
                </div>
              </div>
            </div>
            {record.overrideReason && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: '0.82rem', color: '#92400E' }}>
                <strong>Override Justification:</strong> {record.overrideReason}
              </div>
            )}
          </div>

          {/* Nurse Notes */}
          {record.notes && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Nurse Clinical Notes</div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>{record.notes}</div>
            </div>
          )}

          {/* Record Meta */}
          <div style={{ ...sectionStyle, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <div style={labelStyle}>Record Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.82rem', color: '#1E3A8A' }}>
              <div>👩‍⚕️ Recorded by: <strong>{nurse.name || '—'}</strong></div>
              <div>🏥 Status: <strong style={{ textTransform: 'uppercase' }}>{record.status}</strong></div>
              <div>📅 Recorded: <strong>{record.recordedAt ? new Date(record.recordedAt).toLocaleString() : '—'}</strong></div>
              <div>👨‍⚕️ Confirmed by: <strong>{confirmedBy.name || 'Pending'}</strong></div>
            </div>
          </div>

          <p style={{ fontSize: '0.72rem', color: '#94A3B8', textAlign: 'center', margin: '12px 0 0' }}>
            Decision support only. Synthetic data — not for real patient care. A clinician must review all records.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── RECENT ─────────────────────────────── */
function RecentTab({ records, loading }) {
  const [selectedRecord, setSelectedRecord] = useState(null);
  return (
    <div className="tn-recent">
      <div className="tn-page-header">
        <h1 className="tn-page-title">Recent Entries</h1>
      </div>
      {loading ? (
        <div className="tn-loading">Loading…</div>
      ) : records.length === 0 ? (
        <div className="tn-empty">No triage records recorded yet.</div>
      ) : (
        <table className="tn-table" aria-label="Recent triage records">
          <thead>
            <tr>
              <th>Triage ID</th>
              <th>Patient</th>
              <th>Category</th>
              <th>Vitals (BP/HR/SpO₂)</th>
              <th>Status</th>
              <th>Urgency</th>
              <th>Recorded</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec._id} className={rec.redFlags?.length > 0 ? 'tn-row--redflag' : ''}>
                <td className="tn-table-mono">{rec.triageId}</td>
                <td style={{ fontWeight: 600 }}>{rec.patientId?.name || '—'}</td>
                <td>{rec.chiefComplaint?.category || '—'}</td>
                <td className="tn-table-mono">
                  {rec.vitals
                    ? `${rec.vitals.systolicBp ?? '?'}/${rec.vitals.diastolicBp ?? '?'} · ${rec.vitals.heartRate ?? '?'} · ${rec.vitals.spo2 ?? '?'}%`
                    : '—'}
                </td>
                <td><span className={`tn-status-badge tn-status-badge--${rec.status}`}>{rec.status}</span></td>
                <td><UrgencyBadge urgency={rec.modelSuggestedUrgency || rec.confirmedUrgency} /></td>
                <td className="tn-table-muted">{formatAge(rec.recordedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="tn-btn tn-btn--ghost"
                    style={{ fontSize: '0.75rem', padding: '3px 8px', whiteSpace: 'nowrap' }}
                    onClick={() => setSelectedRecord(rec)}
                  >
                    📋 View Report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedRecord && <TriageReportModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
    </div>
  );
}

/* ──────────────────────────────── PATIENTS ─────────────────────────────── */
function PatientsTab({ patients, loading, records, onStartTriage }) {
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Build a map: patientId → latest triage record
  const patientLatestTriage = {};
  if (records) {
    for (const rec of records) {
      const pid = rec.patientId?._id || rec.patientId;
      if (pid && !patientLatestTriage[pid]) {
        patientLatestTriage[pid] = rec;
      }
    }
  }

  return (
    <div className="tn-patients">
      <div className="tn-page-header">
        <h1 className="tn-page-title">Patient Summaries</h1>
        <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
          Showing {patients.length} registered patients · Click "📋 View Report" for latest triage details
        </span>
      </div>
      {loading ? (
        <div className="tn-loading">Loading patients…</div>
      ) : patients.length === 0 ? (
        <div className="tn-empty">No patients available for intake.</div>
      ) : (
        <table className="tn-table" aria-label="Patient summaries">
          <thead>
            <tr>
              <th>Name</th>
              <th>Age / Gender</th>
              <th>District</th>
              <th>Triage Status</th>
              <th>Latest Urgency</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => {
              const pid = p._id || p.id || p.patientId;
              const latestRec = patientLatestTriage[pid];
              const hasTriaged = Boolean(latestRec);
              const urg = latestRec?.modelSuggestedUrgency || latestRec?.confirmedUrgency;
              return (
                <tr key={pid}>
                  <td style={{ fontWeight: 600, color: '#1E293B' }}>{p.name}</td>
                  <td className="tn-table-muted">{p.age || '—'} yrs · {p.gender || '—'}</td>
                  <td className="tn-table-muted">{p.district || '—'}</td>
                  <td>
                    {hasTriaged ? (
                      <span style={{
                        background: latestRec.status === 'reviewed' ? '#DCFCE7' : latestRec.status === 'submitted' ? '#DBEAFE' : '#FEF3C7',
                        color: latestRec.status === 'reviewed' ? '#166534' : latestRec.status === 'submitted' ? '#1D4ED8' : '#92400E',
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        textTransform: 'uppercase',
                      }}>
                        {latestRec.status}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontStyle: 'italic' }}>⚪ Not triaged</span>
                    )}
                  </td>
                  <td>
                    {urg ? <UrgencyBadge urgency={urg} /> : <span className="tn-table-muted">—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {hasTriaged ? (
                        <button
                          type="button"
                          className="tn-btn tn-btn--ghost"
                          style={{ fontSize: '0.72rem', padding: '3px 8px', whiteSpace: 'nowrap' }}
                          onClick={() => setSelectedRecord(latestRec)}
                        >
                          📋 View Report
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="tn-btn tn-btn--primary"
                          style={{ fontSize: '0.72rem', padding: '3px 10px', whiteSpace: 'nowrap' }}
                          onClick={() => onStartTriage?.(pid)}
                        >
                          ➕ Triage Patient
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {selectedRecord && <TriageReportModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
    </div>
  );
}

/* ──────────────────────────────── MAIN COMPONENT ───────────────────────── */
export default function TriageNursePortal({ token, nurseUser, initialTab = 'overview' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [records, setRecords] = useState([]);
  const [patients, setPatients] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/triage/records', { headers: authHeaders, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load records.');
      setRecords(data.records || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRecordsLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const res = await fetch('/api/triage/patients', { headers: authHeaders, credentials: 'include' });
      const data = await res.json();
      if (res.ok) setPatients(data.patients || []);
    } catch { /* silent */ } finally {
      setPatientsLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => { loadRecords(); loadPatients(); }, [loadRecords, loadPatients]);

  const pendingCount = records.filter((r) => r.status === 'submitted').length;
  const redFlagCount = records.filter((r) => r.redFlags?.length > 0).length;

  const tabs = [
    { id: 'overview', label: 'Triage Overview', icon: '📊' },
    { id: 'intake', label: `Intake Queue (${pendingCount})`, icon: '📥' },
    { id: 'new_triage', label: '⚡ New Triage Intake', icon: '➕' },
    { id: 'recent', label: 'Recent Entries', icon: '🕒' },
    { id: 'patients', label: `Patients (${patients.length})`, icon: '👥' },
  ];

  return (
    <div className="tn-portal-clean">
      {/* Royal Blue Clinical Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
        color: '#FFFFFF',
        borderRadius: '16px',
        padding: '1.75rem 2rem',
        marginBottom: '1.75rem',
        boxShadow: '0 10px 25px -5px rgba(29, 78, 216, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(8px)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem'
          }}>
            📋
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Triage & Emergency Intake Workspace
            </h1>
            <p style={{ margin: '0.35rem 0 0 0', color: '#BFDBFE', fontSize: '0.95rem' }}>
              Nurse {nurseUser?.name || 'Practitioner'} · {nurseUser?.hospital || 'Clinical Facility Partner'} · Shift Active
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '10px',
            padding: '0.6rem 1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#BFDBFE', textTransform: 'uppercase', letterSpacing: '0.05em' }}>In Queue</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF' }}>{pendingCount}</div>
          </div>
          <div style={{
            background: redFlagCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.12)',
            border: redFlagCount > 0 ? '1px solid rgba(248, 113, 113, 0.5)' : '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '10px',
            padding: '0.6rem 1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: redFlagCount > 0 ? '#FECACA' : '#BFDBFE', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Red Flags</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: redFlagCount > 0 ? '#FCA5A5' : '#FFFFFF' }}>{redFlagCount}</div>
          </div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '10px',
            padding: '0.6rem 1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#BFDBFE', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Intake</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF' }}>{records.length}</div>
          </div>
        </div>
      </div>

      {/* Blue Clinical Sub-Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.5rem',
        background: '#DBEAFE',
        borderRadius: '12px',
        marginBottom: '1.75rem',
        overflowX: 'auto',
        border: '1px solid #BFDBFE'
      }} role="tablist" aria-label="Triage nurse workspace sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.65rem 1.15rem',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? '#FFFFFF' : '#1E40AF',
              background: activeTab === tab.id ? 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === tab.id ? '0 4px 10px rgba(29, 78, 216, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="tn-error-banner tn-error-banner--top" role="alert">{errorMsg}</div>
      )}
      {activeTab === 'overview' && (
        <OverviewTab records={records} patients={patients} loading={recordsLoading} />
      )}
      {activeTab === 'intake' && (
        <IntakeQueueTab records={records} loading={recordsLoading} onRefresh={loadRecords} />
      )}
      {activeTab === 'new_triage' && (
        <NewTriageTab patients={patients} token={token} nurseUser={nurseUser} onCreated={loadRecords} />
      )}
      {activeTab === 'recent' && (
        <RecentTab records={records} loading={recordsLoading} />
      )}
      {activeTab === 'patients' && (
        <PatientsTab
          patients={patients}
          loading={patientsLoading}
          records={records}
          onStartTriage={(pid) => {
            setActiveTab('new_triage');
          }}
        />
      )}
    </div>
  );
}
