import React, { useEffect, useState } from 'react';
import { apiFetch as fetch } from '../api';

export default function LoginPage({ onLoginSuccess, isDemoMode = false, onDemoLogin, authError }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'demo'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [enrollmentSecret, setEnrollmentSecret] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');

  // Registration state
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [phone, setPhone] = useState('');
  const [isStaffRegister, setIsStaffRegister] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // Password reset state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState('request'); // 'request' | 'submit'

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [demoAccounts, setDemoAccounts] = useState([]);
  const [demoAccountsError, setDemoAccountsError] = useState(null);

  useEffect(() => {
    if (!isDemoMode) return undefined;
    const controller = new AbortController();
    fetch('/api/auth/demo-accounts', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Demo accounts could not be loaded.');
        setDemoAccounts(data.accounts || []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setDemoAccountsError(loadError.message);
      });
    return () => controller.abort();
  }, [isDemoMode]);

  // Submit Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, twoFactorCode: twoFactorCode || undefined }),
      });
      const data = await res.json();

      if (res.status === 403 && data.requires2FAEnrollment && data.enrollmentToken) {
        setEnrollmentToken(data.enrollmentToken);
        const setupResponse = await fetch('/api/auth/2fa/generate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.enrollmentToken}` },
          credentials: 'include',
        });
        const setupData = await setupResponse.json();
        if (!setupResponse.ok) throw new Error(setupData.message || 'Two-factor setup could not be started.');
        setEnrollmentSecret(setupData.secret);
        setAuthMode('enroll2fa');
        return;
      }

      if (res.status === 403 && data.requires2FA) {
        setRequires2FA(true);
        setError('Two-Factor Authentication required. Please enter your 6-digit TOTP code.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || 'Login failed. Please verify your credentials.');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTwoFactor = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${enrollmentToken}` },
        credentials: 'include',
        body: JSON.stringify({ secret: enrollmentSecret, code: enrollmentCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Two-factor setup could not be completed.');
      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Patient or Invited Staff Registration
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isStaffRegister ? '/api/auth/register-invited' : '/api/auth/register';
      const payload = isStaffRegister
        ? { name, email, password, inviteCode, district, phone }
        : { name, email, password, district, phone };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Registration failed.');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Forgot Password Request
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);

      setSuccessMsg('If the address matches an account, password reset instructions will follow. This response does not confirm whether an account exists.');
      setResetStep('submit');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Password Reset with Token
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);

      setSuccessMsg('Password has been updated. You can now log in.');
      setAuthMode('login');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content" className="login-shell">
      <section className="login-layout" aria-label="CareBridge account access">
        <aside className="login-intro">
          <div className="login-brand-mark" aria-hidden="true">+</div>
          <div className="login-eyebrow">SYNTHETIC CARE NETWORK</div>
          <h1>CareBridge</h1>
          <p className="login-intro-lead">Better-connected care starts here.</p>
          <p className="login-intro-copy">
            Simulated facility information supports research workflows for patients and care teams.
          </p>
          <div className="login-role-list" aria-label="Available account roles">
            <span>Patient</span>
            <span>Doctor</span>
            <span>Hospital admin</span>
            <span>Main admin · reviewer</span>
          </div>
          <div className="login-trust-note">
            <span aria-hidden="true">✓</span>
            <span>Simulated capability matching · Clinician review required</span>
          </div>
        </aside>

        <section className="login-card">
          <div className="login-card-heading">
            <div className="login-card-kicker">WELCOME TO CAREBRIDGE</div>
            <h2>{authMode === 'register' ? 'Create your account' : authMode === 'forgot' ? 'Reset your password' : authMode === 'demo' ? 'Explore demo accounts' : authMode === 'enroll2fa' ? 'Set up two-factor authentication' : 'Sign in to continue'}</h2>
            <p>{authMode === 'demo' ? 'Select a role to enter the demo workspace.' : authMode === 'enroll2fa' ? 'Add this account to an authenticator app, then enter its current six-digit code.' : 'Use your registered email and password to access your workspace.'}</p>
          </div>

        {/* Auth Mode Tabs */}
        {authMode !== 'enroll2fa' && <div className="login-mode-tabs" role="tablist" aria-label="Account actions">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'login'}
            tabIndex={authMode === 'login' ? 0 : -1}
            className={`btn login-mode-tab ${authMode === 'login' ? 'is-active' : ''}`}
            style={{ flex: 1, fontSize: '0.85rem', padding: '8px 12px' }}
            onClick={() => { setAuthMode('login'); setError(null); setSuccessMsg(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'register'}
            tabIndex={authMode === 'register' ? 0 : -1}
            className={`btn login-mode-tab ${authMode === 'register' ? 'is-active' : ''}`}
            style={{ flex: 1, fontSize: '0.85rem', padding: '8px 12px' }}
            onClick={() => { setAuthMode('register'); setError(null); setSuccessMsg(null); }}
          >
            Register
          </button>
          {isDemoMode && (
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'demo'}
              tabIndex={authMode === 'demo' ? 0 : -1}
              className={`btn login-mode-tab ${authMode === 'demo' ? 'is-active' : ''}`}
              style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px' }}
              onClick={() => { setAuthMode('demo'); setError(null); setSuccessMsg(null); }}
            >
              Demo Logins
            </button>
          )}
        </div>}

        {(error || authError) && (
          <div role="alert" aria-live="polite" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>
            ⚠️ {error || authError}
          </div>
        )}

        {successMsg && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>
            ✓ {successMsg}
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {authMode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-control"
                required
                value={email}
                autoComplete="username"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setRequires2FA(false);
                  setTwoFactorCode('');
                }}
                placeholder="doctor@example.invalid"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => { setAuthMode('forgot'); setError(null); }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                className="form-control"
                required
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>

            {requires2FA && (
              <div className="form-group" style={{ background: '#EFF6FF', padding: 14, borderRadius: 8, border: '1px solid #BFDBFE', marginBottom: 14 }}>
                <label htmlFor="login-2fa" style={{ color: '#1E40AF', fontWeight: 600 }}>6-Digit 2FA Code (TOTP)</label>
                <input
                  id="login-2fa"
                  type="text"
                  maxLength={6}
                  className="form-control"
                  required
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="123456"
                  style={{ letterSpacing: '0.2em', fontSize: '1.1rem', textAlign: 'center' }}
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* 2. REGISTRATION FORM */}
        {authMode === 'register' && (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isStaffRegister}
                  onChange={(e) => setIsStaffRegister(e.target.checked)}
                />
                <span>I am a Healthcare Doctor / Administrator with an Invite Code</span>
              </label>
            </div>

            {isStaffRegister && (
              <div className="form-group">
                <label htmlFor="reg-invite">Invitation code</label>
                <input
                  id="reg-invite"
                  type="text"
                  className="form-control"
                  required={isStaffRegister}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="INV-DOC-XXXXXXXX"
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Issued by a verified Hospital Admin or Platform Reviewer.
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                className="form-control"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="M. Anandhi"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Email Address</label>
              <input
                id="reg-email"
                type="email"
                className="form-control"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.invalid"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Password (Min 8 chars, letter + number)</label>
              <input
                id="reg-password"
                type="password"
                className="form-control"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>

            <div className="form-row" style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="reg-district">District</label>
                <input
                  id="reg-district"
                  className="form-control"
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Enter district"
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="reg-phone">Phone (Optional)</label>
                <input
                  id="reg-phone"
                  type="tel"
                  className="form-control"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
              {loading ? 'Registering...' : isStaffRegister ? 'Register as Healthcare Staff' : 'Register as Patient'}
            </button>
          </form>
        )}

        {/* 3. FORGOT / RESET PASSWORD FORM */}
        {authMode === 'forgot' && (
          <div>
            {resetStep === 'request' ? (
              <form onSubmit={handleForgotPassword}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                  Enter your registered email address to receive password reset instructions.
                </div>
                <div className="form-group">
                  <label htmlFor="forgot-email">Account Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    className="form-control"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="doctor@example.invalid"
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                  {loading ? 'Sending...' : 'Request Password Reset'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => setAuthMode('login')}
                >
                  Back to Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword}>
                <div className="form-group">
                  <label htmlFor="reset-token">Reset Token</label>
                  <input
                    id="reset-token"
                    type="text"
                    className="form-control"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Enter reset token from console"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="reset-newpass">New Password</label>
                  <input
                    id="reset-newpass"
                    type="password"
                    className="form-control"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                  {loading ? 'Updating...' : 'Set New Password'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 4. DEMO MODE TAB (ONLY PRESENT WHEN DEMO_MODE=true) */}
        {authMode === 'demo' && isDemoMode && (
          <div className="demo-login-panel">
            <div className="demo-login-note">
              <strong>Demo environment</strong>
              <span>Choose a role to open its pre-seeded research account.</span>
            </div>

            <div className="demo-login-list">
              {demoAccountsError && <p role="alert">{demoAccountsError}</p>}
              {!demoAccountsError && demoAccounts.length === 0 && <p role="status">Loading synthetic demo accounts…</p>}
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="demo-login-option"
                  onClick={() => onDemoLogin?.(account.email)}
                  disabled={loading}
                >
                  <div>
                    <span className="demo-login-title">{account.name}</span>
                    <span className="demo-login-detail">{account.email}</span>
                  </div>
                  <span className="demo-login-role">{account.role.replaceAll('_', ' ')}<span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {authMode === 'enroll2fa' && (
          <form onSubmit={handleEnableTwoFactor} aria-label="Two-factor authentication enrollment">
            <div className="clinical-notice-box">
              <strong>Authenticator setup key</strong>
              <p>Enter this key in your authenticator app and keep it private.</p>
              <code className="totp-secret">{enrollmentSecret}</code>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="enroll-2fa-code">Six-digit authenticator code</label>
              <input
                id="enroll-2fa-code"
                className="form-control"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={enrollmentCode}
                onChange={(event) => setEnrollmentCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading || enrollmentCode.length !== 6}>
              {loading ? 'Verifying…' : 'Verify and continue'}
            </button>
          </form>
        )}
      </section>
      </section>
    </main>
    </>
  );
}
