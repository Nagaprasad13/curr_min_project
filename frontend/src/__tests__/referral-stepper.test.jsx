import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Stepper } from '../design-system/components';

afterEach(cleanup);

describe('referral stepper', () => {
  it('announces the current step and preserves the referral sequence', () => {
    render(<Stepper steps={['Patient details', 'Assessment', 'Confirm urgency', 'Ranked hospitals', 'Send referral']} currentStep={2} />);
    const stepper = screen.getByRole('list', { name: 'Referral progress' });
    expect(within(stepper).getAllByRole('listitem')).toHaveLength(5);
    expect(within(stepper).getByText('Confirm urgency').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(within(stepper).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '✓Patient details', '✓Assessment', '3Confirm urgency', '4Ranked hospitals', '5Send referral',
    ]);
  });
});
