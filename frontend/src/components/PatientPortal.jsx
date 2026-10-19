import React, { useState, useEffect } from 'react';
import { apiFetch as fetch } from '../api';
import { Modal, Skeleton } from '../design-system/components';
import { safeSchemeText } from '../schemeCopy';

export default function PatientPortal({ token, patientUser, initialTab = 'consents' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  const [consents, setConsents] = useState([]);
  const [accessHistory, setAccessHistory] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [myReferrals, setMyReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Grant modal state
  const [selectedConsent, setSelectedConsent] = useState(null);
  const [narrowedTypes, setNarrowedTypes] = useState([]);
  const [shortenedDays, setShortenedDays] = useState(7);
  const [allowSensitive, setAllowSensitive] = useState(false);

  // Scheme matching state
  const [schemeInputs, setSchemeInputs] = useState({
    stateResident: '',
    annualFamilyIncome: '',
    rationCardType: '',
    age: '',
    treatmentCategory: '',
    hasLifeThreateningIllness: '',
    treatmentHospitalType: '',
  });
  const [matchResults, setMatchResults] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    if (patientUser?.id || patientUser?._id) {
      const controller = new AbortController();
      setInitialLoading(true);
      Promise.all([
        loadConsents(controller.signal),
        loadAccessHistory(controller.signal),
        loadMyRecords(controller.signal),
        loadMyReferrals(controller.signal),
      ]).finally(() => {
        if (!controller.signal.aborted) setInitialLoading(false);
      });
      return () => controller.abort();
    }
  }, [patientUser?.id, patientUser?._id]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadConsents = async (signal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/consents', {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setConsents(data.consents || []);
      } else throw new Error(data.message || 'Consent requests could not be loaded.');
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const loadAccessHistory = async (signal) => {
    try {
      const res = await fetch('/api/consents/access-history', {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setAccessHistory(data.accessReport || []);
      } else throw new Error(data.message || 'Access history could not be loaded.');
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    }
  };

  const loadMyRecords = async (signal) => {
    try {
      const patientId = patientUser?.id || patientUser?._id;
      if (!patientId) return;
      const res = await fetch(`/api/patients/${patientId}/records`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) {
        setMyRecords(data.records || []);
      } else throw new Error(data.message || 'Records could not be loaded.');
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    }
  };

  const loadMyReferrals = async (signal) => {
    try {
      const res = await fetch('/api/referrals', {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.ok) setMyReferrals(data.referrals || []);
      else throw new Error(data.message || 'Referral list could not be loaded.');
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
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
        body: JSON.stringify({ reason: 'Patient revoked consent.' }),
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
        body: JSON.stringify({
          inputs: {
            stateResident: schemeInputs.stateResident === '' ? null : schemeInputs.stateResident === 'true',
            annualFamilyIncome: schemeInputs.annualFamilyIncome === '' ? null : Number(schemeInputs.annualFamilyIncome),
            age: schemeInputs.age === '' ? null : Number(schemeInputs.age),
            rationCardType: schemeInputs.rationCardType || null,
            treatmentCategory: schemeInputs.treatmentCategory || null,
            hasLifeThreateningIllness: schemeInputs.hasLifeThreateningIllness === '' ? null : schemeInputs.hasLifeThreateningIllness === 'true',
            treatmentHospitalType: schemeInputs.treatmentHospitalType || null,
          },
        }),
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

  // ── Blue & White Theme Styles ──────────────────────────────────────────────
  const cardStyle = {
    background: '#FFFFFF',
    border: '1px solid #BFDBFE',
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0 2px 12px rgba(29, 78, 216, 0.06)',
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
    padding: '9px 18px',
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(29, 78, 216, 0.25)',
  };
  const btnOutline = {
    background: '#EFF6FF',
    color: '#1D4ED8',
    border: '1px solid #BFDBFE',
    borderRadius: 8,
    padding: '7px 14px',
    fontWeight: 600,
    fontSize: '0.82rem',
    cursor: 'pointer',
  };
  const btnSuccess = {
    background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontWeight: 700,
    fontSize: '0.82rem',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
  };
  const btnDanger = {
    background: '#FEE2E2',
    color: '#B91C1C',
    border: '1px solid #FECACA',
    borderRadius: 8,
    padding: '7px 14px',
    fontWeight: 700,
    fontSize: '0.82rem',
    cursor: 'pointer',
  };

  return (
    <div id="patient-portal-view" style={{ background: '#F0F7FF', minHeight: '100vh', paddingBottom: 40 }}>
      {/* Patient Clinical Blue Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
          padding: '22px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          boxShadow: '0 4px 16px rgba(29, 78, 216, 0.2)',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ color: '#BFDBFE', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Patient Health Records & Consent Portal
          </div>
          <div style={{ color: '#FFFFFF', fontSize: '1.4rem', fontWeight: 800, marginTop: 2 }}>
            👤 {patientUser?.name || 'Patient'}
          </div>
          <div style={{ color: '#E0F2FE', fontSize: '0.82rem', marginTop: 4 }}>
            {patientUser?.district && <>District: <strong>{patientUser.district}</strong> · </>}
            {patientUser?.id && <>CareBridge ID: <span style={{ fontFamily: 'monospace' }}>{patientUser.id}</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 14px', color: '#FFFFFF', fontSize: '0.8rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{consents.length}</div>
            <div style={{ color: '#BFDBFE', fontSize: '0.72rem', textTransform: 'uppercase' }}>Consents</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 14px', color: '#FFFFFF', fontSize: '0.8rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{myRecords.length}</div>
            <div style={{ color: '#BFDBFE', fontSize: '0.72rem', textTransform: 'uppercase' }}>Records</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', borderRadius: 10, padding: '8px 14px', color: '#FFFFFF', fontSize: '0.8rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{myReferrals.length}</div>
            <div style={{ color: '#BFDBFE', fontSize: '0.72rem', textTransform: 'uppercase' }}>Transfers</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1250, margin: '0 auto', padding: '0 20px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#B91C1C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} role="alert">
            <span>⚠️ {error}</span>
            <button type="button" style={btnOutline} onClick={() => {
              setError(null);
              loadConsents();
              loadAccessHistory();
              loadMyRecords();
              loadMyReferrals();
            }}>Retry</button>
          </div>
        )}
        {successMsg && (
          <div style={{ background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#1E3A8A', fontWeight: 600 }} role="status">
            {successMsg}
          </div>
        )}
        {initialLoading && <Skeleton lines={3} />}

        {/* Tab Navigation in Blue Bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', background: '#DBEAFE', padding: 6, borderRadius: 12, border: '1px solid #BFDBFE' }}>
          {[
            { id: 'consents', label: `🔐 Sharing Consents (${consents.length})` },
            { id: 'records', label: `📁 My Health Records (${myRecords.length})` },
            { id: 'referrals', label: `🚑 My Referral Status (${myReferrals.length})` },
            { id: 'schemes', label: '🛡️ Health Schemes Explorer' },
            { id: 'history', label: `📜 Access Audit Log (${accessHistory.length})` },
          ].map((tab) => (
            <button key={tab.id} style={tabStyle(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Consents */}
        {activeTab === 'consents' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #BFDBFE', paddingBottom: 14 }}>
              <div>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>🔐 My Record Sharing Consents</h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>
                  Explicit patient control. Doctors can only view records if you grant permission. You can narrow scope or revoke anytime.
                </p>
              </div>
              <button style={btnOutline} onClick={loadConsents}>↻ Refresh</button>
            </div>

            {consents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748B' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>🔒</div>
                <div style={{ fontWeight: 700, color: '#1E3A8A' }}>No consent requests waiting</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Your care team will request consent when record sharing is required.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }} role="region" aria-label="Consent requests table" tabIndex="0">
                <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#EFF6FF', textAlign: 'left', color: '#1E3A8A' }}>
                      <th style={{ padding: '10px 12px' }}>Consent ID</th>
                      <th style={{ padding: '10px 12px' }}>Requesting Facility</th>
                      <th style={{ padding: '10px 12px' }}>Purpose</th>
                      <th style={{ padding: '10px 12px' }}>Allowed Scope</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consents.map((c) => (
                      <tr key={c.consentId} style={{ borderBottom: '1px solid #BFDBFE', background: '#FFFFFF' }}>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 700, color: '#1D4ED8' }}>{c.consentId}</td>
                        <td style={{ padding: '12px' }}>
                          <strong style={{ color: '#1E293B' }}>{c.requestingHospitalId?.name || 'Simulated Hospital'}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            {c.requestingHospitalId?.district}
                          </div>
                        </td>
                        <td style={{ padding: '12px', color: '#334155' }}>{c.purpose}</td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {c.recordTypes?.map((t) => (
                              <span key={t} style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 999, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}>{t}</span>
                            ))}
                            {c.includeSensitiveRecords && (
                              <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 999, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>Sensitive Included</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            borderRadius: 999,
                            padding: '3px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: c.status === 'granted' ? '#DCFCE7' : c.status === 'requested' ? '#FEF3C7' : '#FEE2E2',
                            color: c.status === 'granted' ? '#166534' : c.status === 'requested' ? '#92400E' : '#B91C1C',
                            border: `1px solid ${c.status === 'granted' ? '#86EFAC' : c.status === 'requested' ? '#FDE68A' : '#FECACA'}`,
                          }}>
                            {c.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {c.status === 'requested' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                id={`grant-btn-${c.consentId}`}
                                style={btnSuccess}
                                onClick={() => openGrantModal(c)}
                              >
                                Grant...
                              </button>
                              <button
                                id={`deny-btn-${c.consentId}`}
                                style={btnDanger}
                                onClick={() => handleDeny(c.consentId)}
                              >
                                Deny
                              </button>
                            </div>
                          )}
                          {c.status === 'granted' && (
                            <button
                              id={`revoke-btn-${c.consentId}`}
                              style={btnDanger}
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
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #BFDBFE', paddingBottom: 14 }}>
              <div>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>📁 My Clinical Records & Diagnostic Reports</h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>Your personal medical documents in protected storage.</p>
              </div>
              <button style={btnOutline} onClick={loadMyRecords}>↻ Refresh</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              {myRecords.map((r) => (
                <div key={r.recordId} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>{r.type}</span>
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                      {new Date(r.recordDate).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 style={{ margin: '4px 0', color: '#1E3A8A', fontSize: '0.95rem' }}>{r.title || r.type}</h4>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: 8 }}>
                    Origin: {r.provenance?.submittingDoctor || 'Synthetic Health Center'}
                  </div>
                  <div style={{ fontSize: '0.82rem', background: '#FFFFFF', padding: 10, borderRadius: 8, border: '1px solid #BFDBFE', color: '#334155' }}>
                    {r.summary || 'Clinical investigation record and laboratory results.'}
                  </div>
                </div>
              ))}
              {myRecords.length === 0 && (
                <div style={{ color: '#64748B', fontSize: '0.88rem' }}>No clinical records recorded on file.</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: My Referral Status */}
        {activeTab === 'referrals' && (
          <div style={cardStyle}>
            <div style={{ marginBottom: 18, borderBottom: '1px solid #BFDBFE', paddingBottom: 14 }}>
              <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>🚑 My Hospital Referral Status</h2>
              <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>
                Current status of your medical transfer request. Simple, non-technical updates.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myReferrals.length === 0 && <p style={{ color: '#64748B' }}>No referrals are linked to this account yet.</p>}
              {myReferrals.map((ref) => (
                <div key={ref.referralId} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px', color: '#1E3A8A' }}>Referral #{ref.referralId}</h3>
                      <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                        Target Facility: <strong>{ref.selectedHospital?.name || 'Selected Referral Hospital'}</strong> ({ref.selectedHospital?.district})
                      </div>
                    </div>
                    <span style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', borderRadius: 999, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {ref.status?.toUpperCase() || 'SUBMITTED'}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#334155', background: '#FFFFFF', padding: 10, borderRadius: 8, border: '1px solid #BFDBFE' }}>
                    <strong>Transfer Update:</strong> Your referral has been dispatched by your attending physician. Medical records sharing is currently <strong>{ref.recordsConsentStatus || 'Active'}</strong>.
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: Schemes Explorer */}
        {activeTab === 'schemes' && (
          <div style={cardStyle}>
            <div style={{ marginBottom: 18, borderBottom: '1px solid #BFDBFE', paddingBottom: 14 }}>
              <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>🛡️ Possible programme matches</h2>
              <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>
                Compare your details with public programme descriptions for CMCHIS and PM-JAY. Possible match only. Not confirmed eligibility.
              </p>
            </div>

            <form onSubmit={handleMatchSchemes} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
              <div>
                <label className="form-label" htmlFor="sc-resident" style={labelStyle}>Tamil Nadu resident?</label>
                <select id="sc-resident" style={inputStyle} value={schemeInputs.stateResident}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, stateResident: e.target.value })}>
                  <option value="">Not provided</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="sc-income" style={labelStyle}>Annual Family Income (INR)</label>
                <input
                  id="sc-income"
                  style={inputStyle}
                  type="number"
                  value={schemeInputs.annualFamilyIncome}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, annualFamilyIncome: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sc-ration" style={labelStyle}>Ration Card Category</label>
                <select
                  id="sc-ration"
                  style={inputStyle}
                  value={schemeInputs.rationCardType}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, rationCardType: e.target.value })}
                >
                  <option value="">Not provided</option>
                  <option value="PHH">PHH (Priority Household)</option>
                  <option value="AAY">AAY (Antyodaya Anna Yojana)</option>
                  <option value="BPL">BPL (Below Poverty Line)</option>
                  <option value="NPHH">NPHH (Non-Priority Household)</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="sc-age" style={labelStyle}>Beneficiary Age</label>
                <input
                  id="sc-age"
                  style={inputStyle}
                  type="number"
                  value={schemeInputs.age}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, age: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sc-category" style={labelStyle}>Treatment category</label>
                <input id="sc-category" style={inputStyle} value={schemeInputs.treatmentCategory}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, treatmentCategory: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor="sc-lifethreatening" style={labelStyle}>Life-threatening illness?</label>
                <select id="sc-lifethreatening" style={inputStyle} value={schemeInputs.hasLifeThreateningIllness}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, hasLifeThreateningIllness: e.target.value })}>
                  <option value="">Not provided</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="sc-hospital-type" style={labelStyle}>Treatment hospital type</label>
                <select id="sc-hospital-type" style={inputStyle} value={schemeInputs.treatmentHospitalType}
                  onChange={(e) => setSchemeInputs({ ...schemeInputs, treatmentHospitalType: e.target.value })}>
                  <option value="">Not provided</option><option value="government">Government</option><option value="private">Private</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <button
                  id="check-schemes-btn"
                  type="submit"
                  style={btnPrimary}
                  disabled={matchLoading}
                >
                  {matchLoading ? 'Evaluating…' : '🔍 Check Potential Matches'}
                </button>
              </div>
            </form>

            {matchResults && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                {matchResults.map((m) => (
                  <div key={m.schemeId} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <h4 style={{ margin: 0, color: '#1E3A8A' }}>{safeSchemeText(m.schemeName)}</h4>
                      <span style={{
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: m.matchStatus === 'potential match' ? '#DCFCE7' : '#FEF3C7',
                        color: m.matchStatus === 'potential match' ? '#166534' : '#92400E',
                        border: `1px solid ${m.matchStatus === 'potential match' ? '#86EFAC' : '#FDE68A'}`,
                      }}>
                        {m.matchStatus === 'potential match' ? 'Possible match' : 'No match identified'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 8px' }}>Programme information source: {safeSchemeText(m.authority)}</p>
                    <div style={{ background: '#FFFFFF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 8, fontSize: '0.78rem', color: '#1E3A8A' }}>
                      Possible match only. Not confirmed eligibility. Contact the programme directly for current information.
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Access Audit Log */}
        {activeTab === 'history' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #BFDBFE', paddingBottom: 14 }}>
              <div>
                <h2 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>📜 Transparent Record Access Audit Log</h2>
                <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>Immutable history of who requested, viewed, or interacted with your health data.</p>
              </div>
              <button style={btnOutline} onClick={loadAccessHistory}>↻ Refresh</button>
            </div>

            <div style={{ overflowX: 'auto' }} role="region" aria-label="Record access history table" tabIndex="0">
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#EFF6FF', textAlign: 'left', color: '#1E3A8A' }}>
                    <th style={{ padding: '10px 12px' }}>Timestamp</th>
                    <th style={{ padding: '10px 12px' }}>Doctor / Actor</th>
                    <th style={{ padding: '10px 12px' }}>Action</th>
                    <th style={{ padding: '10px 12px' }}>Record Types Accessed</th>
                    <th style={{ padding: '10px 12px' }}>Consent Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {accessHistory.map((h, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #BFDBFE', background: '#FFFFFF' }}>
                      <td style={{ padding: '10px 12px' }}>{new Date(h.timestamp).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px' }}><strong>{h.doctorName || 'Attending Clinician'}</strong></td>
                      <td style={{ padding: '10px 12px' }}><span style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '2px 8px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>{h.action}</span></td>
                      <td style={{ padding: '10px 12px' }}>{(h.recordTypesViewed || []).join(', ') || 'N/A'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#1D4ED8' }}>{h.consentId || 'Direct'}</td>
                    </tr>
                  ))}
                  {accessHistory.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: 16, textAlign: 'center', color: '#64748B' }}>
                        No access events recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grant Scope Modal */}
        {selectedConsent && (
          <Modal open title={`Review record sharing: ${selectedConsent.consentId}`} onClose={() => setSelectedConsent(null)}>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: 12 }}>
              Facility: <strong>{selectedConsent.requestingHospitalId?.name}</strong>
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Permitted Categories (Uncheck to narrow):</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedConsent.recordTypes?.map((t) => (
                  <button
                    key={t}
                    type="button"
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #BFDBFE',
                      background: narrowedTypes.includes(t) ? '#1D4ED8' : '#EFF6FF',
                      color: narrowedTypes.includes(t) ? '#FFFFFF' : '#1D4ED8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleRecordType(t)}
                  >
                    {narrowedTypes.includes(t) ? '✓ ' : '+ '} {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor="shorten-days">Consent Duration (Days):</label>
              <select
                id="shorten-days"
                style={inputStyle}
                value={shortenedDays}
                onChange={(e) => setShortenedDays(Number(e.target.value))}
              >
                <option value={1}>1 Day (Immediate transfer only)</option>
                <option value={3}>3 Days</option>
                <option value={7}>7 Days (Standard)</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#1E3A8A', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowSensitive}
                  onChange={(e) => setAllowSensitive(e.target.checked)}
                />
                <span>Include Sensitive Records (Mental health, reproductive health)</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnOutline} onClick={() => setSelectedConsent(null)}>Cancel</button>
              <button type="button" id="confirm-grant-btn" style={btnSuccess} onClick={handleGrant}>
                Confirm Grant
              </button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
