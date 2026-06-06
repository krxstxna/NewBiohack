"""
Claude chat service.

Builds a rich system prompt from the user's gene + wearable context,
then calls the Claude API with full conversation history for multi-turn chat.
"""

import os
import anthropic

MAX_HISTORY_TURNS = 20   # keep last N user+assistant pairs to avoid context bloat
CHAT_MODEL = os.environ.get("GENOFIT_CHAT_MODEL", "claude-sonnet-4-6")


def build_system_prompt(genes: dict, metrics: dict) -> str:
    """
    Construct a grounded system prompt that injects gene and wearable context.
    """
    gene_lines = []
    for gene, info in genes.items():
        variant = info.get("variant", "unknown")
        phenotype = info.get("phenotype", "unknown")
        gene_lines.append(f"  - {gene} ({variant}): {phenotype}")

    gene_block = "\n".join(gene_lines) if gene_lines else "  No gene data loaded yet."

    metric_lines = []

    hrv = metrics.get("hrv", {})
    if hrv:
        metric_lines.append(f"  - HRV: {hrv.get('latest_ms', 'N/A')} ms (30-day avg: {hrv.get('avg_ms', 'N/A')} ms, {hrv.get('n_readings', 0)} readings)")

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
            f"  - Sleep: {sleep.get('avg_hours', 'N/A')} hrs avg per night "
            f"(deep: {round(deep, 0) if deep else 'N/A'} min, REM: {round(rem, 0) if rem else 'N/A'} min)"
        )

    steps = metrics.get("steps", {})
    if steps:
        metric_lines.append(f"  - Steps: {steps.get('avg_daily', 'N/A')} avg/day")

    vo2 = metrics.get("vo2_max", {})
    if vo2:
        metric_lines.append(f"  - VO2 Max: {vo2.get('latest', 'N/A')} mL/kg/min")

    metric_block = "\n".join(metric_lines) if metric_lines else "  No wearable data loaded yet."

    return f"""You are GenoFit, an expert AI that interprets wearable health data through the lens of pharmacogenomic (GeneSight) results. Your job is to explain WHY wearable readings look the way they do, grounded in the user's specific genetic variants.

== User's GeneSight Gene Profile ==
{gene_block}

== User's Apple Health Metrics (last 30 days) ==
{metric_block}

== Your role ==
- When the user asks about a metric or symptom, connect it to their SPECIFIC genotypes (not generic explanations).
- Be precise: name the gene, the variant, and the mechanism (e.g. "your COMT Val/Val slows dopamine clearance, which keeps your sympathetic nervous system activated longer after stress — this suppresses HRV recovery").
- Keep responses concise (100–150 words max) unless the user asks for detail.
- End most responses with ONE actionable insight tailored to their genetics.
- Never give medical diagnoses or tell them to stop medications. Frame everything as informational context.
- If gene or metric data is missing, acknowledge it naturally and work with what's available.
- Use plain, confident language — no jargon dumps.
"""


async def chat_with_context(
    message: str,
    genes: dict,
    metrics: dict,
    history: list
) -> tuple[str, list]:
    """
    Send a message with full conversation history and genomic context.
    Returns (reply_text, updated_history).
    """
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # Build messages array: trim history to avoid token bloat
    trimmed_history = history[-(MAX_HISTORY_TURNS * 2):]
    messages = trimmed_history + [{"role": "user", "content": message}]

    response = await client.messages.create(
        model=CHAT_MODEL,
        max_tokens=1000,
        system=build_system_prompt(genes, metrics),
        messages=messages
    )

    reply = response.content[0].text

    # Append this turn to history
    updated_history = messages + [{"role": "assistant", "content": reply}]

    return reply, updated_history
