"""
GeneSight PDF parser.

Strategy:
  1. Extract all text from the PDF with pdfplumber.
  2. Use Claude Haiku to pull out gene + phenotype pairs as JSON.
  3. Fall back to regex heuristics and merge both results.
"""

import re
import json
import os
import pdfplumber
import io

from services.openai_client import get_literature_model, has_api_key as has_openai_api_key, sync_client


KNOWN_GENES = [
    "CYP2D6", "CYP2C19", "CYP2C9", "CYP3A4", "CYP3A5",
    "CYP1A2", "CYP2B6", "COMT", "SLC6A4", "MTHFR",
    "OPRM1", "APOE", "HTR2A", "HTR2C", "ANKK1", "DRD2",
    "ABCB1", "UGT1A4", "UGT2B15", "VKORC1", "F5",
]

PHENOTYPE_TERMS = [
    "Poor Metabolizer", "Intermediate Metabolizer", "Normal Metabolizer",
    "Extensive Metabolizer", "Ultrarapid Metabolizer", "Rapid Metabolizer",
    "Decreased Function", "Normal Function", "Increased Function",
    "Homozygous", "Heterozygous", "Wild Type",
    "Low Activity", "High Activity", "Increased Metabolizer",
]


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract raw text from all pages of the PDF."""
    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    return "\n".join(text_parts)


def parse_with_claude(text: str) -> dict:
    """Use Claude Haiku to extract structured gene data from raw PDF text."""
    prompt = f"""You are a pharmacogenomics data extractor. Given raw text from a GeneSight report, extract every gene name and its associated genotype/phenotype information.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{{
  "GENE_NAME": {{
    "variant": "genotype string e.g. *1/*2 or Val/Val or C677T",
    "phenotype": "phenotype label e.g. Normal Metabolizer or Poor Metabolizer"
  }}
}}

If a field is not found, use an empty string. Include every gene you find.

Raw report text:
{text[:12000]}"""

    try:
        client = sync_client()
        response = client.chat.completions.create(
            model=get_literature_model(),
            max_tokens=1500,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"[genesight parser] Claude extraction failed: {e}")
        return {}


def parse_with_regex(text: str) -> dict:
    """Regex-based extraction for known gene names and phenotype terms."""
    genes = {}
    lines = text.split("\n")
    full_text = text

    for i, line in enumerate(lines):
        for gene in KNOWN_GENES:
            if not re.search(rf"\b{re.escape(gene)}\b", line, re.IGNORECASE):
                continue

            context = " ".join(lines[i : i + 6])
            variant = ""
            phenotype = ""

            for term in PHENOTYPE_TERMS:
                if term.lower() in context.lower():
                    phenotype = term
                    break

            patterns = [
                r"(\*\d+(?:/\*\d+)+)",
                r"([A-Z][a-z]+/[A-Z][a-z]+)",
                r"(\bC677T\b|\bA1298C\b)",
                r"(\bL/L\b|\bS/S\b|\bL/S\b|\bS/L\b)",
                r"(\brs\d+\b)",
            ]
            for pattern in patterns:
                vm = re.search(pattern, context)
                if vm:
                    variant = vm.group(1)
                    break

            if phenotype or variant:
                genes[gene.upper()] = {"variant": variant, "phenotype": phenotype}
            break

    # Second pass: scan full text for genes missed by line layout
    for gene in KNOWN_GENES:
        if gene.upper() in genes:
            continue
        m = re.search(
            rf"\b{re.escape(gene)}\b(.{{0,120}})",
            full_text,
            re.IGNORECASE,
        )
        if not m:
            continue
        context = m.group(0)
        phenotype = next(
            (term for term in PHENOTYPE_TERMS if term.lower() in context.lower()),
            "",
        )
        vm = re.search(
            r"(\*\d+(?:/\*\d+)+|[A-Z][a-z]+/[A-Z][a-z]+|\bC677T\b|\bL/L\b|\bS/S\b)",
            context,
        )
        variant = vm.group(1) if vm else ""
        if phenotype or variant:
            genes[gene.upper()] = {"variant": variant, "phenotype": phenotype}

    return genes


def _merge_gene_dicts(primary: dict, secondary: dict) -> dict:
    merged = dict(secondary)
    for gene, info in primary.items():
        existing = merged.get(gene, {"variant": "", "phenotype": ""})
        merged[gene] = {
            "variant": info.get("variant") or existing.get("variant", ""),
            "phenotype": info.get("phenotype") or existing.get("phenotype", ""),
        }
    return merged


def parse_genesight_pdf(pdf_bytes: bytes) -> tuple[dict, str]:
    """
    Main entry point. Returns (gene dict, debug hint on failure).
    """
    try:
        text = extract_text_from_pdf(pdf_bytes)
    except Exception as e:
        print(f"[genesight parser] PDF text extraction failed: {e}")
        return {}, "The file could not be read as a PDF."

    if not text.strip():
        return {}, "No text found in the PDF — it may be a scanned/image-only report."

    regex_genes = parse_with_regex(text)
    claude_genes = {}

    if has_openai_api_key():
        claude_genes = parse_with_claude(text)

    genes = _merge_gene_dicts(claude_genes, regex_genes)

    if genes:
        return genes, ""

    return {}, "No gene markers were detected in the extracted text."


def parse_genesight_pdfs(pdf_files: list[tuple[str, bytes]]) -> tuple[dict, list[dict]]:
    """
    Parse multiple PDFs and merge gene results.
    Returns (merged genes dict, list of failed files with errors).
    """
    merged: dict = {}
    failures: list[dict] = []

    for filename, pdf_bytes in pdf_files:
        genes, debug = parse_genesight_pdf(pdf_bytes)
        if genes:
            merged = _merge_gene_dicts(genes, merged)
        else:
            failures.append({
                "filename": filename,
                "error": debug or "No gene markers were detected in the extracted text.",
            })

    return merged, failures
