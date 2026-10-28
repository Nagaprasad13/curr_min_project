import React, { useState, useEffect } from 'react';
import { apiFetch as fetch } from '../api';
import { getTranslation } from '../i18n/strings';
import { Modal, Skeleton } from '../design-system/components';

export default function HospitalAdminPortal({ token, adminUser, initialTab = 'telemetry' }) {
  const [hospital, setHospital] = useState(null);
  const [consistencyChecks, setConsistencyChecks] = useState(null);
  const [latestCapacity, setLatestCapacity] = useState(null);
  const [telemetryAge, setTelemetryAge] = useState(null);
  const [initialContextLoading, setInitialContextLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Capacity update form state
  const [capacityForm, setCapacityForm] = useState({
    generalAvailable: '',
    generalTotal: '',
    emergencyAvailable: '',
    emergencyTotal: '',
    icuAvailable: '',
    icuTotal: '',
    ventilatorsAvailable: '',
    ventilatorsTotal: '',
    emergencyStatus: 'unknown',
    cathLabStatus: 'unknown',
    ctScanStatus: 'unknown',
    mriStatus: 'unknown',
    dialysisStatus: 'unknown',
    bloodBankStatus: 'unknown',
    stalenessMinutes: '',
  });

  const [activeTab, setActiveTab] = useState(initialTab);
  const [practitioners, setPractitioners] = useState([]);
  const [nurses, setNurses] = useState([]);
  const [nursesLoading, setNursesLoading] = useState(false);
  const [nursesError, setNursesError] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedNurseId, setSelectedNurseId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pracForm, setPracForm] = useState({
    fullName: '',
    qualification: '',
    specialty: '',
    registrationNumber: '',
    availability: 'on_call_24x7',
  });
  const [inviteRole, setInviteRole] = useState('doctor');
  const [createdInvite, setCreatedInvite] = useState(null);

  const hospitalId = adminUser?.hospitalId || null;

  useEffect(() => {
    if (adminUser && hospitalId) {
      const controller = new AbortController();
      setInitialContextLoading(true);
      Promise.all([
        loadHospitalDetails(controller.signal),
        loadLatestCapacity(controller.signal),
        loadPractitioners(controller.signal),
        loadNurses(controller.signal),
      ]).finally(() => {
        if (!controller.signal.aborted) setInitialContextLoading(false);
      });
      return () => controller.abort();
    } else if (adminUser) {
      setErrorMsg('This hospital administrator account is not assigned to a hospital.');
    }
  }, [adminUser, hospitalId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadPractitioners = async (signal) => {
    try {
      const res = await fetch(`/api/hospitals/${hospitalId}/practitioners`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setPractitioners(data.practitioners || []);
      } else {
        setErrorMsg(data.message || 'Practitioner roster could not be loaded.');
      }
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    }
  };

  const loadNurses = async (signal) => {
    try {
      const res = await fetch(`/api/hospitals/${hospitalId}/nurses`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setNurses(data.nurses || []);
      } else {
        setNursesError(data.message || 'Nurse roster could not be loaded.');
      }
    } catch (err) {
      if (!signal?.aborted) setNursesError(err.message);
    }
  };

  const handleCreateInvite = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        credentials: 'include',
        body: JSON.stringify({ role: inviteRole, hospitalId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The staff invitation could not be created.');
      setCreatedInvite(data.invite);
      setSuccessMsg('Staff invitation created for this hospital.');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHospitalDetails = async (signal) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/hospitals/${hospitalId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setHospital(data.hospital);
        setConsistencyChecks(data.consistencyChecks);
      } else {
        setErrorMsg(data.message || 'Failed to load hospital profile');
      }
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const loadLatestCapacity = async (signal) => {
    try {
      const res = await fetch(`/api/hospitals/${hospitalId}/capacity/latest`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setLatestCapacity(data.snapshot);
        setTelemetryAge(data.telemetryAge);
        if (data.snapshot?.beds) {
          setCapacityForm((prev) => ({
            ...prev,
            generalAvailable: data.snapshot.beds.general?.available ?? '',
            generalTotal: data.snapshot.beds.general?.total ?? '',
            emergencyAvailable: data.snapshot.beds.emergency?.available ?? '',
            emergencyTotal: data.snapshot.beds.emergency?.total ?? '',
            icuAvailable: data.snapshot.beds.icu?.available ?? '',
            icuTotal: data.snapshot.beds.icu?.total ?? '',
            ventilatorsAvailable: data.snapshot.beds.ventilators?.available ?? '',
            ventilatorsTotal: data.snapshot.beds.ventilators?.total ?? '',
          }));
        }
      } else {
        setErrorMsg(data.message || 'Latest capacity report could not be loaded.');
      }
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    }
  };

  const handleCapacitySubmit = async (e) => {
    e.preventDefault();
    const requiredCounts = [
      capacityForm.generalAvailable, capacityForm.generalTotal,
      capacityForm.emergencyAvailable, capacityForm.emergencyTotal,
      capacityForm.icuAvailable, capacityForm.icuTotal,
      capacityForm.ventilatorsAvailable, capacityForm.ventilatorsTotal,
    ];
    if (requiredCounts.some((value) => value === '' || !Number.isFinite(Number(value)))) {
      setErrorMsg('Enter all available and total capacity counts before submitting.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const payload = {
        reportedAt: new Date().toISOString(),
        reportedBy: adminUser?.name || 'Hospital Admin',
        stalenessThresholdMinutes: Number(capacityForm.stalenessMinutes) || 120,
        beds: {
          general: {
            total: Number(capacityForm.generalTotal),
            available: Number(capacityForm.generalAvailable),
            occupied: Math.max(0, Number(capacityForm.generalTotal) - Number(capacityForm.generalAvailable)),
            reportedStatus: Number(capacityForm.generalAvailable) > 0 ? 'available' : 'unavailable',
          },
          emergency: {
            total: Number(capacityForm.emergencyTotal),
            available: Number(capacityForm.emergencyAvailable),
            occupied: Math.max(0, Number(capacityForm.emergencyTotal) - Number(capacityForm.emergencyAvailable)),
            reportedStatus: Number(capacityForm.emergencyAvailable) > 0 ? 'available' : 'unavailable',
          },
          icu: {
            total: Number(capacityForm.icuTotal),
            available: Number(capacityForm.icuAvailable),
            occupied: Math.max(0, Number(capacityForm.icuTotal) - Number(capacityForm.icuAvailable)),
            reportedStatus: Number(capacityForm.icuAvailable) > 0 ? 'available' : 'unavailable',
          },
          ventilators: {
            total: Number(capacityForm.ventilatorsTotal),
            available: Number(capacityForm.ventilatorsAvailable),
            occupied: Math.max(0, Number(capacityForm.ventilatorsTotal) - Number(capacityForm.ventilatorsAvailable)),
            reportedStatus: Number(capacityForm.ventilatorsAvailable) > 0 ? 'available' : 'unavailable',
          },
        },
        services: {
          emergencyDepartment: { reportedStatus: capacityForm.emergencyStatus },
          cardiacCathLab: { reportedStatus: capacityForm.cathLabStatus },
          ctScan: { reportedStatus: capacityForm.ctScanStatus },
          mri: { reportedStatus: capacityForm.mriStatus },
          dialysis: { reportedStatus: capacityForm.dialysisStatus },
          bloodBank: { reportedStatus: capacityForm.bloodBankStatus },
        },
      };

      const res = await fetch(`/api/hospitals/${hospitalId}/capacity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('✓ Capacity telemetry snapshot recorded successfully into append-only audit trail.');
        loadLatestCapacity();
      } else {
        setErrorMsg(data.message || 'Failed to update capacity');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPractitioner = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/hospitals/${hospitalId}/practitioners`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pracForm),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Practitioner ${data.practitioner.fullName} registered (status: Pending Verification).`);
        setShowAddModal(false);
        setPracForm({
          fullName: '',
          qualification: '',
          specialty: 'General Medicine',
          registrationNumber: '',
          availability: 'on_call_24x7',
        });
        loadPractitioners();
        loadHospitalDetails();
      } else {
        setErrorMsg(data.message || 'Failed to register practitioner');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePractitionerStatus = async (p) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const newStatus = p.employmentStatus === 'active' ? 'on_leave' : 'active';
      const res = await fetch(`/api/hospitals/${hospitalId}/practitioners/${p.practitionerId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ employmentStatus: newStatus }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ ${p.fullName} status updated to: ${newStatus.toUpperCase()}`);
        loadPractitioners();
        loadHospitalDetails();
      } else {
        setErrorMsg(data.message || 'Failed to update practitioner status');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="hospital-admin-portal-view" className="portal-container" style={{ background: '#F0F7FF', minHeight: '100vh', paddingBottom: 40 }}>
      {/* Hospital Admin Blue Clinical Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
          padding: '22px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          borderRadius: 14,
          boxShadow: '0 4px 16px rgba(29, 78, 216, 0.2)',
          marginBottom: 20,
          color: '#FFFFFF',
        }}
      >
        <div>
          <div style={{ color: '#BFDBFE', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Hospital Administration & Telemetry
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.4rem', fontWeight: 800, marginTop: 2 }}>
            🏥 {hospital?.name || 'Facility Dashboard'}
          </div>
          <div style={{ color: '#E0F2FE', fontSize: '0.82rem', marginTop: 4 }}>
            Code: <strong>{hospital?.code || '—'}</strong> · District: <strong>{hospital?.district || '—'}</strong> · Tier: <strong>{hospital?.tier || '—'}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{practitioners.length}</div>
            <div style={{ color: '#BFDBFE', fontSize: '0.72rem', textTransform: 'uppercase' }}>Medical Staff</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{hospital?.verificationStatus?.toUpperCase() || 'VERIFIED'}</div>
            <div style={{ color: '#BFDBFE', fontSize: '0.72rem', textTransform: 'uppercase' }}>Audit Status</div>
          </div>
        </div>
      </div>

      {initialContextLoading && <Skeleton lines={4} />}
      {errorMsg && (
        <div className="clinical-warning-banner" role="alert">
          ⚠️ {errorMsg} <button type="button" className="btn btn-outline btn-sm" onClick={() => {
            setErrorMsg(null);
            loadHospitalDetails();
            loadLatestCapacity();
            loadPractitioners();
          }}>Retry loading</button>
        </div>
      )}
      {successMsg && (
        <div className="clinical-notice-box" role="status" style={{ marginBottom: 16 }}>
          {successMsg}
        </div>
      )}

      {/* Staleness Threshold Reminder Banner */}
      {telemetryAge && (
        <div
          className={`card ${telemetryAge.isStale ? 'card-stale' : telemetryAge.isApproachingStale ? 'card-warning' : 'card-fresh'}`}
          style={{ marginBottom: 16, borderLeft: `6px solid ${telemetryAge.isStale ? '#ef4444' : telemetryAge.isApproachingStale ? '#f59e0b' : '#10b981'}` }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>⏱ Telemetry Freshness Status: </strong>
              <span>{telemetryAge.message}</span>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
              Report age: <strong>{telemetryAge.ageHours}h</strong> (threshold: {telemetryAge.thresholdMinutes / 60}h)
            </div>
          </div>
        </div>
      )}
      {!telemetryAge && (
        <div className="ds-alert ds-alert-warning" role="status">
          <span className="ds-alert-icon" aria-hidden="true">!</span>
          <div><strong>Capacity state: Unknown</strong><div>Unknown, confirm by phone. No recent capacity report is available.</div></div>
        </div>
      )}

      {/* Portal Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', background: '#DBEAFE', padding: 6, borderRadius: 12, border: '1px solid #BFDBFE' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'telemetry' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.82rem',
            background: activeTab === 'telemetry' ? '#1D4ED8' : '#EFF6FF',
            color: activeTab === 'telemetry' ? '#FFFFFF' : '#1D4ED8',
            boxShadow: activeTab === 'telemetry' ? '0 2px 8px rgba(29, 78, 216, 0.25)' : 'none',
          }}
          onClick={() => setActiveTab('telemetry')}
        >
          📊 Facility Profile & Live Telemetry
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'practitioners' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.82rem',
            background: activeTab === 'practitioners' ? '#1D4ED8' : '#EFF6FF',
            color: activeTab === 'practitioners' ? '#FFFFFF' : '#1D4ED8',
            boxShadow: activeTab === 'practitioners' ? '0 2px 8px rgba(29, 78, 216, 0.25)' : 'none',
          }}
          onClick={() => setActiveTab('practitioners')}
        >
          👨‍⚕️ Medical Staff & Specialist Roster ({practitioners.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'nurses' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.82rem',
            background: activeTab === 'nurses' ? '#1D4ED8' : '#EFF6FF',
            color: activeTab === 'nurses' ? '#FFFFFF' : '#1D4ED8',
            boxShadow: activeTab === 'nurses' ? '0 2px 8px rgba(29, 78, 216, 0.25)' : 'none',
          }}
          onClick={() => setActiveTab('nurses')}
        >
          🩺 Nurse Roster ({nurses.length})
        </button>
      </div>

      <section className="card" aria-labelledby="staff-invite-title">
        <h3 id="staff-invite-title">Invite staff to this hospital</h3>
        <label htmlFor="staff-invite-role">Staff role</label>
        <select id="staff-invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
          <option value="doctor">Doctor</option>
          <option value="hospital_admin">Hospital admin</option>
        </select>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleCreateInvite} disabled={loading || !hospitalId}>
          {loading ? 'Creating invite…' : 'Create invite code'}
        </button>
        {createdInvite && (
          <p role="status">
            Code for this hospital: <code>{createdInvite.code}</code> · expires {new Date(createdInvite.expiresAt).toLocaleString()}
          </p>
        )}
      </section>

      {activeTab === 'telemetry' && (
        <div className="grid-2-col">
        {/* Left Column: Hospital Profile & Capability Tiering */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🏥 Hospital Profile & Clinical Capabilities</h2>
            <p className="card-desc">Simulated facility profile. Synthetic data does not represent legal or regulatory compliance.</p>
          </div>

          {hospital ? (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 4px 0' }}>{hospital.name}</h3>
                <span className="badge badge-secondary">{hospital.code}</span> ·{' '}
                <span>District: <strong>{hospital.district}</strong></span>
              </div>

              {/* Tier Status Display */}
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Effective capability tier:</span>
                    <h3 style={{ margin: '2px 0', color: '#1e293b' }}>
                      {hospital.tier}
                      {hospital.tierStatus === 'unconfirmed' && (
                        <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                          UNCONFIRMED
                        </span>
                      )}
                      {hospital.tierStatus === 'confirmed' && (
                        <span className="badge badge-success" style={{ marginLeft: 8 }}>
                          Simulated verification (synthetic data)
                        </span>
                      )}
                    </h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Audit State:</span>
                    <div>
                      <span className={`badge ${hospital.verificationStatus === 'verified' ? 'badge-success' : hospital.verificationStatus === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                        {hospital.verificationStatus?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {hospital.tierStatus === 'unconfirmed' && (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#b45309' }}>
                    ℹ️ <strong>Proposed Tier</strong> pending formal platform reviewer confirmation. Unverified facilities are not visible to external referring clinicians.
                  </p>
                )}
              </div>

              {/* Consistency Warnings */}
              {consistencyChecks && consistencyChecks.warnings?.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#92400e' }}>⚠️ Automated Consistency Audit Warnings</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', color: '#78350f' }}>
                    {consistencyChecks.warnings.map((w, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        <strong>[{w.severity?.toUpperCase()}]</strong> {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Capability Checklist */}
              <div>
                <h4 style={{ margin: '0 0 8px 0' }}>Registered Specialties & Services:</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(hospital.specialties || []).map((s, idx) => (
                    <span key={idx} className="badge badge-secondary">{s}</span>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Key Specialized Infrastructure:</h4>
                <div style={{ fontSize: '0.88rem', color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div>Cath Lab: {hospital.equipment?.cardiacCathLab?.available ? '✓ Available' : '✗ None'}</div>
                  <div>24x7 CT: {hospital.equipment?.ctScan?.available ? '✓ Available' : '✗ None'}</div>
                  <div>MRI Unit: {hospital.equipment?.mri?.available ? '✓ Available' : '✗ None'}</div>
                  <div>Dialysis: {hospital.equipment?.dialysis?.available ? '✓ Available' : '✗ None'}</div>
                  <div>Blood Bank: {hospital.equipment?.bloodBank?.available ? '✓ Available' : '✗ None'}</div>
                  <div>24x7 Emergency: {hospital.has24x7Emergency ? '✓ Yes' : '✗ No'}</div>
                </div>
              </div>
            </div>
          ) : (
            <p>{getTranslation('en', 'common', 'loading')}</p>
          )}
        </div>

        {/* Right Column: Capacity Telemetry Update Form */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📊 Live Capacity Telemetry Update Form</h2>
            <p className="card-desc">
              Timestamped bed counts. Stale capacity (&gt;2 hours) is treated as "UNKNOWN" by the CareBridge referral ranker.
            </p>
          </div>

          <form onSubmit={handleCapacitySubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label" htmlFor="icu-avail">ICU Beds Available</label>
                <input
                  id="icu-avail"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.icuAvailable}
                  onChange={(e) => setCapacityForm({ ...capacityForm, icuAvailable: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label" htmlFor="icu-total">ICU Total Beds</label>
                <input
                  id="icu-total"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.icuTotal}
                  onChange={(e) => setCapacityForm({ ...capacityForm, icuTotal: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="vent-avail">Ventilators Available</label>
                <input
                  id="vent-avail"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.ventilatorsAvailable}
                  onChange={(e) => setCapacityForm({ ...capacityForm, ventilatorsAvailable: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label" htmlFor="vent-total">Ventilators Total</label>
                <input
                  id="vent-total"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.ventilatorsTotal}
                  onChange={(e) => setCapacityForm({ ...capacityForm, ventilatorsTotal: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="emerg-avail">Emergency Beds Available</label>
                <input
                  id="emerg-avail"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.emergencyAvailable}
                  onChange={(e) => setCapacityForm({ ...capacityForm, emergencyAvailable: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label" htmlFor="emerg-total">Emergency Total Beds</label>
                <input
                  id="emerg-total"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.emergencyTotal}
                  onChange={(e) => setCapacityForm({ ...capacityForm, emergencyTotal: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="gen-avail">General Ward Available</label>
                <input
                  id="gen-avail"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.generalAvailable}
                  onChange={(e) => setCapacityForm({ ...capacityForm, generalAvailable: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label" htmlFor="gen-total">General Ward Total</label>
                <input
                  id="gen-total"
                  className="form-input"
                  type="number"
                  min="0"
                  value={capacityForm.generalTotal}
                  onChange={(e) => setCapacityForm({ ...capacityForm, generalTotal: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label" htmlFor="cath-status">Cath Lab Operational Status</label>
              <select
                id="cath-status"
                className="form-input"
                value={capacityForm.cathLabStatus}
                onChange={(e) => setCapacityForm({ ...capacityForm, cathLabStatus: e.target.value })}
              >
                <option value="available">Available / 24x7 On-Call</option>
                <option value="unavailable">Unavailable (Maintenance / No Team)</option>
                <option value="unknown">Unknown / Not Reported</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="staleness-thresh">Staleness Expiry Threshold (Minutes)</label>
              <input
                id="staleness-thresh"
                className="form-input"
                type="number"
                min="30"
                max="720"
                value={capacityForm.stalenessMinutes}
                onChange={(e) => setCapacityForm({ ...capacityForm, stalenessMinutes: e.target.value })}
              />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Default is 120 minutes (2 hours). Telemetry older than this threshold is degraded to "Unknown" state.
              </span>
            </div>

            <button
              id="submit-capacity-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Submitting Snapshot...' : '📡 Broadcast Live Telemetry Snapshot'}
            </button>
          </form>
        </div>
      </div>
      )}

      {activeTab === 'practitioners' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title">👨‍⚕️ Medical Practitioners & Specialist Roster</h2>
              <p className="card-desc">
                Practitioners with simulated verification status contribute to this prototype's capability tier and referral matching.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddModal(true)}
            >
              + Register New Practitioner
            </button>
          </div>

          <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, marginBottom: 16, borderLeft: '4px solid #3b82f6', fontSize: '0.88rem', color: '#1e293b' }}>
            <strong>Governance Notice:</strong> Newly registered practitioners are marked with status <code>pending_verification</code>.
            Only a state <strong>Platform Reviewer</strong> can approve credentials to <code>verified</code> status.
            Hospital Admins may update on-duty / on-leave employment status.
          </div>

          <div style={{ overflowX: 'auto' }} role="region" aria-label="Practitioner roster table" tabIndex="0">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Name & Qualification</th>
                  <th style={{ padding: '8px 12px' }}>Specialty</th>
                  <th style={{ padding: '8px 12px' }}>State Reg Number</th>
                  <th style={{ padding: '8px 12px' }}>Availability</th>
                  <th style={{ padding: '8px 12px' }}>Employment Status</th>
                  <th style={{ padding: '8px 12px' }}>Verification Status</th>
                  <th style={{ padding: '8px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {practitioners.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                      No practitioners registered yet. Click "+ Register New Practitioner" to add medical staff.
                    </td>
                  </tr>
                ) : (
                  practitioners.map((p) => (
                    <tr key={p._id || p.practitionerId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <strong>{p.fullName}</strong>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{p.qualification}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="badge badge-secondary">{p.specialty}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                        {p.registrationNumber}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {p.availability?.replace(/_/g, ' ')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${p.employmentStatus === 'active' ? 'badge-success' : 'badge-warning'}`}>
                          {p.employmentStatus?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${p.verificationStatus === 'verified' ? 'badge-success' : p.verificationStatus === 'pending_verification' ? 'badge-warning' : 'badge-danger'}`}>
                          {p.verificationStatus?.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                          onClick={() => handleTogglePractitionerStatus(p)}
                          disabled={loading}
                        >
                          {p.employmentStatus === 'active' ? 'Set On Leave' : 'Set Active'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Modal to Register Practitioner */}
          {showAddModal && (
            <Modal open title="Register practitioner" onClose={() => setShowAddModal(false)}>
                <form onSubmit={handleAddPractitioner}>
                  <div style={{ marginBottom: 12 }}>
                    <label className="form-label" htmlFor="prac-name">Full Name (with Dr. prefix)</label>
                    <input
                      id="prac-name"
                      className="form-input"
                      type="text"
                      placeholder="Dr. K. Annamalai"
                      value={pracForm.fullName}
                      onChange={(e) => setPracForm({ ...pracForm, fullName: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label className="form-label" htmlFor="prac-qual">Medical Qualifications</label>
                    <input
                      id="prac-qual"
                      className="form-input"
                      type="text"
                      placeholder="MD (Medicine), DM (Cardiology)"
                      value={pracForm.qualification}
                      onChange={(e) => setPracForm({ ...pracForm, qualification: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label className="form-label" htmlFor="prac-spec">Clinical Specialty</label>
                    <input
                      id="prac-spec"
                      className="form-input"
                      value={pracForm.specialty}
                      onChange={(e) => setPracForm({ ...pracForm, specialty: e.target.value })}
                      placeholder="Enter specialty"
                      required
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label className="form-label" htmlFor="prac-reg">Professional registration reference (synthetic)</label>
                    <input
                      id="prac-reg"
                      className="form-input"
                      type="text"
                      placeholder="TMC-2026-9482"
                      value={pracForm.registrationNumber}
                      onChange={(e) => setPracForm({ ...pracForm, registrationNumber: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label className="form-label" htmlFor="prac-avail">Duty / Availability Schedule</label>
                    <select
                      id="prac-avail"
                      className="form-input"
                      value={pracForm.availability}
                      onChange={(e) => setPracForm({ ...pracForm, availability: e.target.value })}
                    >
                      <option value="on_call_24x7">24x7 Emergency On-Call</option>
                      <option value="shift_based">Standard Shift Based</option>
                      <option value="consultant_visiting">Visiting Consultant</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading ? 'Registering...' : 'Register Practitioner'}
                    </button>
                  </div>
                </form>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
