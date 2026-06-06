"""
Nebius Token Factory LLM client.

All inference runs through Nebius credits via the OpenAI-compatible API:
https://api.tokenfactory.nebius.com/v1/
"""

import os

from openai import AsyncOpenAI, OpenAI

NEBIUS_BASE_URL = os.environ.get(
    "NEBIUS_BASE_URL",
    "https://api.tokenfactory.nebius.com/v1/",
)

# Claude model IDs routed through Nebius (override from Token Factory dashboard if needed)
CHAT_MODEL = os.environ.get("GENOFIT_CHAT_MODEL", "anthropic/claude-sonnet-4-6")
LITERATURE_MODEL = os.environ.get(
    "GENOFIT_LITERATURE_MODEL",
    "anthropic/claude-haiku-4-5-20251001",
)


def get_nebius_api_key() -> str:
    key = os.environ.get("NEBIUS_API_KEY", "").strip()
    if key:
        return key
    raise RuntimeError(
        "NEBIUS_API_KEY is not set. Create a key at https://tokenfactory.nebius.com/ "
        "and export it before using chat or PDF parsing."
    )


def has_nebius_api_key() -> bool:
    return bool(os.environ.get("NEBIUS_API_KEY", "").strip())


def sync_client() -> OpenAI:
    return OpenAI(base_url=NEBIUS_BASE_URL, api_key=get_nebius_api_key())


def async_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=NEBIUS_BASE_URL, api_key=get_nebius_api_key())
