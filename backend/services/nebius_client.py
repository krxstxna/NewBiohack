"""
Nebius Token Factory LLM client.

All inference runs through Nebius credits via the OpenAI-compatible API:
https://api.tokenfactory.nebius.com/v1/

Nebius hosts open-weight models (Kimi, Qwen, Llama, etc.), not anthropic/claude/* IDs.
"""

import os

from openai import AsyncOpenAI, OpenAI

NEBIUS_BASE_URL = os.environ.get(
    "NEBIUS_BASE_URL",
    "https://api.tokenfactory.nebius.com/v1/",
)

# Strong models for GenomeCoach chat (first match in your project wins)
CHAT_MODEL_DEFAULTS = [
    "moonshotai/Kimi-K2.5",
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "meta-llama/Llama-3.3-70B-Instruct",
]

# Fast/cheap models for PDF extraction and literature_search
LITERATURE_MODEL_DEFAULTS = [
    "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-fast",
    "google/gemma-2-2b-it",
]


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


_available_models: frozenset[str] | None = None


def list_available_model_ids() -> frozenset[str]:
    """Fetch model IDs from Nebius (cached after first successful fetch)."""
    global _available_models
    if _available_models is not None:
        return _available_models
    try:
        response = sync_client().models.list()
        _available_models = frozenset(m.id for m in response.data)
    except Exception:
        return frozenset()
    return _available_models


def pick_model(explicit: str | None, defaults: list[str]) -> str:
    """Use explicit env override, else first default available in the Nebius project."""
    if explicit:
        return explicit.strip()

    available = list_available_model_ids()
    if available:
        for candidate in defaults:
            if candidate in available:
                return candidate

    return defaults[0]


def get_chat_model() -> str:
    return pick_model(os.environ.get("GENOFIT_CHAT_MODEL"), CHAT_MODEL_DEFAULTS)


def get_literature_model() -> str:
    return pick_model(os.environ.get("GENOFIT_LITERATURE_MODEL"), LITERATURE_MODEL_DEFAULTS)


# Back-compat for imports; resolved once at import time when possible.
CHAT_MODEL = get_chat_model()
LITERATURE_MODEL = get_literature_model()


def model_setup_hint() -> str:
    chat = get_chat_model()
    lit = get_literature_model()
    return (
        f"Using chat model `{chat}` and extraction model `{lit}`. "
        "Override with GENOFIT_CHAT_MODEL / GENOFIT_LITERATURE_MODEL, "
        "or list models via GET /api/models."
    )
