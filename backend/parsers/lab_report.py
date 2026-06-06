"""
Generic lab report PDF parser.

Accepts any health/lab PDF: bloodwork, genetic, ancestry, microbiome, etc.
Extracts structured markers and genes when possible; always stores the report
if the PDF can be read.
"""

import json
import os
import re

from parsers.genesight import (
    extract_text_from_pdf,
    parse_with_regex as parse_genes_regex,
    _merge_gene_dicts,
)
from services.nebius_client import LITERATURE_MODEL, has_nebius_api_key, sync_client

MARKER_PATTERNS = [
    (r"ferritin", r"ferritin[:\s]+(\d+\.?\d*)\s*(ng/mL|ug/L|µg/L)?", "Ferritin"),
    (r"hemoglobin|hgb\b", r"(?:hemoglobin|hgb)[:\s]+(\d+\.?\d*)\s*(g/dL|g/L)?", "Hemoglobin"),
    (r"vitamin d|25-oh", r"(?:vitamin d|25[\-\s]?oh)[:\s]+(\d+\.?\d*)\s*(ng/mL|nmol/L)?", "Vitamin D"),
    (r"\bb12\b|vitamin b12", r"(?:vitamin b12|b12)[:\s]+(\d+\.?\d*)\s*(pg/mL|pmol/L)?", "Vitamin B12"),
    (r"\btsh\b", r"tsh[:\s]+(\d+\.?\d*)\s*(mIU/L|uIU/mL)?", "TSH"),
    (r"cortisol", r"cortisol[:\s]+(\d+\.?\d*)\s*(ug/dL|nmol/L)?", "Cortisol"),
    (r"testosterone", r"testosterone[:\s]+(\d+\.?\d*)\s*(ng/dL|nmol/L)?", "Testosterone"),
    (r"magnesium", r"magnesium[:\s]+(\d+\.?\d*)\s*(mg/dL|mmol/L)?", "Magnesium"),
    (r"cholesterol", r"cholesterol[:\s]+(\d+\.?\d*)\s*(mg/dL|mmol/L)?", "Cholesterol"),
    (r"glucose|a1c|hba1c", r"(?:glucose|a1c|hba1c)[:\s]+(\d+\.?\d*)\s*(mg/dL|%|mmol/L)?", "Glucose/A1c"),
]

REPORT_TYPE_HINTS = {
    "genetic": ["genesight", "pharmacogen", "genotype", "cyp2d6", "comt", "genetic"],
    "ancestry": ["ancestry", "23andme", "ethnicity", "haplogroup"],
    "microbiome": ["microbiome", "microbiota", "gut health", "viome", "thryve"],
    "bloodwork": ["blood", "cbc", "cmp", "metabolic panel", "ferritin", "hemoglobin", "lab result"],
}


def infer_report_type(text: str, filename: str, genes: dict) -> str:
    haystack = f"{filename} {text[:3000]}".lower()
    if genes:
        return "genetic"
    for report_type, keywords in REPORT_TYPE_HINTS.items():
        if any(kw in haystack for kw in keywords):
            return report_type
    return "other"


def extract_markers_regex(text: str) -> dict:
    markers = {}
    lower = text.lower()
    for _, pattern, label in MARKER_PATTERNS:
        if label in markers:
            continue
        match = re.search(pattern, lower, re.IGNORECASE)
        if match:
            value = match.group(1)
            unit = match.group(2) if match.lastindex and match.lastindex >= 2 and match.group(2) else ""
            markers[label] = f"{value}{(' ' + unit) if unit else ''}".strip()
    return markers


def parse_with_claude(text: str, filename: str) -> dict | None:
    prompt = f"""You are a clinical lab report extractor. Parse this health/lab PDF text (any type: bloodwork, genetic, ancestry, gut microbiome, etc.).

Return ONLY valid JSON (no markdown):
{{
  "report_type": "bloodwork|genetic|ancestry|microbiome|other",
  "summary": "2-3 sentence summary of key findings",
  "markers": {{"Marker Name": "value with unit"}},
  "genes": {{"GENE": {{"variant": "", "phenotype": ""}}}}
}}

Use empty objects if not applicable. Include all notable lab values you find.

Filename: {filename}
Text:
{text[:10000]}"""

    try:
        client = sync_client()
        response = client.chat.completions.create(
            model=LITERATURE_MODEL,
            max_tokens=2000,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception as e:
        print(f"[lab_report] Claude extraction failed: {e}")
    return None


def parse_lab_report_pdf(filename: str, pdf_bytes: bytes) -> tuple[dict, str | None]:
    """
    Parse any lab PDF. Returns (report dict, error or None).
    Accepts reports even when no genes/markers are found, as long as PDF reads.
    """
    try:
        text = extract_text_from_pdf(pdf_bytes)
    except Exception as e:
        print(f"[lab_report] PDF read failed: {e}")
        return {}, "The file could not be read as a PDF."

    if not text.strip():
        return {
            "filename": filename,
            "report_type": "other",
            "summary": "Report uploaded. No selectable text found — it may be a scanned/image PDF.",
            "markers": {},
            "genes": {},
        }, None

    report = None
    if has_nebius_api_key():
        report = parse_with_claude(text, filename)

    genes = parse_genes_regex(text)
    markers = extract_markers_regex(text)

    if report:
        report_type = report.get("report_type") or infer_report_type(text, filename, genes)
        summary = report.get("summary") or text[:400].strip()
        markers = {**markers, **(report.get("markers") or {})}
        claude_genes = report.get("genes") or {}
        genes = _merge_gene_dicts(claude_genes, genes)
    else:
        report_type = infer_report_type(text, filename, genes)
        summary = text[:400].strip().replace("\n", " ")
        if markers:
            summary = f"Lab report with {len(markers)} marker(s) detected. " + summary[:200]

    return {
        "filename": filename,
        "report_type": report_type,
        "summary": summary,
        "markers": markers,
        "genes": genes,
    }, None


def parse_lab_reports_batch(pdf_files: list[tuple[str, bytes]]) -> tuple[list[dict], list[dict], dict]:
    """
    Parse multiple lab PDFs.
    Returns (successful reports, failures, merged genes).
    """
    reports: list[dict] = []
    failures: list[dict] = []
    merged_genes: dict = {}

    for filename, pdf_bytes in pdf_files:
        report, error = parse_lab_report_pdf(filename, pdf_bytes)
        if error:
            failures.append({"filename": filename, "error": error})
            continue
        reports.append(report)
        if report.get("genes"):
            merged_genes = _merge_gene_dicts(report["genes"], merged_genes)

    return reports, failures, merged_genes
