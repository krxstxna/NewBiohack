"""
SQLite-backed session store.

Persists genes, lab reports, metrics, and chat history across backend restarts.
Designed for single-user local use (one session row).
"""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "genofit.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                genes TEXT NOT NULL DEFAULT '{}',
                metrics TEXT NOT NULL DEFAULT '{}',
                history TEXT NOT NULL DEFAULT '[]'
            )
            """
        )
        try:
            conn.execute(
                "ALTER TABLE session ADD COLUMN lab_reports TEXT NOT NULL DEFAULT '[]'"
            )
        except sqlite3.OperationalError:
            pass
        conn.execute(
            """
            INSERT OR IGNORE INTO session (id, genes, metrics, history)
            VALUES (1, '{}', '{}', '[]')
            """
        )
        conn.execute(
            "UPDATE session SET lab_reports = '[]' WHERE id = 1 AND lab_reports IS NULL"
        )


def load_session() -> dict:
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT genes, metrics, history, lab_reports FROM session WHERE id = 1"
        ).fetchone()
        if not row:
            return {"genes": {}, "metrics": {}, "history": [], "lab_reports": []}
        return {
            "genes": json.loads(row["genes"]),
            "metrics": json.loads(row["metrics"]),
            "history": json.loads(row["history"]),
            "lab_reports": json.loads(row["lab_reports"]),
        }


def save_session(genes: dict, metrics: dict, history: list, lab_reports: list | None = None) -> None:
    init_db()
    with _connect() as conn:
        if lab_reports is None:
            row = conn.execute("SELECT lab_reports FROM session WHERE id = 1").fetchone()
            lab_reports = json.loads(row["lab_reports"]) if row else []
        conn.execute(
            """
            UPDATE session
            SET genes = ?, metrics = ?, history = ?, lab_reports = ?
            WHERE id = 1
            """,
            (json.dumps(genes), json.dumps(metrics), json.dumps(history), json.dumps(lab_reports)),
        )


def clear_session() -> None:
    save_session({}, {}, [], [])
