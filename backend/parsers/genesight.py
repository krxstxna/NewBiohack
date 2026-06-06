"""
GeneSight PDF parser.

Strategy:
  1. Extract all text from the PDF with pdfplumber.
  2. Use Claude claude-haiku to pull out gene + phenotype pairs as JSON.
     (Haiku is cheap and fast for this structured extraction task.)
  3. Fall back to regex heuristics if the API call fails.

The output is always a dict like:
  {
    "COMT":    {"variant": "Val/Val",    "phenotype": "Poor metabolizer"},
    "SLC6A4":  {"variant": "S/S",        "phenotype": "Low transporter efficiency"},
    ...
  }
"""

import re
import json
import os
import anthropic
import pdfplumber
import io


# Known genes GenoSight tests for (used to anchor regex fallback)
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
    """
    Use Claude Haiku to extract structured gene data from raw PDF text.
    Returns a dict or empty dict on failure.
    """
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

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
{text[:6000]}"""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.content[0].text.strip()
        # Strip any accidental markdown fences
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        print(f"[genesight parser] Claude extraction failed: {e}")
        return {}


def parse_with_regex(text: str) -> dict:
    """
    Fallback: regex-based extraction looking for known gene names
    followed by phenotype/genotype info on the same or next line.
    """
    genes = {}
    lines = text.split("\n")

    for i, line in enumerate(lines):
        for gene in KNOWN_GENES:
            if re.search(rf"\b{gene}\b", line, re.IGNORECASE):
                # Look ahead up to 3 lines for phenotype
                context = " ".join(lines[i:i+4])
                variant = ""
                phenotype = ""

                # Try to find a phenotype term
                for term in PHENOTYPE_TERMS:
                    if term.lower() in context.lower():
                        phenotype = term
                        break

                # Try to find a variant pattern like *1/*2 or Val/Val or rs...
                vm = re.search(r"(\*\d+/\*\d+|[A-Z][a-z]+/[A-Z][a-z]+|\brs\d+\b|[ACGT]\d+[ACGT])", context)
                if vm:
                    variant = vm.group(1)

                if phenotype or variant:
                    genes[gene.upper()] = {
                        "variant": variant,
                        "phenotype": phenotype
                    }
                break  # Don't double-match the same line

    return genes


def parse_genesight_pdf(pdf_bytes: bytes) -> dict:
    """
    Main entry point. Returns gene dict.
    Tries Claude first, falls back to regex.
    """
    try:
        text = extract_text_from_pdf(pdf_bytes)
    except Exception as e:
        print(f"[genesight parser] PDF text extraction failed: {e}")
        return {}

    if not text.strip():
        return {}

    # Try AI extraction first
    if os.environ.get("ANTHROPIC_API_KEY"):
        genes = parse_with_claude(text)
        if genes:
            return genes

    # Fallback to regex
    print("[genesight parser] Falling back to regex extraction")
    return parse_with_regex(text)
