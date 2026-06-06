"""
GenomeCoach chat service — ChatGPT-style API via Nebius Token Factory.
"""

import json
import re

from openai import AsyncOpenAI

from services.openai_client import async_client, get_chat_model, get_literature_model

MAX_HISTORY_TURNS = 20

REPORT_TYPE_LABELS = {
    "bloodwork": "Bloodwork",
    "genetic": "Genetic",
    "ancestry": "Ancestry",
    "microbiome": "Gut microbiome",
    "other": "Lab report",
}

GENOMECOACH_PROMPT = """You are GenomeCoach, an expert translational sports-health analyst. You synthesize pharmacogenomic reports (e.g. Genesight), laboratory bloodwork, uploaded medical documents, wearable biometric trends, and self-reported anthropometrics into a unified athlete profile.

## Your job
1. Classify the user into exactly ONE primary archetype and up to TWO secondary archetypes from the list below.
2. Cross-reference genetics, labs, and wearables — every major claim must cite at least two data domains when data exists.
3. Call the literature_search tool for each significant gene variant, abnormal lab, or wearable pattern before writing recommendations.
4. Produce actionable recovery, training, and nutrition guidance tailored to the archetype and this specific person.
5. Explain genetics and wearable links in plain language a non-scientist athlete can understand in under 60 seconds of reading.
6. Structure all output into exactly FOUR app pages: your_story, train, fuel, rest_recovery. Each page must synthesize genetics, labs, wearables, and profile data relevant to that domain — never silo by data type alone.

## Archetype definitions (use these names only)

| ID | Name | Genetic signals | Wearable / lab signals |
|----|------|-----------------|------------------------|
| forge | Forge | COMT Val/Val (rs4680 GG) | Low HRV, elevated resting HR, slow recovery after hard blocks |
| drift | Drift | SLC6A4 S/S (serotonin transporter) | Fragmented sleep, low REM %, mood/performance swings with poor sleep |
| volt | Volt | HTR2A variant + COMT Val/Val + SLC6A4 S/S | Erratic HRV, high reactivity to stress/training, inconsistent readiness scores |
| titan | Titan | MTHFR C677T homozygous (rs1801133 TT) | Elevated homocysteine, chronic low energy, poor adaptation despite moderate training load |
| blitz | Blitz | CYP2D6 ultrarapid + CYP2C19 rapid metabolizer | Fast caffeine clearance, muted supplement response, strong VO2 gains with standard training |
| pulse | Pulse | ADRB2 variant | Exaggerated HR response to effort, slow HR recovery, high endurance training responsiveness |
| surge | Surge | IL-6 / TNF-alpha inflammatory variants | Elevated CRP, overnight SpO2 dips, plateaus despite consistent training, slow HRV rebound |
| prime | Prime | COMT Met/Met + SLC6A4 L/L + normal CYP2D6 | Strong HRV baseline, predictable recovery, labs and wearables align with effort |

Score each archetype 0–100. Primary = highest score. Secondary = 2nd and 3rd if within 15 points of primary. State confidence (high/medium/low) based on data completeness.

## Cross-domain connection rules (mandatory)

For each connection you surface, use this format internally:
- GENE/LAB signal → expected physiology → WEARABLE metric that should reflect it → does this user's data confirm or contradict?

Examples you must look for:
- MTHFR + homocysteine ↑ → impaired methylation → low energy + poor recovery → check resting HR trend + HRV rebound days
- COMT Val/Val → prolonged catecholamine clearance → elevated resting HR + difficulty downshifting → check sleep HR + morning HRV
- CYP2D6 ultrarapid → rapid drug/supplement metabolism → check caffeine timing vs sleep latency from wearable
- SLC6A4 S/S + low REM → serotonin regulation → performance variance → correlate sleep stages with next-day HRV/training readiness
- IL-6 variants + CRP ↑ → systemic inflammation → SpO2 dips, elevated overnight HR → correlate with overreaching signals
- ADRB2 → beta-2 receptor sensitivity → HR overshoot on intervals → correlate interval HR peaks vs recovery HR at 60s/120s

If wearable data contradicts genetic expectation, say so explicitly and hypothesize why (acclimatization, medication, data quality, recent illness).

## Four-page output rules

### your_story (Your Story page)
- Include full archetype block (primary, secondary, scores, confidence, narrative, matching_markers).
- Include plain_explanation (headline, body ≤120 words, analogy).
- Include ALL cross-domain connections (3–5) and literature citations (3–6).
- Include data_at_a_glance: top genetics, labs, and wearable metrics summarizing the whole profile.

### train (Train page)
- Hero summary tied to archetype + wearable performance data.
- data_insights: relevant genetics, labs, and wearable metrics for training only.
- 3–5 training tips. Periodization, intensity caps, deload triggers tied to wearable thresholds. Never prescribe dangerous volumes.
- this_week_focus: single prioritized training action.
- 1–2 train-specific connections inline.

### fuel (Fuel page)
- Hero summary tied to nutrition/metabolism genetics and labs.
- data_insights: MTHFR, CYP variants, B12, folate, ferritin, vitamin D, homocysteine, user meds/supplements.
- 3–5 nutrition tips. Micronutrients tied to genetics (e.g. methylfolate for MTHFR, omega-3 for Surge), timing, hydration.
- stack_notes: per med/supplement metabolism note + 2–3 suggested additions. Never advise stopping prescriptions.
- 1–2 fuel-specific connections inline.

### rest_recovery (Rest & Recovery page)
- Hero: recovery score + sleep score from wearable when available.
- data_insights: sleep stages, HRV, resting HR, SpO2, SLC6A4/COMT genetics, CRP/cortisol if relevant.
- sleep_tips: 3–4 tips (bedtime, REM, wind-down, caffeine cutoff) + tonight action line.
- recovery_tips: 3–5 tips (HRV-guided rest, stress downregulation, active recovery). Do not duplicate sleep hygiene.
- 1–2 rest-specific connections inline.

### All tips format
- Each tip: title, one sentence "what", one sentence "why" linked to their data, optional "watch_for" wearable sign, data_sources array.

## Tone and safety

- Confident but humble. Use "your data suggests" not "you have."
- Never diagnose disease. Frame labs as "markers to discuss with your clinician."
- Flag critical labs (homocysteine >15, CRP >10, ferritin extremes) in flags array for physician follow-up.
- Do not recommend stopping or changing prescribed medications.
- Include disclaimer: educational only, not medical advice.

## Output

Respond ONLY with valid JSON matching the provided schema. Top-level keys: archetype, your_story, train, fuel, rest_recovery, flags, disclaimer. No markdown fences, no preamble.

## JSON schema

{
  "archetype": {
    "primary": {"id": "forge", "name": "Forge", "score": 0, "confidence": "high|medium|low"},
    "secondary": [{"id": "drift", "name": "Drift", "score": 0}],
    "scores": {"forge": 0, "drift": 0, "volt": 0, "titan": 0, "blitz": 0, "pulse": 0, "surge": 0, "prime": 0},
    "narrative": "string",
    "matching_markers": ["string"]
  },
  "your_story": {
    "plain_explanation": {"headline": "string", "body": "string", "analogy": "string"},
    "connections": [{"title": "string", "analysis": "string", "data_sources": ["string"]}],
    "literature_citations": [{"topic": "string", "summary": "string"}],
    "data_at_a_glance": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"]}
  },
  "train": {
    "hero_summary": "string",
    "data_insights": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"]},
    "tips": [{"title": "string", "what": "string", "why": "string", "watch_for": "string", "data_sources": ["string"]}],
    "this_week_focus": "string",
    "connections": [{"title": "string", "analysis": "string", "data_sources": ["string"]}]
  },
  "fuel": {
    "hero_summary": "string",
    "data_insights": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"], "medications": ["string"]},
    "tips": [{"title": "string", "what": "string", "why": "string", "watch_for": "string", "data_sources": ["string"]}],
    "stack_notes": [{"item": "string", "note": "string"}],
    "suggested_additions": ["string"],
    "connections": [{"title": "string", "analysis": "string", "data_sources": ["string"]}]
  },
  "rest_recovery": {
    "hero": {"recovery_score": "string", "sleep_score": "string", "summary": "string"},
    "data_insights": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"]},
    "sleep_tips": [{"title": "string", "what": "string", "why": "string", "watch_for": "string", "data_sources": ["string"]}],
    "recovery_tips": [{"title": "string", "what": "string", "why": "string", "watch_for": "string", "data_sources": ["string"]}],
    "tonight_action": "string",
    "connections": [{"title": "string", "analysis": "string", "data_sources": ["string"]}]
  },
  "flags": [{"marker": "string", "note": "string"}],
  "disclaimer": "Educational only, not medical advice."
}"""

LITERATURE_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "literature_search",
        "description": (
            "Look up pharmacogenomics, sports medicine, and recovery literature for a "
            "gene variant, abnormal lab marker, or wearable pattern before making recommendations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Gene variant, lab marker, or wearable pattern to research",
                }
            },
            "required": ["query"],
        },
    },
}


async def run_literature_search(client: AsyncOpenAI, query: str) -> str:
    response = await client.chat.completions.create(
        model=get_literature_model(),
        max_tokens=500,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a pharmacogenomics and sports medicine literature assistant. "
                    "Summarize 2–3 relevant peer-reviewed findings for the query. "
                    "Include gene/marker names, expected physiology, and practical athlete implications. "
                    "Be concise and cite study types (e.g. meta-analysis, RCT) when known."
                ),
            },
            {"role": "user", "content": query},
        ],
    )
    return response.choices[0].message.content or ""


def build_system_prompt(genes: dict, metrics: dict, lab_reports: list) -> str:
    report_lines = []
    for report in lab_reports:
        rtype = REPORT_TYPE_LABELS.get(report.get("report_type", ""), "Lab report")
        fname = report.get("filename", "report")
        summary = report.get("summary", "")
        report_lines.append(f"  [{rtype}] {fname}: {summary}")
        markers = report.get("markers") or {}
        for name, value in list(markers.items())[:12]:
            report_lines.append(f"    - {name}: {value}")
        if len(markers) > 12:
            report_lines.append(f"    - ... and {len(markers) - 12} more markers")

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
        metric_lines.append(
            f"  - HRV: {hrv.get('latest_ms', 'N/A')} ms "
            f"(30-day avg: {hrv.get('avg_ms', 'N/A')} ms, {hrv.get('n_readings', 0)} readings)"
        )

    rhr = metrics.get("resting_hr", {})
    if rhr:
        metric_lines.append(
            f"  - Resting HR: {rhr.get('latest_bpm', 'N/A')} bpm "
            f"(avg: {rhr.get('avg_bpm', 'N/A')} bpm)"
        )

    spo2 = metrics.get("spo2", {})
    if spo2:
        metric_lines.append(
            f"  - SpO2: {spo2.get('latest_pct', 'N/A')}% (avg: {spo2.get('avg_pct', 'N/A')}%)"
        )

    sleep = metrics.get("sleep", {})
    if sleep:
        deep = sleep.get("avg_deep_min")
        rem = sleep.get("avg_rem_min")
        metric_lines.append(
            f"  - Sleep: {sleep.get('avg_hours', 'N/A')} hrs avg/night "
            f"(deep: {round(deep, 0) if deep else 'N/A'} min, "
            f"REM: {round(rem, 0) if rem else 'N/A'} min)"
        )

    steps = metrics.get("steps", {})
    if steps:
        metric_lines.append(f"  - Steps: {steps.get('avg_daily', 'N/A')} avg/day")

    vo2 = metrics.get("vo2_max", {})
    if vo2:
        metric_lines.append(f"  - VO2 Max: {vo2.get('latest', 'N/A')} mL/kg/min")

    metric_block = "\n".join(metric_lines) if metric_lines else "  No wearable data loaded yet."

    return f"""{GENOMECOACH_PROMPT}

== This user's uploaded data (ground every answer in these values) ==

Lab reports:
{report_block}

Genetic variants:
{gene_block}

Wearable metrics (last 30 days):
{metric_block}

When a data domain is missing, note lower confidence and avoid inventing values."""


def _strip_json_fences(raw: str) -> str:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    return raw.strip()


def extract_json_dict(raw: str) -> dict | None:
    """Parse GenomeCoach JSON from model output (handles fences and preamble text)."""
    if not raw or not raw.strip():
        return None

    candidates = [_strip_json_fences(raw), raw.strip()]
    for text in candidates:
        parsed = _try_parse_json_object(text)
        if parsed:
            return parsed

    start = raw.find("{")
    if start < 0:
        return None

    depth = 0
    for i in range(start, len(raw)):
        ch = raw[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                parsed = _try_parse_json_object(raw[start : i + 1])
                if parsed:
                    return parsed
                break

    # Truncated JSON — try closing open braces / dangling keys
    snippet = raw[start:].strip()
    snippet = re.sub(r",\s*$", "", snippet)
    if re.search(r":\s*$", snippet):
        snippet = re.sub(r":\s*$", ": null", snippet)
    for extra in range(1, 12):
        candidate = snippet + ("}" * extra)
        candidate = re.sub(r",\s*}", "}", candidate)
        candidate = re.sub(r",\s*]", "]", candidate)
        parsed = _try_parse_json_object(candidate)
        if parsed:
            return parsed
    return None


def _try_parse_json_object(text: str) -> dict | None:
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        cleaned = re.sub(r",\s*}", "}", text)
        cleaned = re.sub(r",\s*]", "]", cleaned)
        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            return None
    return None


def is_valid_profile(data: dict) -> bool:
    """Profile is usable if archetype or at least one dashboard page exists."""
    if not isinstance(data, dict):
        return False
    if data.get("archetype") or data.get("archetype_primary"):
        return True
    for key in ("your_story", "train", "fuel", "rest_recovery"):
        if data.get(key):
            return True
    return False


def normalize_profile(data: dict) -> dict:
    """Ensure four-page dashboard keys exist; migrate legacy flat schema."""
    profile = dict(data)

    if profile.get("archetype_primary") and not profile.get("archetype"):
        profile["archetype"] = {
            "primary": profile.pop("archetype_primary"),
            "secondary": profile.pop("archetype_secondary", []),
            "scores": profile.pop("archetype_scores", {}),
            "narrative": profile.get("reply", ""),
            "matching_markers": [],
        }

    story = profile.setdefault("your_story", {})
    if profile.get("connections") and not story.get("connections"):
        story["connections"] = profile.pop("connections")
    if profile.get("reply") and not story.get("plain_explanation"):
        story["plain_explanation"] = {"headline": "", "body": profile.pop("reply"), "analogy": ""}

    train = profile.setdefault("train", {})
    if profile.get("training") and not train.get("tips"):
        train["tips"] = profile.pop("training")

    fuel = profile.setdefault("fuel", {})
    if profile.get("nutrition") and not fuel.get("tips"):
        fuel["tips"] = profile.pop("nutrition")

    rest = profile.setdefault("rest_recovery", {})
    if profile.get("recovery") and not rest.get("recovery_tips"):
        rest["recovery_tips"] = profile.pop("recovery")

    profile.setdefault("flags", [])
    profile.setdefault(
        "disclaimer",
        "Educational only, not medical advice. Discuss flagged labs with your clinician.",
    )
    return profile


async def build_literature_context(genes: dict, metrics: dict, lab_reports: list) -> str:
    """Pre-run literature_search for dashboard analysis (avoids tool-loop JSON failures)."""
    queries: list[str] = []
    for gene, info in list(genes.items())[:4]:
        queries.append(f"{gene} {info.get('variant', '')} {info.get('phenotype', '')} athlete recovery")

    for report in lab_reports[:2]:
        for name in list((report.get("markers") or {}).keys())[:2]:
            queries.append(f"{name} lab marker athlete training nutrition")

    if metrics.get("hrv"):
        queries.append("heart rate variability HRV recovery athlete genetics")
    if metrics.get("sleep"):
        queries.append("sleep REM deep sleep recovery COMT SLC6A4 athlete")

    if not queries:
        queries.append("pharmacogenomics wearable recovery athlete personalization")

    client = async_client()
    notes: list[str] = []
    for query in queries[:5]:
        try:
            notes.append(f"Query: {query}\n{await run_literature_search(client, query)}")
        except Exception as exc:
            notes.append(f"Query: {query}\n(literature unavailable: {exc})")
    return "\n\n---\n\n".join(notes)


def _format_tip(tip: dict) -> str:
    parts = []
    if tip.get("title"):
        parts.append(f"<strong>{tip['title']}</strong>")
    if tip.get("what"):
        parts.append(tip["what"])
    if tip.get("why"):
        parts.append(tip["why"])
    if tip.get("watch_for"):
        parts.append(f"Watch for: {tip['watch_for']}")
    return " — ".join(parts) if parts else ""


def _format_connection(c: dict) -> str:
    title = c.get("title", "Connection")
    analysis = c.get("analysis", "")
    return f"• <strong>{title}</strong>: {analysis}"


def format_coach_response(data: dict) -> str:
    """Turn structured GenomeCoach JSON into readable chat HTML."""
    sections = []

    arch = data.get("archetype") or {}
    primary = arch.get("primary") or data.get("archetype_primary") or {}
    if primary.get("name"):
        conf = primary.get("confidence", "")
        score = primary.get("score", "")
        line = f"<strong>Primary archetype: {primary['name']}</strong>"
        if score != "":
            line += f" ({score}/100"
            if conf:
                line += f", {conf} confidence"
            line += ")"
        sections.append(line)

    secondary = arch.get("secondary") or data.get("archetype_secondary") or []
    if secondary:
        names = ", ".join(s.get("name", s.get("id", "")) for s in secondary if s)
        if names:
            sections.append(f"<strong>Secondary:</strong> {names}")

    story = data.get("your_story") or {}
    plain = story.get("plain_explanation") or {}
    if plain.get("headline"):
        sections.append(f"<strong>{plain['headline']}</strong>")
    if plain.get("body"):
        sections.append(plain["body"])
    elif data.get("reply"):
        sections.append(data["reply"])

    connections = story.get("connections") or data.get("connections") or []
    if connections:
        items = [_format_connection(c) for c in connections[:5]]
        sections.append("<strong>Key connections</strong><br>" + "<br>".join(items))

    train = data.get("train") or {}
    if train.get("this_week_focus"):
        sections.append(f"<strong>This week:</strong> {train['this_week_focus']}")

    for label, page_key, tip_key in [
        ("Training", "train", "tips"),
        ("Fuel", "fuel", "tips"),
        ("Rest & Recovery", "rest_recovery", "recovery_tips"),
    ]:
        page = data.get(page_key) or {}
        tips = page.get(tip_key) or page.get("sleep_tips") or data.get(tip_key.replace("_tips", "")) or []
        if page_key == "rest_recovery" and not tips:
            tips = (page.get("sleep_tips") or []) + (page.get("recovery_tips") or [])
        if not tips and page_key == "train":
            tips = data.get("training") or []
        if not tips and page_key == "fuel":
            tips = data.get("nutrition") or []
        if not tips and page_key == "rest_recovery":
            tips = data.get("recovery") or []
        if tips:
            items = [f"• {_format_tip(t)}" for t in tips[:5] if _format_tip(t)]
            sections.append(f"<strong>{label}</strong><br>" + "<br>".join(items))

    flags = data.get("flags") or []
    if flags:
        flag_items = [f"• {f.get('marker', 'Flag')}: {f.get('note', '')}" for f in flags[:3]]
        sections.append("<strong>Discuss with clinician</strong><br>" + "<br>".join(flag_items))

    disclaimer = data.get("disclaimer") or "Educational only, not medical advice."
    sections.append(f"<em>{disclaimer}</em>")

    return "<br><br>".join(sections)


def parse_coach_response(raw: str) -> tuple[str, dict | None]:
    """Parse model JSON output; return (display_text, parsed dict or None)."""
    data = extract_json_dict(raw)
    if data:
        return format_coach_response(data), data
    return raw, None


async def _run_coach_completion(messages: list, *, use_tools: bool = True) -> str:
    """Run GenomeCoach with optional tool-use loop; return raw model text."""
    client = async_client()
    raw = ""
    working_messages = list(messages)
    create_kwargs: dict = {
        "model": get_chat_model(),
        "max_tokens": 8192,
        "messages": working_messages,
    }
    if not use_tools:
        create_kwargs["response_format"] = {"type": "json_object"}
    else:
        create_kwargs["tools"] = [LITERATURE_SEARCH_TOOL]

    max_rounds = 6 if use_tools else 2
    for _ in range(max_rounds):
        try:
            response = await client.chat.completions.create(**create_kwargs)
        except Exception:
            if not use_tools and "response_format" in create_kwargs:
                create_kwargs.pop("response_format", None)
                response = await client.chat.completions.create(**create_kwargs)
            else:
                raise

        choice = response.choices[0]
        tool_calls = choice.message.tool_calls or []
        if use_tools and tool_calls:
            working_messages.append(choice.message.model_dump(exclude_none=True))
            for tool_call in tool_calls:
                if tool_call.function.name == "literature_search":
                    args = json.loads(tool_call.function.arguments or "{}")
                    result = await run_literature_search(client, args.get("query", ""))
                else:
                    result = f"Unknown tool: {tool_call.function.name}"
                working_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result,
                    }
                )
            create_kwargs["messages"] = working_messages
            continue

        raw = choice.message.content or ""
        break

    if use_tools and not extract_json_dict(raw):
        working_messages.append(
            {
                "role": "user",
                "content": (
                    "Stop calling tools. Output the complete dashboard as ONE JSON object with keys: "
                    "archetype, your_story, train, fuel, rest_recovery, flags, disclaimer."
                ),
            }
        )
        return await _run_coach_completion(working_messages, use_tools=False)

    return raw


ANALYZE_PROFILE_MESSAGE = (
    "Build my full GenomeCoach dashboard JSON using the uploaded data and literature notes. "
    "Populate archetype, your_story, train, fuel, rest_recovery, flags, and disclaimer. "
    "Return ONE JSON object only — no markdown fences or extra text."
)


async def analyze_profile(genes: dict, metrics: dict, lab_reports: list) -> dict | None:
    """Run initial GenomeCoach analysis for the profile dashboard (no chat history)."""
    literature = await build_literature_context(genes, metrics, lab_reports)
    system = build_system_prompt(genes, metrics, lab_reports)
    if literature:
        system += f"\n\n== Literature search results (use in citations) ==\n{literature}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": ANALYZE_PROFILE_MESSAGE},
    ]

    last_raw = ""
    for attempt in range(3):
        raw = await _run_coach_completion(messages, use_tools=False)
        last_raw = raw or last_raw
        data = extract_json_dict(raw)
        if data and is_valid_profile(data):
            return normalize_profile(data)

        messages.append({"role": "assistant", "content": raw or "{}"})
        messages.append(
            {
                "role": "user",
                "content": (
                    "That was not valid dashboard JSON. Respond with ONLY one JSON object containing "
                    "archetype, your_story, train, fuel, rest_recovery, flags, disclaimer. "
                    f"Attempt {attempt + 2} of 3."
                ),
            }
        )

    # Last resort: accept any parseable dict and normalize
    data = extract_json_dict(last_raw)
    if data:
        return normalize_profile(data)
    return None


async def chat_with_context(
    message: str,
    genes: dict,
    metrics: dict,
    lab_reports: list,
    history: list,
) -> tuple[str, list, dict | None]:
    trimmed_history = history[-(MAX_HISTORY_TURNS * 2):]
    system = build_system_prompt(genes, metrics, lab_reports)
    messages = [{"role": "system", "content": system}, *trimmed_history, {"role": "user", "content": message}]
    raw = await _run_coach_completion(messages)

    display_reply, structured = parse_coach_response(raw)

    # Store formatted reply in history so follow-up turns stay readable
    updated_history = trimmed_history + [
        {"role": "user", "content": message},
        {"role": "assistant", "content": display_reply},
    ]
    return display_reply, updated_history, structured
