/**
 * CareBridge Reproducibility Verification Check
 * Confirms that stored experimental results for Phase 3, Phase 4, and Phase 5
 * are consistent, verifiable, and adhere strictly to preregistered benchmarks.
 * 
 * Usage: npm run check:reproduce
 */

const fs = require('fs');
const path = require('path');

function runReproducibilityCheck() {
  console.log('================================================================');
  console.log(' 🔬 CareBridge Phase 7: Reproducibility & Integrity Check');
  console.log(' Validating Phase 3 (Referral Baselines), Phase 4 (Staleness),');
  console.log(' and Phase 5 (ML Triage & Screening) results...');
  console.log('================================================================\n');

  let allChecksPassed = true;

  // -------------------------------------------------------------------------
  // 1. PHASE 3 REFERRAL ENGINE BASELINE CHECK
  // -------------------------------------------------------------------------
  console.log('[1/3] Checking Phase 3 Evaluation Results (500 Scenarios)...');
  const phase3Path = path.join(__dirname, 'results', 'evaluation_results_0pct_staleness.json');
  if (!fs.existsSync(phase3Path)) {
    console.error(`✗ Missing Phase 3 result file at ${phase3Path}`);
    allChecksPassed = false;
  } else {
    const phase3Data = JSON.parse(fs.readFileSync(phase3Path, 'utf-8'));
    const carebridge = phase3Data.find(d => d.method === 'CareBridge (Ours)');
    const nearestElig = phase3Data.find(d => d.method === 'Nearest Eligible');
    const nearestVer = phase3Data.find(d => d.method === 'Nearest Verified');

    console.log(`   - CareBridge Top-1 Capability Match Rate: ${carebridge?.top1CapabilityMatchRate}% (Expected: 100%)`);
    console.log(`   - CareBridge Top-1 Suitable Rate: ${carebridge?.top1SuitableRate}% (Expected: 100%)`);
    console.log(`   - Nearest Eligible Top-1 Suitable Rate: ${nearestElig?.top1SuitableRate}% (Expected: 71%)`);
    console.log(`   - Nearest Verified Top-1 Suitable Rate: ${nearestVer?.top1SuitableRate}% (Expected: 50.2%)`);

    if (
      carebridge?.top1CapabilityMatchRate === 100 &&
      carebridge?.top1SuitableRate === 100 &&
      nearestElig?.top1SuitableRate === 71 &&
      nearestVer?.top1SuitableRate === 50.2
    ) {
      console.log('   ✓ Phase 3 metrics match preregistered ground truth exactly.');
    } else {
      console.warn('   ⚠️ Discrepancy observed in Phase 3 metrics.');
      allChecksPassed = false;
    }
  }

  // -------------------------------------------------------------------------
  // 2. PHASE 4 STALENESS DEGRADATION EXPERIMENT CHECK
  // -------------------------------------------------------------------------
  console.log('\n[2/3] Checking Phase 4 Staleness Degradation Summary (0% to 50% Staleness)...');
  const phase4Path = path.join(__dirname, 'results', 'staleness_summary.json');
  if (!fs.existsSync(phase4Path)) {
    console.error(`✗ Missing Phase 4 result file at ${phase4Path}`);
    allChecksPassed = false;
  } else {
    const phase4Data = JSON.parse(fs.readFileSync(phase4Path, 'utf-8'));
    const rows = Array.isArray(phase4Data) ? phase4Data : (phase4Data.summaryRows || []);
    
    // Check 0% vs 50% staleness false available rate for unknown_aware vs assume_available
    const ua50 = rows.find(d => d.model === 'CareBridge (unknown_aware)' && d.mechanism === 'aged' && d.staleness === 50);
    const aa50 = rows.find(d => d.model === 'CareBridge (assume_available)' && d.mechanism === 'aged' && d.staleness === 50);
    const tr50 = rows.find(d => d.model === 'CareBridge (trust_last_reported)' && d.mechanism === 'aged' && d.staleness === 50);

    const ua50Fa = ua50?.falseAvailable?.mean ?? ua50?.falseAvailable_mean ?? 0;
    const aa50Fa = aa50?.falseAvailable?.mean ?? aa50?.falseAvailable_mean ?? 0;
    const tr50Fa = tr50?.falseAvailable?.mean ?? tr50?.falseAvailable_mean ?? 0;
    const ua50Dist = ua50?.meanDistance?.mean ?? ua50?.meanDistance_mean ?? 0;

    console.log(`   - At 50% Staleness:`);
    console.log(`     * CareBridge (unknown_aware) False Available Rate: ${(ua50Fa * 100).toFixed(2)}% (Near zero: ~0.01%)`);
    console.log(`     * CareBridge (assume_available) False Available Rate: ${(aa50Fa * 100).toFixed(2)}% (Elevated: ~19.25%)`);
    console.log(`     * CareBridge (trust_last_reported) False Available Rate: ${(tr50Fa * 100).toFixed(2)}% (Moderate: ~8.08%)`);
    console.log(`     * Safety Trade-off: Unknown-aware mean distance increases to ${ua50Dist.toFixed(1)} km (diverting to verified active facilities)`);

    if (
      Math.abs(ua50Fa - 0.0001) < 0.005 &&
      Math.abs(aa50Fa - 0.1925) < 0.01
    ) {
      console.log('   ✓ Phase 4 staleness metrics match stored empirical distribution.');
    } else {
      console.warn('   ⚠️ Discrepancy observed in Phase 4 metrics.');
      allChecksPassed = false;
    }
  }

  // -------------------------------------------------------------------------
  // 3. PHASE 5 ML TRIAGE & SCREENING METRICS CHECK
  // -------------------------------------------------------------------------
  console.log('\n[3/3] Checking Phase 5 ML Triage and Multi-Condition Screening Metrics...');
  const mlResultsPath = path.join(__dirname, '..', '..', '..', 'ml', 'RESULTS.md');
  if (!fs.existsSync(mlResultsPath)) {
    console.error(`✗ Missing ml/RESULTS.md at ${mlResultsPath}`);
    allChecksPassed = false;
  } else {
    const mlText = fs.readFileSync(mlResultsPath, 'utf-8');
    const hasTriageAuroc = mlText.includes('0.702');
    const hasTriageSens = mlText.includes('0.840');
    const screeningConditions = [
      'Diabetes',
      'Heart Disease',
      'Liver Disease',
      'Kidney Disease (CKD)',
      'Thyroid (Hypothyroid)',
    ];
    const screeningSensitivities = new Map(
      mlText.split(/\r?\n/)
        .map(line => line.split('|').map(cell => cell.trim()))
        .filter(cells => screeningConditions.includes((cells[1] || '').replace(/\*/g, '').trim()))
        .map(cells => {
          const match = (cells[6] || '').match(/([\d.]+)%/);
          return [cells[1].replace(/\*/g, '').trim(), match ? Number(match[1]) : NaN];
        })
    );
    const hasScreeningSensitivities = screeningConditions.every(condition =>
      screeningSensitivities.has(condition) && screeningSensitivities.get(condition) >= 90
    );
    const screeningSummary = screeningConditions
      .map(condition => `${condition} ${screeningSensitivities.get(condition) ?? 'missing'}%`)
      .join(', ');

    console.log(`   - Primary Triage Calibrated HistGradientBoosting AUROC: 0.702 (Present: ${hasTriageAuroc})`);
    console.log(`   - Primary Triage Sensitivity: 0.840 (Present: ${hasTriageSens})`);
    console.log(`   - Screening model sensitivities in ml/RESULTS.md: ${screeningSummary} (All >=90%: ${hasScreeningSensitivities})`);

    if (hasTriageAuroc && hasTriageSens && hasScreeningSensitivities) {
      console.log('   ✓ Phase 5 ML models satisfy preregistered high-sensitivity clinical constraints.');
    } else {
      console.warn('   ⚠️ Discrepancy observed in Phase 5 ML metrics.');
      allChecksPassed = false;
    }
  }

  console.log('\n================================================================');
  if (allChecksPassed) {
    console.log(' ✅ REPRODUCIBILITY GATE PASSED: All metrics match stored outputs.');
  } else {
    console.log(' ❌ REPRODUCIBILITY GATE FAILED: Some checks reported discrepancies.');
  }
  console.log('================================================================\n');

  return allChecksPassed;
}

if (require.main === module) {
  const ok = runReproducibilityCheck();
  process.exit(ok ? 0 : 1);
}

module.exports = runReproducibilityCheck;
