import React, { useState, useEffect } from 'react';
import Banner from './components/Banner';
import LoginPage from './components/LoginPage';
import PatientPortal from './components/PatientPortal';
import DoctorPortal from './components/DoctorPortal';
import ReviewerPortal from './components/ReviewerPortal';
import HospitalAdminPortal from './components/HospitalAdminPortal';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [patientsList, setPatientsList] = useState([]);

  // Demo mode is strictly forbidden in production builds (import.meta.env.PROD)
  const isDemoMode = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';

  // Check for active session on application mount
  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      setLoadingSession(true);
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        loadPatients();
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.warn('Session verification check failed:', err.message);
      setCurrentUser(null);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleLoginSuccess = (user, authToken) => {
    setCurrentUser(user);
    if (authToken) setToken(authToken);
    setAuthError(null);
    loadPatients(authToken);
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.warn('Logout request failed:', err.message);
    } finally {
      setCurrentUser(null);
      setToken(null);
    }
  };

  const handleDemoLogin = async (email) => {
    try {
      setAuthError(null);
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Demo login failed');
      setCurrentUser(data.user);
      if (data.token) setToken(data.token);
      loadPatients(data.token);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const loadPatients = async () => {
    setPatientsList([
      { _id: '6acdf89630cd8eb4c816cd51', name: 'Kavitha R. (Patient 1)', district: 'Salem', age: 48 },
      { _id: '6acdf89630cd8eb4c816cd52', name: 'Murugan P. (Patient 2)', district: 'Salem', age: 62 },
      { _id: '6acdf89630cd8eb4c816cd53', name: 'Anitha S. (Patient 3)', district: 'Erode', age: 34 },
      { _id: '6acdf89630cd8eb4c816cd54', name: 'Ramasamy K. (Patient 4)', district: 'Erode', age: 72 },
      { _id: '6acdf89630cd8eb4c816cd55', name: 'Priya M. (Patient 5)', district: 'Coimbatore', age: 29 },
    ]);
  };

  if (loadingSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
        <div>Loading CareBridge session...</div>
      </div>
    );
  }

  // If not logged in, render the real Login & Registration view
  if (!currentUser) {
    return (
      <div className="app-container">
        <Banner />
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          isDemoMode={isDemoMode}
          onDemoLogin={handleDemoLogin}
        />
        <footer style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 'auto' }}>
          CareBridge Health Informatics Research Prototype | DPDP Act 2023 Research Prototype Notice
          <br />
          All clinical records, facility telemetry, and patient profiles are synthetic. Decision support only. Clinician review required.
        </footer>
      </div>
    );
  }

  // Authenticated State: Strict server-verified role-based layout
  return (
    <div className="app-container">
      {/* 1. Mandatory Clinical Disclaimer Banner */}
      <Banner />

      {/* 2. Top Header Navigation (No Simulated User switcher in normal mode!) */}
      <header className="header">
        <div className="brand-section">
          <div>
            <div className="brand-logo">CareBridge</div>
            <div className="brand-subtitle">Capability-Verified, Freshness-Aware Hospital Referral Engine</div>
          </div>
        </div>

        {/* User Session Status and Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#38bdf8', textTransform: 'capitalize' }}>
              Role: {currentUser.role.replace('_', ' ')} {currentUser.district ? `(${currentUser.district})` : ''}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Demo Mode Notice Banner (Only shown if demo mode is active) */}
      {isDemoMode && (
        <div style={{ background: '#78350f', color: '#fef3c7', padding: '6px 24px', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            ⚙️ <strong>DEMO MODE ACTIVE:</strong> Using pre-seeded research account. Production mode enforces real sessions only.
          </div>
          <button
            type="button"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #fef3c7', color: '#fef3c7', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}
            onClick={handleSignOut}
          >
            Switch Account
          </button>
        </div>
      )}

      {/* 3. Role-Gated Workspace (User cannot navigate to unassigned roles) */}
      <main className="main-content" role="main">
        {currentUser.role === 'hospital_admin' && (
          <HospitalAdminPortal token={token} adminUser={currentUser} />
        )}
        {currentUser.role === 'platform_reviewer' && (
          <ReviewerPortal token={token} reviewerUser={currentUser} />
        )}
        {currentUser.role === 'doctor' && (
          <DoctorPortal token={token} doctorUser={currentUser} patients={patientsList} />
        )}
        {currentUser.role === 'patient' && (
          <PatientPortal token={token} patientUser={currentUser} />
        )}
      </main>

      {/* 4. Footer */}
      <footer style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 'auto' }}>
        CareBridge Health Informatics Research Prototype | India DPDP Act 2023 Research Prototype Notice
        <br />
        All clinical data, facility telemetry, and patient profiles are synthetic. Decision support only. A clinician must review.
      </footer>
    </div>
  );
}
