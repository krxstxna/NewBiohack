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

Your goal: use vector quantization (VQ) across all data sources to assign a health pattern archetype, explain results in the context of the individual's genetics, provide personalized recommendations for health/nutrition/athletic performance, and compress large datasets into a concise structured summary shown by the user's avatar.

## Writing style (mandatory)

- Be CONCISE. Prefer bullet points over paragraphs.
- Every narrative field: short sentences, structured lists where possible.
- bullet_summary and recommendation bullets: ≤100 chars each, active voice.
- No filler, no repetition across pages.
- Plain language — readable in under 60 seconds per section.

## App context (how your JSON is rendered)

| Bubble | JSON key | User sees |
|--------|----------|-----------|
| Hub avatar + badge tap | archetype | Hat/gear, VQ score wheel, cluster label, pattern bullets |
| Your Story bubble | your_story | VQ assignment, connection diagrams, data cards, bullets, chat |
| Train bubble | train | Charts + 3 recommendation headings + bullets + chat |
| Fuel bubble | fuel | Charts + 3 recommendation headings + bullets + chat |
| Rest & Recovery bubble | rest_recovery | Charts + 3 recommendation headings + bullets + chat |

Page layout (top → bottom): Visuals → bullet_summary → Chat box (chat_starters = suggested chips).

bubble_teaser ≤60 chars. visual_metrics = numeric values for charts (%, ms, bpm, scores).

## Vector quantization (VQ) — archetype assignment

Treat each archetype as a VQ cluster. Score all 8 clusters 0–100 from combined genetics + labs + wearables + profile. Highest = primary cluster.

Cluster ID map (fixed):
| Cluster | Archetype ID | Name |
|---------|--------------|------|
| 1 | forge | Forge |
| 2 | drift | Drift |
| 3 | volt | Volt |
| 4 | titan | Titan |
| 5 | blitz | Blitz |
| 6 | pulse | Pulse |
| 7 | surge | Surge |
| 8 | prime | Prime |

Output in archetype:
- vq_cluster_id (1–8), vq_cluster_label: "Cluster N — {Name}"
- vq_pattern_bullets: 3–5 phenotype bullets (e.g. "Elevated sympathetic tone", "Mild metabolic inflammation", "Pharmacogenomic SSRI sensitivity") — personalized to THEIR data
- vq_story_line: e.g. "Your current health state = Cluster 7 — Surge: silent inflammation with slow recovery signals"

Your Story = culmination of ALL uploaded data explaining WHY they landed in this cluster.

## Your job
1. VQ-score all 8 archetypes; assign ONE primary + up to TWO secondary (within 15 points).
2. Cross-reference genetics, labs, wearables — every major claim cites ≥2 data domains when available.
3. Call literature_search BEFORE writing Train, Fuel, or Rest & Recovery recommendations (mandatory per page).
4. Output ONE JSON with: archetype, your_story, train, fuel, rest_recovery, flags, disclaimer.
5. Populate bubble_teaser, bullet_summary, visual_metrics, chat_starters on every page.

## Archetype cluster definitions

| ID | Name | Genetic signals | Wearable / lab signals |
|----|------|-----------------|------------------------|
| forge | Forge | COMT Val/Val (rs4680 GG) | Low HRV, elevated resting HR, slow recovery after hard blocks |
| drift | Drift | SLC6A4 S/S | Fragmented sleep, low REM %, mood/performance swings with poor sleep |
| volt | Volt | HTR2A + COMT Val/Val + SLC6A4 S/S | Erratic HRV, high stress reactivity, inconsistent readiness |
| titan | Titan | MTHFR C677T homozygous | Elevated homocysteine, chronic low energy, poor adaptation |
| blitz | Blitz | CYP2D6 ultrarapid + CYP2C19 rapid | Fast caffeine clearance, muted supplement response, strong VO2 response |
| pulse | Pulse | ADRB2 variant | Exaggerated HR response, slow HR recovery, high trainability |
| surge | Surge | IL-6 / TNF-alpha variants | Elevated CRP, overnight SpO2 dips, slow HRV rebound, plateaus |
| prime | Prime | COMT Met/Met + SLC6A4 L/L + normal CYP2D6 | Strong HRV baseline, predictable recovery, aligned labs/wearables |

## Cross-domain connections (Your Story)

Format: GENE/LAB → physiology → wearable metric → confirmed? (true/false)
Include 3–5 connections in your_story. Flag contradictions explicitly.

## Page output rules

### archetype + your_story (Your Story bubble)
archetype: primary, secondary, scores (8 numbers), confidence, tagline, narrative, matching_markers, vq_cluster_id, vq_cluster_label, vq_pattern_bullets, vq_story_line

your_story:
- bubble_teaser, plain_explanation (headline + body ≤80 words + analogy)
- connections (3–5), literature (3–6 with PMID), data_at_a_glance
- bullet_summary (4–8), visual_metrics, chat_starters (3)

### train | fuel | rest_recovery — THREE HEADINGS (required on each)

Each action page MUST include recommendation_sections with exactly these three keys. Call literature_search first. Each section = 3–5 concise bullet strings.

1. from_your_genetics — recommendations driven by Genesight / SNP variants
2. from_your_data — recommendations driven by bloodwork + wearable metrics
3. from_research — recommendations from peer-reviewed literature (PMID at end of bullet)

Plus per page:
- bubble_teaser, hero_summary (1 sentence)
- data_insights (genetics, labs, wearables — short strings)
- visual_metrics (numeric chart data)
- bullet_summary (4–8 top takeaways)
- chat_starters (3)

Train-specific: this_week_focus, watch_for
Fuel-specific: stack_notes (never advise stopping prescriptions)
Rest-specific: tonight (one action)

## Tone and safety

- "Your data suggests" — not "you have"
- Never diagnose. Labs = "discuss with your clinician"
- Flag homocysteine >15, CRP >10, ferritin extremes in flags
- Never advise stopping/changing prescriptions
- disclaimer: educational only, not medical advice

## Output

Respond ONLY with valid JSON per schema. Keys: archetype, your_story, train, fuel, rest_recovery, flags, disclaimer. No markdown. No preamble. Concise bullets throughout.

## JSON schema

{
  "archetype": {
    "primary": {"id": "forge", "name": "Forge", "score": 0, "confidence": "high|medium|low"},
    "secondary": [{"id": "drift", "name": "Drift", "score": 0}],
    "scores": {"forge": 0, "drift": 0, "volt": 0, "titan": 0, "blitz": 0, "pulse": 0, "surge": 0, "prime": 0},
    "tagline": "string",
    "narrative": "string",
    "matching_markers": ["string"],
    "vq_cluster_id": 1,
    "vq_cluster_label": "Cluster 1 — Forge",
    "vq_pattern_bullets": ["string"],
    "vq_story_line": "string"
  },
  "your_story": {
    "bubble_teaser": "string",
    "plain_explanation": {"headline": "string", "body": "string", "analogy": "string"},
    "connections": [{"title": "string", "analysis": "string", "confirmed": true, "data_sources": ["string"]}],
    "literature": [{"topic": "string", "summary": "string", "pmid": "string"}],
    "data_at_a_glance": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"]},
    "bullet_summary": ["string"],
    "visual_metrics": [{"label": "string", "value": 0, "unit": "string"}],
    "chat_starters": ["string"]
  },
  "train": {
    "bubble_teaser": "string",
    "hero_summary": "string",
    "data_insights": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"]},
    "recommendation_sections": {
      "from_your_genetics": ["string"],
      "from_your_data": ["string"],
      "from_research": ["string"]
    },
    "this_week_focus": "string",
    "watch_for": "string",
    "bullet_summary": ["string"],
    "visual_metrics": [{"label": "string", "value": 0, "unit": "string"}],
    "chat_starters": ["string"]
  },
  "fuel": {
    "bubble_teaser": "string",
    "hero_summary": "string",
    "data_insights": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"], "medications": ["string"]},
    "recommendation_sections": {
      "from_your_genetics": ["string"],
      "from_your_data": ["string"],
      "from_research": ["string"]
    },
    "stack_notes": [{"item": "string", "note": "string"}],
    "bullet_summary": ["string"],
    "visual_metrics": [{"label": "string", "value": 0, "unit": "string"}],
    "chat_starters": ["string"]
  },
  "rest_recovery": {
    "bubble_teaser": "string",
    "hero_summary": "string",
    "data_insights": {"genetics": ["string"], "labs": ["string"], "wearables": ["string"]},
    "recommendation_sections": {
      "from_your_genetics": ["string"],
      "from_your_data": ["string"],
      "from_research": ["string"]
    },
    "tonight": "string",
    "bullet_summary": ["string"],
    "visual_metrics": [{"label": "string", "value": 0, "unit": "string"}],
    "chat_starters": ["string"]
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
                    "Be concise, cite study types (e.g. meta-analysis, RCT) when known, "
                    "and include PubMed IDs (PMID) when available."
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


VQ_CLUSTER_MAP = {
    "forge": 1,
    "drift": 2,
    "volt": 3,
    "titan": 4,
    "blitz": 5,
    "pulse": 6,
    "surge": 7,
    "prime": 8,
}


def _tips_to_bullets(tips: list) -> list[str]:
    bullets: list[str] = []
    for tip in tips or []:
        if isinstance(tip, str):
            bullets.append(tip)
            continue
        parts = [tip.get("what", ""), tip.get("why", "")]
        text = " — ".join(p for p in parts if p)
        if tip.get("title"):
            text = f"{tip['title']}: {text}" if text else tip["title"]
        if text:
            bullets.append(text)
    return bullets


def _ensure_recommendation_sections(page: dict, legacy_tips: list | None = None) -> None:
    sections = page.setdefault(
        "recommendation_sections",
        {"from_your_genetics": [], "from_your_data": [], "from_research": []},
    )
    if legacy_tips and not any(sections.values()):
        sections["from_your_data"] = _tips_to_bullets(legacy_tips)


def normalize_profile(data: dict) -> dict:
    """Ensure VQ dashboard keys exist; migrate legacy flat schema."""
    profile = dict(data)

    if profile.get("archetype_primary") and not profile.get("archetype"):
        profile["archetype"] = {
            "primary": profile.pop("archetype_primary"),
            "secondary": profile.pop("archetype_secondary", []),
            "scores": profile.pop("archetype_scores", {}),
            "narrative": profile.get("reply", ""),
            "matching_markers": [],
        }

    arch = profile.setdefault("archetype", {})
    primary = arch.get("primary") or {}
    cluster_id = arch.get("vq_cluster_id")
    if not cluster_id and primary.get("id"):
        cluster_id = VQ_CLUSTER_MAP.get(str(primary["id"]).lower())
        if cluster_id:
            arch["vq_cluster_id"] = cluster_id
    if cluster_id and not arch.get("vq_cluster_label"):
        name = primary.get("name") or str(primary.get("id", "")).title()
        arch["vq_cluster_label"] = f"Cluster {cluster_id} — {name}"
    arch.setdefault("vq_pattern_bullets", [])
    arch.setdefault("vq_story_line", arch.get("narrative", ""))
    arch.setdefault("tagline", "")

    story = profile.setdefault("your_story", {})
    if profile.get("connections") and not story.get("connections"):
        story["connections"] = profile.pop("connections")
    if profile.get("reply") and not story.get("plain_explanation"):
        story["plain_explanation"] = {"headline": "", "body": profile.pop("reply"), "analogy": ""}
    if story.get("literature_citations") and not story.get("literature"):
        story["literature"] = story.pop("literature_citations")
    story.setdefault("bullet_summary", [])
    story.setdefault("visual_metrics", [])
    story.setdefault("chat_starters", [])
    story.setdefault("bubble_teaser", "")

    train = profile.setdefault("train", {})
    if profile.get("training") and not train.get("tips"):
        train["tips"] = profile.pop("training")
    _ensure_recommendation_sections(train, train.pop("tips", None))
    train.setdefault("bullet_summary", [])
    train.setdefault("visual_metrics", [])
    train.setdefault("chat_starters", [])
    train.setdefault("bubble_teaser", "")

    fuel = profile.setdefault("fuel", {})
    if profile.get("nutrition") and not fuel.get("tips"):
        fuel["tips"] = profile.pop("nutrition")
    _ensure_recommendation_sections(fuel, fuel.pop("tips", None))
    fuel.setdefault("bullet_summary", [])
    fuel.setdefault("visual_metrics", [])
    fuel.setdefault("chat_starters", [])
    fuel.setdefault("bubble_teaser", "")

    rest = profile.setdefault("rest_recovery", {})
    if profile.get("recovery") and not rest.get("recovery_tips"):
        rest["recovery_tips"] = profile.pop("recovery")
    legacy_rest_tips = (rest.pop("sleep_tips", None) or []) + (rest.pop("recovery_tips", None) or [])
    hero = rest.pop("hero", None) or {}
    if hero.get("summary") and not rest.get("hero_summary"):
        rest["hero_summary"] = hero["summary"]
    if hero.get("recovery_score") or hero.get("sleep_score"):
        rest.setdefault("visual_metrics", [])
        if hero.get("recovery_score"):
            rest["visual_metrics"].append(
                {"label": "Recovery score", "value": hero["recovery_score"], "unit": ""}
            )
        if hero.get("sleep_score"):
            rest["visual_metrics"].append(
                {"label": "Sleep score", "value": hero["sleep_score"], "unit": ""}
            )
    if rest.get("tonight_action") and not rest.get("tonight"):
        rest["tonight"] = rest.pop("tonight_action")
    _ensure_recommendation_sections(rest, legacy_rest_tips or None)
    rest.setdefault("bullet_summary", [])
    rest.setdefault("visual_metrics", rest.get("visual_metrics") or [])
    rest.setdefault("chat_starters", [])
    rest.setdefault("bubble_teaser", "")

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


def _format_bullet_list(label: str, bullets: list) -> str:
    items = [f"• {b}" for b in bullets[:6] if b]
    return f"<strong>{label}</strong><br>" + "<br>".join(items) if items else ""


def _format_recommendation_sections(page: dict) -> str:
    sections = page.get("recommendation_sections") or {}
    parts = []
    for key, label in (
        ("from_your_genetics", "From your genetics"),
        ("from_your_data", "From your data"),
        ("from_research", "From research"),
    ):
        block = _format_bullet_list(label, sections.get(key) or [])
        if block:
            parts.append(block)
    return "<br><br>".join(parts)


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

    if arch.get("vq_cluster_label"):
        sections.append(f"<strong>{arch['vq_cluster_label']}</strong>")
    if arch.get("vq_story_line"):
        sections.append(arch["vq_story_line"])
    for bullet in (arch.get("vq_pattern_bullets") or [])[:5]:
        sections.append(f"• {bullet}")

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

    for bullet in (story.get("bullet_summary") or [])[:6]:
        sections.append(f"• {bullet}")

    connections = story.get("connections") or data.get("connections") or []
    if connections:
        items = [_format_connection(c) for c in connections[:5]]
        sections.append("<strong>Key connections</strong><br>" + "<br>".join(items))

    train = data.get("train") or {}
    if train.get("this_week_focus"):
        sections.append(f"<strong>This week:</strong> {train['this_week_focus']}")
    if train.get("watch_for"):
        sections.append(f"<strong>Watch for:</strong> {train['watch_for']}")

    for label, page_key in [("Training", "train"), ("Fuel", "fuel"), ("Rest & Recovery", "rest_recovery")]:
        page = data.get(page_key) or {}
        rec_block = _format_recommendation_sections(page)
        if rec_block:
            sections.append(f"<strong>{label}</strong><br>{rec_block}")
            continue
        tips = page.get("tips") or data.get(page_key.replace("rest_recovery", "recovery")) or []
        if page_key == "train" and not tips:
            tips = data.get("training") or []
        if page_key == "fuel" and not tips:
            tips = data.get("nutrition") or []
        if tips:
            items = [f"• {_format_tip(t)}" for t in tips[:5] if _format_tip(t)]
            sections.append(f"<strong>{label}</strong><br>" + "<br>".join(items))

    rest = data.get("rest_recovery") or {}
    if rest.get("tonight"):
        sections.append(f"<strong>Tonight:</strong> {rest['tonight']}")

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
                    "Stop calling tools. Output the complete VQ dashboard as ONE JSON object with keys: "
                    "archetype, your_story, train, fuel, rest_recovery, flags, disclaimer. "
                    "Include recommendation_sections on train, fuel, rest_recovery."
                ),
            }
        )
        return await _run_coach_completion(working_messages, use_tools=False)

    return raw


ANALYZE_PROFILE_MESSAGE = (
    "Build my full GenomeCoach VQ dashboard JSON using the uploaded data and literature notes. "
    "VQ-score all 8 clusters, populate archetype (with vq_cluster_id, vq_cluster_label, "
    "vq_pattern_bullets, vq_story_line), your_story, train, fuel, rest_recovery, flags, disclaimer. "
    "Every page needs bubble_teaser, bullet_summary, visual_metrics, chat_starters. "
    "Train, fuel, rest_recovery must each include recommendation_sections "
    "(from_your_genetics, from_your_data, from_research). "
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
                    "archetype (with VQ fields), your_story, train, fuel, rest_recovery, flags, disclaimer. "
                    "Include recommendation_sections on train, fuel, rest_recovery. "
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
