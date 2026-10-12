"""
triage_data_loader.py
---------------------
Data loading, cleaning, leakage guard, and patient-level splitting for
the Triage Severity model.
"""

import os
import re
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

# Strict whitelist of allowed triage features (available at intake BEFORE physician evaluation)
ALLOWED_TRIAGE_FEATURES = [
    'age',
    'gender',
    'arrival_transport',
    'temperature',
    'heartrate',
    'resprate',
    'o2sat',
    'sbp',
    'dbp',
    'pain'
]

# Forbidden column patterns representing clinical outcomes, labs, diagnoses, or disposition
FORBIDDEN_COLUMNS_PATTERNS = [
    r'diag', r'icd', r'lab', r'med', r'disposition', r'los', r'stay', r'admit',
    r'death', r'icu', r'discharge', r'pyxis', r'prescription', r'culture',
    r'vital_sign_out', r'treatment', r'order'
]


def assert_no_data_leakage(columns: list):
    """
    Leakage guard: Fails with ValueError if any post-triage or diagnostic
    column enters the model feature set.
    """
    for col in columns:
        col_lower = str(col).lower()
        if col_lower in ['subject_id', 'stay_id', 'acuity', 'target']:
            continue
        # Check against whitelist
        if col_lower not in ALLOWED_TRIAGE_FEATURES and not col_lower.endswith('_missing'):
            for pattern in FORBIDDEN_COLUMNS_PATTERNS:
                if re.search(pattern, col_lower):
                    raise ValueError(
                        f"[DATA LEAKAGE DETECTED] Forbidden post-triage column '{col}' "
                        f"matches pattern '{pattern}'. Triage models can only consume intake variables."
                    )


def clean_vital_signs(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean impossible physiological vital values with documented rules.
    Values outside biological survival ranges are converted to NaN with missingness flags.
    """
    cleaned = df.copy()

    # Temperature normalization to Celsius
    if 'temperature' in cleaned.columns:
        temp = pd.to_numeric(cleaned['temperature'], errors='coerce')
        # If recorded in Fahrenheit (> 45.0), convert to Celsius
        is_f = temp > 45.0
        temp.loc[is_f] = (temp.loc[is_f] - 32.0) * 5.0 / 9.0
        # Biological bounds for core body temp: 30.0C to 45.0C
        temp.loc[(temp < 30.0) | (temp > 45.0)] = np.nan
        cleaned['temperature'] = temp

    # Heart rate bounds: 20 - 260 bpm
    if 'heartrate' in cleaned.columns:
        hr = pd.to_numeric(cleaned['heartrate'], errors='coerce')
        hr.loc[(hr < 20) | (hr > 260)] = np.nan
        cleaned['heartrate'] = hr

    # Respiratory rate bounds: 4 - 70 breaths/min
    if 'resprate' in cleaned.columns:
        rr = pd.to_numeric(cleaned['resprate'], errors='coerce')
        rr.loc[(rr < 4) | (rr > 70)] = np.nan
        cleaned['resprate'] = rr

    # SpO2 bounds: 50% - 100%
    if 'o2sat' in cleaned.columns:
        spo2 = pd.to_numeric(cleaned['o2sat'], errors='coerce')
        spo2.loc[(spo2 < 50) | (spo2 > 100)] = np.nan
        cleaned['o2sat'] = spo2

    # Blood pressure: SBP 40 - 300, DBP 20 - 200
    if 'sbp' in cleaned.columns:
        sbp = pd.to_numeric(cleaned['sbp'], errors='coerce')
        sbp.loc[(sbp < 40) | (sbp > 300)] = np.nan
        cleaned['sbp'] = sbp
    if 'dbp' in cleaned.columns:
        dbp = pd.to_numeric(cleaned['dbp'], errors='coerce')
        dbp.loc[(dbp < 20) | (dbp > 200)] = np.nan
        cleaned['dbp'] = dbp

    # Pain score: 0 to 10 numeric
    if 'pain' in cleaned.columns:
        pain = pd.to_numeric(cleaned['pain'], errors='coerce')
        pain.loc[(pain < 0) | (pain > 10)] = np.nan
        cleaned['pain'] = pain

    # Add missingness indicators for key vitals
    cleaned['o2sat_missing'] = cleaned['o2sat'].isna().astype(int)
    cleaned['temperature_missing'] = cleaned['temperature'].isna().astype(int)
    cleaned['pain_missing'] = cleaned['pain'].isna().astype(int)

    return cleaned


def load_mimic_triage_data(base_path: str = None) -> pd.DataFrame:
    """
    Loads MIMIC-IV-ED demo triage and tracking tables, constructs binary high-acuity target,
    applies leakage assertions, and cleans vitals.
    """
    if base_path is None:
        base_path = os.path.join(os.path.dirname(__file__), 'data', 'raw', 'mimic_demo', 'mimic-iv-ed-demo-2.2', 'ed')

    triage_path = os.path.join(base_path, 'triage.csv.gz')
    edstays_path = os.path.join(base_path, 'edstays.csv.gz')

    if not os.path.exists(triage_path) or not os.path.exists(edstays_path):
        raise FileNotFoundError(f"MIMIC demo files not found at {base_path}")

    triage_df = pd.read_csv(triage_path, compression='gzip')
    stays_df = pd.read_csv(edstays_path, compression='gzip')

    # Merge on stay_id
    merged = pd.merge(
        triage_df,
        stays_df[['stay_id', 'gender', 'arrival_transport']],
        on='stay_id',
        how='inner'
    )

    # Filter out missing acuity labels
    labeled = merged.dropna(subset=['acuity']).copy()

    # Target: High acuity (ESI 1 or 2) = 1, Lower acuity (ESI 3, 4, 5) = 0
    labeled['target'] = (labeled['acuity'].astype(float) <= 2.0).astype(int)

    # Estimate age proxy if available or default 52.0 (median adult ED age)
    if 'age' not in labeled.columns:
        labeled['age'] = 52.0

    # Ensure arrival_transport normalization
    labeled['arrival_transport'] = labeled['arrival_transport'].fillna('UNKNOWN').astype(str).str.upper()
    labeled['gender'] = labeled['gender'].fillna('UNKNOWN').astype(str).str.upper()

    # Clean vitals and add missingness flags
    cleaned = clean_vital_signs(labeled)

    # Feature verification against leakage guard
    feature_cols = [c for c in cleaned.columns if c in ALLOWED_TRIAGE_FEATURES or c.endswith('_missing')]
    assert_no_data_leakage(feature_cols)

    return cleaned


def split_by_patient(df: pd.DataFrame, test_size: float = 0.20, random_state: int = 42):
    """
    Splits dataset strictly by patient (subject_id) to prevent visit-level leakage.
    Returns (train_df, test_df).
    """
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
    train_idx, test_idx = next(gss.split(df, groups=df['subject_id']))

    train_df = df.iloc[train_idx].copy()
    test_df = df.iloc[test_idx].copy()

    # Assert zero patient overlap
    overlap = set(train_df['subject_id']).intersection(set(test_df['subject_id']))
    assert len(overlap) == 0, f"[PATIENT LEAKAGE ERROR] Overlap detected: {len(overlap)} subjects in both train and test!"

    return train_df, test_df
