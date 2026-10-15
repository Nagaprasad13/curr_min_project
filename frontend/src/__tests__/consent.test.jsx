import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PatientPortal from '../components/PatientPortal';

afterEach(cleanup);

function setupFetch(consent) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url === '/api/consents') return { ok: true, json: async () => ({ consents: [consent] }) };
    if (url === '/api/consents/access-history') return { ok: true, json: async () => ({ accessReport: [] }) };
    if (String(url).includes('/records')) return { ok: true, json: async () => ({ records: [] }) };
    if (String(url).includes('/api/referrals/')) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ message: 'updated' }) };
  });
}

describe('patient consent controls', () => {
  it('allows narrowing scope before granting record sharing', async () => {
    setupFetch({ consentId: 'CONSENT-1', status: 'requested', recordTypes: ['lab_report', 'prescription'], requestingHospitalId: { name: 'Synthetic facility' } });
    render(<PatientPortal token="memory-token" patientUser={{ id: 'patient-1', name: 'Patient' }} initialTab="consents" />);
    await screen.findByText('CONSENT-1');
    fireEvent.click(screen.getByRole('button', { name: 'Grant...' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /lab_report/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Grant' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/consents/CONSENT-1/grant', expect.objectContaining({ method: 'POST' })));
    const grantRequest = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/grant'));
    expect(JSON.parse(grantRequest[1].body).narrowedRecordTypes).toEqual(['prescription']);
  });

  it('allows a patient to revoke a previously granted consent', async () => {
    setupFetch({ consentId: 'CONSENT-2', status: 'granted', recordTypes: ['lab_report'], requestingHospitalId: { name: 'Synthetic facility' } });
    render(<PatientPortal token="memory-token" patientUser={{ id: 'patient-1', name: 'Patient' }} initialTab="consents" />);
    await screen.findByText('CONSENT-2');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Now' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/consents/CONSENT-2/revoke', expect.objectContaining({ method: 'POST' })));
  });
});
