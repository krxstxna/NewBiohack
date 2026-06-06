"""
Claude chat service.

Builds a rich system prompt from the user's lab reports, genes, and wearable context,
then calls the Claude API with full conversation history for multi-turn chat.
"""

import os
import anthropic

MAX_HISTORY_TURNS = 20
CHAT_MODEL = os.environ.get("GENOFIT_CHAT_MODEL", "claude-sonnet-4-6")

REPORT_TYPE_LABELS = {
    "bloodwork": "Bloodwork",
    "genetic": "Genetic",
    "ancestry": "Ancestry",
    "microbiome": "Gut microbiome",
    "other": "Lab report",
}


def build_system_prompt(genes: dict, metrics: dict, lab_reports: list) -> str:
    report_lines = []
    for report in lab_reports:
        rtype = REPORT_TYPE_LABELS.get(report.get("report_type", ""), "Lab report")
        fname = report.get("filename", "report")
        summary = report.get("summary", "")
        report_lines.append(f"  [{rtype}] {fname}: {summary}")
        markers = report.get("markers") or {}
        for name, value in list(markers.items())[:8]:
            report_lines.append(f"    - {name}: {value}")
        if len(markers) > 8:
            report_lines.append(f"    - ... and {len(markers) - 8} more markers")

    report_block = "\n".join(report_lines) if report_lines else "  No lab reports loaded yet."

    gene_lines = []
    for gene, info in genes.items():
        variant = info.get("variant", "unknown")
        phenotype = info.get("phenotype", "unknown")
        gene_lines.append(f"  - {gene} ({variant}): {phenotype}")

    gene_block = "\n".join(gene_lines) if gene_lines else "  No genetic variants extracted yet."

    metric_lines = []
    hrv = metrics.get("hrv", {})
    if hrv:
        metric_lines.append(f"  - HRV: {hrv.get('latest_ms', 'N/A')} ms (30-day avg: {hrv.get('avg_ms', 'N/A')} ms)")

    rhr = metrics.get("resting_hr", {})
    if rhr:
        metric_lines.append(f"  - Resting HR: {rhr.get('latest_bpm', 'N/A')} bpm (avg: {rhr.get('avg_bpm', 'N/A')} bpm)")

    spo2 = metrics.get("spo2", {})
    if spo2:
        metric_lines.append(f"  - SpO2: {spo2.get('latest_pct', 'N/A')}% (avg: {spo2.get('avg_pct', 'N/A')}%)")

    sleep = metrics.get("sleep", {})
    if sleep:
        deep = sleep.get("avg_deep_min")
        rem = sleep.get("avg_rem_min")
        metric_lines.append(
            f"  - Sleep: {sleep.get('avg_hours', 'N/A')} hrs avg/night "
            f"(deep: {round(deep, 0) if deep else 'N/A'} min, REM: {round(rem, 0) if rem else 'N/A'} min)"
        )

    steps = metrics.get("steps", {})
    if steps:
        metric_lines.append(f"  - Steps: {steps.get('avg_daily', 'N/A')} avg/day")

    vo2 = metrics.get("vo2_max", {})
    if vo2:
        metric_lines.append(f"  - VO2 Max: {vo2.get('latest', 'N/A')} mL/kg/min")

    metric_block = "\n".join(metric_lines) if metric_lines else "  No wearable data loaded yet."

    return f"""You are GenoFit, an expert AI that interprets lab results and wearable health data together. You connect bloodwork, genetic reports, microbiome data, and daily biometrics to explain WHY the user's health signals look the way they do.

== User's Lab Reports ==
{report_block}

== Genetic Variants (from reports) ==
{gene_block}

== Wearable Metrics (last 30 days) ==
{metric_block}

== Your role ==
- Ground answers in the user's SPECIFIC lab values, genes, and wearable data — not generic advice.
- Connect across data sources (e.g. low ferritin on bloodwork + elevated resting HR on wearable → possible oxygen-transport limitation).
- Be precise about values, mechanisms, and how different report types relate.
- Keep responses concise (100–150 words max) unless the user asks for detail.
- End most responses with ONE actionable insight tailored to their data.
- Never give medical diagnoses or tell them to stop medications. Frame everything as informational context.
- If data is missing for a question, acknowledge it and work with what's available.
- Use plain, confident language — no jargon dumps.
"""


async def chat_with_context(
    message: str,
    genes: dict,
    metrics: dict,
    lab_reports: list,
    history: list,
) -> tuple[str, list]:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    trimmed_history = history[-(MAX_HISTORY_TURNS * 2):]
    messages = trimmed_history + [{"role": "user", "content": message}]

    response = await client.messages.create(
        model=CHAT_MODEL,
        max_tokens=1000,
        system=build_system_prompt(genes, metrics, lab_reports),
        messages=messages,
    )

    reply = response.content[0].text
    updated_history = messages + [{"role": "assistant", "content": reply}]
    return reply, updated_history
