export const ROLE_VIEWS = {
  doctor: [
    { id: 'assessment', label: 'New assessment', title: 'Referral workspace' },
    { id: 'referrals', label: 'Ranked facilities', title: 'Ranked facilities' },
    { id: 'records', label: 'Consented records', title: 'Patient records' },
    { id: 'schemes', label: 'Scheme information', title: 'Scheme information' },
  ],
  patient: [
    { id: 'consents', label: 'Consent requests', title: 'Consent and sharing' },
    { id: 'records', label: 'My records', title: 'My health records' },
    { id: 'referrals', label: 'Referral status', title: 'Referral status' },
    { id: 'schemes', label: 'Possible scheme matches', title: 'Possible scheme matches' },
    { id: 'history', label: 'Access history', title: 'Record access history' },
  ],
  hospital_admin: [
    { id: 'telemetry', label: 'Facility profile and capacity', title: 'Facility overview' },
    { id: 'practitioners', label: 'Practitioner roster', title: 'Practitioner roster' },
  ],
  platform_reviewer: [
    { id: 'queue', label: 'Verification queue', title: 'Facility verification queue' },
    { id: 'directory', label: 'Hospital directory', title: 'Hospital directory' },
    { id: 'practitioners', label: 'Practitioner verification', title: 'Practitioner review' },
    { id: 'schemes', label: 'Scheme catalogue', title: 'Scheme catalogue' },
    { id: 'specialty_map', label: 'Condition and specialty review', title: 'Condition and specialty review' },
    { id: 'models', label: 'Model registry', title: 'Model registry' },
  ],
};

export function defaultViewForRole(role) {
  return ROLE_VIEWS[role]?.[0]?.id || null;
}

export function routeForRole(role, view = defaultViewForRole(role)) {
  return `/${role}/${view}`;
}

export function resolveRoleRoute(pathname, verifiedRole) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'design-system') return { kind: 'design-system' };
  if (!segments.length) return { kind: 'redirect', path: routeForRole(verifiedRole) };
  const [routeRole, view] = segments;
  if (routeRole !== verifiedRole) return { kind: 'denied', routeRole };
  const found = ROLE_VIEWS[verifiedRole]?.find((item) => item.id === view);
  if (!found) return { kind: 'redirect', path: routeForRole(verifiedRole) };
  return { kind: 'page', role: verifiedRole, view: found.id, title: found.title };
}
