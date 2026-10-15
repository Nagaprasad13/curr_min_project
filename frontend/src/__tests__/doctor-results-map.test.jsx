import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import ReferralResultsMap from '../components/ReferralResultsMap';

afterEach(cleanup);

describe('referral results map', () => {
  it('renders districts from ranked results without inventing map coordinates', async () => {
    const { container } = render(
      <ReferralResultsMap recommendations={[
        { hospitalId: 'hospital-1', hospitalName: 'Synthetic Salem Facility', district: 'Salem', rank: 1 },
        { hospitalId: 'hospital-2', hospitalName: 'Synthetic Chennai Facility', district: 'Chennai', rank: 2 },
      ]} />
    );

    expect(screen.getByRole('complementary', { name: 'Recommendation locations' })).toBeInTheDocument();
    expect(screen.getByText('Districts are read from the ranked hospital results; map coordinates are not available.')).toBeInTheDocument();
    expect(screen.getByText('Salem · 1 ranked facility')).toBeInTheDocument();
    expect(screen.getByText('Chennai · 1 ranked facility')).toBeInTheDocument();

    const results = await axe.run(container, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map(({ id }) => id)).toEqual([]);
  });
});
