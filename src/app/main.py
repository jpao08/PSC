from __future__ import annotations

from pathlib import Path
import sys

from fastapi import FastAPI
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from adapters.input.api_routes import create_api_router
from app.wiring import build_container


def _resolve_runtime_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[2]


WEB_DIR = _resolve_runtime_root() / "web"


def create_app() -> FastAPI:
    container = build_container()

    app = FastAPI(title="PSC Indicators MVP", version="0.1.0")
    app.include_router(create_api_router(container=container))

    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

        @app.get("/", include_in_schema=False)
        def index() -> FileResponse:
            return FileResponse(WEB_DIR / "index.html")

    @app.get("/health", include_in_schema=False)
    def health() -> PlainTextResponse:
        return PlainTextResponse("ok")

    return app


app = create_app()
