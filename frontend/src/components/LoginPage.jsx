import React, { useState } from 'react';

export default function LoginPage({ onLoginSuccess, isDemoMode = false, onDemoLogin }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'demo'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);

  // Registration state
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('Salem');
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

      setSuccessMsg('If an account exists, instructions have been generated. (In development, check the backend console for the simulated link).');
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
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '28px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Brand & Title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8' }}>CareBridge</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Health Informatics Referral System
          </div>
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 4 }}>
            Research Prototype | Synthetic Clinical Data Only
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
          <button
            type="button"
            className={`btn ${authMode === 'login' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px' }}
            onClick={() => { setAuthMode('login'); setError(null); setSuccessMsg(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`btn ${authMode === 'register' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px' }}
            onClick={() => { setAuthMode('register'); setError(null); setSuccessMsg(null); }}
          >
            Register
          </button>
          {isDemoMode && (
            <button
              type="button"
              className={`btn ${authMode === 'demo' ? 'btn-warning' : 'btn-outline'}`}
              style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px' }}
              onClick={() => { setAuthMode('demo'); setError(null); setSuccessMsg(null); }}
            >
              Demo Logins
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 16 }}>
            ✓ {successMsg}
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {authMode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-control"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@carebridge.tn.gov.in"
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="login-password">Password</label>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>

            {requires2FA && (
              <div className="form-group" style={{ background: 'rgba(56, 189, 248, 0.1)', padding: 12, borderRadius: 8, border: '1px solid #0284c7' }}>
                <label htmlFor="login-2fa" style={{ color: '#38bdf8' }}>6-Digit 2FA Code (TOTP)</label>
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

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
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
                <label htmlFor="reg-invite">Official Invite Code</label>
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
                placeholder="patient@carebridge.tn.gov.in"
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
                <select
                  id="reg-district"
                  className="form-control"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                >
                  <option value="Salem">Salem</option>
                  <option value="Coimbatore">Coimbatore</option>
                  <option value="Erode">Erode</option>
                  <option value="Dharmapuri">Dharmapuri</option>
                  <option value="Namakkal">Namakkal</option>
                </select>
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
                    placeholder="doctor@carebridge.tn.gov.in"
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
          <div>
            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid #f59e0b',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: '0.78rem',
              color: '#fcd34d',
              marginBottom: 16
            }}>
              ⚙️ <strong>DEMO ENVIRONMENT ACTIVE:</strong> Issues authenticated sessions with real server cookies for pre-seeded research evaluation accounts.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Hospital Admin (Salem Mohan - Tier 2)', email: 'admin.salem@carebridge.tn.gov.in', role: 'hospital_admin' },
                { label: 'Dr. S. Sundaram, MD (Referring Doctor)', email: 'doctor@carebridge.tn.gov.in', role: 'doctor' },
                { label: 'Dr. K. Swaminathan (Platform Reviewer)', email: 'reviewer@carebridge.tn.gov.in', role: 'platform_reviewer' },
                { label: 'M. Anandhi (Patient 1)', email: 'patient@carebridge.tn.gov.in', role: 'patient' },
                { label: 'Hospital Admin (Kovai Apex - Tier 1)', email: 'admin.kovai@carebridge.tn.gov.in', role: 'hospital_admin' },
              ].map((persona) => (
                <button
                  key={persona.email}
                  type="button"
                  className="btn btn-outline"
                  style={{ textAlign: 'left', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => onDemoLogin(persona.email)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{persona.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{persona.email}</div>
                  </div>
                  <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>{persona.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
