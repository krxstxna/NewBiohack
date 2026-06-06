from pathlib import Path

import anthropic
from fastapi import APIRouter, FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
import uvicorn
import os

from parsers.genesight import parse_genesight_pdf
from parsers.apple_health import parse_apple_health_xml
from services.claude import chat_with_context
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
        if path == "/" or path.endswith((".html", ".js", ".css")):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)

session = load_session()

FRONTEND_DIR = Path(__file__).resolve().parent.parent


def persist_session() -> None:
    save_session(session["genes"], session["metrics"], session["history"])


def require_api_key() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(
            503,
            "ANTHROPIC_API_KEY is not set. Export it before using chat.",
        )


def validate_pdf_upload(file: UploadFile) -> None:
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if not filename.endswith(".pdf") and content_type != "application/pdf":
        raise HTTPException(400, "Please upload a PDF file.")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ── Upload endpoints ──────────────────────────────────────────────────────────

@api.post("/upload/genesight")
async def upload_genesight(file: UploadFile = File(...)):
    validate_pdf_upload(file)
    try:
        contents = await file.read()
        genes, debug = parse_genesight_pdf(contents)
    except Exception as e:
        raise HTTPException(500, f"GeneSight upload failed: {str(e)}")

    if not genes:
        hint = debug or "Make sure it's a GeneSight report PDF with selectable text."
        raise HTTPException(422, f"Could not extract gene data from this PDF. {hint}")

    session["genes"] = genes
    session["history"] = []
    persist_session()
    return {"status": "ok", "genes": genes}


@api.post("/upload/apple-health")
async def upload_apple_health(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    if not filename.endswith(".xml"):
        raise HTTPException(400, "Please upload the export.xml from Apple Health.")
    try:
        contents = await file.read()
        metrics = parse_apple_health_xml(contents)
    except Exception as e:
        raise HTTPException(500, f"Apple Health upload failed: {str(e)}")

    session["metrics"] = metrics
    persist_session()
    return {"status": "ok", "metrics": metrics}


# ── Chat endpoint ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str


@api.post("/chat")
async def chat(req: ChatRequest):
    if not session["genes"] and not session["metrics"]:
        return {"reply": "Please upload your GeneSight PDF and Apple Health export first, then I can help interpret your data."}
    require_api_key()
    try:
        reply, updated_history = await chat_with_context(
            message=req.message,
            genes=session["genes"],
            metrics=session["metrics"],
            history=session["history"],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(
            401,
            "Invalid Anthropic API key. Check that ANTHROPIC_API_KEY is set correctly in your shell.",
        )
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"Claude API error: {e.message}")
    except anthropic.APIError as e:
        raise HTTPException(502, f"Claude API error: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"Chat failed: {str(e)}")

    session["history"] = updated_history
    persist_session()
    return {"reply": reply}


# ── State endpoints ───────────────────────────────────────────────────────────

@api.get("/health")
def health():
    return {
        "status": "ok",
        "has_api_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


@api.get("/session")
def get_session():
    return {
        "has_genes": bool(session["genes"]),
        "has_metrics": bool(session["metrics"]),
        "genes": session["genes"],
        "metrics": session["metrics"],
        "history": session["history"],
        "history_length": len(session["history"]),
    }


@api.delete("/session")
def clear_session():
    session["genes"] = {}
    session["metrics"] = {}
    session["history"] = []
    wipe_session()
    return {"status": "cleared"}


app.include_router(api)

# Legacy routes (older frontend builds called these without /api prefix)
app.add_api_route("/upload/genesight", upload_genesight, methods=["POST"])
app.add_api_route("/upload/apple-health", upload_apple_health, methods=["POST"])
app.add_api_route("/chat", chat, methods=["POST"])
app.add_api_route("/health", health, methods=["GET"])
app.add_api_route("/session", get_session, methods=["GET"])
app.add_api_route("/session", clear_session, methods=["DELETE"])

# ── Frontend (must be mounted after API routes) ─────────────────────────────

if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
