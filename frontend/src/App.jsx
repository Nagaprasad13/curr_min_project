import React, { useEffect, useState } from 'react';
import { apiFetch as fetch } from './api';
import LoginPage from './components/LoginPage';
import PatientPortal from './components/PatientPortal';
import DoctorPortal from './components/DoctorPortal';
import ReviewerPortal from './components/ReviewerPortal';
import HospitalAdminPortal from './components/HospitalAdminPortal';
import DesignSystemPage from './design-system/DesignSystemPage';
import { Button, useDesignTheme } from './design-system/components';
import { defaultViewForRole, resolveRoleRoute, routeForRole, ROLE_VIEWS } from './roleRouting';

const ROLE_LABELS = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital_admin: 'Hospital admin',
  platform_reviewer: 'Platform reviewer',
};

function setPath(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function AppFooter() {
  return <footer className="app-footer"><span>CareBridge research prototype</span><strong>Synthetic data. Not for real patient care.</strong></footer>;
}

function NotPermitted({ role, onReturn }) {
  return <section className="ds-card ds-denied" role="alert">
    <span className="ds-denied-icon" aria-hidden="true">!</span>
    <p className="ds-eyebrow">Access restricted</p>
    <h1>This page is not permitted for your account</h1>
    <p>Your verified server session is for {ROLE_LABELS[role] || 'your assigned role'}. You can only access pages assigned to that role.</p>
    <Button onClick={onReturn}>Return to your workspace</Button>
  </section>;
}

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="card" role="alert">
          <h1>This page could not be displayed</h1>
          <p>The page failed unexpectedly. Reload it to try again.</p>
          <Button variant="secondary" onClick={() => this.setState({ hasError: false })}>Retry page</Button>
        </section>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, toggleTheme] = useDesignTheme();
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(() => sessionStorage.getItem('carebridge-disclaimer-collapsed') !== 'true');

  const isDemoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    const onUnauthorized = () => {
      setCurrentUser(null);
      setToken(null);
      setPath('/');
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('carebridge:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('carebridge:unauthorized', onUnauthorized);
    };
  }, []);

  useEffect(() => {
    const route = currentUser ? resolveRoleRoute(pathname, currentUser.role) : null;
    if (route?.kind === 'redirect') {
      window.history.replaceState({}, '', route.path);
      setPathname(route.path);
    }
  }, [currentUser, pathname]);

  useEffect(() => {
    if (import.meta.env.DEV && window.location.pathname === '/design-system') return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include', signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCurrentUser(null);
          setAuthError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSession(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleLoginSuccess = (user, authToken) => {
    setCurrentUser(user);
    setToken(authToken || null);
    setAuthError(null);
    setPath(routeForRole(user.role));
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setCurrentUser(null);
      setToken(null);
      setPath('/');
    }
  };

  const handleDemoLogin = async (email) => {
    try {
      setAuthError(null);
      const response = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Demo sign-in failed.');
      handleLoginSuccess(data.user, data.token);
    } catch (error) {
      setAuthError(error.message);
    }
  };

  if (import.meta.env.DEV && pathname === '/design-system') {
    return <><a className="skip-link" href="#main-content">Skip to main content</a><header className="ds-demo-header"><a href="/">CareBridge</a><div><span>{theme === 'dark' ? 'Dark theme' : 'Light theme'}</span><Button variant="secondary" onClick={toggleTheme}>Switch theme</Button></div></header><DesignSystemPage /><AppFooter /></>;
  }

  if (loadingSession) {
    return <main className="session-loading" aria-live="polite"><span className="ds-spinner" aria-hidden="true" /> Checking your secure session…</main>;
  }

  if (!currentUser) {
    return <div className="app-container auth-layout">
      <LoginPage onLoginSuccess={handleLoginSuccess} isDemoMode={isDemoMode} onDemoLogin={handleDemoLogin} authError={authError} />
      <AppFooter />
    </div>;
  }

  const role = currentUser.role;
  const route = resolveRoleRoute(pathname, role);
  if (route.kind === 'redirect') {
    return <main className="session-loading" aria-live="polite"><span className="ds-spinner" aria-hidden="true" /> Opening your workspace…</main>;
  }
  if (route.kind === 'design-system') {
    return <><main id="main-content" className="page-wrap"><NotPermitted role={role} onReturn={() => setView(defaultViewForRole(role))} /></main><AppFooter /></>;
  }

  const roleViews = ROLE_VIEWS[role] || [];
  const currentView = route.kind === 'page' ? route.view : defaultViewForRole(role);
  const setView = (view) => {
    if (roleViews.some((item) => item.id === view)) {
      setPath(routeForRole(role, view));
      setSidebarOpen(false);
    }
  };
  const onDisclaimerToggle = () => {
    const next = !disclaimerExpanded;
    setDisclaimerExpanded(next);
    sessionStorage.setItem('carebridge-disclaimer-collapsed', String(!next));
  };

  return <div className="app-container workspace-app">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className={`disclaimer-strip ${disclaimerExpanded ? 'is-expanded' : 'is-collapsed'}`}>
      <span className="disclaimer-icon" aria-hidden="true">i</span>
      <span><strong>Decision support only.</strong>{disclaimerExpanded && ' A clinician must review.'}</span>
      <button type="button" onClick={onDisclaimerToggle} aria-expanded={disclaimerExpanded} aria-label={disclaimerExpanded ? 'Collapse decision support notice' : 'Expand decision support notice'}>{disclaimerExpanded ? '−' : '+'}</button>
    </div>
    <header className="workspace-header">
      <Button className="mobile-menu-button" variant="ghost" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-label="Toggle navigation">☰</Button>
      <a className="workspace-brand" href={routeForRole(role)} onClick={(event) => { event.preventDefault(); setView(defaultViewForRole(role)); }}>
        <span className="brand-symbol" aria-hidden="true">+</span><span>CareBridge<small>Research workspace</small></span>
      </a>
      <div className="workspace-crumb" aria-label="Breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{route.kind === 'page' ? route.title : 'Not permitted'}</strong></div>
      <details className="user-menu">
        <summary aria-label={`${currentUser.name}, ${ROLE_LABELS[role] || 'Account'} user menu`}><span className="user-avatar" aria-hidden="true">{(currentUser.name || 'U').slice(0, 1).toUpperCase()}</span><span className="user-menu-name">{currentUser.name}<small>{ROLE_LABELS[role] || 'Account'}</small></span><span aria-hidden="true">⌄</span></summary>
        <div className="user-menu-panel">
          <p><strong>{currentUser.name}</strong><br /><span>{ROLE_LABELS[role] || 'Account'}</span></p>
          <Button variant="secondary" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? '☀ Light theme' : '◐ Dark theme'}</Button>
          <Button variant="ghost" onClick={handleSignOut}>Sign out</Button>
        </div>
      </details>
    </header>
    {isDemoMode && <div className="demo-notice"><strong>Demo mode</strong> · Sample accounts and synthetic records are in use.</div>}
    <div className="workspace-body">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`workspace-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label={`${ROLE_LABELS[role] || 'Account'} navigation`}>
        <p className="sidebar-label">YOUR WORKSPACE</p>
        <nav aria-label={`${ROLE_LABELS[role] || 'Account'} navigation`}>
          {roleViews.map((item, index) => <a key={item.id} href={routeForRole(role, item.id)} aria-current={currentView === item.id ? 'page' : undefined} className={currentView === item.id ? 'active' : ''} onClick={(event) => { event.preventDefault(); setView(item.id); }}>
            <span className="nav-icon" aria-hidden="true">{['◇', '▤', '◉', '⌂', '◎'][index % 5]}</span><span>{item.label}</span>{currentView === item.id && <span className="active-marker" aria-hidden="true" />}
          </a>)}
        </nav>
        {import.meta.env.DEV && <a className="design-system-link" href="/design-system">Design system preview</a>}
        <p className="sidebar-support">All screens use simulated data. Verify operational details independently.</p>
      </aside>
      <div className="workspace-content">
        {route.kind === 'denied' ? <div id="main-content" className="page-wrap" tabIndex="-1"><NotPermitted role={role} onReturn={() => setView(defaultViewForRole(role))} /></div> : (
          <main id="main-content" className="main-content" tabIndex="-1">
            <RouteErrorBoundary routeKey={`${role}-${currentView}`}>
              {role === 'hospital_admin' && <HospitalAdminPortal token={token} adminUser={currentUser} initialTab={currentView} />}
              {role === 'platform_reviewer' && <ReviewerPortal token={token} reviewerUser={currentUser} initialTab={currentView} />}
              {role === 'doctor' && <DoctorPortal token={token} doctorUser={currentUser} initialTab={currentView} />}
              {role === 'patient' && <PatientPortal token={token} patientUser={currentUser} initialTab={currentView} />}
            </RouteErrorBoundary>
          </main>
        )}
        <AppFooter />
      </div>
    </div>
  </div>;
}
