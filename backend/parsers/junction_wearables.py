"""Fetch wearable summaries and chart series from Junction API (last 30 days)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
import statistics

from services.junction_client import get_junction_client


def _avg(values: list[float]) -> float | None:
    return round(statistics.mean(values), 1) if values else None


def _latest(values: list[float]) -> float | None:
    return round(values[-1], 1) if values else None


def _record_date(obj, fallback_index: int | None = None) -> str | None:
    cal = getattr(obj, "calendar_date", None)
    if cal:
        return str(cal)[:10]
    ts = getattr(obj, "timestamp", None)
    if ts:
        if isinstance(ts, datetime):
            return ts.date().isoformat()
        return str(ts)[:10]
    if fallback_index is not None:
        return (date.today() - timedelta(days=fallback_index)).isoformat()
    return None


def _aggregate_daily(points: list[dict]) -> list[dict]:
    """Average multiple readings on the same calendar day."""
    buckets: dict[str, list[float]] = defaultdict(list)
    for point in points:
        d = point.get("date")
        v = point.get("value")
        if d is None or v is None:
            continue
        buckets[str(d)[:10]].append(float(v))
    return [
        {"date": day, "value": round(statistics.mean(vals), 1)}
        for day, vals in sorted(buckets.items())
    ]


def _series_from_vital_points(points, *, transform=None) -> list[dict]:
    raw: list[dict] = []
    for idx, point in enumerate(points or []):
        value = getattr(point, "value", None)
        if value is None:
            continue
        val = float(value)
        if transform:
            val = transform(val)
        day = _record_date(point, fallback_index=len(points) - idx if points else None)
        if not day:
            continue
        raw.append({"date": day, "value": round(val, 1)})
    return _aggregate_daily(raw)


def _build_sleep_chart_series(nights) -> dict:
    hours: list[dict] = []
    deep: list[dict] = []
    rem: list[dict] = []
    light: list[dict] = []
    hrv: list[dict] = []
    resting: list[dict] = []

    for night in nights or []:
        day = _record_date(night)
        if not day:
            continue
        if night.total is not None:
            hours.append({"date": day, "value": round(float(night.total) / 3600, 2)})
        if night.deep is not None:
            deep.append({"date": day, "value": round(float(night.deep) / 60, 1)})
        if night.rem is not None:
            rem.append({"date": day, "value": round(float(night.rem) / 60, 1)})
        if night.light is not None:
            light.append({"date": day, "value": round(float(night.light) / 60, 1)})
        if night.average_hrv is not None:
            hrv.append({"date": day, "value": round(float(night.average_hrv), 1)})
        if night.hr_resting is not None:
            resting.append({"date": day, "value": round(float(night.hr_resting), 1)})

    return {
        "sleep_hours": _aggregate_daily(hours),
        "sleep_deep_min": _aggregate_daily(deep),
        "sleep_rem_min": _aggregate_daily(rem),
        "sleep_light_min": _aggregate_daily(light),
        "hrv_from_sleep": _aggregate_daily(hrv),
        "resting_hr_from_sleep": _aggregate_daily(resting),
    }


def _build_activity_chart_series(days) -> dict:
    steps: list[dict] = []
    calories: list[dict] = []
    for day_row in days or []:
        day = _record_date(day_row)
        if not day:
            continue
        if day_row.steps is not None:
            steps.append({"date": day, "value": float(day_row.steps)})
        if day_row.calories_active is not None:
            calories.append({"date": day, "value": round(float(day_row.calories_active), 1)})
    return {
        "steps": _aggregate_daily(steps),
        "active_calories": _aggregate_daily(calories),
    }


def fetch_junction_metrics(user_id: str, lookback_days: int = 30) -> dict:
    """Pull sleep, activity, HRV, resting HR, and SpO2 from Junction."""
    client = get_junction_client()
    end = date.today()
    start = end - timedelta(days=lookback_days)
    start_s = start.isoformat()
    end_s = end.isoformat()

    summary: dict = {
        "sources": ["junction"],
        "junction_user_id": user_id,
        "charts": {},
    }

    nights = []
    activity_days = []

    # Sleep summary + chart series
    try:
        sleep_resp = client.sleep.get(user_id, start_date=start_s, end_date=end_s)
        nights = sleep_resp.sleep or []
        if nights:
            durations = [n.total for n in nights if n.total is not None]
            deep = [n.deep for n in nights if n.deep is not None]
            rem = [n.rem for n in nights if n.rem is not None]
            resting = [n.hr_resting for n in nights if n.hr_resting is not None]
            hrv_sleep = [n.average_hrv for n in nights if n.average_hrv is not None]
            summary["sleep"] = {
                "avg_hours": round(statistics.mean(durations) / 3600, 1) if durations else None,
                "n_nights": len(nights),
                "avg_deep_min": _avg([d / 60 for d in deep]) if deep else None,
                "avg_rem_min": _avg([r / 60 for r in rem]) if rem else None,
            }
            if resting and "resting_hr" not in summary:
                summary["resting_hr"] = {
                    "avg_bpm": _avg(resting),
                    "latest_bpm": _latest(resting),
                }
            if hrv_sleep and "hrv" not in summary:
                summary["hrv"] = {
                    "avg_ms": _avg(hrv_sleep),
                    "latest_ms": _latest(hrv_sleep),
                    "n_readings": len(hrv_sleep),
                }
            summary["charts"].update(_build_sleep_chart_series(nights))
    except Exception as e:
        summary.setdefault("junction_errors", []).append(f"sleep: {e}")

    # Activity (steps, calories)
    try:
        activity_resp = client.activity.get(user_id, start_date=start_s, end_date=end_s)
        activity_days = activity_resp.activity or []
        if activity_days:
            steps = [d.steps for d in activity_days if d.steps is not None]
            cals = [d.calories_active for d in activity_days if d.calories_active is not None]
            if steps:
                summary["steps"] = {
                    "avg_daily": _avg(steps),
                    "total": int(sum(steps)),
                }
            if cals:
                summary["active_calories"] = {"avg_daily_kcal": _avg(cals)}
            summary["charts"].update(_build_activity_chart_series(activity_days))
    except Exception as e:
        summary.setdefault("junction_errors", []).append(f"activity: {e}")

    # Vitals time series
    for vital_name, key, parser in [
        ("hrv", "hrv", lambda pts: [p.value for p in pts if p.value is not None]),
        ("heartrate", "resting_hr", lambda pts: [p.value for p in pts if p.value is not None]),
        ("blood_oxygen", "spo2", lambda pts: [p.value for p in pts if p.value is not None]),
    ]:
        try:
            method = getattr(client.vitals, vital_name)
            points = method(user_id, start_date=start_s, end_date=end_s)
            values = parser(points)
            chart_key = {"hrv": "hrv", "resting_hr": "resting_hr", "spo2": "spo2"}[key]
            if key == "spo2":
                summary["charts"][chart_key] = _series_from_vital_points(
                    points,
                    transform=lambda v: v * 100 if v <= 1 else v,
                )
            else:
                summary["charts"][chart_key] = _series_from_vital_points(points)

            if not values:
                continue
            if key == "hrv":
                summary["hrv"] = {
                    "avg_ms": _avg(values),
                    "latest_ms": _latest(values),
                    "n_readings": len(values),
                }
            elif key == "resting_hr":
                summary["resting_hr"] = {
                    "avg_bpm": _avg(values),
                    "latest_bpm": _latest(values),
                }
            elif key == "spo2":
                norm = [v * 100 if v <= 1 else v for v in values]
                summary["spo2"] = {
                    "avg_pct": _avg(norm),
                    "latest_pct": _latest(norm),
                }
        except Exception as e:
            summary.setdefault("junction_errors", []).append(f"{vital_name}: {e}")

    # Prefer dedicated vitals HRV series; fall back to sleep-derived HRV
    charts = summary.get("charts") or {}
    if not charts.get("hrv") and charts.get("hrv_from_sleep"):
        charts["hrv"] = charts["hrv_from_sleep"]
    if not charts.get("resting_hr") and charts.get("resting_hr_from_sleep"):
        charts["resting_hr"] = charts["resting_hr_from_sleep"]

    if not summary["charts"]:
        summary.pop("charts", None)

    return summary


def merge_wearable_metrics(primary: dict, junction: dict) -> dict:
    """Merge Apple Health (primary) with Junction; Junction fills missing fields."""
    if not junction:
        return primary

    merged = dict(primary or {})
    sources = list(merged.get("sources") or [])
    if "apple_health" not in sources and primary:
        sources.insert(0, "apple_health")
    for src in junction.get("sources") or []:
        if src not in sources:
            sources.append(src)
    merged["sources"] = sources

    for key, value in junction.items():
        if key in ("sources", "junction_errors", "junction_user_id", "charts"):
            continue
        if key not in merged or not merged[key]:
            merged[key] = value

    if junction.get("charts"):
        merged_charts = dict(merged.get("charts") or {})
        for chart_key, series in junction["charts"].items():
            if chart_key.endswith("_from_sleep"):
                continue
            if chart_key not in merged_charts or not merged_charts[chart_key]:
                merged_charts[chart_key] = series
        if merged_charts:
            merged["charts"] = merged_charts

    if junction.get("junction_user_id"):
        merged["junction_user_id"] = junction["junction_user_id"]
    if junction.get("junction_errors"):
        merged["junction_errors"] = junction.get("junction_errors", [])

    return merged
