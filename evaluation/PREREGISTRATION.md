# CareBridge Research Preregistration: Hospital Capacity Telemetry Staleness Experiment

> **DOCUMENT STATUS: FROZEN & LOCKED**  
> **Registration Date**: October 2026  
> **Protocol Rule**: This document is registered and locked BEFORE running the Phase 4 staleness experiments. Hypotheses, primary metrics, and analytical procedures defined herein cannot be modified post-experiment.

---

## 1. Research Context & Purpose

In centralized hospital referral systems, decision-support tools frequently query institutional bed and equipment telemetry. However, real-world telemetry degrades rapidly due to intermittent reporting, communication failures, and administrative burden.

Standard referral algorithms commit one of two errors when telemetry is stale or missing:
1. **The Naive Assumption (`assume_available`)**: Assuming that an uncontacted hospital or an aged report remains available.
2. **The Staleness Disregard (`trust_last_reported`)**: Directly trusting a stale report without adjusting for elapsed time.

**CareBridge Core Intervention (`unknown_aware`)**:
Treat stale telemetry (exceeding urgency-specific freshness thresholds) and missing telemetry as **"unknown"**. In ranking, "unknown" is penalized relative to fresh availability ($0.3$ vs $1.0$), while generating an explicit decision-support warning requiring telephone confirmation.

---

## 2. Research Question (RQ)

> **RQ**: How does stale or missing hospital capacity data affect referral recommendation quality, and does treating stale data as **"unknown"** reduce harmful errors compared with treating it as **"available"**?

---

## 3. Formal Hypotheses

### Hypothesis 1 (H1) - Primary Safety Benefit:
> **H1**: As hospital capacity staleness rises ($s \in [0\%, 50\%]$), the **false-available rate in Top-1 recommendations** increases substantially faster for the naive `assume_available` mode and baseline methods than for CareBridge's `unknown_aware` mode.

### Hypothesis 2 (H2) - Empirical Cost / Efficiency Trade-Off:
> **H2**: CareBridge's `unknown_aware` mode will experience an efficiency cost in **Top-1 suitable rate** and an increase in **missed-opportunity rate** relative to ideal conditions, because it demotes hospitals whose beds are actually available in the hidden network state but whose reports are stale. We commit to honestly quantifying this exact trade-off.

### Hypothesis 3 (H3) - Robustness Over Conventional Baselines:
> **H3**: At every staleness level ($0\%$ to $50\%$), both capacity-aware modes (`unknown_aware` and `assume_available`) will achieve higher Top-1 suitability and lower false-available rates than standard proximity and tier baselines (`nearestVerified` and `alwaysTier1`), because proximity and tier heuristics completely ignore clinical capability matching.

---

## 4. Primary and Secondary Metrics

### Primary Metric:
- **False-Available Rate in Top-1 Recommendations ($\text{FAR}_1$)**:
  $$\text{FAR}_1 = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(\text{Top-1 hospital was selected as available, but hidden true state has } 0 \text{ beds})$$
  *Clinical Impact*: Represents the fraction of patients who would be dispatched to a facility that in reality has no bed capacity (futile transfer).

### Secondary Metrics:
1. **Top-1 Suitable Rate ($\text{SR}_1$)**:
   $$\text{SR}_1 = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(\text{Top-1 hospital is verified, clinically matches required specialty/equipment, AND has true capacity})$$
2. **Top-3 Hit Rate ($\text{HR}_3$)**:
   Fraction of referrals where at least one of the top-3 recommended hospitals is in the ground-truth suitable set.
3. **Normalized Discounted Cumulative Gain at Rank 3 ($\text{NDCG@3}$)** & **Mean Reciprocal Rank ($\text{MRR}$)**:
   Measures ranking quality against the set of all ground-truth suitable facilities.
4. **Capability-Match Rate ($\text{CMR}_1$)**:
   Fraction of top-1 recommendations possessing verified status, the required specialty, and all necessary equipment (regardless of bed state).
5. **Flagged Unknown Rate ($\text{FUR}_1$)**:
   Fraction of top-1 recommendations carrying the explicit clinical warning: *"Capacity unknown: confirm availability by telephone prior to transfer dispatch"*.
6. **Missed-Opportunity Rate ($\text{MOR}$)**:
   Fraction of scenarios where at least one suitable hospital existed in the network, but zero suitable hospitals appeared in the top-3 recommendations (capturing over-cautious exclusion or demotion).
7. **No-Result Rate ($\text{NRR}$)**:
   Fraction of scenarios returning an empty recommendation list.
8. **Mean Straight-Line Distance ($\bar{D}_1$)**:
   Average straight-line Haversine distance (in km) to the Top-1 hospital.

---

## 5. Experimental Design & Seed Separation

### Seed Protocol:
To avoid p-hacking and overfitting:
- **Tuning Seeds**: Seeds `1` through `10` are reserved exclusively for parameter sensitivity tuning (e.g., assessing unknown score values $0.1, 0.3, 0.5$).
- **Test Seeds**: Seeds `101` through `130` ($K = 30$ independent random seeds) are reserved exclusively for reported evaluation.
- **Independence Guarantee**: Tuning seeds and test seeds are strictly disjoint.

### Experimental Matrix:
- **Scenarios**: 500 fixed synthetic referral scenarios across Tamil Nadu districts (incorporating remote patients, specialist deficits, and saturated Tier 1 centers).
- **Staleness Levels ($s$)**: $0\%, 10\%, 20\%, 30\%, 40\%, 50\%$ of network hospitals.
- **Staleness Mechanisms**:
  - `aged`: Fraction $s$ of hospitals have telemetry older than the urgency freshness threshold.
  - `missing`: Fraction $s$ of hospitals have never reported telemetry.
  - `mixed`: Half aged, half missing (primary evaluation mechanism).
- **Network Capacity Drift Probability ($p_{\text{drift}}$)**:
  - Default: $0.30$ (30% probability that true bed availability shifted since the aged report was filed).
  - Sensitivity values: $0.10$ and $0.50$.
- **Models Evaluated (7 Models)**:
  1. `CareBridge (unknown_aware)` [Proposed Engine]
  2. `CareBridge (assume_available)` [Naive Comparison Engine]
  3. `CareBridge (trust_last_reported)` [Unadjusted Historical Baseline]
  4. `Nearest Eligible` [Strong Proximity + Hard Filters Baseline]
  5. `Nearest Verified` [Pure Proximity Baseline]
  6. `Always Tier 1` [Quaternary Bias Baseline]
  7. `Random Eligible` [Uniform Selection Baseline]

---

## 6. Statistical Inference & Reporting Plan

1. **Point Estimates**: Reported as the mean across 30 test seeds ($30 \times 500 = 15,000$ referral evaluations per cell).
2. **Confidence Intervals**: 95% bootstrap confidence intervals computed using 1,000 bootstrap resamples across seeds.
3. **Paired Comparisons**:
   Paired difference $\Delta = \text{Metric}(\text{unknown\_aware}) - \text{Metric}(\text{assume\_available})$ evaluated for each seed-scenario pair. Paired bootstrap 95% CIs and Wilcoxon signed-rank test p-values reported with Cliff's delta effect sizes.
4. **Honest Reporting Commitment**:
   Null findings, non-significant differences, and the exact trade-off cost of `unknown_aware` (missed opportunities) will be reported with the same prominence as safety benefits.

---

## 7. Scope & Permitted Scientific Claims

- **Permitted Claims**:
  - Relative algorithmic behavior of referral strategies under simulated telemetry staleness.
  - Mathematical demonstration of risk reduction under defined drift models.
- **Explicitly Prohibited Claims**:
  - No claims regarding reduced patient mortality, improved clinical health outcomes, reduced transit delays, or reduced healthcare costs.
  - No claims of production clinical validity without prospective human-in-the-loop clinical trial verification.
