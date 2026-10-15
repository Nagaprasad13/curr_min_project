"""
train_triage.py
---------------
Training, calibration, bootstrap confidence intervals, subgroup analysis,
and evaluation for the CareBridge Triage Severity Model.
"""

import os
import sys
os.environ["LOKY_MAX_CPU_COUNT"] = "4"
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import json
import joblib
from datetime import date
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    roc_auc_score, average_precision_score, brier_score_loss,
    confusion_matrix, precision_score, recall_score
)

from triage_data_loader import (
    load_mimic_triage_data, split_by_patient, ALLOWED_TRIAGE_FEATURES
)
from approximate_news2 import compute_approximate_news2


def compute_expected_calibration_error(y_true, y_prob, n_bins=10):
    """Computes Expected Calibration Error (ECE)."""
    bin_edges = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    if n == 0:
        return 0.0
    for i in range(n_bins):
        bin_mask = (y_prob >= bin_edges[i]) & (y_prob < bin_edges[i + 1]) if i < n_bins - 1 else (y_prob >= bin_edges[i]) & (y_prob <= bin_edges[i + 1])
        bin_size = np.sum(bin_mask)
        if bin_size > 0:
            bin_acc = np.mean(y_true[bin_mask])
            bin_conf = np.mean(y_prob[bin_mask])
            ece += (bin_size / n) * np.abs(bin_acc - bin_conf)
    return float(ece)


def bootstrap_metric_ci(y_true, y_prob, metric_fn, n_bootstraps=1000, alpha=0.05, seed=42):
    """Computes non-parametric 95% bootstrap confidence interval."""
    rng = np.random.RandomState(seed)
    scores = []
    n = len(y_true)
    for _ in range(n_bootstraps):
        idx = rng.randint(0, n, size=n)
        if len(np.unique(y_true[idx])) < 2:
            continue
        try:
            score = metric_fn(y_true[idx], y_prob[idx])
            scores.append(score)
        except Exception:
            continue
    if not scores:
        return np.nan, np.nan
    return float(np.percentile(scores, 100 * (alpha / 2))), float(np.percentile(scores, 100 * (1 - alpha / 2)))


def summarize_binary_predictions(y_true, y_prob, threshold=0.5):
    """Summarizes held-out baseline metrics at a fixed probability threshold."""
    predictions = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, predictions, labels=[0, 1]).ravel()

    return {
        "auroc": float(roc_auc_score(y_true, y_prob)),
        "sensitivity": float(recall_score(y_true, predictions, zero_division=0)),
        "specificity": float(tn / (tn + fp)) if tn + fp else 0.0,
        "ppv": float(precision_score(y_true, predictions, zero_division=0)),
        "brier_score": float(brier_score_loss(y_true, y_prob)),
        "missed_cases_count": int(fn),
        "missed_cases_rate": float(fn / (fn + tp) * 100) if fn + tp else 0.0,
    }


def build_preprocessing_pipeline():
    """Builds scikit-learn ColumnTransformer for triage intake features."""
    num_cols = ['age', 'temperature', 'heartrate', 'resprate', 'o2sat', 'sbp', 'dbp', 'pain']
    cat_cols = ['gender', 'arrival_transport']
    bin_cols = ['o2sat_missing', 'temperature_missing', 'pain_missing']

    num_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])

    cat_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='constant', fill_value='UNKNOWN')),
        ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])

    bin_pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='constant', fill_value=0))
    ])

    preprocessor = ColumnTransformer(transformers=[
        ('num', num_pipeline, num_cols),
        ('cat', cat_pipeline, cat_cols),
        ('bin', bin_pipeline, bin_cols)
    ], remainder='drop')

    return preprocessor, num_cols, cat_cols, bin_cols


def run_triage_training():
    print("=" * 70)
    print("CareBridge Phase 5: Training Triage Severity Model")
    print("Population: MIMIC-IV-ED Demo (Research Prototype / Decision Support)")
    print("=" * 70)

    # 1. Load data
    df = load_mimic_triage_data()
    print(f"Total non-missing acuity visits loaded: {len(df)}")
    print(f"Unique subject IDs: {df['subject_id'].nunique()}")
    print(f"Target distribution (1=High Acuity ESI 1-2, 0=Lower Acuity ESI 3-5):")
    print(df['target'].value_counts(normalize=True).to_dict())

    # 2. Patient-level split
    train_df, test_df = split_by_patient(df, test_size=0.25, random_state=42)
    print(f"\nTrain cohort: {len(train_df)} visits ({train_df['subject_id'].nunique()} subjects)")
    print(f"Test cohort:  {len(test_df)} visits ({test_df['subject_id'].nunique()} subjects)")

    feature_cols = [c for c in ALLOWED_TRIAGE_FEATURES if c in df.columns] + ['o2sat_missing', 'temperature_missing', 'pain_missing']
    X_train = train_df[feature_cols]
    y_train = train_df['target'].values
    X_test = test_df[feature_cols]
    y_test = test_df['target'].values

    # Preprocessing
    preprocessor, num_cols, cat_cols, bin_cols = build_preprocessing_pipeline()

    # -------------------------------------------------------------------------
    # Baseline 1: Majority Class
    # -------------------------------------------------------------------------
    majority_class_prob = float(np.mean(y_train))
    y_pred_prob_majority = np.full_like(y_test, majority_class_prob, dtype=float)

    # -------------------------------------------------------------------------
    # Baseline 2: Approximate NEWS2 Score
    # -------------------------------------------------------------------------
    news2_scores_test = []
    for _, row in test_df.iterrows():
        v = {
            'resprate': row.get('resprate'),
            'o2sat': row.get('o2sat'),
            'sbp': row.get('sbp'),
            'heartrate': row.get('heartrate'),
            'temperature': row.get('temperature')
        }
        news2_scores_test.append(compute_approximate_news2(v))
    news2_scores_test = np.array(news2_scores_test, dtype=float)
    # Min-max scale NEWS2 for probability approximation
    news2_prob_test = news2_scores_test / 20.0

    # -------------------------------------------------------------------------
    # Baseline 3: Regularized Logistic Regression
    # -------------------------------------------------------------------------
    lr_pipe = Pipeline([
        ('prep', preprocessor),
        ('clf', LogisticRegression(C=0.5, penalty='l2', solver='liblinear', random_state=42))
    ])
    lr_pipe.fit(X_train, y_train)
    lr_prob_test = lr_pipe.predict_proba(X_test)[:, 1]

    # -------------------------------------------------------------------------
    # Candidate 1: Random Forest
    # -------------------------------------------------------------------------
    rf_pipe = Pipeline([
        ('prep', preprocessor),
        ('clf', RandomForestClassifier(n_estimators=100, max_depth=5, class_weight='balanced', random_state=42))
    ])
    rf_pipe.fit(X_train, y_train)
    rf_prob_test = rf_pipe.predict_proba(X_test)[:, 1]

    # -------------------------------------------------------------------------
    # Candidate 2: HistGradientBoosting (Primary Candidate)
    # -------------------------------------------------------------------------
    # Fit HistGradientBoosting directly
    hgb_pipe = Pipeline([
        ('prep', preprocessor),
        ('clf', HistGradientBoostingClassifier(max_iter=100, max_depth=4, class_weight='balanced', random_state=42))
    ])
    hgb_pipe.fit(X_train, y_train)
    hgb_prob_uncal = hgb_pipe.predict_proba(X_test)[:, 1]

    # Calibrated Classifier (Platt Sigmoid Calibration)
    calibrated_hgb = CalibratedClassifierCV(hgb_pipe, method='sigmoid', cv=3)
    calibrated_hgb.fit(X_train, y_train)
    hgb_prob_cal = calibrated_hgb.predict_proba(X_test)[:, 1]

    # Select Primary Model: Calibrated HistGradientBoosting
    primary_prob_test = hgb_prob_cal

    # -------------------------------------------------------------------------
    # Threshold Tuning on Train / Validation folds for Target Sensitivity (>= 90%)
    # -------------------------------------------------------------------------
    train_probs = calibrated_hgb.predict_proba(X_train)[:, 1]
    # Scan potential thresholds from 0.05 to 0.95
    best_thresh = 0.50
    for t in np.linspace(0.10, 0.80, 71):
        preds = (train_probs >= t).astype(int)
        sens = recall_score(y_train, preds, zero_division=0)
        if sens >= 0.90:
            best_thresh = float(t)
        else:
            break
    print(f"\nOperating threshold tuned on train to achieve >= 90% sensitivity: {best_thresh:.3f}")

    # Evaluate at tuned threshold on TEST set
    test_preds = (primary_prob_test >= best_thresh).astype(int)
    sens_test = float(recall_score(y_test, test_preds, zero_division=0))
    spec_test = float(recall_score(1 - y_test, 1 - test_preds, zero_division=0))
    ppv_test = float(precision_score(y_test, test_preds, zero_division=0))
    tn, fp, fn, tp = confusion_matrix(y_test, test_preds).ravel()

    extra_alerts_per_100 = float((fp / len(y_test)) * 100)
    missed_rate = float((fn / (tp + fn)) * 100) if (tp + fn) > 0 else 0.0

    auroc = float(roc_auc_score(y_test, primary_prob_test))
    auprc = float(average_precision_score(y_test, primary_prob_test))
    brier_uncal = float(brier_score_loss(y_test, hgb_prob_uncal))
    brier_cal = float(brier_score_loss(y_test, hgb_prob_cal))
    ece = compute_expected_calibration_error(y_test, primary_prob_test)

    # 95% Bootstrap CIs on Test set
    auroc_ci = bootstrap_metric_ci(y_test, primary_prob_test, roc_auc_score)
    auprc_ci = bootstrap_metric_ci(y_test, primary_prob_test, average_precision_score)
    brier_ci = bootstrap_metric_ci(y_test, primary_prob_test, brier_score_loss)
    sens_ci = bootstrap_metric_ci(y_test, (primary_prob_test >= best_thresh).astype(int), recall_score)

    print("\n--- TEST SET EVALUATION RESULTS (Mean [95% CI]) ---")
    print(f"Primary Metric - Sensitivity:  {sens_test:.3f} [{sens_ci[0]:.3f}, {sens_ci[1]:.3f}]")
    print(f"Specificity:                   {spec_test:.3f}")
    print(f"Positive Predictive Value (PPV): {ppv_test:.3f}")
    print(f"Extra Alerts per 100 patients: {extra_alerts_per_100:.1f}")
    print(f"Missed High-Risk Cases:        {fn} of {tp + fn} ({missed_rate:.1f}%)")
    print(f"AUROC:                         {auroc:.3f} [{auroc_ci[0]:.3f}, {auroc_ci[1]:.3f}]")
    print(f"AUPRC:                         {auprc:.3f} [{auprc_ci[0]:.3f}, {auprc_ci[1]:.3f}]")
    print(f"Brier Score (Uncalibrated):    {brier_uncal:.4f}")
    print(f"Brier Score (Calibrated):      {brier_cal:.4f} [{brier_ci[0]:.4f}, {brier_ci[1]:.4f}]")
    print(f"Expected Calibration Error (ECE): {ece:.4f}")

    # Comparative held-out metrics vs baselines (fixed 0.50 threshold).
    baseline_metrics = {
        "majority_class": summarize_binary_predictions(y_test, y_pred_prob_majority),
        "approximate_news2": {
            "auroc": float(roc_auc_score(y_test, news2_prob_test)),
            "classification_threshold": None,
        },
        "logistic_regression": summarize_binary_predictions(y_test, lr_prob_test),
        "random_forest": summarize_binary_predictions(y_test, rf_prob_test),
    }

    print("\n--- COMPARISON WITH BASELINES (Test Metrics, Threshold 0.50) ---")
    for name, metrics in baseline_metrics.items():
        if name == "approximate_news2":
            print(f"{name}: AUROC={metrics['auroc']:.3f} (continuous score; no cutoff metrics reported)")
            continue
        print(
            f"{name}: AUROC={metrics['auroc']:.3f}, "
            f"Sensitivity={metrics['sensitivity']:.3f}, "
            f"Specificity={metrics['specificity']:.3f}, "
            f"PPV={metrics['ppv']:.3f}, "
            f"Brier={metrics['brier_score']:.4f}, "
            f"Missed={metrics['missed_cases_count']}/{int(np.sum(y_test))}"
        )

    # Subgroup Analysis
    print("\n--- SUBGROUP AUDITS (US Demo Hospital Cohort) ---")
    subgroups = {}

    # Sex Subgroup
    for g in ['F', 'M']:
        mask = (test_df['gender'] == g).values
        if np.sum(mask) >= 5 and len(np.unique(y_test[mask])) > 1:
            g_sens = recall_score(y_test[mask], test_preds[mask], zero_division=0)
            g_brier = brier_score_loss(y_test[mask], primary_prob_test[mask])
            subgroups[f"Sex_{g}"] = {"n": int(np.sum(mask)), "sensitivity": float(g_sens), "brier": float(g_brier)}
            print(f"Sex {g} (N={np.sum(mask)}): Sensitivity = {g_sens:.3f}, Brier = {g_brier:.4f}")

    # Arrival Subgroup
    for arr in ['AMBULANCE', 'WALK IN']:
        mask = (test_df['arrival_transport'] == arr).values
        if np.sum(mask) >= 5 and len(np.unique(y_test[mask])) > 1:
            arr_sens = recall_score(y_test[mask], test_preds[mask], zero_division=0)
            arr_brier = brier_score_loss(y_test[mask], primary_prob_test[mask])
            subgroups[f"Arrival_{arr}"] = {"n": int(np.sum(mask)), "sensitivity": float(arr_sens), "brier": float(arr_brier)}
            print(f"Arrival {arr} (N={np.sum(mask)}): Sensitivity = {arr_sens:.3f}, Brier = {arr_brier:.4f}")

    # Robustness Audit: Missing SpO2
    print("\n--- ROBUSTNESS CHECK: Masking SpO2 as Missing ---")
    X_test_no_spo2 = X_test.copy()
    X_test_no_spo2['o2sat'] = np.nan
    X_test_no_spo2['o2sat_missing'] = 1
    prob_no_spo2 = calibrated_hgb.predict_proba(X_test_no_spo2)[:, 1]
    preds_no_spo2 = (prob_no_spo2 >= best_thresh).astype(int)
    sens_no_spo2 = float(recall_score(y_test, preds_no_spo2, zero_division=0))
    auroc_no_spo2 = float(roc_auc_score(y_test, prob_no_spo2))
    print(f"Sensitivity with SpO2 missing: {sens_no_spo2:.3f} (diff = {sens_no_spo2 - sens_test:+.3f})")
    print(f"AUROC with SpO2 missing:       {auroc_no_spo2:.3f} (diff = {auroc_no_spo2 - auroc:+.3f})")

    # Save Model Artifacts
    os.makedirs(os.path.join(os.path.dirname(__file__), 'models'), exist_ok=True)
    model_path = os.path.join(os.path.dirname(__file__), 'models', 'triage_model.joblib')
    joblib.dump(calibrated_hgb, model_path)
    print(f"\n[OK] Saved calibrated triage model pipeline to {model_path}")

    # Model Card
    card = {
        "modelName": "CareBridge Triage Severity Classifier",
        "version": "1.0.0",
        "algorithm": "HistGradientBoostingClassifier with Platt Sigmoid Calibration",
        "dataset": "MIMIC-IV-ED Demo v2.2 (PhysioNet)",
        "population": "Emergency Department arrivals, Beth Israel Deaconess Medical Center, Boston, MA, USA",
        "trainingDate": date.today().isoformat(),
        "target": "High Acuity (ESI acuity 1 or 2 vs 3, 4, 5)",
        "cohort": {
            "labeled_visits": int(len(df)),
            "unique_patients": int(df['subject_id'].nunique()),
            "train_visits": int(len(train_df)),
            "train_patients": int(train_df['subject_id'].nunique()),
            "test_visits": int(len(test_df)),
            "test_patients": int(test_df['subject_id'].nunique()),
            "test_high_acuity_cases": int(np.sum(y_test)),
        },
        "operatingThreshold": best_thresh,
        "metrics": {
            "sensitivity": sens_test,
            "sensitivity_95_ci": list(sens_ci),
            "specificity": spec_test,
            "ppv": ppv_test,
            "extra_alerts_per_100": extra_alerts_per_100,
            "missed_cases_count": int(fn),
            "missed_cases_rate": missed_rate,
            "auroc": auroc,
            "auroc_95_ci": list(auroc_ci),
            "auprc": auprc,
            "auprc_95_ci": list(auprc_ci),
            "brier_score_calibrated": brier_cal,
            "brier_score_uncalibrated": brier_uncal,
            "expected_calibration_error": ece
        },
        "baselines": baseline_metrics,
        "subgroups": subgroups,
        "robustness_missing_spo2": {
            "sensitivity": sens_no_spo2,
            "auroc": auroc_no_spo2
        },
        "intendedUse": "Decision support triage urgency suggestion to support doctor referral prioritization. NOT a clinical diagnosis.",
        "disclaimer": "Decision support only. Clinician must review. Trained on non-Tamil Nadu public data and not validated for Tamil Nadu patient populations."
    }

    card_path = os.path.join(os.path.dirname(__file__), 'models', 'triage_model_card.json')
    with open(card_path, 'w') as f:
        json.dump(card, f, indent=2)
    print(f"[OK] Saved model card to {card_path}")

    return card


if __name__ == '__main__':
    run_triage_training()
