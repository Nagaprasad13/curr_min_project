import React from 'react';

export default function Banner() {
  return (
    <div id="clinical-disclaimer-banner" className="disclaimer-banner">
      <span role="img" aria-label="warning">⚠️</span>
      <strong>DECISION SUPPORT ONLY. A CLINICIAN MUST REVIEW.</strong>
      <span style={{ opacity: 0.85, marginLeft: 8, fontSize: '0.75rem', fontWeight: 400 }}>
        CareBridge Research Prototype (Tamil Nadu) — Synthetic Data Only
      </span>
    </div>
  );
}
