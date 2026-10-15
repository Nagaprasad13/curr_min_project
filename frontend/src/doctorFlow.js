export function urgencyConfirmationError(isOverride, reason) {
  return isOverride && !reason.trim() ? 'A reason is required when changing the suggested urgency.' : '';
}
