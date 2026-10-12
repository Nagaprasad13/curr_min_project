/**
 * CareBridge Scientific Plot Generator
 * 
 * Generates publication-quality vector SVG and bitmap PNG charts
 * for all 5 Phase 4 figures. Uses color-blind-friendly palettes (Okabe-Ito inspired)
 * and includes 95% bootstrap confidence interval bands.
 */

const fs = require('fs');
const path = require('path');
const { SimpleCanvas } = require('./pngWriter');

// Color-blind safe palette
const PALETTE = {
  unknown_aware: { hex: '#1f77b4', rgb: [31, 119, 180], label: 'CareBridge (unknown_aware)' },
  assume_available: { hex: '#d62728', rgb: [214, 39, 40], label: 'CareBridge (assume_available)' },
  trust_last_reported: { hex: '#ff7f0e', rgb: [255, 127, 14], label: 'CareBridge (trust_last_reported)' },
  nearest_eligible: { hex: '#9467bd', rgb: [148, 103, 189], label: 'Nearest Eligible' },
  nearest_verified: { hex: '#7f7f7f', rgb: [127, 127, 127], label: 'Nearest Verified' },
  always_tier1: { hex: '#8c564b', rgb: [140, 86, 75], label: 'Always Tier 1' },
  random_eligible: { hex: '#2ca02c', rgb: [44, 160, 44], label: 'Random Eligible' },
};

/**
 * Builds an SVG line chart with optional shaded confidence bands.
 */
function buildSVGLineChart({
  title,
  xLabel = 'Telemetry Staleness Level (%)',
  yLabel = 'Rate (%)',
  xValues = [0, 10, 20, 30, 40, 50],
  series = [],
  yMax = 100,
  yMin = 0,
  width = 900,
  height = 550,
  disclaimer = 'Notice: Synthetic research prototype simulation data. Decision support only.',
}) {
  const margin = { top: 70, right: 240, bottom: 80, left: 80 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);

  const scaleX = (x) => margin.left + ((x - minX) / (maxX - minX || 1)) * plotWidth;
  const scaleY = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  
  <!-- Title and Subtitle -->
  <text x="${margin.left}" y="32" font-size="18" font-weight="700" fill="#1a202c">${title}</text>
  <text x="${margin.left}" y="52" font-size="11" fill="#718096">${disclaimer}</text>
  
  <!-- Plot Background -->
  <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
`;

  // Horizontal Grid Lines & Y Ticks
  const numYSteps = 5;
  for (let i = 0; i <= numYSteps; i++) {
    const val = yMin + (i / numYSteps) * (yMax - yMin);
    const yPos = scaleY(val);
    svg += `  <line x1="${margin.left}" y1="${yPos}" x2="${margin.left + plotWidth}" y2="${yPos}" stroke="#edf2f7" stroke-width="1"/>
  <text x="${margin.left - 12}" y="${yPos + 4}" font-size="11" fill="#4a5568" text-anchor="end">${Math.round(val)}%</text>
`;
  }

  // Vertical Grid Lines & X Ticks
  for (const x of xValues) {
    const xPos = scaleX(x);
    svg += `  <line x1="${xPos}" y1="${margin.top}" x2="${xPos}" y2="${margin.top + plotHeight}" stroke="#edf2f7" stroke-width="1"/>
  <text x="${xPos}" y="${margin.top + plotHeight + 20}" font-size="11" fill="#4a5568" text-anchor="middle">${x}%</text>
`;
  }

  // Axis Labels
  svg += `  <text x="${margin.left + plotWidth / 2}" y="${margin.top + plotHeight + 50}" font-size="13" font-weight="600" fill="#2d3748" text-anchor="middle">${xLabel}</text>
  <text transform="rotate(-90)" x="${-(margin.top + plotHeight / 2)}" y="${margin.left - 50}" font-size="13" font-weight="600" fill="#2d3748" text-anchor="middle">${yLabel}</text>
`;

  // Draw Confidence Bands first (so they stay in the background)
  for (const s of series) {
    if (s.ciLower && s.ciUpper && s.ciLower.length === xValues.length) {
      let bandPoints = '';
      for (let i = 0; i < xValues.length; i++) {
        bandPoints += `${scaleX(xValues[i])},${scaleY(s.ciUpper[i])} `;
      }
      for (let i = xValues.length - 1; i >= 0; i--) {
        bandPoints += `${scaleX(xValues[i])},${scaleY(s.ciLower[i])} `;
      }
      svg += `  <polygon points="${bandPoints.trim()}" fill="${s.color}" fill-opacity="0.15" stroke="none"/>\n`;
    }
  }

  // Draw Lines & Data Points
  for (const s of series) {
    const points = s.values.map((v, i) => `${scaleX(xValues[i])},${scaleY(v)}`).join(' ');
    const strokeDash = s.isDashed ? 'stroke-dasharray="4,4"' : '';
    const strokeWidth = s.isHighlighted ? 3 : 2;

    svg += `  <!-- Series: ${s.name} -->
  <polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" ${strokeDash}/>
`;
    for (let i = 0; i < xValues.length; i++) {
      const px = scaleX(xValues[i]);
      const py = scaleY(s.values[i]);
      svg += `  <circle cx="${px}" cy="${py}" r="${s.isHighlighted ? 4.5 : 3.5}" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>\n`;
    }
  }

  // Legend on Right Margin
  let legendY = margin.top + 10;
  svg += `  <!-- Legend -->
  <rect x="${margin.left + plotWidth + 15}" y="${margin.top}" width="${margin.right - 25}" height="${series.length * 24 + 16}" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" rx="4"/>
`;
  for (const s of series) {
    const strokeDash = s.isDashed ? 'stroke-dasharray="3,3"' : '';
    svg += `  <g transform="translate(${margin.left + plotWidth + 25}, ${legendY})">
    <line x1="0" y1="6" x2="20" y2="6" stroke="${s.color}" stroke-width="${s.isHighlighted ? 2.5 : 1.5}" ${strokeDash}/>
    <circle cx="10" cy="6" r="3" fill="${s.color}"/>
    <text x="28" y="10" font-size="11" fill="#2d3748">${s.name}</text>
  </g>
`;
    legendY += 24;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Builds a simple raster PNG approximation corresponding to the SVG chart.
 */
function buildRasterPNG({ xValues, series, width = 900, height = 550, yMin = 0, yMax = 100 }) {
  const canvas = new SimpleCanvas(width, height, [255, 255, 255]);
  const margin = { top: 70, right: 240, bottom: 80, left: 80 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);

  const scaleX = (x) => margin.left + ((x - minX) / (maxX - minX || 1)) * plotWidth;
  const scaleY = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

  // Background rect
  canvas.fillRect(margin.left, margin.top, plotWidth, plotHeight, [248, 250, 252]);

  // Horizontal grid lines
  for (let i = 0; i <= 5; i++) {
    const val = yMin + (i / 5) * (yMax - yMin);
    const yPos = Math.floor(scaleY(val));
    canvas.drawLine(margin.left, yPos, margin.left + plotWidth, yPos, [237, 242, 247], 1);
  }

  // Draw series lines
  for (const s of series) {
    const color = s.rgb || [100, 100, 100];
    const thickness = s.isHighlighted ? 3 : 2;
    for (let i = 0; i < xValues.length - 1; i++) {
      const x0 = scaleX(xValues[i]);
      const y0 = scaleY(s.values[i]);
      const x1 = scaleX(xValues[i + 1]);
      const y1 = scaleY(s.values[i + 1]);
      canvas.drawLine(x0, y0, x1, y1, color, thickness);
    }
  }

  return canvas.toPNG();
}

/**
 * Generates and writes all 5 required Phase 4 plots in SVG and PNG.
 */
function generateAllStalenessPlots(summaryData, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const stalenessLevels = [0, 10, 20, 30, 40, 50];

  // Helper to extract series data from summary
  const getSeriesData = (modelKey, metricKey, mechanism = 'mixed') => {
    const values = [];
    const ciLower = [];
    const ciUpper = [];

    for (const s of stalenessLevels) {
      const cell = summaryData.find(
        row => row.model === modelKey && row.staleness === s && row.mechanism === mechanism
      );
      if (cell && cell[metricKey]) {
        values.push(cell[metricKey].mean * 100);
        ciLower.push(cell[metricKey].ciLower * 100);
        ciUpper.push(cell[metricKey].ciUpper * 100);
      } else {
        values.push(0);
        ciLower.push(0);
        ciUpper.push(0);
      }
    }
    return { values, ciLower, ciUpper };
  };

  // -------------------------------------------------------------------------
  // FIGURE 1 (HEADLINE): False-Available Rate in Top-1 vs. Staleness
  // -------------------------------------------------------------------------
  const fig1Series = [
    {
      name: 'CareBridge (unknown_aware)',
      color: PALETTE.unknown_aware.hex,
      rgb: PALETTE.unknown_aware.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (unknown_aware)', 'falseAvailable'),
    },
    {
      name: 'CareBridge (assume_available)',
      color: PALETTE.assume_available.hex,
      rgb: PALETTE.assume_available.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (assume_available)', 'falseAvailable'),
    },
    {
      name: 'CareBridge (trust_last_reported)',
      color: PALETTE.trust_last_reported.hex,
      rgb: PALETTE.trust_last_reported.rgb,
      isDashed: true,
      ...getSeriesData('CareBridge (trust_last_reported)', 'falseAvailable'),
    },
    {
      name: 'Nearest Eligible',
      color: PALETTE.nearest_eligible.hex,
      rgb: PALETTE.nearest_eligible.rgb,
      isDashed: true,
      ...getSeriesData('Nearest Eligible', 'falseAvailable'),
    },
    {
      name: 'Nearest Verified',
      color: PALETTE.nearest_verified.hex,
      rgb: PALETTE.nearest_verified.rgb,
      isDashed: true,
      ...getSeriesData('Nearest Verified', 'falseAvailable'),
    },
    {
      name: 'Always Tier 1',
      color: PALETTE.always_tier1.hex,
      rgb: PALETTE.always_tier1.rgb,
      isDashed: true,
      ...getSeriesData('Always Tier 1', 'falseAvailable'),
    },
    {
      name: 'Random Eligible',
      color: PALETTE.random_eligible.hex,
      rgb: PALETTE.random_eligible.rgb,
      isDashed: true,
      ...getSeriesData('Random Eligible', 'falseAvailable'),
    },
  ];

  const fig1Svg = buildSVGLineChart({
    title: 'Figure 1: False-Available Rate in Top-1 vs. Capacity Staleness (Primary Safety Outcome)',
    yLabel: 'False-Available Rate in Top-1 (%)',
    xValues: stalenessLevels,
    series: fig1Series,
    yMax: 50,
  });
  const fig1Png = buildRasterPNG({ xValues: stalenessLevels, series: fig1Series, yMax: 50 });

  fs.writeFileSync(path.join(outputDir, 'fig1_false_available_vs_staleness.svg'), fig1Svg);
  fs.writeFileSync(path.join(outputDir, 'fig1_false_available_vs_staleness.png'), fig1Png);

  // -------------------------------------------------------------------------
  // FIGURE 2: Top-1 Suitable Rate vs. Staleness
  // -------------------------------------------------------------------------
  const fig2Series = [
    {
      name: 'CareBridge (unknown_aware)',
      color: PALETTE.unknown_aware.hex,
      rgb: PALETTE.unknown_aware.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (unknown_aware)', 'top1Suitable'),
    },
    {
      name: 'CareBridge (assume_available)',
      color: PALETTE.assume_available.hex,
      rgb: PALETTE.assume_available.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (assume_available)', 'top1Suitable'),
    },
    {
      name: 'CareBridge (trust_last_reported)',
      color: PALETTE.trust_last_reported.hex,
      rgb: PALETTE.trust_last_reported.rgb,
      isDashed: true,
      ...getSeriesData('CareBridge (trust_last_reported)', 'top1Suitable'),
    },
    {
      name: 'Nearest Eligible',
      color: PALETTE.nearest_eligible.hex,
      rgb: PALETTE.nearest_eligible.rgb,
      isDashed: true,
      ...getSeriesData('Nearest Eligible', 'top1Suitable'),
    },
    {
      name: 'Nearest Verified',
      color: PALETTE.nearest_verified.hex,
      rgb: PALETTE.nearest_verified.rgb,
      isDashed: true,
      ...getSeriesData('Nearest Verified', 'top1Suitable'),
    },
    {
      name: 'Always Tier 1',
      color: PALETTE.always_tier1.hex,
      rgb: PALETTE.always_tier1.rgb,
      isDashed: true,
      ...getSeriesData('Always Tier 1', 'top1Suitable'),
    },
    {
      name: 'Random Eligible',
      color: PALETTE.random_eligible.hex,
      rgb: PALETTE.random_eligible.rgb,
      isDashed: true,
      ...getSeriesData('Random Eligible', 'top1Suitable'),
    },
  ];

  const fig2Svg = buildSVGLineChart({
    title: 'Figure 2: Top-1 Suitable Rate vs. Capacity Staleness (Effectiveness Outcome)',
    yLabel: 'Top-1 Suitable Rate (%)',
    xValues: stalenessLevels,
    series: fig2Series,
    yMax: 100,
  });
  const fig2Png = buildRasterPNG({ xValues: stalenessLevels, series: fig2Series, yMax: 100 });

  fs.writeFileSync(path.join(outputDir, 'fig2_top1_suitable_vs_staleness.svg'), fig2Svg);
  fs.writeFileSync(path.join(outputDir, 'fig2_top1_suitable_vs_staleness.png'), fig2Png);

  // -------------------------------------------------------------------------
  // FIGURE 3: Trade-off Plot (False Available vs. Missed Opportunities)
  // -------------------------------------------------------------------------
  const fig3Series = [
    {
      name: 'CareBridge (unknown_aware) - False-Available',
      color: PALETTE.unknown_aware.hex,
      rgb: PALETTE.unknown_aware.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (unknown_aware)', 'falseAvailable'),
    },
    {
      name: 'CareBridge (unknown_aware) - Missed-Opportunity',
      color: '#004085',
      rgb: [0, 64, 133],
      isDashed: true,
      ...getSeriesData('CareBridge (unknown_aware)', 'missedOpportunity'),
    },
    {
      name: 'CareBridge (assume_available) - False-Available',
      color: PALETTE.assume_available.hex,
      rgb: PALETTE.assume_available.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (assume_available)', 'falseAvailable'),
    },
    {
      name: 'CareBridge (assume_available) - Missed-Opportunity',
      color: '#842029',
      rgb: [132, 32, 41],
      isDashed: true,
      ...getSeriesData('CareBridge (assume_available)', 'missedOpportunity'),
    },
  ];

  const fig3Svg = buildSVGLineChart({
    title: 'Figure 3: Clinical Safety vs. Efficiency Trade-off: False-Available vs. Missed Opportunities',
    yLabel: 'Rate (%) across Staleness Levels',
    xValues: stalenessLevels,
    series: fig3Series,
    yMax: 40,
  });
  const fig3Png = buildRasterPNG({ xValues: stalenessLevels, series: fig3Series, yMax: 40 });

  fs.writeFileSync(path.join(outputDir, 'fig3_tradeoff_safety_vs_efficiency.svg'), fig3Svg);
  fs.writeFileSync(path.join(outputDir, 'fig3_tradeoff_safety_vs_efficiency.png'), fig3Png);

  // -------------------------------------------------------------------------
  // FIGURE 4: Share of Top-1 Recommendations Flagged "Unknown"
  // -------------------------------------------------------------------------
  const fig4Series = [
    {
      name: 'CareBridge (unknown_aware)',
      color: PALETTE.unknown_aware.hex,
      rgb: PALETTE.unknown_aware.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (unknown_aware)', 'flaggedUnknown'),
    },
    {
      name: 'CareBridge (assume_available)',
      color: PALETTE.assume_available.hex,
      rgb: PALETTE.assume_available.rgb,
      isHighlighted: true,
      ...getSeriesData('CareBridge (assume_available)', 'flaggedUnknown'),
    },
    {
      name: 'CareBridge (trust_last_reported)',
      color: PALETTE.trust_last_reported.hex,
      rgb: PALETTE.trust_last_reported.rgb,
      isDashed: true,
      ...getSeriesData('CareBridge (trust_last_reported)', 'flaggedUnknown'),
    },
  ];

  const fig4Svg = buildSVGLineChart({
    title: 'Figure 4: Decision-Support Transparency: Share of Top-1 Recommendations Flagged Unknown',
    yLabel: 'Share of Top-1 Flagged "Capacity Unknown" (%)',
    xValues: stalenessLevels,
    series: fig4Series,
    yMax: 80,
  });
  const fig4Png = buildRasterPNG({ xValues: stalenessLevels, series: fig4Series, yMax: 80 });

  fs.writeFileSync(path.join(outputDir, 'fig4_flagged_unknown_share.svg'), fig4Svg);
  fs.writeFileSync(path.join(outputDir, 'fig4_flagged_unknown_share.png'), fig4Png);

  // -------------------------------------------------------------------------
  // FIGURE 5: Sensitivity Analysis for Drift Probability (p_drift in {0.1, 0.3, 0.5})
  // -------------------------------------------------------------------------
  const getDriftSeries = (modelKey, pDriftVal) => {
    const values = [];
    for (const s of stalenessLevels) {
      const cell = summaryData.find(
        row => row.model === modelKey && row.staleness === s && row.pDrift === pDriftVal
      );
      values.push(cell && cell.falseAvailable ? cell.falseAvailable.mean * 100 : 0);
    }
    return values;
  };

  const fig5Series = [
    {
      name: 'assume_available (p_drift = 0.5)',
      color: '#800000',
      rgb: [128, 0, 0],
      isHighlighted: true,
      values: getDriftSeries('CareBridge (assume_available)', 0.5),
    },
    {
      name: 'assume_available (p_drift = 0.3, default)',
      color: '#d62728',
      rgb: [214, 39, 40],
      isHighlighted: true,
      values: getDriftSeries('CareBridge (assume_available)', 0.3),
    },
    {
      name: 'assume_available (p_drift = 0.1)',
      color: '#ff9896',
      rgb: [255, 152, 150],
      values: getDriftSeries('CareBridge (assume_available)', 0.1),
    },
    {
      name: 'unknown_aware (p_drift = 0.5)',
      color: '#084081',
      rgb: [8, 64, 129],
      isDashed: true,
      values: getDriftSeries('CareBridge (unknown_aware)', 0.5),
    },
    {
      name: 'unknown_aware (p_drift = 0.3, default)',
      color: '#1f77b4',
      rgb: [31, 119, 180],
      isDashed: true,
      values: getDriftSeries('CareBridge (unknown_aware)', 0.3),
    },
    {
      name: 'unknown_aware (p_drift = 0.1)',
      color: '#9ecae1',
      rgb: [158, 202, 225],
      isDashed: true,
      values: getDriftSeries('CareBridge (unknown_aware)', 0.1),
    },
  ];

  const fig5Svg = buildSVGLineChart({
    title: 'Figure 5: Sensitivity Analysis: False-Available Rate across Drift Probabilities',
    yLabel: 'False-Available Rate in Top-1 (%)',
    xValues: stalenessLevels,
    series: fig5Series,
    yMax: 50,
  });
  const fig5Png = buildRasterPNG({ xValues: stalenessLevels, series: fig5Series, yMax: 50 });

  fs.writeFileSync(path.join(outputDir, 'fig5_sensitivity_drift_probabilities.svg'), fig5Svg);
  fs.writeFileSync(path.join(outputDir, 'fig5_sensitivity_drift_probabilities.png'), fig5Png);
}

module.exports = {
  generateAllStalenessPlots,
  buildSVGLineChart,
};
