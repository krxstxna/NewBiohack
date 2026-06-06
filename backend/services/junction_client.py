"""Junction (Vital) API client — server-side only."""

import os

from junction import Junction
from junction.environment import JunctionEnvironment

JUNCTION_BASE_URL = os.environ.get(
    "JUNCTION_BASE_URL", "https://api.sandbox.us.junction.com"
).rstrip("/")

_ENV_MAP = {
    "sandbox": JunctionEnvironment.SANDBOX,
    "production": JunctionEnvironment.PRODUCTION,
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


def get_or_create_user(client_user_id: str) -> str:
    """Return Junction user_id for a stable app-side client_user_id."""
    client = get_junction_client()
    try:
        user = client.user.get_by_client_user_id(client_user_id)
    except Exception:
        user = client.user.create(client_user_id=client_user_id)
    return user.user_id


def create_link_token(user_id: str) -> str:
    """Link token for Junction Link widget (Oura, Garmin, etc.)."""
    client = get_junction_client()
    resp = client.link.token(user_id=user_id)
    return resp.link_token
