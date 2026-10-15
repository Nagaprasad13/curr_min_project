import React, { useState, useEffect } from 'react';
import { apiFetch as fetch } from '../api';
import { Modal, Skeleton } from '../design-system/components';
import { safeSchemeText } from '../schemeCopy';

export default function ReviewerPortal({ token, reviewerUser, initialTab = 'queue' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  // Schemes state
  const [schemes, setSchemes] = useState([]);
  // Hospitals verification queue state
  const [hospitals, setHospitals] = useState([]);
  const [hospitalDirectory, setHospitalDirectory] = useState([]);
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
  const [models, setModels] = useState([]);
  const [modelAction, setModelAction] = useState(null);
  const [modelReason, setModelReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (reviewerUser) {
      const controller = new AbortController();
      setInitialLoading(true);
      Promise.all([
        loadSchemes(controller.signal),
        loadHospitalsQueue(controller.signal),
        loadHospitalDirectory(controller.signal),
        loadSpecialtyMap(controller.signal),
        loadModels(controller.signal),
      ]).finally(() => {
        if (!controller.signal.aborted) setInitialLoading(false);
      });
      return () => controller.abort();
    }
  }, [reviewerUser]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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

  const loadModels = async (signal) => {
    try {
      const response = await fetch('/api/models', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        credentials: 'include',
        signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load the model registry.');
      setModels(data.models || []);
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    }
  };

  const handleModelStatus = async (event) => {
    event.preventDefault();
    if (!modelAction || !modelReason.trim()) {
      setErrorMsg('A reason is required to change a model status.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      const response = await fetch(`/api/models/${modelAction.modelId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        credentials: 'include',
        body: JSON.stringify({ status: modelAction.status, justification: modelReason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Model status could not be changed.');
      setSuccessMsg(data.message || 'Model registry status updated.');
      setModelAction(null);
      setModelReason('');
      await loadModels();
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

  const loadSchemes = async (signal) => {
    try {
      const res = await fetch('/api/schemes', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Scheme catalogue could not be loaded.');
      setSchemes(data.schemes || []);
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    }
  };

  const loadHospitalsQueue = async (signal) => {
    try {
      setLoading(true);
      const res = await fetch('/api/hospitals', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Hospital queue could not be loaded.');
      setHospitals(data.hospitals || []);
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const loadHospitalDirectory = async (signal) => {
    try {
      const res = await fetch('/api/hospitals/reviewer-directory', {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load the hospital directory.');
      setHospitalDirectory(data.hospitals || []);
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
    }
  };

  const loadSpecialtyMap = async (signal) => {
    try {
      const res = await fetch('/api/specialty-map', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Condition-specialty mappings could not be loaded.');
      setSpecialtyMappings(data.mappings || []);
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err.message);
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
        body: JSON.stringify({ reason: 'Research simulation review recorded; data are synthetic.' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Simulated verification recorded for this synthetic facility.');
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
          notes: 'Reviewed in the CareBridge research prototype',
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
    if (!reviewerUser) return;
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
    if (!reviewerUser) return;
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
      {initialLoading && <Skeleton lines={4} />}
      {errorMsg && <div className="clinical-warning-banner" role="alert">⚠️ {errorMsg} <button type="button" className="btn btn-outline btn-sm" onClick={() => {
        setErrorMsg(null);
        loadSchemes();
        loadHospitalsQueue();
        loadHospitalDirectory();
        loadSpecialtyMap();
        loadModels();
      }}>Retry loading</button></div>}
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
          className={`btn ${activeTab === 'directory' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => { setActiveTab('directory'); loadHospitalDirectory(); }}
        >
          Hospital directory ({hospitalDirectory.length})
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
        <button
          className={`btn ${activeTab === 'models' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('models')}
        >
          Model registry ({models.length})
        </button>
      </div>

      {activeTab === 'directory' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Synthetic hospital directory</h2>
              <p className="card-desc">Administrator assignments, practitioner status counts, and capacity report age.</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadHospitalDirectory}>Refresh directory</button>
          </div>
          {hospitalDirectory.length === 0 ? (
            <p role="status">No hospital records are available. Refresh the directory or check the data connection.</p>
          ) : (
            <div className="ds-table-scroll" role="region" aria-label="Reviewer hospital directory table" tabIndex="0">
              <table className="data-table">
                <thead><tr><th>Hospital</th><th>Administrator accounts</th><th>Practitioner counts by status</th><th>Latest capacity report</th></tr></thead>
                <tbody>{hospitalDirectory.map((hospital) => (
                  <tr key={hospital.hospitalId}>
                    <td><strong>{hospital.name}</strong><br />{hospital.code} · {hospital.district}</td>
                    <td>{hospital.admins.length
                      ? hospital.admins.map((admin) => <div key={admin.email}>{admin.name} · {admin.email}</div>)
                      : 'No admin assigned'}</td>
                    <td>{Object.entries(hospital.practitionerCounts).map(([verification, employment]) => (
                      <div key={verification}>
                        <strong>{verification.replaceAll('_', ' ')}</strong>: {Object.entries(employment).map(([status, count]) => `${status} ${count}`).join(', ')}
                      </div>
                    ))}</td>
                    <td>{hospital.latestCapacity
                      ? `${Math.floor(hospital.latestCapacity.ageMinutes / 60)}h ${hospital.latestCapacity.ageMinutes % 60}m old`
                      : 'No capacity report'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 1: Hospital Verification Queue */}
      {activeTab === 'queue' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">📋 Hospital Capability Verification & Tier Audit Queue</h2>
              <p className="card-desc">
                Review proposed test tiers, consistency warnings, and synthetic facility evidence. This simulated action sets the facility's effective test tier.
              </p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadHospitalsQueue}>↻ Refresh Queue</button>
          </div>

          <div style={{ overflowX: 'auto' }} role="region" aria-label="Hospital verification queue table" tabIndex="0">
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
                        {h.tierStatus === 'confirmed' ? 'Simulated verification' : h.tierStatus || 'Proposed'}
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

      {activeTab === 'models' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Model registry</h2>
              <p className="card-desc">Research artifacts and dataset lineage. Promotion and retirement require a reviewer reason.</p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={loadModels}>Refresh registry</button>
          </div>
          {models.length === 0 ? <p>No model versions are registered yet. Register a candidate from the existing training results first.</p> : (
            <div className="ds-table-scroll">
              <table className="data-table">
                <thead><tr><th>Model</th><th>Version</th><th>Status</th><th>Dataset</th><th>Rows</th><th>Headline metric</th><th>Limitations</th><th>Action</th></tr></thead>
                <tbody>{models.map((model) => (
                  <tr key={model.modelId}>
                    <td>{model.name}</td><td>{model.version}</td><td>{model.status}</td>
                    <td>{model.datasetName} · {model.datasetSource}</td>
                    <td>{model.datasetRowCount ?? '—'}</td>
                    <td>{model.metrics?.AUROC?.value ?? model.metrics?.auroc?.value ?? '—'}</td>
                    <td>{Array.isArray(model.limitations) ? model.limitations.join('; ') : model.limitations}</td>
                    <td>{model.status !== 'active'
                      ? <button type="button" className="btn btn-success btn-sm" onClick={() => setModelAction({ modelId: model.modelId, status: 'active' })}>Promote</button>
                      : <button type="button" className="btn btn-outline btn-sm" onClick={() => setModelAction({ modelId: model.modelId, status: 'retired' })}>Retire</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {models.map((model) => <details key={`${model.modelId}-metrics`} className="model-metrics"><summary>{model.name} {model.version} · reviewer metrics</summary><pre>{JSON.stringify(model.metrics || {}, null, 2)}</pre></details>)}
          {modelAction && (
            <form className="model-reason-form" onSubmit={handleModelStatus}>
              <label htmlFor="model-status-reason">{modelAction.status === 'active' ? 'Promotion reason' : 'Retirement reason'}</label>
              <textarea id="model-status-reason" required minLength={1} maxLength={500} value={modelReason} onChange={(event) => setModelReason(event.target.value)} />
              <button className="btn btn-primary" type="submit" disabled={loading || !modelReason.trim()}>Confirm {modelAction.status}</button>
              <button className="btn btn-outline" type="button" onClick={() => { setModelAction(null); setModelReason(''); }}>Cancel</button>
            </form>
          )}
        </section>
      )}

      {/* TAB 2: Scheme Catalogue Management */}
      {activeTab === 'schemes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🛡️ Scheme catalogue (research prototype)</h2>
              <p className="card-desc">
                Catalogue review dates are internal research metadata and do not indicate endorsement by a programme administrator.
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
                      {safeSchemeText(s.name)} ({safeSchemeText(s.schemeId)})
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Programme information source</div>
                  </div>
                  <span className={`badge ${s.status === 'verified' ? 'badge-success' : 'badge-warning'}`}>
                    {s.status === 'verified' ? 'Research review recorded' : 'Needs research review'}
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#334155', marginBottom: 12 }}>
                  {safeSchemeText(s.shortDescription) || 'Prototype catalogue entry. Check the current information with the programme.'}
                </p>

                <div style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                  <strong>Last checked in prototype:</strong> {s.lastVerifiedDate ? new Date(s.lastVerifiedDate).toLocaleDateString() : 'Not checked'}
                  {s.outdated && (
                    <span className="badge badge-danger" style={{ marginLeft: 8 }}>⚠️ OUTDATED (&gt;180d)</span>
                  )}
                </div>

                <div style={{ fontSize: '0.8rem', marginBottom: 12 }}>
                  <strong>Programme source URL (not an endorsement):</strong>{' '}
                  <a href={s.officialPortalUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7' }}>
                    Open programme information source in a new tab
                  </a>
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleVerifyScheme(s.schemeId)}
                  disabled={loading}
                >
                  🛡️ Review published source
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

          <div style={{ overflowX: 'auto' }} role="region" aria-label="Scheme catalogue table" tabIndex="0">
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
                Platform reviewer workflow. Practitioners with simulated verification status contribute to the prototype capability tiering.
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
            <div style={{ overflowX: 'auto' }} role="region" aria-label="Practitioner verification table" tabIndex="0">
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
        <Modal open title="Reject simulated facility verification" onClose={() => setShowRejectModal(false)}>
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
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleRejectHospital}
                disabled={loading || !rejectReason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
