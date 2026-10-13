import React, { useState, useEffect } from 'react';

export default function ReviewerPortal({ token, reviewerUser }) {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'schemes' | 'specialty_map' | 'practitioners'

  // Schemes state
  const [schemes, setSchemes] = useState([]);
  // Hospitals verification queue state
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Specialty map state
  const [specialtyMappings, setSpecialtyMappings] = useState([]);
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [mappingStatus, setMappingStatus] = useState('REVIEWED_ACCEPTED');
  const [mappingRules, setMappingRules] = useState('');

  // Practitioner verification state
  const [pracHospitalId, setPracHospitalId] = useState('');
  const [hospitalPractitioners, setHospitalPractitioners] = useState([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (token) {
      loadSchemes();
      loadHospitalsQueue();
      loadSpecialtyMap();
    }
  }, [token]);

  const loadPractitionersForHospital = async (hId) => {
    if (!hId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/hospitals/${hId}/practitioners`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (res.ok) {
        setHospitalPractitioners(data.practitioners || []);
      } else {
        setErrorMsg(data.message || 'Failed to load practitioners');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPractitioner = async (hId, practitionerId, newVerificationStatus) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/hospitals/${hId}/practitioners/${practitionerId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ verificationStatus: newVerificationStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Practitioner credentials updated to ${newVerificationStatus.toUpperCase()}. Tier re-evaluation completed (Current Tier: ${data.currentHospitalTier || 'N/A'}).`);
        loadPractitionersForHospital(hId);
        loadHospitalsQueue();
      } else {
        setErrorMsg(data.message || 'Failed to update practitioner verification status');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSchemes = async () => {
    try {
      const res = await fetch('/api/schemes', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (res.ok) setSchemes(data.schemes || []);
    } catch (err) {
      console.warn('Failed to load schemes:', err.message);
    }
  };

  const loadHospitalsQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hospitals', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (res.ok) {
        setHospitals(data.hospitals || []);
      }
    } catch (err) {
      console.warn('Failed to load hospitals queue:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSpecialtyMap = async () => {
    try {
      const res = await fetch('/api/specialty-map', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (res.ok) {
        setSpecialtyMappings(data.mappings || []);
      }
    } catch (err) {
      console.warn('Failed to load condition-specialty mappings:', err.message);
    }
  };

  const handleVerifyHospital = async (hospitalId) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/hospitals/${hospitalId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Audit criteria satisfied; clinical capabilities confirmed.' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ ${data.message}`);
        loadHospitalsQueue();
      } else {
        setErrorMsg(data.message || 'Verification failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectHospital = async () => {
    if (!selectedHospital || !rejectReason.trim()) {
      setErrorMsg('A detailed rejection reason is strictly required.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/hospitals/${selectedHospital._id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Hospital verification rejected: ${selectedHospital.name}`);
        setShowRejectModal(false);
        setRejectReason('');
        setSelectedHospital(null);
        loadHospitalsQueue();
      } else {
        setErrorMsg(data.message || 'Rejection failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOffMapping = async (mapId) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/specialty-map/${mapId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: mappingStatus,
          escalation_rules: mappingRules || undefined,
          notes: 'Signed off by TNHSP Reviewer',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Condition mapping updated successfully.`);
        setEditingMappingId(null);
        loadSpecialtyMap();
      } else {
        setErrorMsg(data.message || 'Failed to sign off mapping');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSweepOutdated = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/schemes/check-outdated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ maxAgeDays: 180 }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Outdated scheme audit sweep complete. Flagged ${data.flaggedCount} scheme(s) older than 180 days.`);
        loadSchemes();
      } else {
        setErrorMsg(data.message || 'Sweep failed.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyScheme = async (schemeId) => {
    if (!token) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/schemes/${schemeId}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Scheme ${schemeId} re-verified and timestamp updated.`);
        loadSchemes();
      } else {
        setErrorMsg(data.message || 'Verification failed.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="reviewer-portal-view" className="portal-container">
      {errorMsg && <div className="clinical-warning-banner" role="alert">⚠️ {errorMsg}</div>}
      {successMsg && <div className="clinical-notice-box" role="status" style={{ marginBottom: 16 }}>{successMsg}</div>}

      {/* Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('queue')}
        >
          📋 Hospital Verification Queue ({hospitals.filter((h) => h.verificationStatus !== 'verified').length} pending)
        </button>
        <button
          className={`btn ${activeTab === 'schemes' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('schemes')}
        >
          🛡️ Health Schemes Catalogue ({schemes.length})
        </button>
        <button
          className={`btn ${activeTab === 'specialty_map' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('specialty_map')}
        >
          🩺 Condition-Specialty Review Sheet ({specialtyMappings.length})
        </button>
        <button
          className={`btn ${activeTab === 'practitioners' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => {
            setActiveTab('practitioners');
            if (!pracHospitalId && hospitals.length > 0) {
              setPracHospitalId(hospitals[0]._id);
              loadPractitionersForHospital(hospitals[0]._id);
            }
          }}
        >
          👨‍⚕️ Practitioner Verifications
        </button>
      </div>

      {/* TAB 1: Hospital Verification Queue */}
      {activeTab === 'queue' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">📋 Hospital Capability Verification & Tier Audit Queue</h2>
              <p className="card-desc">
                Review proposed capability tiers, consistency warnings, and simulated establishment proof. Approving confirms the hospital's effective tier.
              </p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadHospitalsQueue}>↻ Refresh Queue</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Hospital Name & District</th>
                  <th style={{ padding: 8 }}>Proposed Tier</th>
                  <th style={{ padding: 8 }}>Effective Tier</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Key Capabilities</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hospitals.map((h) => (
                  <tr key={h._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 8 }}>
                      <strong>{h.name}</strong>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{h.code} · {h.district}</div>
                    </td>
                    <td style={{ padding: 8 }}>
                      <span className="badge badge-secondary">{h.proposedTier || h.tier}</span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <strong>{h.tier}</strong>{' '}
                      <span className={`badge ${h.tierStatus === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>
                        {h.tierStatus || 'unconfirmed'}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <span className={`badge ${h.verificationStatus === 'verified' ? 'badge-success' : h.verificationStatus === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                        {h.verificationStatus}
                      </span>
                    </td>
                    <td style={{ padding: 8, fontSize: '0.8rem', color: '#475569' }}>
                      ICU: {h.bedCounts?.icu || 0} | Vents: {h.equipment?.ventilators?.count || 0} | CathLab: {h.equipment?.cardiacCathLab?.available ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {h.verificationStatus !== 'verified' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleVerifyHospital(h._id)}
                            disabled={loading}
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setSelectedHospital(h);
                              setShowRejectModal(true);
                            }}
                            disabled={loading}
                          >
                            ✗ Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#10b981', fontSize: '0.82rem' }}>Verified ✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Scheme Catalogue Management */}
      {activeTab === 'schemes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🛡️ Government Healthcare Schemes Catalogue (Auditor Management)</h2>
              <p className="card-desc">
                Stamped with verified dates, official source URLs, and confirmed vs draft criteria.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button id="sweep-outdated-btn" className="btn btn-warning btn-sm" onClick={handleSweepOutdated}>
                ⏱ Sweep Outdated Schemes (&gt;180d)
              </button>
              <button className="btn btn-outline btn-sm" onClick={loadSchemes}>↻ Refresh</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
            {schemes.map((s) => (
              <div key={s.schemeId} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', margin: '0 0 4px 0', color: '#1e293b' }}>
                      {s.name} ({s.schemeId})
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Authority: {s.authority}</div>
                  </div>
                  <span className={`badge ${s.status === 'verified' ? 'badge-success' : 'badge-warning'}`}>
                    {s.status}
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#334155', marginBottom: 12 }}>
                  {s.shortDescription}
                </p>

                <div style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                  <strong>Verified Date:</strong> {s.lastVerifiedDate ? new Date(s.lastVerifiedDate).toLocaleDateString() : 'Unverified'}
                  {s.outdated && (
                    <span className="badge badge-danger" style={{ marginLeft: 8 }}>⚠️ OUTDATED (&gt;180d)</span>
                  )}
                </div>

                <div style={{ fontSize: '0.8rem', marginBottom: 12 }}>
                  <strong>Official Portal:</strong>{' '}
                  <a href={s.officialPortalUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7' }}>
                    {s.officialPortalUrl}
                  </a>
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleVerifyScheme(s.schemeId)}
                  disabled={loading}
                >
                  🛡️ Re-Verify Against Official Portal
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Condition-Specialty Review Sheet */}
      {activeTab === 'specialty_map' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🩺 Condition-Specialty Escalation Mapping Review Sheet</h2>
              <p className="card-desc">
                Reviewer sign-off on conditionSpecialtyMap protocol rules used by automated clinical triage routing.
              </p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadSpecialtyMap}>↻ Refresh Mappings</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Condition & ICD-10</th>
                  <th style={{ padding: 8 }}>Primary / Secondary Specialty</th>
                  <th style={{ padding: 8 }}>Min Hospital Tier</th>
                  <th style={{ padding: 8 }}>Escalation Protocol Rules</th>
                  <th style={{ padding: 8 }}>Review State</th>
                  <th style={{ padding: 8 }}>Reviewer Action</th>
                </tr>
              </thead>
              <tbody>
                {specialtyMappings.map((m) => (
                  <tr key={m._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 8 }}>
                      <strong>{m.name}</strong>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        ID: {m.condition_id} · ICD-10: {m.icd10_code}
                      </div>
                    </td>
                    <td style={{ padding: 8 }}>
                      <strong>{m.primary_specialty}</strong>
                      {m.secondary_specialty && (
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          Sec: {m.secondary_specialty}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      <span className="badge badge-secondary">{m.min_hospital_tier}</span>
                    </td>
                    <td style={{ padding: 8, fontSize: '0.82rem', color: '#334155', maxWidth: 280 }}>
                      {editingMappingId === m._id ? (
                        <textarea
                          className="form-input"
                          style={{ fontSize: '0.8rem', minHeight: 60 }}
                          value={mappingRules}
                          onChange={(e) => setMappingRules(e.target.value)}
                        />
                      ) : (
                        m.escalation_rules || 'Standard specialty consultation protocol'
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      {editingMappingId === m._id ? (
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={mappingStatus}
                          onChange={(e) => setMappingStatus(e.target.value)}
                        >
                          <option value="REVIEWED_ACCEPTED">REVIEWED_ACCEPTED</option>
                          <option value="MODIFIED">MODIFIED</option>
                          <option value="PENDING CLINICIAN REVIEW">PENDING CLINICIAN REVIEW</option>
                        </select>
                      ) : (
                        <span className={`badge ${m.status === 'REVIEWED_ACCEPTED' ? 'badge-success' : m.status === 'MODIFIED' ? 'badge-warning' : 'badge-danger'}`}>
                          {m.status}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      {editingMappingId === m._id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleSignOffMapping(m._id)}
                            disabled={loading}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setEditingMappingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setEditingMappingId(m._id);
                            setMappingStatus(m.status);
                            setMappingRules(m.escalation_rules || '');
                          }}
                        >
                          ✏️ Edit / Sign-off
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Practitioner Credentials Verification */}
      {activeTab === 'practitioners' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">👨‍⚕️ Practitioner Credentials Verification & Governance</h2>
              <p className="card-desc">
                State platform reviewer gate. Only approved practitioners count toward hospital specialist capacity and dynamic capability tiering.
              </p>
            </div>
            {pracHospitalId && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => loadPractitionersForHospital(pracHospitalId)}
              >
                ↻ Refresh Roster
              </button>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label" htmlFor="reviewer-hospital-select">
              Select Facility to Inspect Medical Staff Roster:
            </label>
            <select
              id="reviewer-hospital-select"
              className="form-input"
              value={pracHospitalId}
              onChange={(e) => {
                setPracHospitalId(e.target.value);
                loadPractitionersForHospital(e.target.value);
              }}
            >
              <option value="">-- Choose a Hospital --</option>
              {hospitals.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name} ({h.district} · {h.tier} · Status: {h.verificationStatus})
                </option>
              ))}
            </select>
          </div>

          {pracHospitalId ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Practitioner Name</th>
                    <th style={{ padding: '8px 12px' }}>Specialty</th>
                    <th style={{ padding: '8px 12px' }}>Qualification</th>
                    <th style={{ padding: '8px 12px' }}>State Registration</th>
                    <th style={{ padding: '8px 12px' }}>Employment</th>
                    <th style={{ padding: '8px 12px' }}>Verification Status</th>
                    <th style={{ padding: '8px 12px' }}>Reviewer Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitalPractitioners.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                        No practitioners registered in this facility yet.
                      </td>
                    </tr>
                  ) : (
                    hospitalPractitioners.map((p) => (
                      <tr key={p._id || p.practitionerId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <strong>{p.fullName}</strong>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="badge badge-secondary">{p.specialty}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {p.qualification}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {p.registrationNumber}
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
                          <div style={{ display: 'flex', gap: 6 }}>
                            {p.verificationStatus !== 'verified' && (
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                onClick={() => handleVerifyPractitioner(pracHospitalId, p.practitionerId, 'verified')}
                                disabled={loading}
                              >
                                ✓ Verify
                              </button>
                            )}
                            {p.verificationStatus !== 'rejected' && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#ef4444', borderColor: '#ef4444' }}
                                onClick={() => handleVerifyPractitioner(pracHospitalId, p.practitionerId, 'rejected')}
                                disabled={loading}
                              >
                                ✗ Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#64748b', fontStyle: 'italic' }}>
              Select a hospital above to review its practitioner credentials.
            </p>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedHospital && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Reject Hospital Verification</h3>
            <p style={{ fontSize: '0.88rem', color: '#475569' }}>
              Hospital: <strong>{selectedHospital.name}</strong> ({selectedHospital.code})
            </p>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="reject-reason-input">
                Mandatory Rejection Justification:
              </label>
              <textarea
                id="reject-reason-input"
                className="form-input"
                rows="4"
                placeholder="Specify missing infrastructure, invalid registration, or capability inconsistency..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleRejectHospital}
                disabled={loading || !rejectReason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
