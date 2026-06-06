"""Junction (Vital) API client — server-side only."""

import os

from junction import Junction
from junction.environment import JunctionEnvironment
from junction.types.demo_providers import DemoProviders
from junction.types.providers import Providers

JUNCTION_BASE_URL = os.environ.get(
    "JUNCTION_BASE_URL", "https://api.sandbox.us.junction.com"
).rstrip("/")

_ENV_MAP = {
    "sandbox": JunctionEnvironment.SANDBOX,
    "production": JunctionEnvironment.PRODUCTION,
}

_PROVIDER_MAP = {
    "oura": Providers.OURA,
    "fitbit": Providers.FITBIT,
    "garmin": Providers.GARMIN,
    "whoop": Providers.WHOOP,
}

_DEMO_PROVIDER_MAP = {
    "oura": DemoProviders.OURA,
    "fitbit": DemoProviders.FITBIT,
}


def has_junction_api_key() -> bool:
    return bool(os.environ.get("JUNCTION_API_KEY", "").strip())


def get_junction_client() -> Junction:
    key = os.environ.get("JUNCTION_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "JUNCTION_API_KEY is not set. Create a Sandbox key in the Junction dashboard."
        )
    env_name = os.environ.get("JUNCTION_ENV", "sandbox").strip().lower()
    environment = _ENV_MAP.get(env_name, JunctionEnvironment.SANDBOX)
    return Junction(api_key=key, environment=environment)


def resolve_provider(name: str | None) -> Providers | None:
    if not name:
        return None
    return _PROVIDER_MAP.get(name.strip().lower())


def is_junction_sandbox() -> bool:
    return os.environ.get("JUNCTION_ENV", "sandbox").strip().lower() == "sandbox"


def provider_is_connected(user_id: str, provider: str) -> bool:
    slug = provider.strip().lower()
    return slug in {s.lower() for s in get_connected_provider_slugs(user_id)}


def ensure_provider_connection(
    user_id: str,
    provider: str,
    redirect_url: str | None = None,
) -> dict:
    """
    Connect a wearable provider for data access.

    Sandbox oura/fitbit: auto-connect demo synthetic data (no OAuth).
    Production (or unsupported demo providers): return OAuth link URL.
    """
    slug = provider.strip().lower()
    if provider_is_connected(user_id, slug):
        return {
            "mode": "connected",
            "connected_providers": get_connected_provider_slugs(user_id),
        }

    if is_junction_sandbox() and slug in _DEMO_PROVIDER_MAP:
        client = get_junction_client()
        resp = client.link.connect_demo_provider(
            user_id=user_id,
            provider=_DEMO_PROVIDER_MAP[slug],
        )
        return {
            "mode": "demo",
            "success": resp.success,
            "detail": resp.detail,
            "connected_providers": get_connected_provider_slugs(user_id),
        }

    token_data = create_link_token(user_id, slug, redirect_url)
    return {"mode": "oauth", **token_data}


def get_or_create_user(client_user_id: str) -> str:
    """Return Junction user_id for a stable app-side client_user_id."""
    client = get_junction_client()
    try:
        user = client.user.get_by_client_user_id(client_user_id)
    except Exception:
        user = client.user.create(client_user_id=client_user_id)
    return user.user_id


def get_connected_provider_slugs(user_id: str) -> list[str]:
    client = get_junction_client()
    providers = client.user.get_connected_providers(user_id)
    slugs: list[str] = []
    for entries in providers.values():
        for entry in entries:
            slug = getattr(entry, "slug", None) or getattr(entry, "provider", None)
            if slug:
                slugs.append(str(slug))
    return slugs


def create_link_token(
    user_id: str,
    provider: str | None = None,
    redirect_url: str | None = None,
) -> dict:
    """Link token + web URL for Junction Link OAuth (Oura, Fitbit, etc.)."""
    client = get_junction_client()
    kwargs: dict = {"user_id": user_id}
    resolved = resolve_provider(provider)
    if resolved:
        kwargs["provider"] = resolved
    if redirect_url:
        kwargs["redirect_url"] = redirect_url
        kwargs["on_error"] = "redirect"
        kwargs["on_close"] = "redirect"
    resp = client.link.token(**kwargs)
    return {"link_token": resp.link_token, "link_web_url": resp.link_web_url}
