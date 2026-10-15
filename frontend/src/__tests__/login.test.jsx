import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '../components/LoginPage';

afterEach(cleanup);

describe('login form', () => {
  it('provides a working skip link to the main authentication content', () => {
    render(<LoginPage onLoginSuccess={vi.fn()} />);
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')).toBeInTheDocument();
  });

  it('has labeled credentials and completes sign-in without storing a client-side token', async () => {
    const onLoginSuccess = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { name: 'Test User', role: 'patient' }, token: 'ephemeral-token' }),
    });
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'patient@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith({ name: 'Test User', role: 'patient' }, 'ephemeral-token'));
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(window.localStorage.length).toBe(0);
  });

  it('loads development demo accounts from the API instead of a frontend persona list', async () => {
    const onDemoLogin = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accounts: [{ name: 'Synthetic Patient', email: 'patient.synthetic@example.invalid', role: 'patient' }],
      }),
    });
    render(<LoginPage onLoginSuccess={vi.fn()} isDemoMode onDemoLogin={onDemoLogin} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Demo Logins' }));
    const account = await screen.findByRole('button', { name: /Synthetic Patient.*patient\.synthetic@example\.invalid.*patient/i });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/demo-accounts', expect.objectContaining({ credentials: 'include' }));
    fireEvent.click(account);
    expect(onDemoLogin).toHaveBeenCalledWith('patient.synthetic@example.invalid');
  });

  it('enrolls two-factor authentication with a six-digit code', async () => {
    const onLoginSuccess = vi.fn();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ requires2FAEnrollment: true, enrollmentToken: 'limited-enrollment-token' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ secret: 'SYNTHETIC-SECRET' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { name: 'Test User', role: 'patient' }, token: 'session-token' }),
      });
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'patient@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    const codeInput = await screen.findByLabelText('Six-digit authenticator code');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/auth/2fa/generate', expect.objectContaining({ credentials: 'include' }));
    expect(global.fetch).toHaveBeenNthCalledWith(3, '/api/auth/2fa/enable', expect.objectContaining({
      body: JSON.stringify({ secret: 'SYNTHETIC-SECRET', code: '123456' }),
    }));
  });
});
