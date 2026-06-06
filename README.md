# GenoFit

A local platform that interprets your Apple Health wearable data through the lens of your GeneSight pharmacogenomic report using ChatGPT.

---

## What it does

Upload your GeneSight PDF → upload your Apple Health export → ask questions in plain English.

GenoFit explains **why** your HRV, sleep, resting HR, and recovery scores look the way they do, grounded in your specific gene variants (COMT, SLC6A4, MTHFR, CYP2D6, CYP2C19, etc.).

---

## Project structure

```
NewBiohack/
├── index.html
├── style.css
├── app.js
└── backend/
    ├── main.py                  # FastAPI app (upload + chat endpoints)
    ├── parsers/
    │   ├── genesight.py         # PDF → gene dict (GPT + regex fallback)
    │   └── apple_health.py      # export.xml → summarized metrics
    ├── services/
    │   ├── claude.py            # GenomeCoach chat (ChatGPT API)
    │   └── openai_client.py     # ChatGPT-style API client (Nebius Token Factory)
    └── requirements.txt
```

---

## Setup

### 1. Prerequisites

- Python 3.10+
- A Nebius Token Factory API key → https://tokenfactory.nebius.com/

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

If chat was failing with a server error after a previous install, reinstall dependencies:

```bash
pip install -r requirements.txt --upgrade
```

### 3. Set your Nebius API key

GenoFit uses the **ChatGPT-style API** (`chat.completions`) through Nebius Token Factory:

```bash
export NEBIUS_API_KEY=your-nebius-api-key
```

GenoFit defaults to the **us-central1** Token Factory endpoint and `openai/gpt-oss-120b-fast`:

```bash
export NEBIUS_API_KEY=your-nebius-api-key
# optional — these are already the defaults:
export NEBIUS_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1/
export GENOFIT_CHAT_MODEL=openai/gpt-oss-120b-fast
export GENOFIT_LITERATURE_MODEL=openai/gpt-oss-120b-fast
```

List models your key can use: `GET http://localhost:8000/api/models`

If you previously set `GENOFIT_LITERATURE_MODEL=openai/gpt-oss-20b`, **unset it** — that model is not on Nebius.

Add exports to your `~/.zshrc` or `~/.bashrc` to make them permanent.

### 4. Start the backend

```bash
cd backend
python main.py
```

The API runs at `http://localhost:8000`.  
Open **http://localhost:8000** in your browser for the full app (frontend + API).  
Swagger UI is at `http://localhost:8000/docs`.

You can also open `index.html` directly if you prefer — it will talk to the backend at `localhost:8000`.

### Resetting your session

GenoFit stores data in two places — a hard refresh alone will **not** clear it:

| Location | What it stores |
|----------|------------------|
| `backend/genofit.db` | Uploaded genes, metrics, chat history |
| Browser `localStorage` | Your name and onboarding progress |

To start completely fresh:

1. Click **Start over** in the chat sidebar, or **Clear previous session & start fresh** on the welcome screen
2. Or open `http://localhost:8000/?reset=1`
3. Or manually delete the database: `rm backend/genofit.db`

Then restart the backend and reload the page.

---

## How to get your Apple Health export

1. On your iPhone: **Settings → Health → your profile picture → Export All Health Data**
2. This creates a `export.zip` — unzip it
3. Upload the `export.xml` file (it will be large, 50–500 MB is normal)

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload/genesight` | Upload GeneSight PDF |
| POST | `/api/upload/apple-health` | Upload Apple Health XML |
| POST | `/api/chat` | Send a chat message |
| GET  | `/api/health` | Health check + API key status |
| GET  | `/api/models` | List models available to your Nebius API key |
| GET  | `/api/session` | Get current session state |
| DELETE | `/api/session` | Clear all session data |
| GET | `/docs` | Swagger UI |

---

## How gene parsing works

1. Text is extracted from your GeneSight PDF using `pdfplumber`
2. GPT-OSS on Nebius reads the text and extracts gene + phenotype pairs as structured JSON
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
- GitHub Pages: enable Pages in the repository settings and choose **GitHub Actions** as the source. The included workflow publishes the static frontend to `https://krxstxna.github.io/NewBiohack/`. If the repository stays private, Pages availability depends on the GitHub account/organization plan.

---

## Notes

- All data stays local except inference requests sent to **Nebius Token Factory** (ChatGPT-style API, GPT models)
- Sessions persist in SQLite (`backend/genofit.db`) until you clear them or delete the file
- Large Apple Health XML files (300MB+) may take 10–20 seconds to parse
