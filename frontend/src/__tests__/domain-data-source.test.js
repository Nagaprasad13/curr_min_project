import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const runtimeFiles = [
  '../App.jsx',
  '../components/DoctorPortal.jsx',
  '../components/PatientPortal.jsx',
  '../components/HospitalAdminPortal.jsx',
  '../components/ReviewerPortal.jsx',
  '../components/LoginPage.jsx',
  '../design-system/DesignSystemPage.jsx',
];

describe('runtime domain data source policy', () => {
  it('does not embed synthetic patient, referral, hospital, or district records in runtime views', () => {
    const source = runtimeFiles
      .map((path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))
      .join('\n');
    const forbiddenValues = [
      '6acdf89630cd8eb4c816cd51',
      '6ace2c7ce3e4fb59acb387ba',
      'Kavitha R. (Patient 1)',
      'P. Anandhi (Patient 1)',
      'Kovai Apex Super Speciality Hospital',
      'Salem Mohan Kumaramangalam Medical College',
      'REF-2026-0001',
      'Coimbatore',
      'Dharmapuri',
      'Salem Central',
    ];
    forbiddenValues.forEach((value) => expect(source).not.toContain(value));
  });
});
