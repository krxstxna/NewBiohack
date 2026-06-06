# GenoFit

A local platform that interprets your Apple Health wearable data through the lens of your GeneSight pharmacogenomic report using Claude AI.

---

## What it does

Upload your GeneSight PDF → upload your Apple Health export → ask questions in plain English.

GenoFit explains **why** your HRV, sleep, resting HR, and recovery scores look the way they do, grounded in your specific gene variants (COMT, SLC6A4, MTHFR, CYP2D6, CYP2C19, etc.).

---

## Project structure

```
genofit/
├── backend/
│   ├── main.py                  # FastAPI app (upload + chat endpoints)
│   ├── parsers/
│   │   ├── genesight.py         # PDF → gene dict (Claude Haiku + regex fallback)
│   │   └── apple_health.py      # export.xml → summarized metrics
│   ├── services/
│   │   └── claude.py            # Claude Sonnet chat with genomic system prompt
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Setup

### 1. Prerequisites

- Python 3.10+
- An Anthropic API key → https://console.anthropic.com

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

If chat was failing with a server error after a previous install, reinstall to pick up the Anthropic SDK fix:

```bash
pip install -r requirements.txt --upgrade
```

### 3. Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Add this to your `~/.zshrc` or `~/.bashrc` to make it permanent.

### 4. Start the backend

```bash
cd backend
python main.py
```

The API runs at `http://localhost:8000`.  
Open **http://localhost:8000** in your browser for the full app (frontend + API).  
Swagger UI is at `http://localhost:8000/docs`.

You can also open `frontend/index.html` directly if you prefer — it will talk to the backend at `localhost:8000`.

---

## How to get your Apple Health export

1. On your iPhone: **Settings → Health → your profile picture → Export All Health Data**
2. This creates a `export.zip` — unzip it
3. Upload the `export.xml` file (it will be large, 50–500 MB is normal)

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload/genesight` | Upload GeneSight PDF |
| POST | `/upload/apple-health` | Upload Apple Health XML |
| POST | `/chat` | Send a chat message |
| GET  | `/health` | Health check + API key status |
| GET  | `/session` | Get current session state |
| DELETE | `/session` | Clear all session data |
| GET | `/docs` | Swagger UI |

---

## How gene parsing works

1. Text is extracted from your GeneSight PDF using `pdfplumber`
2. Claude Haiku reads the text and extracts gene + phenotype pairs as structured JSON
3. If the API call fails, a regex fallback scans for known gene names and phenotype terms
4. The parsed genes are stored in-memory for the session

---

## Extending it

**Add more wearable sources**
- Oura: export CSV from the Oura app → add `parsers/oura.py`
- Garmin: use the Garmin Connect API → add `parsers/garmin.py`
- Whoop: export CSV from whoop.com → add `parsers/whoop.py`

**Persist sessions**
- Sessions are stored in `backend/genofit.db` (SQLite) and survive backend restarts
- Chat history is restored when you reload the page

**Add more genes**
- The `KNOWN_GENES` list in `parsers/genesight.py` can be extended
- The system prompt in `services/claude.py` is where gene→signal mappings can be made more explicit

**Deploy**
- Backend: `railway up` or `fly deploy` (add a `Procfile`: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`)
- Frontend: push to Netlify or Vercel (static files only)

---

## Notes

- All data stays local — nothing is sent anywhere except to the Anthropic API for chat responses
- Sessions persist in SQLite (`backend/genofit.db`) until you clear them or delete the file
- Large Apple Health XML files (300MB+) may take 10–20 seconds to parse
