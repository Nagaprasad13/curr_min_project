import { describe, expect, it } from 'vitest';
import { urgencyConfirmationError } from '../doctorFlow';

describe('urgency override validation', () => {
  it('requires a reason before an urgency override can be confirmed', () => {
    expect(urgencyConfirmationError(true, '   ')).toMatch(/reason is required/i);
    expect(urgencyConfirmationError(true, 'Reviewed current vital signs')).toBe('');
    expect(urgencyConfirmationError(false, '')).toBe('');
  });
});
