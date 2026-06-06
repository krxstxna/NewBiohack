"""Fetch wearable summaries from Junction API (last 30 days)."""

from datetime import date, timedelta
import statistics

from services.junction_client import get_junction_client


def _avg(values: list[float]) -> float | None:
    return round(statistics.mean(values), 1) if values else None


def _latest(values: list[float]) -> float | None:
    return round(values[-1], 1) if values else None


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
    }

    # Sleep summary
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
    except Exception as e:
        summary.setdefault("junction_errors", []).append(f"sleep: {e}")

    # Activity (steps, calories)
    try:
        activity_resp = client.activity.get(user_id, start_date=start_s, end_date=end_s)
        days = activity_resp.activity or []
        if days:
            steps = [d.steps for d in days if d.steps is not None]
            cals = [d.calories_active for d in days if d.calories_active is not None]
            if steps:
                summary["steps"] = {
                    "avg_daily": _avg(steps),
                    "total": int(sum(steps)),
                }
            if cals:
                summary["active_calories"] = {"avg_daily_kcal": _avg(cals)}
    except Exception as e:
        summary.setdefault("junction_errors", []).append(f"activity: {e}")

    # Vitals time series
    for vital_name, key, parser in [
        ("hrv", "hrv", lambda pts: [p.value for p in pts if p.value is not None]),
        ("heartrate", "resting_hr", lambda pts: [p.value for p in pts if p.value is not None]),
        ("blood_oxygen", "spo2", lambda pts: [p.value for p in pts if p.value is not None]),
    ]:
        if key in summary and key != "resting_hr":
            continue
        try:
            method = getattr(client.vitals, vital_name)
            points = method(user_id, start_date=start_s, end_date=end_s)
            values = parser(points)
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
        if key in ("sources", "junction_errors", "junction_user_id"):
            continue
        if key not in merged or not merged[key]:
            merged[key] = value

    if junction.get("junction_user_id"):
        merged["junction_user_id"] = junction["junction_user_id"]
    if junction.get("junction_errors"):
        merged["junction_errors"] = junction.get("junction_errors", [])

    return merged
