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

# GPT models on Nebius Token Factory (override via env or dashboard MODEL_ID)
CHAT_MODEL = os.environ.get("GENOFIT_CHAT_MODEL", "openai/gpt-oss-120b")
LITERATURE_MODEL = os.environ.get("GENOFIT_LITERATURE_MODEL", "openai/gpt-oss-20b")


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


def get_chat_model() -> str:
    return CHAT_MODEL


def get_literature_model() -> str:
    return LITERATURE_MODEL


def model_setup_hint() -> str:
    return (
        f"Using chat model `{get_chat_model()}` and extraction model `{get_literature_model()}`. "
        "Override with GENOFIT_CHAT_MODEL / GENOFIT_LITERATURE_MODEL, "
        "or list models via GET /api/models."
    )


def list_available_model_ids() -> frozenset[str]:
    try:
        response = sync_client().models.list()
        return frozenset(m.id for m in response.data)
    except Exception:
        return frozenset()
