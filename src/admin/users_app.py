from __future__ import annotations

import argparse
import hmac
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from supabase import Client

from adapters.output.supabase_repositories import SimpleTokenService
from core.domain.models import ValidationError
from core.domain.rules import ensure_valid_role, hash_password, normalize_email
from infra.config import Settings
from infra.supabase_client import build_supabase_client


def _resolve_project_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[2]


ADMIN_WEB_DIR = _resolve_project_root() / "admin_web"


def _build_local_url(host: str, port: int) -> str:
    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    return f"http://{browser_host}:{port}"


def _wait_http_ready(url: str, timeout_seconds: float = 25.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as response:  # noqa: S310
                if 200 <= response.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.25)
    return False


def _open_browser_async(url: str) -> None:
    def _worker() -> None:
        if _wait_http_ready(url):
            webbrowser.open(url, new=2, autoraise=True)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


def _find_listening_pids_windows(port: int) -> set[int]:
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"],
        capture_output=True,
        text=True,
        check=False,
    )
    pids: set[int] = set()
    suffix = f":{port}"
    for raw_line in result.stdout.splitlines():
        parts = [item for item in raw_line.strip().split() if item]
        if len(parts) < 5:
            continue
        local_address = parts[1]
        state = parts[3].upper()
        pid_raw = parts[4]
        if state not in {"LISTENING", "ESCUTANDO"} or not local_address.endswith(suffix):
            continue
        try:
            pid = int(pid_raw)
        except ValueError:
            continue
        if pid > 0:
            pids.add(pid)
    return pids


def _shutdown_server_processes(port: int) -> None:
    time.sleep(0.4)
    candidate_pids: set[int] = {os.getpid(), os.getppid()}
    starter_pid_raw = os.getenv("PSC_ADMIN_STARTER_PID", "").strip()
    if starter_pid_raw.isdigit():
        candidate_pids.add(int(starter_pid_raw))

    if sys.platform.startswith("win"):
        candidate_pids.update(_find_listening_pids_windows(port))
        for pid in sorted(candidate_pids, reverse=True):
            if pid <= 0:
                continue
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F", "/T"],
                capture_output=True,
                text=True,
                check=False,
            )
        os._exit(0)

    for pid in sorted(candidate_pids, reverse=True):
        if pid <= 0:
            continue
        subprocess.run(["kill", "-TERM", str(pid)], capture_output=True, text=True, check=False)
    os._exit(0)


class AdminLoginPayload(BaseModel):
    password: str


class AdminUserPayload(BaseModel):
    email: str
    name: str
    role: str
    password: str | None = None
    is_active: bool = True
    can_edit_projected_value: bool = False
    area_ids: list[str] = Field(default_factory=list)


def verify_admin_password(candidate: str, expected: str) -> bool:
    if not expected:
        return False
    return hmac.compare_digest(candidate, expected)


def _admin_password_from_env() -> str:
    return os.getenv("USER_ADMIN_PASSWORD", "").strip()


def _serialize_user(row: dict[str, Any], area_ids: list[str]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "email": str(row["email"]),
        "name": str(row.get("name") or ""),
        "role": str(row["role"]),
        "area_id": str(row["area_id"]) if row.get("area_id") else None,
        "is_active": bool(row.get("is_active", True)),
        "can_edit_projected_value": bool(row.get("can_edit_projected_value", False)),
        "area_ids": area_ids,
    }


def _ensure_valid_role_or_422(role: str) -> None:
    try:
        ensure_valid_role(role)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class AdminUserRepository:
    def __init__(self, client: Client) -> None:
        self.client = client

    def list_areas(self) -> list[dict[str, Any]]:
        response = (
            self.client.table("areas")
            .select("id,name,hex_color,is_active")
            .eq("is_active", True)
            .order("name")
            .execute()
        )
        return [
            {
                "id": str(row["id"]),
                "name": str(row["name"]),
                "hex_color": str(row["hex_color"]) if row.get("hex_color") else None,
                "is_active": bool(row.get("is_active", True)),
            }
            for row in (response.data or [])
        ]

    def list_users(self) -> list[dict[str, Any]]:
        response = self.client.table("users").select("*").order("name").execute()
        users = response.data or []
        user_ids = [str(row["id"]) for row in users if row.get("id")]
        access_map = self._list_access_map(user_ids)
        return [_serialize_user(row, access_map.get(str(row["id"]), [])) for row in users]

    def create_user(self, payload: AdminUserPayload) -> dict[str, Any]:
        clean_email = normalize_email(payload.email)
        clean_name = payload.name.strip()
        if not clean_email:
            raise HTTPException(status_code=422, detail="Email obrigatorio.")
        if not clean_name:
            raise HTTPException(status_code=422, detail="Nome obrigatorio.")
        if not payload.password:
            raise HTTPException(status_code=422, detail="Senha obrigatoria para novo usuario.")
        _ensure_valid_role_or_422(payload.role)

        area_ids = self._dedupe_area_ids(payload.area_ids)
        user_payload = {
            "email": clean_email,
            "name": clean_name,
            "role": payload.role,
            "password_hash": hash_password(payload.password),
            "area_id": area_ids[0] if area_ids else None,
            "is_active": payload.is_active,
            "can_edit_projected_value": payload.can_edit_projected_value,
        }
        response = self.client.table("users").insert(user_payload).execute()
        row = (response.data or [])[0]
        self.replace_user_areas(str(row["id"]), area_ids)
        return _serialize_user(row, area_ids)

    def update_user(self, user_id: str, payload: AdminUserPayload) -> dict[str, Any]:
        clean_email = normalize_email(payload.email)
        clean_name = payload.name.strip()
        if not clean_email:
            raise HTTPException(status_code=422, detail="Email obrigatorio.")
        if not clean_name:
            raise HTTPException(status_code=422, detail="Nome obrigatorio.")
        _ensure_valid_role_or_422(payload.role)

        area_ids = self._dedupe_area_ids(payload.area_ids)
        user_payload: dict[str, Any] = {
            "email": clean_email,
            "name": clean_name,
            "role": payload.role,
            "area_id": area_ids[0] if area_ids else None,
            "is_active": payload.is_active,
            "can_edit_projected_value": payload.can_edit_projected_value,
        }
        if payload.password:
            user_payload["password_hash"] = hash_password(payload.password)

        response = self.client.table("users").update(user_payload).eq("id", user_id).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Usuario nao encontrado.")
        self.replace_user_areas(user_id, area_ids)
        return _serialize_user(rows[0], area_ids)

    def deactivate_user(self, user_id: str) -> None:
        response = self.client.table("users").update({"is_active": False}).eq("id", user_id).execute()
        if not (response.data or []):
            raise HTTPException(status_code=404, detail="Usuario nao encontrado.")

    def replace_user_areas(self, user_id: str, area_ids: list[str]) -> None:
        self.client.table("user_area_access").delete().eq("user_id", user_id).execute()
        rows = [{"user_id": user_id, "area_id": area_id} for area_id in self._dedupe_area_ids(area_ids)]
        if rows:
            self.client.table("user_area_access").insert(rows).execute()

    def _list_access_map(self, user_ids: list[str]) -> dict[str, list[str]]:
        if not user_ids:
            return {}
        response = (
            self.client.table("user_area_access")
            .select("user_id,area_id")
            .in_("user_id", user_ids)
            .execute()
        )
        access_map: dict[str, list[str]] = {}
        for row in response.data or []:
            user_id = str(row["user_id"])
            access_map.setdefault(user_id, []).append(str(row["area_id"]))
        return access_map

    @staticmethod
    def _dedupe_area_ids(area_ids: list[str]) -> list[str]:
        deduped: list[str] = []
        for area_id in area_ids:
            clean_area_id = area_id.strip()
            if clean_area_id and clean_area_id not in deduped:
                deduped.append(clean_area_id)
        return deduped


def create_app() -> FastAPI:
    settings = Settings.from_env()
    admin_password = _admin_password_from_env()
    if not admin_password:
        raise RuntimeError("Configure USER_ADMIN_PASSWORD no .env antes de iniciar o admin.")

    client = build_supabase_client(settings)
    repository = AdminUserRepository(client=client)
    token_service = SimpleTokenService(secret_key=settings.app_secret_key, ttl_minutes=720)
    bearer = HTTPBearer(auto_error=False)

    app = FastAPI(title="PSC Users Admin", version="0.1.0")

    def require_admin(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> None:
        if credentials is None or token_service.read_user_id(credentials.credentials) != "admin":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin nao autenticado.")

    @app.post("/api/login")
    def login(payload: AdminLoginPayload) -> dict[str, str]:
        if not verify_admin_password(payload.password, admin_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha admin invalida.")
        return {"access_token": token_service.issue_token("admin"), "token_type": "bearer"}

    @app.get("/api/areas")
    def list_areas(_admin: None = Depends(require_admin)) -> list[dict[str, Any]]:
        return repository.list_areas()

    @app.get("/api/users")
    def list_users(_admin: None = Depends(require_admin)) -> list[dict[str, Any]]:
        return repository.list_users()

    @app.post("/api/users")
    def create_user(
        payload: AdminUserPayload,
        _admin: None = Depends(require_admin),
    ) -> dict[str, Any]:
        return repository.create_user(payload)

    @app.put("/api/users/{user_id}")
    def update_user(
        user_id: str,
        payload: AdminUserPayload,
        _admin: None = Depends(require_admin),
    ) -> dict[str, Any]:
        return repository.update_user(user_id=user_id, payload=payload)

    @app.delete("/api/users/{user_id}")
    def deactivate_user(user_id: str, _admin: None = Depends(require_admin)) -> dict[str, str]:
        repository.deactivate_user(user_id=user_id)
        return {"status": "deactivated"}

    @app.post("/api/system/shutdown")
    def shutdown_app(
        background_tasks: BackgroundTasks,
        request: Request,
        _admin: None = Depends(require_admin),
    ) -> dict[str, str]:
        shutdown_port = request.url.port
        if shutdown_port is None:
            env_port = os.getenv("PSC_ADMIN_SERVER_PORT", "8020")
            shutdown_port = int(env_port) if env_port.isdigit() else 8020

        background_tasks.add_task(_shutdown_server_processes, shutdown_port)
        return {"status": "shutting_down", "message": "Admin em encerramento."}

    if ADMIN_WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=ADMIN_WEB_DIR), name="static")

        @app.get("/", include_in_schema=False)
        def index() -> FileResponse:
            return FileResponse(ADMIN_WEB_DIR / "index.html")

    @app.get("/health", include_in_schema=False)
    def health() -> PlainTextResponse:
        return PlainTextResponse("ok")

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Inicia o admin local de usuarios do PSC.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8020)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--log-level", default="info")
    parser.add_argument(
        "--open-browser",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Abre automaticamente o admin no navegador.",
    )
    args = parser.parse_args()

    if args.env_file:
        os.environ.setdefault("UVICORN_ENV_FILE", args.env_file)
    os.environ["PSC_ADMIN_STARTER_PID"] = str(os.getpid())
    os.environ["PSC_ADMIN_SERVER_PORT"] = str(args.port)

    if args.open_browser:
        _open_browser_async(_build_local_url(args.host, args.port))

    app_target: FastAPI | str
    if args.reload:
        app_target = "admin.users_app:create_app"
        factory = True
    else:
        app_target = create_app()
        factory = False

    uvicorn.run(
        app_target,
        host=args.host,
        port=args.port,
        reload=args.reload,
        factory=factory,
        env_file=args.env_file,
        log_level=args.log_level,
        use_colors=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise
