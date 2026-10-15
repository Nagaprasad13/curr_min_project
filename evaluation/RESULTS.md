# CareBridge Phase 4 Empirical Research Results & Discussion

> **NOTICE & CLINICAL DISCLAIMER:**  
> **Decision support only. A clinician must review every recommendation.**  
> All data analyzed herein is synthetic. The referral models, drift mechanisms, and staleness parameters are simulation constructs. This study evaluates the relative algorithmic behavior of decision-support ranking strategies under simulated telemetry degradation. It does **NOT** make claims of clinical diagnosis, improved patient survival, reduced ambulance transit delays, or reduced healthcare costs.

---

## 1. Executive Summary of Findings

Across 30 independent test seeds ($K = 30$, Seeds 101–130) and 500 clinical referral scenarios across Tamil Nadu ($15,000$ evaluations per experimental cell), we benchmarked the CareBridge `unknown_aware` referral engine against the naive `assume_available` strategy, the unadjusted `trust_last_reported` historical baseline, and four standard referral heuristics (`Nearest Eligible`, `Nearest Verified`, `Always Tier 1`, and `Random Eligible`).

### Key Empirical Findings:
1. **Primary Safety Finding (H1 Confirmed)**:
   - For the naive `assume_available` strategy, the **false-available rate in Top-1 recommendations** escalated rapidly from **0.0%** at 0% staleness to **9.3% [8.9%, 9.7%]** at 20% staleness and **19.3% [18.9%, 19.6%]** at 50% staleness.
   - For CareBridge `unknown_aware`, the false-available rate remained strictly **0.0% [0.0%, 0.0%]** across all staleness levels ($0\%$ to $50\%$).
   - The paired difference at 50% staleness is **$-19.25\%$ [$-19.61\%, -18.85\%$]** ($p < 0.0001$, Wilcoxon signed-rank test; Cliff's $\delta = -1.000$).
2. **Honest Quantification of the Cost of Caution (H2 Nuance & Distance Cost)**:
   - Because `unknown_aware` penalizes stale telemetry, it avoids dispatching patients to unconfirmed facilities.
   - Within the evaluated 40-hospital regional network, `unknown_aware` maintained 100% Top-1 suitability across the network by expanding its search horizon: **mean straight-line transit distance increased from 24.8 km (0% staleness) to 33.6 km (20% staleness) and 60.4 km (50% staleness)**.
   - In contrast, `assume_available` maintained an artificially short mean distance (20.0 km at 50% staleness), while producing **19.3% false-available referral errors in simulation** (recommendations to facilities that were full in the simulated network).
3. **Outperformance Over Conventional Heuristics (H3 Confirmed)**:
   - Both capacity-aware CareBridge modes vastly outperformed the common proximity heuristic `Nearest Verified` (which achieved only **50.2% Top-1 suitability** and a **27.8% false-available rate**) and the quaternary bias heuristic `Always Tier 1` (**67.6% Top-1 suitability** and **32.4% false-available rate**).

---

## 2. Benchmark Results Table

**Table 1**: Full Factorial Referral Performance across Staleness Levels ($s \in \{0\%, 20\%, 50\%\}$, Mixed Mechanism, 30 Test Seeds, 500 Scenarios/Seed). Means and 95% Bootstrap Confidence Intervals.

| Staleness | Referral Model / Strategy | Telemetry Handling | False-Available Rate $\downarrow$ (95% CI) | Top-1 Suitable Rate $\uparrow$ (95% CI) | Top-3 Hit Rate | NDCG@3 | Missed Opp. | Flagged Unknown | Mean Dist. |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0%** | **CareBridge (unknown_aware)** | Fresh evaluated (stale $\to$ unknown) | **0.0%** [0.0, 0.0] | **100.0%** [100.0, 100.0] | 100.0% | 1.000 | 0.0% | 0.0% | 24.8 km |
| 0% | CareBridge (assume_available) | Naive: Stale/missing $\to$ available | 0.0% [0.0, 0.0] | 100.0% [100.0, 100.0] | 100.0% | 1.000 | 0.0% | 0.0% | 24.8 km |
| 0% | CareBridge (trust_last_reported) | Historical: Unadjusted snapshot | 0.0% [0.0, 0.0] | 100.0% [100.0, 100.0] | 100.0% | 1.000 | 0.0% | 0.0% | 24.8 km |
| 0% | Nearest Eligible | Ignored (minimum distance) | 29.0% [29.0, 29.0] | 71.0% [71.0, 71.0] | 97.6% | 0.711 | 2.4% | 0.0% | 14.8 km |
| 0% | Nearest Verified | Ignored (proximity only) | 27.8% [27.8, 27.8] | 50.2% [50.2, 50.2] | 84.6% | 0.470 | 15.4% | 0.0% | 14.2 km |
| 0% | Always Tier 1 | Ignored (nearest Tier 1 hub) | 32.4% [32.4, 32.4] | 67.6% [67.6, 67.6] | 93.4% | 0.689 | 6.6% | 0.0% | 17.9 km |
| 0% | Random Eligible | Ignored (uniform random) | 29.3% [28.6, 30.1] | 70.2% [69.3, 71.0] | 96.7% | 0.701 | 3.3% | 0.0% | 215.5 km |
| **20%** | **CareBridge (unknown_aware)** | Fresh evaluated (stale $\to$ unknown) | **0.0%** [0.0, 0.0] | **100.0%** [100.0, 100.0] | 100.0% | 1.000 | 0.0% | 0.0% | 33.6 km |
| 20% | CareBridge (assume_available) | Naive: Stale/missing $\to$ available | 9.3% [8.9, 9.7] | 90.7% [90.3, 91.1] | 99.8% | 0.910 | 0.2% | 0.0% | 22.5 km |
| 20% | CareBridge (trust_last_reported) | Historical: Unadjusted snapshot | 2.0% [1.8, 2.1] | 98.0% [97.9, 98.2] | 100.0% | 0.982 | 0.0% | 0.0% | 29.4 km |
| 20% | Nearest Eligible | Ignored (minimum distance) | 29.0% [29.0, 29.0] | 71.0% [71.0, 71.0] | 97.6% | 0.711 | 2.4% | 0.0% | 14.8 km |
| 20% | Nearest Verified | Ignored (proximity only) | 27.8% [27.8, 27.8] | 50.2% [50.2, 50.2] | 84.6% | 0.470 | 15.4% | 0.0% | 14.2 km |
| 20% | Always Tier 1 | Ignored (nearest Tier 1 hub) | 32.4% [32.4, 32.4] | 67.6% [67.6, 67.6] | 93.4% | 0.689 | 6.6% | 0.0% | 17.9 km |
| 20% | Random Eligible | Ignored (uniform random) | 29.3% [28.6, 30.1] | 70.2% [69.3, 71.0] | 96.7% | 0.701 | 3.3% | 0.0% | 215.5 km |
| **50%** | **CareBridge (unknown_aware)** | Fresh evaluated (stale $\to$ unknown) | **0.0%** [0.0, 0.0] | **100.0%** [100.0, 100.0] | 100.0% | 0.998 | 0.0% | 0.0% | 60.4 km |
| 50% | CareBridge (assume_available) | Naive: Stale/missing $\to$ available | 19.3% [18.9, 19.6] | 80.8% [80.4, 81.1] | 98.6% | 0.814 | 1.5% | 0.0% | 20.0 km |
| 50% | CareBridge (trust_last_reported) | Historical: Unadjusted snapshot | 5.4% [5.0, 5.8] | 94.6% [94.2, 95.0] | 100.0% | 0.948 | 0.0% | 0.0% | 40.0 km |
| 50% | Nearest Eligible | Ignored (minimum distance) | 29.0% [29.0, 29.0] | 71.0% [71.0, 71.0] | 97.6% | 0.711 | 2.4% | 0.0% | 14.8 km |
| 50% | Nearest Verified | Ignored (proximity only) | 27.8% [27.8, 27.8] | 50.2% [50.2, 50.2] | 84.6% | 0.470 | 15.4% | 0.0% | 14.2 km |
| 50% | Always Tier 1 | Ignored (nearest Tier 1 hub) | 32.4% [32.4, 32.4] | 67.6% [67.6, 67.6] | 93.4% | 0.689 | 6.6% | 0.0% | 17.9 km |
| 50% | Random Eligible | Ignored (uniform random) | 29.3% [28.6, 30.1] | 70.2% [69.3, 71.0] | 96.7% | 0.701 | 3.3% | 0.0% | 215.5 km |

---

## 3. Paired Statistical Hypothesis Testing

To isolate the exact algorithmic treatment effect independent of scenario variation, we conducted paired seed-level comparisons across the 30 test seeds ($15,000$ paired cases per staleness level).

**Table 2**: Paired Inferential Comparisons (`unknown_aware` minus `assume_available`).

| Staleness Level | Outcome Metric | Mean Paired Difference $\Delta$ | 95% Bootstrap CI | Wilcoxon $p$-value | Cliff's $\delta$ Effect Size | Result |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **0%** | False-Available Rate | $0.00\%$ | $[0.00\%, 0.00\%]$ | $p = 1.000$ | $0.000$ | Equivalent at baseline |
| 0% | Top-1 Suitable Rate | $0.00\%$ | $[0.00\%, 0.00\%]$ | $p = 1.000$ | $0.000$ | Equivalent at baseline |
| **10%** | False-Available Rate | **$-4.72\%$** | $[-5.05\%, -4.39\%]$ | $p < 0.0001$ | $-1.000$ | Significant safety gain |
| 10% | Top-1 Suitable Rate | **$+4.72\%$** | $[+4.39\%, +5.05\%]$ | $p < 0.0001$ | $+1.000$ | Significant suitability gain |
| **20%** | False-Available Rate | **$-9.29\%$** | $[-9.73\%, -8.87\%]$ | $p < 0.0001$ | $-1.000$ | Significant safety gain |
| 20% | Top-1 Suitable Rate | **$+9.29\%$** | $[+8.87\%, +9.73\%]$ | $p < 0.0001$ | $+1.000$ | Significant suitability gain |
| **30%** | False-Available Rate | **$-13.01\%$** | $[-13.46\%, -12.57\%]$ | $p < 0.0001$ | $-1.000$ | Significant safety gain |
| 30% | Top-1 Suitable Rate | **$+13.01\%$** | $[+12.57\%, +13.47\%]$ | $p < 0.0001$ | $+1.000$ | Significant suitability gain |
| **50%** | False-Available Rate | **$-19.25\%$** | $[-19.61\%, -18.85\%]$ | $p < 0.0001$ | $-1.000$ | Significant safety gain |
| 50% | Top-1 Suitable Rate | **$+19.25\%$** | $[+18.87\%, +19.62\%]$ | $p < 0.0001$ | $+1.000$ | Significant suitability gain |

---

## 4. Evaluation of Hypotheses

### Hypothesis 1 (H1) - CONFIRMED:
> *H1 postulated that as staleness rises, the false-available rate for `assume_available` increases much faster than for `unknown_aware`.*
- **Verdict**: Strongly supported.
- At 50% staleness, `assume_available` commits false-available errors in nearly 1 out of every 5 emergency referrals (**19.3%**), whereas `unknown_aware` achieves **0.0%** false availability by refusing to treat stale telemetry as confirmed beds ($p < 0.0001$).
- Even the unadjusted historical baseline (`trust_last_reported`) suffers a **5.4%** false-available rate, demonstrating that simply reading the last recorded number without freshness discounting is clinically perilous.

### Hypothesis 2 (H2) - EMPIRICAL TRADE-OFF IDENTIFIED:
> *H2 postulated that `unknown_aware` incurs an efficiency cost by demoting hospitals whose beds are actually available in the true state but whose reports are stale.*
- **Verdict**: Confirmed with important geographic nuances.
- In our regional Tamil Nadu network with 40 facilities, there were sufficient alternative equipped facilities that `unknown_aware` maintained 100% Top-1 suitability.
- However, the **geographic transit cost** was substantial: mean straight-line transit distance rose from **24.8 km** to **60.4 km** at 50% staleness.
- Clinically, this reveals the fundamental trade-off: `unknown_aware` protects against transfer failure (dispatching to a full hospital) by routing to facilities with verified fresh capacity further away, unless the clinician explicitly elects to telephone and confirm the closer stale hospital.

### Hypothesis 3 (H3) - CONFIRMED:
> *H3 postulated that both capacity-aware modes outperform `Nearest Verified` and `Always Tier 1` at every staleness level.*
- **Verdict**: Strongly supported.
- `Nearest Verified` exhibits poor clinical suitability (**50.2%**) because proximity frequently routes patients to primary clinics lacking intensive care ventilators or specialists.
- `Always Tier 1` exhibits high false-available rates (**32.4%**) because quaternary centers experience regional saturation in our realistic true network state.

---

## 5. Sensitivity Analyses

1. **Drift Probability ($p_{\text{drift}} \in \{0.1, 0.3, 0.5\}$)**:
   - For `unknown_aware`: False-available rate remained 0.0% across all drift values.
   - For `assume_available` at 50% staleness: False-available rate scaled monotonically with drift: **6.4%** ($p_{\text{drift}} = 0.1$), **19.3%** ($p_{\text{drift}} = 0.3$), and **32.1%** ($p_{\text{drift}} = 0.5$).
2. **Biased Staleness (Tier 3 Facilities Stale More Often)**:
   - When Tier 3 facilities report telemetry with $3\times$ higher staleness probability, CareBridge `unknown_aware` performance remained unperturbed because Tier 3 facilities are rarely candidate targets for high-acuity ICU referrals.
3. **Freshness Threshold Scaling**:
   - Halving the urgency thresholds (emergency: 60m) increased the distance penalty moderately (+8.2 km mean distance) while maintaining 0% false availability.

---

## 6. Generated Figures & Visualizations

All publication figures were generated in both vector SVG and 24-bit PNG formats:
- **Figure 1 (Headline)**: `docs/plots/fig1_false_available_vs_staleness.svg` (and `.png`)
- **Figure 2 (Suitability)**: `docs/plots/fig2_top1_suitable_vs_staleness.svg` (and `.png`)
- **Figure 3 (Trade-off Curve)**: `docs/plots/fig3_tradeoff_safety_vs_efficiency.svg` (and `.png`)
- **Figure 4 (Transparency Telemetry)**: `docs/plots/fig4_flagged_unknown_share.svg` (and `.png`)
- **Figure 5 (Sensitivity Panel)**: `docs/plots/fig5_sensitivity_drift_probabilities.svg` (and `.png`)

---

## 7. Limitations & Threats to Validity

1. **Synthetic Simulation Network**: All 40 hospitals, equipment matrices, and 500 patient scenarios are synthetic models calibrated to Tamil Nadu geography. Real clinical deployment requires integration with state registry APIs (e.g., TN-CEA, ABDM).
2. **Assumed Drift Mechanics**: Telemetry drift was modeled via a stochastic transition probability ($p_{\text{drift}} = 0.3$). Real-world bed occupancy dynamics follow diurnal admission/discharge distributions and sudden epidemic surges.
3. **Distance Approximation**: Distances are strictly straight-line Haversine calculations and do not account for road topology, traffic congestion, or ambulance response times.
4. **Absence of Human Clinician Override in Benchmark**: In practice, a human clinician reviews the recommendation and may place a telephone call to an unconfirmed hospital 12 km away rather than sending an ambulance 60 km away.

---

## 8. Permitted vs. Prohibited Claims

- **Permitted Claims**:
  - Treats stale or missing telemetry as "unknown", mathematically eliminating false-available recommendations under the defined simulation model.
  - Demonstrates that naive availability assumptions cause a 19.3% error rate at 50% telemetry staleness.
  - Quantifies the exact geographic trade-off between confirmed availability and transit distance.
- **Strictly Prohibited Claims**:
  - No claim that CareBridge reduces patient mortality or improves health outcomes.
  - No claim that CareBridge shortens emergency transfer delays.
  - No claim that CareBridge reduces public healthcare expenditure.
