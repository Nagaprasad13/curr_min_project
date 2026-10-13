import React, { useState, useEffect } from 'react';

export default function PatientPortal({ token, patientUser }) {
  const [activeTab, setActiveTab] = useState('consents'); // 'records' | 'consents' | 'referrals' | 'schemes' | 'history'

  const [consents, setConsents] = useState([]);
  const [accessHistory, setAccessHistory] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [myReferrals, setMyReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Grant modal state
  const [selectedConsent, setSelectedConsent] = useState(null);
  const [narrowedTypes, setNarrowedTypes] = useState([]);
  const [shortenedDays, setShortenedDays] = useState(7);
  const [allowSensitive, setAllowSensitive] = useState(false);

  // Scheme matching state
  const [schemeInputs, setSchemeInputs] = useState({
    stateResident: true,
    annualFamilyIncome: 95000,
    rationCardType: 'PHH',
    age: 48,
    treatmentCategory: 'Cardiology',
    hasLifeThreateningIllness: false,
    treatmentHospitalType: 'government',
  });
  const [matchResults, setMatchResults] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    if (token) {
      loadConsents();
      loadAccessHistory();
      loadMyRecords();
      loadMyReferrals();
    }
  }, [token]);

  const loadConsents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/consents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setConsents(data.consents || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAccessHistory = async () => {
    try {
      const res = await fetch('/api/consents/access-history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setAccessHistory(data.accessReport || []);
      }
    } catch (err) {
      console.warn('Error fetching access history:', err.message);
    }
  };

  const loadMyRecords = async () => {
    try {
      const patientId = patientUser?.id || patientUser?._id;
      if (!patientId) return;
      const res = await fetch(`/api/patients/${patientId}/records`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMyRecords(data.records || []);
      }
    } catch (err) {
      console.warn('Error fetching own records:', err.message);
    }
  };

  const loadMyReferrals = async () => {
    try {
      // In synthetic seed, referrals exist; we fetch sample status
      const res = await fetch('/api/referrals/6ace2c7ce3e4fb59acb387ba', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.referralId) {
        setMyReferrals([data]);
      } else {
        // Fallback demo state
        setMyReferrals([
          {
            referralId: 'REF-2026-0001',
            status: 'submitted',
            recordsConsentStatus: 'granted',
            selectedHospital: { name: 'Kovai Apex Super Speciality Hospital', district: 'Coimbatore' },
          },
        ]);
      }
    } catch (err) {
      setMyReferrals([
        {
          referralId: 'REF-2026-0001',
          status: 'submitted',
          recordsConsentStatus: 'granted',
          selectedHospital: { name: 'Kovai Apex Super Speciality Hospital', district: 'Coimbatore' },
        },
      ]);
    }
  };

  const openGrantModal = (consent) => {
    setSelectedConsent(consent);
    setNarrowedTypes([...consent.recordTypes]);
    setShortenedDays(7);
    setAllowSensitive(Boolean(consent.includeSensitiveRecords));
  };

  const handleGrant = async () => {
    if (!selectedConsent) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/consents/${selectedConsent.consentId}/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          narrowedRecordTypes: narrowedTypes,
          shortenedExpiryDays: shortenedDays,
          includeSensitiveRecords: allowSensitive,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Consent ${selectedConsent.consentId} granted successfully.`);
        setSelectedConsent(null);
        loadConsents();
        loadAccessHistory();
      } else {
        setError(data.message || 'Grant operation failed.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async (consentId) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/consents/${consentId}/deny`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Patient declined sharing.' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Consent ${consentId} declined.`);
        loadConsents();
        loadAccessHistory();
      } else {
        setError(data.message || 'Deny operation failed.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (consentId) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/consents/${consentId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Patient revoked permission.' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`✓ Consent ${consentId} revoked. Access terminated immediately.`);
        loadConsents();
        loadAccessHistory();
      } else {
        setError(data.message || 'Revoke operation failed.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMatchSchemes = async (e) => {
    e.preventDefault();
    try {
      setMatchLoading(true);
      setError(null);
      const res = await fetch('/api/schemes/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inputs: schemeInputs }),
      });
      const data = await res.json();
      if (res.ok) {
        setMatchResults(data.potentialMatches || []);
      } else {
        setError(data.message || 'Scheme matching failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setMatchLoading(false);
    }
  };

  const toggleRecordType = (type) => {
    if (narrowedTypes.includes(type)) {
      if (narrowedTypes.length > 1) {
        setNarrowedTypes(narrowedTypes.filter((t) => t !== type));
      }
    } else {
      setNarrowedTypes([...narrowedTypes, type]);
    }
  };

  return (
    <div id="patient-portal-view" className="portal-container">
      {error && <div className="clinical-warning-banner" role="alert">⚠️ {error}</div>}
      {successMsg && <div className="clinical-notice-box" role="status" style={{ marginBottom: 16 }}>{successMsg}</div>}

      {/* Patient Profile Bar */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, color: '#1e293b' }}>
              👤 {patientUser?.name || 'P. Anandhi (Patient 1)'}
            </h3>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              District: <strong>{patientUser?.district || 'Salem'}</strong> · CareBridge ID: {patientUser?.id || 'PT-2026-001'}
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#0284c7' }}>
            🔒 Zero Client Trust Architecture (You control record access)
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'consents' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('consents')}
        >
          🔐 Sharing Consents ({consents.length})
        </button>
        <button
          className={`btn ${activeTab === 'records' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('records')}
        >
          📁 My Health Records ({myRecords.length})
        </button>
        <button
          className={`btn ${activeTab === 'referrals' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('referrals')}
        >
          🚑 My Referral Status ({myReferrals.length})
        </button>
        <button
          className={`btn ${activeTab === 'schemes' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('schemes')}
        >
          🛡️ Health Schemes Explorer
        </button>
        <button
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setActiveTab('history')}
        >
          📜 Access Audit Log ({accessHistory.length})
        </button>
      </div>

      {/* TAB 1: Consents */}
      {activeTab === 'consents' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🔐 My Record Sharing Consents</h2>
              <p className="card-desc">
                Explicit patient control. Doctors can only view records if you grant permission. You can narrow scope or revoke anytime.
              </p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadConsents}>↻ Refresh</button>
          </div>

          {consents.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No consent requests recorded yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Consent ID</th>
                    <th style={{ padding: 8 }}>Requesting Facility</th>
                    <th style={{ padding: 8 }}>Purpose</th>
                    <th style={{ padding: 8 }}>Allowed Scope</th>
                    <th style={{ padding: 8 }}>Status</th>
                    <th style={{ padding: 8 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c) => (
                    <tr key={c.consentId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.consentId}</td>
                      <td style={{ padding: 8 }}>
                        <strong>{c.requestingHospitalId?.name || 'Simulated Hospital'}</strong>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {c.requestingHospitalId?.district}
                        </div>
                      </td>
                      <td style={{ padding: 8 }}>{c.purpose}</td>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {c.recordTypes?.map((t) => (
                            <span key={t} className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>{t}</span>
                          ))}
                          {c.includeSensitiveRecords && (
                            <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>Sensitive Included</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: 8 }}>
                        <span className={`badge ${c.status === 'granted' ? 'badge-success' : c.status === 'requested' ? 'badge-warning' : 'badge-danger'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>
                        {c.status === 'requested' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              id={`grant-btn-${c.consentId}`}
                              className="btn btn-success btn-sm"
                              onClick={() => openGrantModal(c)}
                            >
                              Grant...
                            </button>
                            <button
                              id={`deny-btn-${c.consentId}`}
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeny(c.consentId)}
                            >
                              Deny
                            </button>
                          </div>
                        )}
                        {c.status === 'granted' && (
                          <button
                            id={`revoke-btn-${c.consentId}`}
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRevoke(c.consentId)}
                          >
                            Revoke Now
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: My Clinical Records */}
      {activeTab === 'records' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">📁 My Clinical Records & Diagnostic Reports</h2>
              <p className="card-desc">Your personal medical documents in protected storage.</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadMyRecords}>↻ Refresh</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {myRecords.map((r) => (
              <div key={r.recordId} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="badge badge-secondary">{r.type}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {new Date(r.recordDate).toLocaleDateString()}
                  </span>
                </div>
                <h4 style={{ margin: '0 0 4px 0' }}>{r.title || r.type}</h4>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                  Origin: {r.provenance?.submittingDoctor || 'Synthetic Health Center'}
                </div>
                <div style={{ fontSize: '0.82rem', background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e2e8f0' }}>
                  {r.summary || 'Clinical investigation record and laboratory results.'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: My Referral Status (Plain language, zero risk percentages) */}
      {activeTab === 'referrals' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🚑 My Hospital Referral Status</h2>
              <p className="card-desc">
                Current status of your medical transfer request. Simple, non-technical updates.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myReferrals.map((ref, idx) => (
              <div key={idx} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>Referral #{ref.referralId}</h3>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Target Facility: <strong>{ref.selectedHospital?.name || 'Selected Referral Hospital'}</strong> ({ref.selectedHospital?.district})
                    </div>
                  </div>
                  <span className="badge badge-success">
                    {ref.status?.toUpperCase() || 'SUBMITTED'}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: '#334155', background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <strong>Transfer Update:</strong> Your referral has been dispatched by your attending physician. Medical records sharing is currently <strong>{ref.recordsConsentStatus || 'Active'}</strong>.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Schemes Explorer */}
      {activeTab === 'schemes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">🛡️ Government Healthcare Scheme Potential Matches</h2>
              <p className="card-desc">
                Check potential alignment with Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS) and PM-JAY.
              </p>
            </div>
          </div>

          <form onSubmit={handleMatchSchemes} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="form-label" htmlFor="sc-income">Annual Family Income (INR)</label>
              <input
                id="sc-income"
                className="form-input"
                type="number"
                value={schemeInputs.annualFamilyIncome}
                onChange={(e) => setSchemeInputs({ ...schemeInputs, annualFamilyIncome: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="sc-ration">Ration Card Category</label>
              <select
                id="sc-ration"
                className="form-input"
                value={schemeInputs.rationCardType}
                onChange={(e) => setSchemeInputs({ ...schemeInputs, rationCardType: e.target.value })}
              >
                <option value="PHH">PHH (Priority Household)</option>
                <option value="AAY">AAY (Antyodaya Anna Yojana)</option>
                <option value="BPL">BPL (Below Poverty Line)</option>
                <option value="NPHH">NPHH (Non-Priority Household)</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="sc-age">Beneficiary Age</label>
              <input
                id="sc-age"
                className="form-input"
                type="number"
                value={schemeInputs.age}
                onChange={(e) => setSchemeInputs({ ...schemeInputs, age: Number(e.target.value) })}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <button
                id="check-schemes-btn"
                type="submit"
                className="btn btn-primary"
                disabled={matchLoading}
              >
                {matchLoading ? 'Evaluating...' : '🔍 Check Potential Matches'}
              </button>
            </div>
          </form>

          {matchResults && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {matchResults.map((m) => (
                <div key={m.schemeId} className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h4 style={{ margin: 0 }}>{m.schemeName}</h4>
                    <span className={`badge ${m.matchStatus === 'potential match' ? 'badge-success' : 'badge-warning'}`}>
                      {m.matchStatus}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 8px 0' }}>
                    Authority: {m.authority}
                  </p>
                  <div className="clinical-notice-box" style={{ fontSize: '0.78rem', marginTop: 8 }}>
                    {m.notice}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Access Audit Log */}
      {activeTab === 'history' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">📜 Transparent Record Access Audit Log</h2>
              <p className="card-desc">Immutable history of who requested, viewed, or interacted with your health data.</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadAccessHistory}>↻ Refresh</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Timestamp</th>
                  <th style={{ padding: 8 }}>Doctor / Actor</th>
                  <th style={{ padding: 8 }}>Action</th>
                  <th style={{ padding: 8 }}>Record Types Accessed</th>
                  <th style={{ padding: 8 }}>Consent Reference</th>
                </tr>
              </thead>
              <tbody>
                {accessHistory.map((h, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 8 }}>{new Date(h.timestamp).toLocaleString()}</td>
                    <td style={{ padding: 8 }}><strong>{h.doctorName || 'Attending Clinician'}</strong></td>
                    <td style={{ padding: 8 }}><span className="badge badge-secondary">{h.action}</span></td>
                    <td style={{ padding: 8 }}>{(h.recordTypesViewed || []).join(', ') || 'N/A'}</td>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{h.consentId || 'Direct'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grant Scope Modal */}
      {selectedConsent && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Grant Record Sharing: {selectedConsent.consentId}</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
              Facility: <strong>{selectedConsent.requestingHospitalId?.name}</strong>
            </p>

            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Permitted Categories (Uncheck to narrow):</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedConsent.recordTypes?.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn btn-sm ${narrowedTypes.includes(t) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleRecordType(t)}
                  >
                    {narrowedTypes.includes(t) ? '✓ ' : '+ '} {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="form-label" htmlFor="shorten-days">Consent Duration (Days):</label>
              <select
                id="shorten-days"
                className="form-input"
                value={shortenedDays}
                onChange={(e) => setShortenedDays(Number(e.target.value))}
              >
                <option value={1}>1 Day (Immediate transfer only)</option>
                <option value={3}>3 Days</option>
                <option value={7}>7 Days (Standard)</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={allowSensitive}
                  onChange={(e) => setAllowSensitive(e.target.checked)}
                />
                <span>Include Sensitive Records (Mental health, HIV, reproductive health)</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setSelectedConsent(null)}>Cancel</button>
              <button id="confirm-grant-btn" className="btn btn-success" onClick={handleGrant}>
                Confirm Grant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
