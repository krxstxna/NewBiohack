"""
OpenAI-compatible chat client (ChatGPT-style chat.completions API).

Default: Nebius Token Factory — same pattern as Nebius docs:

    import os
    from openai import OpenAI

    client = OpenAI(
        base_url="https://api.tokenfactory.nebius.com/v1/",
        api_key=os.environ.get("NEBIUS_API_KEY"),
    )

    response = client.chat.completions.create(
        model="MODEL_ID",
        messages=[{"role": "system", "content": "..."}, ...],
    )
"""

import os

from openai import AsyncOpenAI, OpenAI

DEFAULT_BASE_URL = "https://api.tokenfactory.nebius.com/v1/"

OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL)

CHAT_MODEL_DEFAULTS = [
    "openai/gpt-oss-120b",
    "moonshotai/Kimi-K2.5",
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "meta-llama/Llama-3.3-70B-Instruct",
]

# Fast/cheap models for PDF extraction and literature_search
LITERATURE_MODEL_DEFAULTS = [
    "openai/gpt-oss-120b-fast",
    "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-fast",
    "google/gemma-2-2b-it",
    "openai/gpt-oss-120b",
]

_available_models: frozenset[str] | None = None


def get_api_key() -> str:
    key = (
        os.environ.get("NEBIUS_API_KEY", "").strip()
        or os.environ.get("OPENAI_API_KEY", "").strip()
    )
    if key:
        return key
    raise RuntimeError(
        "NEBIUS_API_KEY is not set. Create a key at https://tokenfactory.nebius.com/ "
        "and export it before using chat or PDF parsing."
    )


def has_api_key() -> bool:
    return bool(
        os.environ.get("NEBIUS_API_KEY", "").strip()
        or os.environ.get("OPENAI_API_KEY", "").strip()
    )


def _client_kwargs() -> dict:
    return {
        "base_url": OPENAI_BASE_URL,
        "api_key": get_api_key(),
    }


def sync_client() -> OpenAI:
    return OpenAI(**_client_kwargs())


def async_client() -> AsyncOpenAI:
    return AsyncOpenAI(**_client_kwargs())


def list_available_model_ids() -> frozenset[str]:
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
    available = list_available_model_ids()

    if explicit:
        chosen = explicit.strip()
        if not available or chosen in available:
            return chosen
        # Stale/invalid env override — fall through to defaults

    if available:
        for candidate in defaults:
            if candidate in available:
                return candidate

    return defaults[0]


def get_chat_model() -> str:
    return pick_model(os.environ.get("GENOFIT_CHAT_MODEL"), CHAT_MODEL_DEFAULTS)


def get_literature_model() -> str:
    lit = pick_model(os.environ.get("GENOFIT_LITERATURE_MODEL"), LITERATURE_MODEL_DEFAULTS)
    if lit:
        return lit
    return get_chat_model()


def model_setup_hint() -> str:
    return (
        f"Using chat model `{get_chat_model()}` and extraction model `{get_literature_model()}`. "
        "Override with GENOFIT_CHAT_MODEL / GENOFIT_LITERATURE_MODEL, "
        "or list models via GET /api/models."
    )
