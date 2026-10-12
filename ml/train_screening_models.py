"""
train_screening_models.py
-------------------------
Orchestrates training and cross-validation across all 5 public condition datasets:
1. Diabetes (Pima Indians)
2. Heart Disease (UCI Cleveland)
3. Liver Disease (ILPD)
4. Chronic Kidney Disease (UCI CKD)
5. Thyroid Disorder (UCI Hypothyroid)

Saves trained model pipelines to /ml/models/ and generates /ml/models/screening_summary.json.
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

from screening_pipeline import (
    ScreeningModel,
    clean_pima_diabetes,
    clean_cleveland_heart,
    clean_ilpd_liver
)


# =============================================================================
# 1. DIABETES (Pima Indians)
# =============================================================================


def build_diabetes_model():
    return ScreeningModel(
        name="Diabetes",
        icd10="E11",
        specialty="Endocrinology",
        required_features=['Glucose', 'BMI', 'Age', 'BloodPressure'],
        num_features=['Pregnancies', 'Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI', 'DiabetesPedigreeFunction', 'Age'],
        cat_features=[],
        target_col="Outcome",
        positive_val=1,
        data_cleaner=clean_pima_diabetes
    )


# =============================================================================
# 2. HEART DISEASE (Cleveland)
# =============================================================================
def build_heart_model():
    return ScreeningModel(
        name="Heart Disease",
        icd10="I25.1",
        specialty="Cardiology",
        required_features=['age', 'sex', 'trestbps', 'chol', 'cp'],
        num_features=['age', 'trestbps', 'chol', 'thalach', 'oldpeak'],
        cat_features=['sex', 'cp', 'fbs', 'restecg', 'exang', 'slope', 'ca', 'thal'],
        target_col="target",
        positive_val=1,
        data_cleaner=clean_cleveland_heart
    )


# =============================================================================
# 3. LIVER DISEASE (ILPD)
# =============================================================================
def build_liver_model():
    return ScreeningModel(
        name="Liver Disease",
        icd10="K76.9",
        specialty="Gastroenterology",
        required_features=['age', 'gender', 'tb', 'sgpt', 'sgot', 'alb'],
        num_features=['age', 'tb', 'db', 'alkphos', 'sgpt', 'sgot', 'tp', 'alb', 'ag_ratio'],
        cat_features=['gender'],
        target_col="target",
        positive_val=1,
        data_cleaner=clean_ilpd_liver
    )


# =============================================================================
# 4. CHRONIC KIDNEY DISEASE (UCI CKD)
# =============================================================================
def load_and_clean_ckd(raw_path: str) -> pd.DataFrame:
    arff_rows = []
    col_names = []
    with open(raw_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line.lower().startswith('@attribute'):
                col_names.append(line.split()[1].strip("'\""))
            elif line and not line.startswith('@') and not line.startswith('%'):
                parts = [v.strip().strip("'\"") for v in line.split(',')]
                if len(parts) > len(col_names) and parts[-1] == '':
                    parts = parts[:-1]
                if len(parts) == 26 and parts[19] == '':
                    parts.pop(19)
                if len(parts) > len(col_names):
                    parts = parts[:len(col_names)]
                arff_rows.append(parts)

    df = pd.DataFrame(arff_rows, columns=col_names).replace('?', np.nan).replace('', np.nan)
    target_col = 'class' if 'class' in df.columns else 'classification'
    df['target'] = df[target_col].astype(str).str.strip().str.lower().apply(
        lambda x: 1 if 'ckd' in x and 'not' not in x else 0
    )

    num_cols = ['age', 'bp', 'bgr', 'bu', 'sc', 'sod', 'pot', 'hemo', 'pcv', 'wbcc', 'rbcc']
    for c in num_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')

    return df


def build_ckd_model():
    return ScreeningModel(
        name="Chronic Kidney Disease",
        icd10="N18.9",
        specialty="Nephrology",
        required_features=['age', 'bp', 'sc', 'bu', 'hemo'],
        num_features=['age', 'bp', 'bgr', 'bu', 'sc', 'sod', 'pot', 'hemo'],
        cat_features=['sg', 'al', 'su', 'rbc', 'pc', 'pcc', 'ba', 'htn', 'dm', 'cad', 'appet', 'pe', 'ane'],
        target_col="target",
        positive_val=1
    )


# =============================================================================
# 5. THYROID DISORDER (UCI Hypothyroid)
# =============================================================================
def load_and_clean_thyroid(raw_path: str) -> pd.DataFrame:
    t_cols = [
        'target_raw', 'age', 'sex', 'on_thyroxine', 'query_on_thyroxine', 'on_antithyroid_medication',
        'thyroid_surgery', 'query_hypothyroid', 'query_hyperthyroid', 'pregnant', 'sick', 'tumor',
        'lithium', 'goitre', 'TSH_meas', 'TSH', 'T3_meas', 'T3', 'TT4_meas', 'TT4',
        'T4U_meas', 'T4U', 'FTI_meas', 'FTI', 'TBG_meas', 'TBG'
    ]
    df = pd.read_csv(raw_path, header=None, names=t_cols, na_values='?')
    df['target'] = df['target_raw'].astype(str).str.strip().str.lower().apply(lambda x: 1 if 'hypothyroid' in x and 'negative' not in x else 0)

    num_cols = ['age', 'TSH', 'T3', 'TT4', 'T4U', 'FTI']
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors='coerce')

    return df


def build_thyroid_model():
    # Note: Exclude on_thyroxine and query_on_thyroxine as potential treatment leakages
    return ScreeningModel(
        name="Thyroid Disorder",
        icd10="E03.9",
        specialty="Endocrinology",
        required_features=['age', 'sex', 'TSH', 'TT4'],
        num_features=['age', 'TSH', 'T3', 'TT4', 'T4U', 'FTI'],
        cat_features=['sex', 'on_antithyroid_medication', 'thyroid_surgery', 'query_hypothyroid', 'query_hyperthyroid', 'pregnant', 'sick', 'tumor', 'lithium', 'goitre'],
        target_col="target",
        positive_val=1
    )


# =============================================================================
# MAIN TRAINING RUNNER
# =============================================================================
def train_all_screening_models():
    print("=" * 70)
    print("CareBridge Phase 5: Training Condition Screening Models")
    print("Evaluation Protocol: 5x10 Repeated Stratified K-Fold with 95% Bootstrap CIs")
    print("Optimization: Recall-First Operating Threshold for Clinical Decision Support")
    print("=" * 70)

    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, 'data', 'raw')
    models_dir = os.path.join(base_dir, 'models')
    os.makedirs(models_dir, exist_ok=True)

    results_summary = {}

    # 1. Diabetes
    print("\n[1/5] Training Diabetes Screening Model (Pima Indians Diabetes)...")
    pima_path = os.path.join(data_dir, 'pima_diabetes.csv')
    pima_df = pd.read_csv(pima_path)
    diabetes_model = build_diabetes_model()
    res_diab = diabetes_model.evaluate_and_train(pima_df)
    results_summary["Diabetes"] = res_diab
    joblib.dump(diabetes_model, os.path.join(models_dir, 'diabetes_model.joblib'))
    print(f"  Recall (Target >= 0.90): {res_diab['recall']:.3f} [{res_diab['recall_95_ci'][0]:.3f}, {res_diab['recall_95_ci'][1]:.3f}]")
    print(f"  AUROC: {res_diab['auroc']:.3f} | Brier: {res_diab['brier_score']:.4f} | Operating Threshold: {res_diab['operating_threshold']:.3f}")

    # 2. Heart Disease
    print("\n[2/5] Training Heart Disease Screening Model (UCI Cleveland)...")
    c_cols = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal', 'num']
    heart_path = os.path.join(data_dir, 'heart_disease', 'processed.cleveland.data')
    heart_df = pd.read_csv(heart_path, header=None, names=c_cols, na_values='?')
    heart_model = build_heart_model()
    res_heart = heart_model.evaluate_and_train(heart_df)
    results_summary["Heart Disease"] = res_heart
    joblib.dump(heart_model, os.path.join(models_dir, 'heart_model.joblib'))
    print(f"  Recall (Target >= 0.90): {res_heart['recall']:.3f} [{res_heart['recall_95_ci'][0]:.3f}, {res_heart['recall_95_ci'][1]:.3f}]")
    print(f"  AUROC: {res_heart['auroc']:.3f} | Brier: {res_heart['brier_score']:.4f} | Operating Threshold: {res_heart['operating_threshold']:.3f}")

    # 3. Liver Disease
    print("\n[3/5] Training Liver Disease Screening Model (ILPD)...")
    l_cols = ['age', 'gender', 'tb', 'db', 'alkphos', 'sgpt', 'sgot', 'tp', 'alb', 'ag_ratio', 'selector']
    liver_path = os.path.join(data_dir, 'ilpd', 'Indian Liver Patient Dataset (ILPD).csv')
    liver_df = pd.read_csv(liver_path, header=None, names=l_cols)
    liver_model = build_liver_model()
    res_liver = liver_model.evaluate_and_train(liver_df)
    results_summary["Liver Disease"] = res_liver
    joblib.dump(liver_model, os.path.join(models_dir, 'liver_model.joblib'))
    print(f"  Recall (Target >= 0.90): {res_liver['recall']:.3f} [{res_liver['recall_95_ci'][0]:.3f}, {res_liver['recall_95_ci'][1]:.3f}]")
    print(f"  AUROC: {res_liver['auroc']:.3f} | Brier: {res_liver['brier_score']:.4f} | Operating Threshold: {res_liver['operating_threshold']:.3f}")

    # 4. Chronic Kidney Disease
    print("\n[4/5] Training Chronic Kidney Disease Screening Model (UCI CKD)...")
    ckd_path = os.path.join(data_dir, 'ckd', 'Chronic_Kidney_Disease', 'chronic_kidney_disease.arff')
    ckd_df = load_and_clean_ckd(ckd_path)
    ckd_model = build_ckd_model()
    res_ckd = ckd_model.evaluate_and_train(ckd_df)
    results_summary["Chronic Kidney Disease"] = res_ckd
    joblib.dump(ckd_model, os.path.join(models_dir, 'ckd_model.joblib'))
    print(f"  Recall (Target >= 0.90): {res_ckd['recall']:.3f} [{res_ckd['recall_95_ci'][0]:.3f}, {res_ckd['recall_95_ci'][1]:.3f}]")
    print(f"  AUROC: {res_ckd['auroc']:.3f} | Brier: {res_ckd['brier_score']:.4f} | Operating Threshold: {res_ckd['operating_threshold']:.3f}")
    if res_ckd['auroc'] > 0.98:
        print("  [NOTE ON CKD SEPARABILITY]: AUROC exceeds 0.98 due to near-perfect linear biochemical separability on 400 patient cohort, not clinical generalization.")

    # 5. Thyroid Disorder
    print("\n[5/5] Training Thyroid Disorder Screening Model (UCI Hypothyroid)...")
    thyroid_path = os.path.join(data_dir, 'thyroid', 'hypothyroid.data')
    thyroid_df = load_and_clean_thyroid(thyroid_path)
    thyroid_model = build_thyroid_model()
    res_thyroid = thyroid_model.evaluate_and_train(thyroid_df)
    results_summary["Thyroid Disorder"] = res_thyroid
    joblib.dump(thyroid_model, os.path.join(models_dir, 'thyroid_model.joblib'))
    print(f"  Recall (Target >= 0.90): {res_thyroid['recall']:.3f} [{res_thyroid['recall_95_ci'][0]:.3f}, {res_thyroid['recall_95_ci'][1]:.3f}]")
    print(f"  AUROC: {res_thyroid['auroc']:.3f} | Brier: {res_thyroid['brier_score']:.4f} | Operating Threshold: {res_thyroid['operating_threshold']:.3f}")

    # Save summary JSON
    summary_path = os.path.join(models_dir, 'screening_summary.json')
    with open(summary_path, 'w') as f:
        json.dump(results_summary, f, indent=2)
    print(f"\n[OK] Saved screening models summary to {summary_path}")

    return results_summary


if __name__ == '__main__':
    train_all_screening_models()
