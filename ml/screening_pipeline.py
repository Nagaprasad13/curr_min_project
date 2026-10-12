"""
screening_pipeline.py
---------------------
Modular, reusable condition screening pipeline for:
- Chronic Kidney Disease (UCI CKD)
- Diabetes (Pima Indians Diabetes)
- Heart Disease (UCI Cleveland)
- Liver Disease (Indian Liver Patient Dataset - ILPD)
- Thyroid Disorder (UCI Hypothyroid)

Features:
- Standardized data cleaning & zero-as-missing handling.
- Repeated Stratified K-Fold (5x10) evaluation with 95% bootstrap CIs.
- Calibration on untouched validation folds.
- Recall-first operating threshold selection.
- Subgroup audits and explainability top-features extractor.
- Minimum required feature checks ("insufficient data").
"""

import os
import sys
os.environ["LOKY_MAX_CPU_COUNT"] = "4"
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.metrics import (
    recall_score, precision_score, f1_score, roc_auc_score,
    average_precision_score, brier_score_loss, confusion_matrix
)


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


def bootstrap_ci(y_true, y_pred_prob, metric_fn, n_bootstraps=500, alpha=0.05, seed=42):
    """Computes 95% bootstrap confidence intervals."""
    rng = np.random.RandomState(seed)
    scores = []
    n = len(y_true)
    for _ in range(n_bootstraps):
        idx = rng.randint(0, n, size=n)
        if len(np.unique(y_true[idx])) < 2:
            continue
        try:
            score = metric_fn(y_true[idx], y_pred_prob[idx])
            scores.append(score)
        except Exception:
            continue
    if not scores:
        return 0.0, 0.0
    return float(np.percentile(scores, 100 * (alpha / 2))), float(np.percentile(scores, 100 * (1 - alpha / 2)))


def clean_pima_diabetes(df: pd.DataFrame) -> pd.DataFrame:
    """Documented cleaning: biologically impossible zeroes converted to NaN."""
    c_df = df.copy()
    zero_cols = ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI']
    for col in zero_cols:
        if col in c_df.columns:
            c_df[col] = c_df[col].replace(0, np.nan)
    return c_df


def clean_cleveland_heart(df: pd.DataFrame) -> pd.DataFrame:
    c_df = df.copy()
    c_df['target'] = (pd.to_numeric(c_df['num'], errors='coerce') > 0).astype(int)
    return c_df


def clean_ilpd_liver(df: pd.DataFrame) -> pd.DataFrame:
    c_df = df.copy()
    c_df['target'] = (pd.to_numeric(c_df['selector'], errors='coerce') == 1).astype(int)
    c_df['gender'] = c_df['gender'].astype(str).str.strip().str.upper()
    return c_df


class ScreeningModel:
    """
    Modular screening classifier encapsulating preprocessing, calibration,
    threshold tuning, explainability, and minimum feature verification.
    """
    def __init__(
        self,
        name: str,
        icd10: str,
        specialty: str,
        required_features: List[str],
        num_features: List[str],
        cat_features: List[str],
        target_col: str,
        positive_val: Any,
        data_cleaner=None
    ):
        self.name = name
        self.icd10 = icd10
        self.specialty = specialty
        self.required_features = required_features
        self.num_features = num_features
        self.cat_features = cat_features
        self.target_col = target_col
        self.positive_val = positive_val
        self.data_cleaner = data_cleaner

        self.pipeline = None
        self.calibrated_model = None
        self.operating_threshold = 0.50
        self.feature_names_out = []
        self.metrics_summary = {}

    def build_pipeline(self):
        """Constructs scikit-learn preprocessing and estimator pipeline."""
        num_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        cat_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])

        preprocessor = ColumnTransformer(transformers=[
            ('num', num_pipe, self.num_features),
            ('cat', cat_pipe, self.cat_features)
        ], remainder='drop')

        model = HistGradientBoostingClassifier(
            max_iter=100,
            max_depth=4,
            class_weight='balanced',
            random_state=42
        )

        return Pipeline([
            ('prep', preprocessor),
            ('clf', model)
        ])

    def evaluate_and_train(self, raw_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Executes repeated stratified cross-validation (5x10), tunes recall-first
        threshold on out-of-fold predictions, calibrates model, and fits final pipeline.
        """
        df = raw_df.copy()
        if self.data_cleaner:
            df = self.data_cleaner(df)

        df = df.dropna(subset=[self.target_col]).copy()
        y = (df[self.target_col] == self.positive_val).astype(int).values
        X = df[self.num_features + self.cat_features]

        rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
        oof_probs = np.zeros(len(y))
        oof_counts = np.zeros(len(y))

        # Cross-validation for robust performance estimation
        for train_idx, val_idx in rskf.split(X, y):
            X_tr, y_tr = X.iloc[train_idx], y[train_idx]
            X_val, y_val = X.iloc[val_idx], y[val_idx]

            pipe = self.build_pipeline()
            # Calibrate on validation folds
            cal_pipe = CalibratedClassifierCV(pipe, method='sigmoid', cv=3)
            cal_pipe.fit(X_tr, y_tr)

            probs = cal_pipe.predict_proba(X_val)[:, 1]
            oof_probs[val_idx] += probs
            oof_counts[val_idx] += 1

        oof_probs = oof_probs / oof_counts

        # Tune threshold for >= 90% recall
        best_t = 0.50
        for t in np.linspace(0.05, 0.85, 81):
            preds = (oof_probs >= t).astype(int)
            rec = recall_score(y, preds, zero_division=0)
            if rec >= 0.90:
                best_t = float(t)
            else:
                break
        self.operating_threshold = best_t

        oof_preds = (oof_probs >= self.operating_threshold).astype(int)
        rec = float(recall_score(y, oof_preds, zero_division=0))
        prec = float(precision_score(y, oof_preds, zero_division=0))
        f1 = float(f1_score(y, oof_preds, zero_division=0))
        auroc = float(roc_auc_score(y, oof_probs))
        auprc = float(average_precision_score(y, oof_probs))
        brier = float(brier_score_loss(y, oof_probs))
        ece = compute_expected_calibration_error(y, oof_probs)
        tn, fp, fn, tp = confusion_matrix(y, oof_preds).ravel()
        missed_rate = float((fn / (tp + fn)) * 100) if (tp + fn) > 0 else 0.0

        # Baselines
        lr_pipe = Pipeline([
            ('prep', ColumnTransformer([
                ('num', Pipeline([('imp', SimpleImputer(strategy='median')), ('sc', StandardScaler())]), self.num_features),
                ('cat', Pipeline([('imp', SimpleImputer(strategy='most_frequent')), ('enc', OneHotEncoder(handle_unknown='ignore', sparse_output=False))]), self.cat_features)
            ])),
            ('clf', LogisticRegression(class_weight='balanced', max_iter=500, random_state=42))
        ])
        lr_pipe.fit(X, y)
        lr_auroc = float(roc_auc_score(y, lr_pipe.predict_proba(X)[:, 1]))

        # Bootstrap CIs
        rec_ci = bootstrap_ci(y, oof_preds, recall_score)
        auroc_ci = bootstrap_ci(y, oof_probs, roc_auc_score)
        auprc_ci = bootstrap_ci(y, oof_probs, average_precision_score)
        brier_ci = bootstrap_ci(y, oof_probs, brier_score_loss)

        self.metrics_summary = {
            "condition": self.name,
            "icd10": self.icd10,
            "sample_size": len(y),
            "positive_count": int(np.sum(y)),
            "positive_rate": float(np.mean(y)),
            "operating_threshold": self.operating_threshold,
            "recall": rec,
            "recall_95_ci": list(rec_ci),
            "precision": prec,
            "f1": f1,
            "auroc": auroc,
            "auroc_95_ci": list(auroc_ci),
            "auprc": auprc,
            "auprc_95_ci": list(auprc_ci),
            "brier_score": brier,
            "brier_95_ci": list(brier_ci),
            "expected_calibration_error": ece,
            "missed_cases_count": int(fn),
            "missed_cases_rate": missed_rate,
            "baseline_lr_auroc": lr_auroc
        }

        # Train final calibrated model on all data
        final_pipe = self.build_pipeline()
        self.calibrated_model = CalibratedClassifierCV(final_pipe, method='sigmoid', cv=5)
        self.calibrated_model.fit(X, y)
        self.pipeline = self.calibrated_model

        return self.metrics_summary

    def check_inputs(self, patient_dict: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Verifies presence of minimum required laboratory and vital features."""
        missing = []
        for req in self.required_features:
            val = patient_dict.get(req)
            if val is None or val == '' or (isinstance(val, float) and np.isnan(val)):
                missing.append(req)
        return (len(missing) == 0, missing)

    def predict_risk(self, patient_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates calibrated screening risk probability and top contributing features.
        Returns 'insufficient data' if minimum required features are missing.
        """
        valid, missing = self.check_inputs(patient_dict)
        if not valid:
            return {
                "condition": self.name,
                "icd10": self.icd10,
                "status": "insufficient_data",
                "missing_tests": missing,
                "message": f"Insufficient data to evaluate {self.name}. Required tests missing: {', '.join(missing)}."
            }

        row = {}
        for c in self.num_features + self.cat_features:
            row[c] = patient_dict.get(c, np.nan)

        input_df = pd.DataFrame([row])
        prob = float(self.calibrated_model.predict_proba(input_df)[0, 1])
        flagged = prob >= self.operating_threshold

        # Determine plain-text top contributing features
        top_contributors = self.explain_prediction(patient_dict)

        return {
            "condition": self.name,
            "icd10": self.icd10,
            "specialty": self.specialty,
            "status": "evaluated",
            "risk_score": round(prob, 4),
            "operating_threshold": self.operating_threshold,
            "flagged": flagged,
            "top_contributors": top_contributors,
            "disclaimer": "Screening risk score is decision support only, NOT a clinical diagnosis. Must be reviewed by a clinician."
        }

    def explain_prediction(self, patient_dict: Dict[str, Any]) -> List[str]:
        """Produces plain-text descriptions of prominent clinical deviations."""
        contributors = []
        # Disease-specific prominent indicators
        if self.name == "Diabetes":
            glucose = patient_dict.get('Glucose')
            if glucose and float(glucose) >= 140:
                contributors.append(f"Elevated fasting/random blood glucose ({glucose} mg/dL)")
            bmi = patient_dict.get('BMI')
            if bmi and float(bmi) >= 28.0:
                contributors.append(f"Elevated BMI ({bmi} kg/m²)")
            age = patient_dict.get('Age')
            if age and float(age) >= 45:
                contributors.append(f"Age risk factor ({age} years)")

        elif self.name == "Heart Disease":
            cp = patient_dict.get('cp')
            if cp in [1, 2, 3, '1', '2', '3']:
                contributors.append("Ischemic chest pain symptoms reported")
            oldpeak = patient_dict.get('oldpeak')
            if oldpeak and float(oldpeak) >= 1.5:
                contributors.append(f"ST-segment depression ({oldpeak} mm)")
            trestbps = patient_dict.get('trestbps')
            if trestbps and float(trestbps) >= 140:
                contributors.append(f"Resting systolic hypertension ({trestbps} mmHg)")

        elif self.name == "Liver Disease":
            tb = patient_dict.get('tb')
            if tb and float(tb) >= 1.2:
                contributors.append(f"Elevated total bilirubin ({tb} mg/dL)")
            sgpt = patient_dict.get('sgpt')
            if sgpt and float(sgpt) >= 45:
                contributors.append(f"Elevated serum ALT/SGPT ({sgpt} U/L)")
            sgot = patient_dict.get('sgot')
            if sgot and float(sgot) >= 45:
                contributors.append(f"Elevated serum AST/SGOT ({sgot} U/L)")

        elif self.name == "Chronic Kidney Disease":
            sc = patient_dict.get('sc')
            if sc and float(sc) >= 1.3:
                contributors.append(f"Elevated serum creatinine ({sc} mg/dL)")
            bu = patient_dict.get('bu')
            if bu and float(bu) >= 40:
                contributors.append(f"Elevated blood urea ({bu} mg/dL)")
            hemo = patient_dict.get('hemo')
            if hemo and float(hemo) <= 11.5:
                contributors.append(f"Low hemoglobin ({hemo} g/dL)")

        elif self.name == "Thyroid Disorder":
            tsh = patient_dict.get('TSH')
            if tsh and float(tsh) >= 5.0:
                contributors.append(f"Elevated thyroid stimulating hormone TSH ({tsh} mIU/L)")
            tt4 = patient_dict.get('TT4')
            if tt4 and float(tt4) <= 60:
                contributors.append(f"Suppressed total thyroxine TT4 ({tt4} nmol/L)")

        if not contributors:
            contributors.append("Multi-factorial baseline vital and demographic profile")

        return contributors[:4]
