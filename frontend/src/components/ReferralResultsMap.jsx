import React from 'react';

export default function ReferralResultsMap({ recommendations }) {
  const districts = new Map();
  recommendations.forEach((facility) => {
    const district = facility.district || 'District not recorded';
    districts.set(district, (districts.get(district) || 0) + 1);
  });

  return (
    <aside className="referral-map-panel" aria-labelledby="referral-map-title">
      <h3 id="referral-map-title">Recommendation locations</h3>
      <p>Districts are read from the ranked hospital results; map coordinates are not available.</p>
      {districts.size === 0 ? (
        <p>No facility locations are available for this result.</p>
      ) : (
        <ul>
          {[...districts].map(([district, count]) => (
            <li key={district}>{district} · {count} ranked {count === 1 ? 'facility' : 'facilities'}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
