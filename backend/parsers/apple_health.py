"""
Apple Health export.xml parser.

Apple Health exports a single large XML file. We parse the most relevant
metrics for genomic correlation: HRV, resting HR, sleep, SpO2, steps,
active energy, and heart rate during workouts.

Returns a dict of summarized metrics (averages / latest values over
the past 30 days) ready to be injected into the Claude system prompt.
"""

import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
import io
import statistics


# Map Apple Health record type identifiers → friendly names + units
RECORD_TYPES = {
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": ("hrv_ms", "ms"),
    "HKQuantityTypeIdentifierRestingHeartRate":          ("resting_hr_bpm", "bpm"),
    "HKQuantityTypeIdentifierOxygenSaturation":          ("spo2_pct", "%"),
    "HKQuantityTypeIdentifierStepCount":                 ("steps", "steps"),
    "HKQuantityTypeIdentifierActiveEnergyBurned":        ("active_calories", "kcal"),
    "HKQuantityTypeIdentifierHeartRate":                 ("heart_rate_bpm", "bpm"),
    "HKQuantityTypeIdentifierVO2Max":                    ("vo2_max", "mL/kg/min"),
    "HKCategoryTypeIdentifierSleepAnalysis":             ("sleep", None),  # special handling
}

SLEEP_VALUES = {
    "HKCategoryValueSleepAnalysisAsleep":     "asleep",
    "HKCategoryValueSleepAnalysisInBed":      "in_bed",
    "HKCategoryValueSleepAnalysisAwake":      "awake",
    "HKCategoryValueSleepAnalysisREM":        "rem",
    "HKCategoryValueSleepAnalysisCore":       "core",
    "HKCategoryValueSleepAnalysisDeep":       "deep",
}


def parse_apple_health_xml(xml_bytes: bytes, lookback_days: int = 30) -> dict:
    """
    Parse Apple Health export.xml and return a summary dict of recent metrics.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        print(f"[apple_health] XML parse error: {e}")
        return {}

    cutoff = datetime.now() - timedelta(days=lookback_days)
    raw: dict = defaultdict(list)
    sleep_minutes: dict = defaultdict(float)   # date → minutes asleep

    for record in root.iter("Record"):
        rtype = record.get("type", "")
        end_date_str = record.get("endDate", "")

        # Parse date
        try:
            end_date = datetime.strptime(end_date_str[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

        if end_date < cutoff:
            continue

        # Sleep — special handling
        if rtype == "HKCategoryTypeIdentifierSleepAnalysis":
            val = record.get("value", "")
            stage = SLEEP_VALUES.get(val, "")
            if stage in ("asleep", "core", "deep", "rem"):
                start_str = record.get("startDate", "")
                try:
                    start_date = datetime.strptime(start_str[:19], "%Y-%m-%d %H:%M:%S")
                    duration_min = (end_date - start_date).total_seconds() / 60
                    day_key = end_date.strftime("%Y-%m-%d")
                    sleep_minutes[day_key] += duration_min
                    # Track stages
                    raw[f"sleep_{stage}"].append(duration_min)
                except ValueError:
                    pass
            continue

        # Numeric records
        if rtype in RECORD_TYPES:
            friendly_name, unit = RECORD_TYPES[rtype]
            try:
                value = float(record.get("value", "0"))
                raw[friendly_name].append(value)
            except ValueError:
                pass

    return _summarize(raw, sleep_minutes)


def _summarize(raw: dict, sleep_minutes: dict) -> dict:
    """Convert raw lists into summary stats."""
    summary = {}

    def avg(lst): return round(statistics.mean(lst), 1) if lst else None
    def latest(lst): return round(lst[-1], 1) if lst else None

    # HRV — average of last 30 days
    if raw.get("hrv_ms"):
        summary["hrv"] = {
            "avg_ms": avg(raw["hrv_ms"]),
            "latest_ms": latest(raw["hrv_ms"]),
            "n_readings": len(raw["hrv_ms"])
        }

    # Resting HR
    if raw.get("resting_hr_bpm"):
        summary["resting_hr"] = {
            "avg_bpm": avg(raw["resting_hr_bpm"]),
            "latest_bpm": latest(raw["resting_hr_bpm"])
        }

    # SpO2
    if raw.get("spo2_pct"):
        vals = [v * 100 if v < 2 else v for v in raw["spo2_pct"]]  # normalize 0-1 → %
        summary["spo2"] = {
            "avg_pct": avg(vals),
            "latest_pct": latest(vals)
        }

    # Sleep — average nightly minutes → hours
    if sleep_minutes:
        nightly = list(sleep_minutes.values())
        avg_min = statistics.mean(nightly)
        summary["sleep"] = {
            "avg_hours": round(avg_min / 60, 1),
            "avg_minutes_total": round(avg_min, 0),
            "n_nights": len(nightly),
            "avg_deep_min": avg(raw.get("sleep_deep", [])),
            "avg_rem_min": avg(raw.get("sleep_rem", []))
        }

    # Steps
    if raw.get("steps"):
        summary["steps"] = {
            "avg_daily": avg(raw["steps"]),
            "total": int(sum(raw["steps"]))
        }

    # Active calories
    if raw.get("active_calories"):
        summary["active_calories"] = {
            "avg_daily_kcal": avg(raw["active_calories"])
        }

    # VO2 max
    if raw.get("vo2_max"):
        summary["vo2_max"] = {
            "latest": latest(raw["vo2_max"])
        }

    return summary
