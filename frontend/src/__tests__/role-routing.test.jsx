import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import App from '../App';
import { ROLE_VIEWS, resolveRoleRoute, routeForRole } from '../roleRouting';

vi.mock('../components/DoctorPortal', () => ({ default: () => <section><h1>Doctor workspace test page</h1></section> }));
vi.mock('../components/PatientPortal', () => ({ default: () => <section><h1>Patient workspace test page</h1></section> }));
vi.mock('../components/HospitalAdminPortal', () => ({ default: () => <section><h1>Hospital admin test page</h1></section> }));
vi.mock('../components/ReviewerPortal', () => ({ default: () => <section><h1>Reviewer workspace test page</h1></section> }));
vi.mock('../components/LoginPage', () => ({ default: () => <main><h1>Sign in test page</h1></main> }));

afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.dataset.theme = 'light';
});

describe('verified role routing', () => {
  it.each(Object.keys(ROLE_VIEWS))('offers only %s menu items and audits each route', async (role) => {
    const headingByRole = {
      doctor: 'Doctor workspace test page',
      patient: 'Patient workspace test page',
      hospital_admin: 'Hospital admin test page',
      platform_reviewer: 'Reviewer workspace test page',
    };
    for (const view of ROLE_VIEWS[role]) {
      window.history.replaceState({}, '', routeForRole(role, view.id));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: 'user-1', name: 'Sample User', role } }),
      });
      const { container, unmount } = render(<App />);
      await screen.findByRole('heading', { name: headingByRole[role] });
      const navLinks = [...container.querySelectorAll('.workspace-sidebar nav a')];
      expect(navLinks).toHaveLength(ROLE_VIEWS[role].length);
      expect(navLinks.map((link) => link.getAttribute('href'))).toEqual(ROLE_VIEWS[role].map(({ id }) => routeForRole(role, id)));
      const results = await axe.run(container, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], rules: { 'color-contrast': { enabled: false } } });
      expect(results.violations.map(({ id }) => id)).toEqual([]);
      unmount();
    }
  });

  it('blocks a direct URL for a different role', async () => {
    window.history.replaceState({}, '', '/doctor/assessment');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'patient-1', name: 'Sample Patient', role: 'patient' } }),
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'This page is not permitted for your account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Patient navigation' })).toBeInTheDocument();
    expect(resolveRoleRoute('/reviewer/queue', 'patient').kind).toBe('denied');
  });

  it('redirects the root path to the session role default view', async () => {
    window.history.replaceState({}, '', '/');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'doctor-1', name: 'Sample Doctor', role: 'doctor' } }),
    });
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/doctor/assessment'));
    expect(await screen.findByRole('navigation', { name: 'Doctor navigation' })).toBeInTheDocument();
  });
});
