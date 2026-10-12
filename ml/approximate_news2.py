"""
approximate_news2.py
--------------------
Implementation of an approximate National Early Warning Score 2 (NEWS2).
Explicit disclaimer: This implementation is for comparative research baseline
purposes only. It is approximate and NOT validated for clinical deployment
or triage decision-making in Tamil Nadu or any hospital system.
"""

def compute_approximate_news2(vitals: dict) -> int:
    """
    Computes approximate NEWS2 vital score from vital sign dictionary.
    Keys expected (any can be None/missing):
      resprate: breaths/min
      o2sat: SpO2 %
      sbp: systolic blood pressure mmHg
      heartrate: beats/min
      temperature: degrees Fahrenheit or Celsius (auto-detected)
    """
    score = 0

    # 1. Respiration Rate
    rr = vitals.get('resprate')
    if rr is not None:
        try:
            rr = float(rr)
            if rr <= 8 or rr >= 25:
                score += 3
            elif 21 <= rr <= 24:
                score += 2
            elif 9 <= rr <= 11:
                score += 1
            # 12-20 is 0
        except (ValueError, TypeError):
            pass

    # 2. Oxygen Saturation (Scale 1 standard)
    spo2 = vitals.get('o2sat')
    if spo2 is not None:
        try:
            spo2 = float(spo2)
            if spo2 <= 91:
                score += 3
            elif 92 <= spo2 <= 93:
                score += 2
            elif 94 <= spo2 <= 95:
                score += 1
            # >= 96 is 0
        except (ValueError, TypeError):
            pass

    # 3. Systolic Blood Pressure
    sbp = vitals.get('sbp')
    if sbp is not None:
        try:
            sbp = float(sbp)
            if sbp <= 90 or sbp >= 220:
                score += 3
            elif 91 <= sbp <= 100:
                score += 2
            elif 101 <= sbp <= 110:
                score += 1
            # 111-219 is 0
        except (ValueError, TypeError):
            pass

    # 4. Heart Rate / Pulse
    hr = vitals.get('heartrate')
    if hr is not None:
        try:
            hr = float(hr)
            if hr <= 40 or hr >= 131:
                score += 3
            elif 111 <= hr <= 130:
                score += 2
            elif (41 <= hr <= 50) or (91 <= hr <= 110):
                score += 1
            # 51-90 is 0
        except (ValueError, TypeError):
            pass

    # 5. Temperature
    temp = vitals.get('temperature')
    if temp is not None:
        try:
            temp = float(temp)
            # Detect Fahrenheit (e.g., > 45) and convert to Celsius
            if temp > 45.0:
                temp_c = (temp - 32.0) * 5.0 / 9.0
            else:
                temp_c = temp

            if temp_c <= 35.0:
                score += 3
            elif temp_c >= 39.1:
                score += 2
            elif (35.1 <= temp_c <= 36.0) or (38.1 <= temp_c <= 39.0):
                score += 1
            # 36.1-38.0 is 0
        except (ValueError, TypeError):
            pass

    return score
