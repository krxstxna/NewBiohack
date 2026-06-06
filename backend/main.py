from pathlib import Path

from fastapi import APIRouter, FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
import uvicorn
import os
from openai import APIError, APIStatusError, AuthenticationError

from parsers.lab_report import parse_lab_reports_batch
from parsers.genesight import _merge_gene_dicts
from parsers.apple_health import parse_apple_health_xml
from services.claude import analyze_profile, chat_with_context
from services.openai_client import has_api_key as has_openai_api_key
from services.openai_client import list_available_model_ids, model_setup_hint
from services.junction_client import (
    configured_junction_user_id,
    create_link_token,
    ensure_provider_connection,
    get_connected_provider_slugs,
    has_junction_api_key,
    is_junction_sandbox,
    resolve_junction_user_id,
    resolve_provider,
)
from parsers.junction_wearables import fetch_junction_metrics, merge_wearable_metrics
from services.session_store import load_session, save_session, clear_session as wipe_session

app = FastAPI(title="GenoFit API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Prevent browsers from serving stale HTML/JS/CSS during development."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        is_frontend_route = path == "/" or (not path.startswith("/api") and not Path(path).suffix)
        if is_frontend_route or path.endswith((".html", ".js", ".css")):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)

session = load_session()
session.setdefault("lab_reports", [])
session.setdefault("junction_user_id", "")
session.setdefault("profile", {})


def persist_session() -> None:
    save_session(
        session["genes"],
        session["metrics"],
        session["history"],
        session.get("lab_reports", []),
        session.get("junction_user_id", ""),
        session.get("profile", {}),
    )


def _junction_client_user_id(client_user_id: str = "") -> str:
    env_client = os.getenv("JUNCTION_CLIENT_USER_ID", "").strip()
    uid = env_client or (client_user_id or "genofit-local").strip()
    return uid or "genofit-local"


def _resolve_junction_user(client_user_id: str = "", junction_user_id: str = "") -> str:
    return resolve_junction_user_id(
        client_user_id,
        junction_user_id or session.get("junction_user_id", ""),
    )


def _merge_junction_metrics(metrics: dict, client_user_id: str = "") -> tuple[dict, dict]:
    """Fetch Junction wearables and merge into metrics. Returns (metrics, junction_meta)."""
    if not has_junction_api_key():
        return metrics, {}

    junction_meta: dict = {}
    try:
        junction_user_id = _resolve_junction_user(client_user_id)
        session["junction_user_id"] = junction_user_id
        junction_payload = fetch_junction_metrics(junction_user_id)
        metrics = merge_wearable_metrics(metrics, junction_payload)
        junction_meta = {
            "user_id": junction_user_id,
            "sources": junction_payload.get("sources", []),
            "errors": junction_payload.get("junction_errors", []),
            "connected_providers": get_connected_provider_slugs(junction_user_id),
        }
    except Exception as exc:
        junction_meta = {"errors": [str(exc)]}
    return metrics, junction_meta


def merge_lab_reports(existing: list, new_reports: list) -> list:
    by_name = {r["filename"]: r for r in existing}
    for report in new_reports:
        by_name[report["filename"]] = report
    return list(by_name.values())


def apply_lab_upload(new_reports: list, new_genes: dict) -> None:
    had_data = bool(session["genes"] or session.get("lab_reports"))
    session["lab_reports"] = merge_lab_reports(session.get("lab_reports", []), new_reports)
    if new_genes:
        session["genes"] = _merge_gene_dicts(new_genes, session["genes"])
    if not had_data and (session["genes"] or session["lab_reports"]):
        session["history"] = []
    persist_session()


def require_api_key() -> None:
    if not has_openai_api_key():
        raise HTTPException(
            503,
            "NEBIUS_API_KEY is not set. Create a key at https://tokenfactory.nebius.com/ and export it before using chat.",
        )


def validate_pdf_upload(file: UploadFile) -> None:
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if not filename.endswith(".pdf") and content_type != "application/pdf":
        raise HTTPException(400, f"Please upload PDF files only. Got: {file.filename or 'unknown'}")


FRONTEND_DIR = Path(__file__).resolve().parent.parent


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ── Upload endpoints ──────────────────────────────────────────────────────────

@api.post("/upload/genesight")
async def upload_genesight(file: UploadFile = File(...)):
    """Legacy single-file upload — accepts any lab PDF."""
    return await upload_lab_reports_batch([file])


@api.post("/upload/lab-reports/batch")
async def upload_lab_reports_batch(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "Please upload at least one PDF file.")

    pdf_files = []
    for file in files:
        validate_pdf_upload(file)
        contents = await file.read()
        pdf_files.append((file.filename or "report.pdf", contents))

    try:
        reports, failures, new_genes = parse_lab_reports_batch(pdf_files)
    except Exception as e:
        raise HTTPException(500, f"Lab report upload failed: {str(e)}")

    if not reports and failures:
        detail = failures[0]["error"] if len(failures) == 1 else f"{len(failures)} files could not be read."
        raise HTTPException(422, detail)

    apply_lab_upload(reports, new_genes)
    return {
        "status": "ok",
        "lab_reports": session["lab_reports"],
        "genes": session["genes"],
        "files_processed": [r["filename"] for r in reports],
        "files_failed": failures,
    }


@api.post("/upload/genesight/batch")
async def upload_genesight_batch(files: list[UploadFile] = File(...)):
    """Legacy alias — accepts any lab PDF, not just genetic reports."""
    return await upload_lab_reports_batch(files)


@api.post("/upload/apple-health")
async def upload_apple_health(
    file: UploadFile = File(...),
    client_user_id: str = Form(""),
):
    filename = (file.filename or "").lower()
    if not filename.endswith(".xml"):
        raise HTTPException(400, "Please upload the export.xml from Apple Health.")
    try:
        contents = await file.read()
        metrics = parse_apple_health_xml(contents)
    except Exception as e:
        raise HTTPException(500, f"Apple Health upload failed: {str(e)}")

    metrics, junction_meta = _merge_junction_metrics(metrics, client_user_id)
    session["metrics"] = metrics
    persist_session()
    result = {"status": "ok", "metrics": metrics}
    if junction_meta:
        result["junction"] = junction_meta
    return result


@api.post("/junction/connect")
async def junction_connect(
    provider: str = Form(...),
    client_user_id: str = Form(""),
    junction_user_id: str = Form(""),
    redirect_url: str = Form(""),
):
    """
    Connect a provider and pull metrics.

    Sandbox oura/fitbit: uses Junction demo data (no login).
    Production: returns link_web_url for OAuth.
    """
    if not has_junction_api_key():
        raise HTTPException(
            503,
            "Junction API is not configured. Set JUNCTION_API_KEY.",
        )
    if not resolve_provider(provider):
        raise HTTPException(400, f"Unsupported provider: {provider}")

    try:
        junction_user_id = _resolve_junction_user(client_user_id, junction_user_id)
        session["junction_user_id"] = junction_user_id

        connection = ensure_provider_connection(
            junction_user_id,
            provider,
            redirect_url or None,
        )
        if connection.get("mode") == "oauth":
            persist_session()
            return {
                "status": "oauth_required",
                "connection": connection,
                "link_token": connection.get("link_token"),
                "link_web_url": connection.get("link_web_url"),
                "junction_user_id": junction_user_id,
            }

        existing = session.get("metrics") or {}
        metrics, junction_meta = _merge_junction_metrics(existing, client_user_id)
        session["metrics"] = metrics
        persist_session()
        return {
            "status": "ok",
            "metrics": metrics,
            "junction": junction_meta,
            "connection": connection,
        }
    except Exception as e:
        raise HTTPException(502, f"Junction connect failed: {str(e)}") from e


@api.post("/junction/sync")
async def junction_sync(
    client_user_id: str = Form(""),
    junction_user_id: str = Form(""),
):
    """Refresh wearable metrics from Junction (Oura, Garmin, etc.)."""
    if not has_junction_api_key():
        raise HTTPException(
            503,
            "Junction API is not configured. Set JUNCTION_API_KEY.",
        )

    existing = session.get("metrics") or {}
    try:
        metrics, junction_meta = _merge_junction_metrics(existing, client_user_id)
        session["metrics"] = metrics
        persist_session()
        return {"status": "ok", "metrics": metrics, "junction": junction_meta}
    except Exception as e:
        raise HTTPException(502, f"Junction sync failed: {str(e)}") from e


@api.post("/junction/user")
async def junction_link_user(junction_user_id: str = Form(...)):
    """Point this GenoFit session at an existing Junction user (e.g. dashboard demo user)."""
    if not has_junction_api_key():
        raise HTTPException(503, "Junction API is not configured.")

    user_id = junction_user_id.strip()
    if not user_id:
        raise HTTPException(400, "junction_user_id is required.")

    try:
        session["junction_user_id"] = user_id
        persist_session()
        connected = get_connected_provider_slugs(user_id)
        metrics, junction_meta = _merge_junction_metrics(session.get("metrics") or {}, "")
        session["metrics"] = metrics
        persist_session()
        return {
            "status": "ok",
            "junction_user_id": user_id,
            "connected_providers": connected,
            "metrics": metrics,
            "junction": junction_meta,
        }
    except Exception as e:
        raise HTTPException(502, f"Could not link Junction user: {e}") from e


@api.get("/junction/link-token")
async def junction_link_token(
    client_user_id: str = "",
    provider: str = "",
    redirect_url: str = "",
):
    """Link token + web URL for Junction Link OAuth (Oura, Fitbit, Garmin, etc.)."""
    if not has_junction_api_key():
        raise HTTPException(503, "Junction API is not configured.")

    if provider and not resolve_provider(provider):
        raise HTTPException(400, f"Unsupported provider: {provider}")

    try:
        junction_user_id = _resolve_junction_user(client_user_id)
        session["junction_user_id"] = junction_user_id
        persist_session()
        token_data = create_link_token(
            junction_user_id,
            provider or None,
            redirect_url or None,
        )
        return {
            **token_data,
            "junction_user_id": junction_user_id,
            "connected_providers": get_connected_provider_slugs(junction_user_id),
        }
    except Exception as e:
        raise HTTPException(502, str(e)) from e


# ── Chat endpoint ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str


@api.post("/chat")
async def chat(req: ChatRequest):
    if not session["genes"] and not session["metrics"] and not session.get("lab_reports"):
        return {"reply": "Please upload your lab reports and wearable data first, then I can help interpret your results."}
    require_api_key()
    try:
        reply, updated_history, structured = await chat_with_context(
            message=req.message,
            genes=session["genes"],
            metrics=session["metrics"],
            lab_reports=session.get("lab_reports", []),
            history=session["history"],
        )
    except AuthenticationError:
        raise HTTPException(
            401,
            "Invalid API key. Check that NEBIUS_API_KEY is set correctly in your shell.",
        )
    except APIStatusError as e:
        detail = e.message
        if e.status_code == 404:
            detail = (
                f"{detail} Unset GENOFIT_LITERATURE_MODEL / GENOFIT_CHAT_MODEL if set to an invalid ID. "
                f"{model_setup_hint()}"
            )
        raise HTTPException(502, f"ChatGPT API error: {detail}")
    except APIError as e:
        raise HTTPException(502, f"ChatGPT API error: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"Chat failed: {str(e)}")

    session["history"] = updated_history
    persist_session()
    result = {"reply": reply}
    if structured:
        result["analysis"] = structured
    return result


@api.post("/profile/analyze")
async def profile_analyze():
    """Run GenomeCoach analysis for the profile dashboard after wearable upload."""
    if not session["metrics"]:
        raise HTTPException(400, "Upload wearable data first.")

    require_api_key()
    try:
        structured = await analyze_profile(
            session["genes"],
            session["metrics"],
            session.get("lab_reports", []),
        )
    except AuthenticationError:
        raise HTTPException(
            401,
            "Invalid API key. Check that NEBIUS_API_KEY is set correctly in your shell.",
        )
    except APIStatusError as e:
        detail = e.message
        if e.status_code == 404:
            detail = (
                f"{detail} Unset GENOFIT_LITERATURE_MODEL / GENOFIT_CHAT_MODEL if set to an invalid ID. "
                f"{model_setup_hint()}"
            )
        raise HTTPException(502, f"ChatGPT API error: {detail}")
    except APIError as e:
        raise HTTPException(502, f"ChatGPT API error: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"Profile analysis failed: {str(e)}")

    if not structured:
        raise HTTPException(
            502,
            "Could not parse GenomeCoach analysis. Try again, or unset GENOFIT_CHAT_MODEL if set to an invalid model.",
        )

    session["profile"] = structured
    persist_session()
    return {
        "status": "ok",
        "profile": structured,
        "metrics": session["metrics"],
        "genes": session["genes"],
    }


# ── State endpoints ───────────────────────────────────────────────────────────

@api.get("/models")
def list_models():
    require_api_key()
    try:
        ids = sorted(list_available_model_ids())
    except Exception as e:
        raise HTTPException(502, f"Could not list models: {e}")
    return {
        "models": ids,
        "chat_model": model_setup_hint(),
    }


@api.get("/health")
def health():
    return {
        "status": "ok",
        "has_api_key": has_openai_api_key(),
        "has_junction_api_key": has_junction_api_key(),
        "junction_env": os.getenv("JUNCTION_ENV", "sandbox"),
        "junction_sandbox_demo": is_junction_sandbox(),
        "junction_user_override": bool(configured_junction_user_id()),
        "model_hint": model_setup_hint() if has_openai_api_key() else None,
    }


@api.get("/session")
def get_session():
    return {
        "has_genes": bool(session["genes"]),
        "has_metrics": bool(session["metrics"]),
        "has_lab_reports": bool(session.get("lab_reports")),
        "has_junction": bool(session.get("junction_user_id")),
        "junction_user_id": session.get("junction_user_id", ""),
        "genes": session["genes"],
        "metrics": session["metrics"],
        "lab_reports": session.get("lab_reports", []),
        "profile": session.get("profile", {}),
        "has_profile": bool(session.get("profile")),
        "history": session["history"],
        "history_length": len(session["history"]),
    }


@api.delete("/session")
def clear_session():
    session["genes"] = {}
    session["metrics"] = {}
    session["history"] = []
    session["lab_reports"] = []
    session["junction_user_id"] = ""
    session["profile"] = {}
    wipe_session()
    return {"status": "cleared"}


app.include_router(api)

# Legacy routes (older frontend builds called these without /api prefix)
app.add_api_route("/upload/genesight", upload_genesight, methods=["POST"])
app.add_api_route("/upload/lab-reports/batch", upload_lab_reports_batch, methods=["POST"])
app.add_api_route("/upload/genesight/batch", upload_genesight_batch, methods=["POST"])
app.add_api_route("/upload/apple-health", upload_apple_health, methods=["POST"])
app.add_api_route("/chat", chat, methods=["POST"])
app.add_api_route("/health", health, methods=["GET"])
app.add_api_route("/session", get_session, methods=["GET"])
app.add_api_route("/session", clear_session, methods=["DELETE"])

# ── Frontend (must be mounted after API routes) ─────────────────────────────

def frontend_file(path: str) -> Path | None:
    requested = (FRONTEND_DIR / path).resolve()
    if requested.is_file() and requested.is_relative_to(FRONTEND_DIR):
        return requested
    return None


def frontend_index() -> FileResponse:
    index_path = frontend_file("index.html")
    if not index_path:
        raise HTTPException(404, "Frontend index.html was not found.")
    return FileResponse(index_path)


@app.get("/", include_in_schema=False)
def serve_frontend_root():
    return frontend_index()


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend_path(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(404, "API route not found.")

    static_path = frontend_file(full_path)
    if not static_path and Path(full_path).suffix:
        static_path = frontend_file(Path(full_path).name)
    if static_path:
        return FileResponse(static_path)

    # Browser-entered app URLs should load the single-page frontend instead of
    # returning StaticFiles' default 404.
    if not Path(full_path).suffix:
        return frontend_index()

    raise HTTPException(404, "Frontend asset not found.")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
