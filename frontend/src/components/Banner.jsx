import React from 'react';

export default function Banner() {
  return (
    <div id="clinical-disclaimer-banner" className="disclaimer-banner">
      <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        ⚠️ CLINICAL NOTICE
      </span>
      <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
        DECISION SUPPORT ONLY. A CLINICIAN MUST REVIEW.
      </span>
      <span style={{ opacity: 0.85, marginLeft: 6, fontSize: '0.75rem', fontWeight: 400 }}>
        CareBridge Research Prototype (Tamil Nadu) — Synthetic Clinical Data Only
      </span>
    </div>
  );
}
