from __future__ import annotations

import argparse
import ctypes
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from dataclasses import dataclass
from typing import TextIO

import uvicorn
from fastapi import FastAPI


@dataclass(frozen=True)
class KillAttempt:
    pid: int
    success: bool
    reason: str | None = None


def _is_port_busy(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.2)
        return probe.connect_ex(("127.0.0.1", port)) == 0


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
        line = raw_line.strip()
        if not line:
            continue

        parts = [item for item in line.split() if item]
        if len(parts) < 5:
            continue

        local_address = parts[1]
        state = parts[3].upper()
        pid_raw = parts[4]
        if state not in {"LISTENING", "ESCUTANDO"}:
            continue
        if not local_address.endswith(suffix):
            continue

        try:
            pid = int(pid_raw)
        except ValueError:
            continue

        if pid > 0:
            pids.add(pid)

    return pids


def _try_elevated_kill_windows(pid: int) -> KillAttempt:
    command = (
        "Start-Process taskkill "
        f"-ArgumentList '/PID {pid} /F /T' "
        "-Verb RunAs -Wait"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        return KillAttempt(pid=pid, success=True)

    reason = (result.stderr or result.stdout or "").strip()
    if not reason:
        reason = "Falha ao encerrar processo com elevacao UAC."
    return KillAttempt(pid=pid, success=False, reason=reason)


def _find_listening_pids_unix(port: int) -> set[int]:
    result = subprocess.run(
        ["lsof", "-ti", f"tcp:{port}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return set()

    pids: set[int] = set()
    for item in result.stdout.splitlines():
        raw = item.strip()
        if not raw:
            continue
        try:
            pid = int(raw)
        except ValueError:
            continue
        if pid > 0:
            pids.add(pid)
    return pids


def _kill_pid(pid: int, allow_uac_elevation: bool) -> KillAttempt:
    if pid == os.getpid():
        return KillAttempt(
            pid=pid,
            success=False,
            reason="Launcher nao encerra o proprio processo.",
        )

    if sys.platform.startswith("win"):
        result = subprocess.run(
            ["taskkill", "/PID", str(pid), "/F", "/T"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return KillAttempt(pid=pid, success=True)

        reason = (result.stderr or result.stdout or "").strip()
        if allow_uac_elevation:
            elevated_attempt = _try_elevated_kill_windows(pid)
            if elevated_attempt.success:
                return elevated_attempt

            elevated_reason = elevated_attempt.reason or "Falha em tentativa elevada."
            merged_reason = reason or "Falha no taskkill."
            return KillAttempt(
                pid=pid,
                success=False,
                reason=f"{merged_reason} | elevacao: {elevated_reason}",
            )

        return KillAttempt(pid=pid, success=False, reason=reason or "Falha no taskkill.")

    result = subprocess.run(
        ["kill", "-TERM", str(pid)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        return KillAttempt(pid=pid, success=True)

    reason = (result.stderr or result.stdout or "").strip()
    return KillAttempt(pid=pid, success=False, reason=reason or "Falha no kill.")


def _close_listeners_on_port(
    port: int,
    allow_uac_elevation: bool,
) -> tuple[set[int], list[KillAttempt]]:
    if sys.platform.startswith("win"):
        pids = _find_listening_pids_windows(port)
    else:
        pids = _find_listening_pids_unix(port)

    attempts: list[KillAttempt] = []
    for pid in sorted(pids):
        attempts.append(_kill_pid(pid, allow_uac_elevation=allow_uac_elevation))
    return pids, attempts


def _cleanup_port_with_retries(
    port: int,
    allow_uac_elevation: bool,
    rounds: int = 3,
) -> tuple[set[int], list[KillAttempt]]:
    all_found_pids: set[int] = set()
    all_attempts: list[KillAttempt] = []

    for _ in range(rounds):
        if not _is_port_busy(port):
            break

        found_pids, attempts = _close_listeners_on_port(
            port=port,
            allow_uac_elevation=allow_uac_elevation,
        )
        all_found_pids.update(found_pids)
        all_attempts.extend(attempts)
        time.sleep(0.4)

    return all_found_pids, all_attempts


def _wait_until_free(port: int, timeout_seconds: float = 4.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not _is_port_busy(port):
            return True
        time.sleep(0.2)
    return not _is_port_busy(port)


def _build_local_url(host: str, port: int) -> str:
    browser_host = host
    if host in {"0.0.0.0", "::"}:
        browser_host = "127.0.0.1"
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
        if not _wait_http_ready(url):
            print(f"[startup] Servidor nao respondeu a tempo para abrir navegador: {url}")
            return
        opened = _open_url_in_default_browser(url)
        if opened:
            print(f"[startup] Navegador aberto em: {url}")
        else:
            print(f"[startup] Nao foi possivel abrir navegador automaticamente: {url}")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


def _open_url_in_default_browser(url: str) -> bool:
    try:
        opened = webbrowser.open(url, new=2, autoraise=True)
        if opened:
            return True
    except Exception:
        pass

    if sys.platform.startswith("win"):
        try:
            os.startfile(url)  # type: ignore[attr-defined]
            return True
        except Exception:
            return False
    return False


def _show_startup_error_dialog(message: str) -> None:
    if not sys.platform.startswith("win"):
        return
    try:
        title = "PSC - Falha ao iniciar"
        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
    except Exception:
        pass


def _ensure_standard_streams() -> None:
    # In one-file builds with noconsole, sys.stdout/sys.stderr can be None.
    # Uvicorn logging expects file-like objects and may call isatty().
    if sys.stdout is None:
        sys.stdout = _open_null_stream()
    if sys.stderr is None:
        sys.stderr = _open_null_stream()


def _open_null_stream() -> TextIO:
    return open(os.devnull, "w", encoding="utf-8")


def main() -> None:
    _ensure_standard_streams()

    parser = argparse.ArgumentParser(
        description=(
            "Inicia o servidor FastAPI limpando automaticamente processos "
            "que estejam escutando na mesma porta."
        )
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--log-level", default="info")
    parser.add_argument("--skip-port-cleanup", action="store_true")
    parser.add_argument("--skip-uac-elevation", action="store_true")
    parser.add_argument(
        "--open-browser",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Abre automaticamente a aplicacao no navegador.",
    )
    args = parser.parse_args()

    if not args.skip_port_cleanup and _is_port_busy(args.port):
        print(f"[startup] Porta {args.port} ocupada. Encerrando processos...")
        found_pids, attempts = _cleanup_port_with_retries(
            port=args.port,
            allow_uac_elevation=not args.skip_uac_elevation,
        )

        success_pids = {item.pid for item in attempts if item.success}
        latest_attempt_by_pid: dict[int, KillAttempt] = {}
        for item in attempts:
            latest_attempt_by_pid[item.pid] = item

        killed = sorted(success_pids)
        failed = [
            attempt
            for pid, attempt in latest_attempt_by_pid.items()
            if pid not in success_pids
        ]

        if killed:
            print(f"[startup] Processos encerrados: {', '.join(str(pid) for pid in killed)}")
        if failed:
            for item in failed:
                reason = item.reason or "Motivo nao informado."
                print(f"[startup] Falha ao encerrar PID {item.pid}: {reason}")
        if not found_pids:
            print("[startup] Nenhum PID em LISTENING foi identificado para a porta.")
        elif not killed and failed:
            print("[startup] PIDs foram encontrados, mas nao puderam ser encerrados.")
        elif killed and failed:
            print("[startup] Alguns processos foram encerrados e outros falharam.")

        if not _wait_until_free(args.port):
            raise RuntimeError(
                f"Porta {args.port} continua ocupada apos tentativa de limpeza. "
                "Tente abrir o terminal como Administrador e executar novamente."
            )

    os.environ["PSC_STARTER_PID"] = str(os.getpid())
    os.environ["PSC_SERVER_PORT"] = str(args.port)

    if args.open_browser:
        _open_browser_async(_build_local_url(args.host, args.port))

    app_target: FastAPI | str
    if args.reload and not getattr(sys, "frozen", False):
        # O auto-reload do Uvicorn exige import string.
        app_target = "app.main:app"
    else:
        # No executavel (frozen), evita import dinamico por string, que pode falhar
        # no bootloader do PyInstaller.
        from app.main import create_app

        app_target = create_app()

    uvicorn.run(
        app_target,
        host=args.host,
        port=args.port,
        reload=args.reload and not getattr(sys, "frozen", False),
        env_file=args.env_file,
        log_level=args.log_level,
        use_colors=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        _show_startup_error_dialog(str(exc))
        raise
