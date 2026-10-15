import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DoctorPortal from '../components/DoctorPortal';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));

const doctorUser = { _id: 'doctor-1', hospitalId: 'hospital-1' };
const patient = { _id: 'patient-1', name: 'Synthetic Patient', district: 'Salem' };

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockPortalApi({ recommendations = [], excludedHospitals = [] } = {}) {
  apiFetch.mockImplementation((url) => {
    if (url === '/api/patients?limit=100') return Promise.resolve(response({ patients: [patient] }));
    if (url === '/api/hospitals/hospital-1') return Promise.resolve(response({ hospital: { name: 'Synthetic Hospital' } }));
    if (url === '/api/hospitals?limit=100') {
      return Promise.resolve(response({ hospitals: [{ specialties: ['Cardiology', 'Nephrology'] }] }));
    }
    if (url === '/api/referrals/assess') {
      return Promise.resolve(response({ urgency: 'urgent', specialties: ['Cardiology'], red_flags: [] }));
    }
    if (url === '/api/referrals/recommend') {
      return Promise.resolve(response({ referralId: 'REF-TEST-001', recommendations, excludedHospitals }));
    }
    return Promise.resolve(response({}));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('doctor assessment and referral results', () => {
  it('collects all required intake fields and submits the backend assessment shape', async () => {
    mockPortalApi();
    render(<DoctorPortal token="test-token" doctorUser={doctorUser} />);

    await screen.findByRole('option', { name: /Synthetic Patient/ });
    expect(screen.getByLabelText('Age (years)')).toBeInTheDocument();
    expect(screen.getByLabelText('Sex recorded for assessment')).toBeInTheDocument();
    expect(screen.getByLabelText('Temperature (°C or °F)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Age (years)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Sex recorded for assessment'), { target: { value: 'F' } });
    fireEvent.change(screen.getByLabelText('Heart Rate (bpm)'), { target: { value: '78' } });
    fireEvent.change(screen.getByLabelText('Resp Rate (/min)'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Systolic BP (mmHg)'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('SpO2 (%)'), { target: { value: '98' } });
    fireEvent.change(screen.getByLabelText('Temperature (°C or °F)'), { target: { value: '37' } });
    fireEvent.click(screen.getByLabelText('Chest pain'));
    fireEvent.click(screen.getByRole('button', { name: /Run Clinical Triage Assessment/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/referrals/assess',
      expect.objectContaining({ method: 'POST' }),
    ));
    const request = apiFetch.mock.calls.find(([url]) => url === '/api/referrals/assess')[1];
    expect(JSON.parse(request.body)).toMatchObject({
      age: 45,
      gender: 'F',
      heartrate: 78,
      resprate: 18,
      sbp: 120,
      o2sat: 98,
      temperature: 37,
      chest_pain: true,
    });
    expect(JSON.parse(request.body)).not.toHaveProperty('vitals');
  });

  it('reports insufficient intake without sending an assessment when required values are missing', async () => {
    mockPortalApi();
    render(<DoctorPortal token="test-token" doctorUser={doctorUser} />);
    await screen.findByRole('option', { name: /Synthetic Patient/ });

    fireEvent.click(screen.getByRole('button', { name: /Run Clinical Triage Assessment/ }));

    expect(await screen.findByText(/intake vitals are incomplete/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith('/api/referrals/assess', expect.anything());
  });

  it('does not show a referral code when ranking finds no suitable hospitals', async () => {
    mockPortalApi({
      excludedHospitals: [{
        hospitalId: 'hospital-2',
        hospitalName: 'Synthetic No-Match Hospital',
        district: 'Salem',
        reason: 'Lacks required specialty: Cardiology',
      }],
    });
    render(<DoctorPortal token="test-token" doctorUser={doctorUser} initialTab="referrals" />);

    await screen.findByRole('option', { name: 'Cardiology' });
    fireEvent.change(screen.getByLabelText('Required specialty'), { target: { value: 'Cardiology' } });
    fireEvent.change(screen.getByLabelText('Patient latitude'), { target: { value: '11.66' } });
    fireEvent.change(screen.getByLabelText('Patient longitude'), { target: { value: '78.14' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Ranked Recommendations/ }));

    expect(await screen.findByRole('heading', { name: 'No suitable hospitals found' })).toBeInTheDocument();
    expect(screen.getByText(/Lacks required specialty: Cardiology/)).toBeInTheDocument();
    expect(screen.queryByText('REF-TEST-001')).not.toBeInTheDocument();
    expect(screen.queryByText(/bed reservation/i)).not.toBeInTheDocument();
  });

  it('does not display the referral workflow stepper on the records tab', async () => {
    mockPortalApi();
    render(<DoctorPortal token="test-token" doctorUser={doctorUser} initialTab="records" />);

    await screen.findByRole('heading', { name: /Consented Clinical Records Viewer/ });
    expect(screen.queryByText('Patient details')).not.toBeInTheDocument();
  });
});
