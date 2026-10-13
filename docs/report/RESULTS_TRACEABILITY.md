# CareBridge: Results Traceability Matrix & Figures Index

This document establishes 100% empirical traceability between the research claims made in [`REPORT.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/report/REPORT.md) and the underlying data artifacts, benchmark evaluations, automated tests, and source code.

---

## 1. Claims-to-Results Traceability Table

| Claim in REPORT.md | Exact Metric / Finding Reported | Source File & Location | Verification Method |
| :--- | :--- | :--- | :--- |
| **Phase 3 Baselines (0% Staleness)** | CareBridge Top-1 Capability Match: **100%**<br>Top-1 Suitable: **100%**<br>MRR: **1.000**<br>Mean Distance: **24.8 km** | [`backend/src/evaluation/results/evaluation_results_0pct_staleness.json`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/results/evaluation_results_0pct_staleness.json#L3-L13) | `node src/evaluation/reproducibilityCheck.js` |
| **Heuristic Failure (Nearest Verified)** | Top-1 Suitable: **50.2%**<br>Top-1 Capability: **71.2%**<br>MRR: **0.692** | [`backend/src/evaluation/results/evaluation_results_0pct_staleness.json`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/results/evaluation_results_0pct_staleness.json#L27-L37) | `node src/evaluation/reproducibilityCheck.js` |
| **Heuristic Failure (Always Tier 1)** | Top-1 Suitable: **67.6%**<br>MRR: **0.809**<br>Mean Distance: **17.9 km** | [`backend/src/evaluation/results/evaluation_results_0pct_staleness.json`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/results/evaluation_results_0pct_staleness.json#L39-L49) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 4 Primary Safety (50% Staleness)** | `assume_available` False-Available: **19.3%** [18.9%, 19.6%]<br>`unknown_aware` False-Available: **0.0%** [0.0%, 0.0%] | [`backend/src/evaluation/results/staleness_summary.json`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/results/staleness_summary.json)<br>and [`backend/src/evaluation/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/RESULTS.md#L47-L49) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 4 Statistical Significance** | Paired difference $\Delta = -19.25\%$ [$-19.61\%, -18.85\%$], $p < 0.0001$ (Wilcoxon), Cliff's $\delta = -1.000$ | [`backend/src/evaluation/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/RESULTS.md#L73-L75) | `npm run experiment` |
| **The Cost of Caution (Distance Penalty)** | `unknown_aware` distance rises: **24.8 km** (0%) $\to$ **33.6 km** (20%) $\to$ **60.4 km** (50%) | [`backend/src/evaluation/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/evaluation/RESULTS.md#L20-L21) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 5 Triage AUROC & Sensitivity** | AUROC: **0.702** [0.511–0.855]<br>Sensitivity: **84.0%** [68.0–96.2%]<br>Brier Score: **0.2186** | [`ml/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/RESULTS.md#L25-L36) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 5 Diabetes Screening** | Sensitivity: **90.3%** [86.8–94.0%]<br>AUROC: **0.833** [0.806–0.862]<br>Threshold: **0.24** | [`ml/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/RESULTS.md#L60) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 5 Heart Disease Screening** | Sensitivity: **90.6%** [85.7–95.3%]<br>AUROC: **0.899** [0.863–0.931]<br>Threshold: **0.28** | [`ml/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/RESULTS.md#L61) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 5 Liver Disease Screening** | Sensitivity: **90.4%** [87.4–92.9%]<br>AUROC: **0.744** [0.704–0.780]<br>Threshold: **0.56** | [`ml/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/RESULTS.md#L62) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 5 Kidney Disease (CKD)** | Sensitivity: **95.6%** [92.9–97.9%]<br>AUROC: **1.000** [0.999–1.000]<br>Brier Score: **0.0058** | [`ml/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/RESULTS.md#L63) | `node src/evaluation/reproducibilityCheck.js` |
| **Phase 5 Thyroid (Hypothyroid)** | Sensitivity: **90.1%** [84.8–95.0%]<br>AUROC: **0.990** [0.978–0.997]<br>Brier Score: **0.0082** | [`ml/RESULTS.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/RESULTS.md#L64) | `node src/evaluation/reproducibilityCheck.js` |
| **Authorisation Matrix (5 Roles)** | 13 endpoints tested across 5 roles; 0 privilege escalation bypasses | [`docs/AUTH_MATRIX.md`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/AUTH_MATRIX.md) | `npx jest src/tests/authMatrix.test.js` |
| **IDOR Defense Indistinguishability** | Nonexistent vs forbidden queries return identical generic 404 responses | [`backend/src/tests/phase7.test.js`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/tests/phase7.test.js#L142-L171) | `npx jest src/tests/phase7.test.js` |
| **API Latency Measurements** | `/api/referrals/recommend`: Median ~25–35 ms<br>`/api/referrals/assess`: Median ~22–45 ms | [`backend/src/tests/phase7.test.js`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/tests/phase7.test.js#L221-L284) | `npx jest src/tests/phase7.test.js` |

---

## 2. Empirical Figures & Plots Index

All visualization assets are generated directly from experimental data and stored in [`docs/plots/`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots) as both vector (`.svg`) and bitmap (`.png`) formats:

| Figure ID | File Paths | Description & Clinical Insight |
| :--- | :--- | :--- |
| **Figure 1** | [`docs/plots/fig1_false_available_vs_staleness.png`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig1_false_available_vs_staleness.png)<br>[`docs/plots/fig1_false_available_vs_staleness.svg`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig1_false_available_vs_staleness.svg) | **False-Available Referral Error vs. Staleness Level (0% to 50%)**<br>Illustrates how naive `assume_available` escalates to 19.3% false availability while `unknown_aware` remains flat at 0.0%. |
| **Figure 2** | [`docs/plots/fig2_top1_suitable_vs_staleness.png`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig2_top1_suitable_vs_staleness.png)<br>[`docs/plots/fig2_top1_suitable_vs_staleness.svg`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig2_top1_suitable_vs_staleness.svg) | **Top-1 Clinical Suitability Degradation**<br>Demonstrates how unadjusted heuristics deteriorate in suitability compared to CareBridge unknown-aware routing. |
| **Figure 3** | [`docs/plots/fig3_tradeoff_safety_vs_efficiency.png`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig3_tradeoff_safety_vs_efficiency.png)<br>[`docs/plots/fig3_tradeoff_safety_vs_efficiency.svg`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig3_tradeoff_safety_vs_efficiency.svg) | **The Fundamental Safety vs. Efficiency Trade-Off**<br>Plots straight-line distance penalty against false-available rate, demonstrating the empirical "cost of caution". |
| **Figure 4** | [`docs/plots/fig4_flagged_unknown_share.png`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig4_flagged_unknown_share.png)<br>[`docs/plots/fig4_flagged_unknown_share.svg`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig4_flagged_unknown_share.svg) | **Proportion of Recommendations Flagged as Unknown Capacity**<br>Shows the visibility of unknown capacity flags surfaced to clinicians to trigger telephone confirmations. |
| **Figure 5** | [`docs/plots/fig5_sensitivity_drift_probabilities.png`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig5_sensitivity_drift_probabilities.png)<br>[`docs/plots/fig5_sensitivity_drift_probabilities.svg`](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/plots/fig5_sensitivity_drift_probabilities.svg) | **Sensitivity Analysis & Calibration Drift across Seed Distributions**<br>Empirical distributions of model outputs across 30 random seeds confirming statistical stability. |

---

## 3. Automated Reproducibility Command

To programmatically re-verify every claim in this table on a clean machine:
```powershell
# From project root:
cd backend
npm run check:reproduce
```
*Expected exit code:* `0` (`REPRODUCIBILITY GATE PASSED: All metrics match stored outputs.`).
