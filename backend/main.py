from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
import os

from parsers.genesight import parse_genesight_pdf
from parsers.apple_health import parse_apple_health_xml
from services.claude import chat_with_context

app = FastAPI(title="GenoSight API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
# In-memory session state (one user, local dev)
session = {
    "genes": {},
    "metrics": {},
    "history": []
}


# ── Upload endpoints ──────────────────────────────────────────────────────────

@app.post("/upload/genesight")
async def upload_genesight(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Please upload a PDF file.")
    contents = await file.read()
    genes = parse_genesight_pdf(contents)
    if not genes:
        raise HTTPException(422, "Could not extract gene data from this PDF. Make sure it's a GeneSight report.")
    session["genes"] = genes
    session["history"] = []  # reset chat on new report
    return {"status": "ok", "genes": genes}


@app.post("/upload/apple-health")
async def upload_apple_health(file: UploadFile = File(...)):
    if not file.filename.endswith(".xml"):
        raise HTTPException(400, "Please upload the export.xml from Apple Health.")
    contents = await file.read()
    metrics = parse_apple_health_xml(contents)
    session["metrics"] = metrics
    return {"status": "ok", "metrics": metrics}


# ── Chat endpoint ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat(req: ChatRequest):
    if not session["genes"] and not session["metrics"]:
        return {"reply": "Please upload your GeneSight PDF and Apple Health export first, then I can help interpret your data."}
    reply, updated_history = await chat_with_context(
        message=req.message,
        genes=session["genes"],
        metrics=session["metrics"],
        history=session["history"]
    )
    session["history"] = updated_history
    return {"reply": reply}


# ── State endpoints ───────────────────────────────────────────────────────────

@app.get("/session")
def get_session():
    return {
        "has_genes": bool(session["genes"]),
        "has_metrics": bool(session["metrics"]),
        "genes": session["genes"],
        "metrics": session["metrics"],
        "history_length": len(session["history"])
    }

@app.delete("/session")
def clear_session():
    session["genes"] = {}
    session["metrics"] = {}
    session["history"] = []
    return {"status": "cleared"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
