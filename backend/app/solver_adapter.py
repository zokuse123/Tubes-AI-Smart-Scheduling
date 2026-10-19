"""Bounded subprocess adapter untuk kontrak CLI SWI-Prolog versi 1."""

import json
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from .errors import APIError
from .solver_verifier import verify_assignments


@dataclass(frozen=True)
class SolverConfig:
    executable: str
    cli_path: Path
    timeout_seconds: float = 30.0
    stdout_limit: int = 1024 * 1024
    stderr_limit: int = 256 * 1024

    @classmethod
    def from_mapping(cls, config: Mapping[str, Any]) -> "SolverConfig":
        return cls(
            str(config["SWIPL_EXECUTABLE"]),
            Path(config["SOLVER_CLI_PATH"]).resolve(),
            float(config["SOLVER_TIMEOUT_SECONDS"]),
            int(config["SOLVER_STDOUT_LIMIT"]),
            int(config["SOLVER_STDERR_LIMIT"]),
        )


def _error(code: str, message: str, status: int) -> APIError:
    return APIError(code, message, status)


def _resolve_executable(value: str) -> str:
    candidate = Path(value)
    if candidate.is_absolute():
        if candidate.is_file():
            return str(candidate)
        raise _error("SOLVER_UNAVAILABLE", "Mesin penjadwalan tidak tersedia.", 503)
    resolved = shutil.which(value)
    if resolved is None:
        raise _error("SOLVER_UNAVAILABLE", "Mesin penjadwalan tidak tersedia.", 503)
    return str(Path(resolved).resolve())


def _stop_process(process: subprocess.Popen) -> bool:
    if process.poll() is None:
        try:
            process.terminate()
            process.wait(timeout=1)
        except (OSError, subprocess.TimeoutExpired):
            try:
                process.kill()
                process.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                return False
    return process.poll() is not None


def _capture_process(command: list[str], payload: bytes, config: SolverConfig):
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
        )
    except (OSError, ValueError):
        raise _error("SOLVER_UNAVAILABLE", "Mesin penjadwalan tidak tersedia.", 503) from None

    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    limits = {"stdout": config.stdout_limit, "stderr": config.stderr_limit}
    overflow: set[str] = set()
    failures: list[BaseException] = []
    lock = threading.Lock()

    def close_stream(stream) -> None:
        try:
            stream.close()
        except (OSError, ValueError) as exc:
            failures.append(exc)

    def reader(name: str, stream) -> None:
        try:
            while True:
                chunk = stream.read(65536)
                if not chunk:
                    break
                with lock:
                    remaining = limits[name] - len(buffers[name])
                    if len(chunk) > remaining:
                        buffers[name].extend(chunk[: max(remaining, 0)])
                        overflow.add(name)
                    elif name not in overflow:
                        buffers[name].extend(chunk)
        except (OSError, ValueError) as exc:
            failures.append(exc)
        finally:
            close_stream(stream)

    def writer() -> None:
        try:
            process.stdin.write(payload)
            process.stdin.flush()
        except (OSError, ValueError, BrokenPipeError) as exc:
            failures.append(exc)
        finally:
            close_stream(process.stdin)

    threads = [
        threading.Thread(target=reader, args=("stdout", process.stdout), daemon=True),
        threading.Thread(target=reader, args=("stderr", process.stderr), daemon=True),
        threading.Thread(target=writer, daemon=True),
    ]
    for thread in threads:
        thread.start()

    deadline = time.monotonic() + config.timeout_seconds
    timed_out = False
    cleanup_failed = False
    try:
        while process.poll() is None:
            if overflow or failures:
                cleanup_failed = not _stop_process(process)
                break
            if time.monotonic() >= deadline:
                timed_out = True
                cleanup_failed = not _stop_process(process)
                break
            time.sleep(0.005)
        process.wait(timeout=1)
    except (OSError, subprocess.TimeoutExpired):
        failures.append(OSError("process cleanup failed"))
        cleanup_failed = not _stop_process(process)
    finally:
        for thread in threads:
            thread.join(timeout=1)
        cleanup_failed = not _stop_process(process) or cleanup_failed

    if cleanup_failed:
        failures.append(OSError("process could not be reaped"))

    if timed_out:
        raise _error("SOLVER_TIMEOUT", "Pencarian melewati batas waktu 30 detik.", 504)
    if "stdout" in overflow:
        raise _error("SOLVER_PROTOCOL_ERROR", "Respons mesin penjadwalan melebihi batas aman.", 502)
    if "stderr" in overflow:
        raise _error("SOLVER_PROCESS_ERROR", "Mesin penjadwalan gagal dijalankan.", 502)
    if failures or any(thread.is_alive() for thread in threads):
        raise _error("SOLVER_PROCESS_ERROR", "Mesin penjadwalan gagal dijalankan.", 502)
    return process.returncode, bytes(buffers["stdout"]), bytes(buffers["stderr"])


def _strict_int(value: Any, *, positive: bool = False) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and (not positive or value > 0)


def _validate_error(value: Any, *, path_required: bool) -> None:
    expected = {"code", "message", "path"} if path_required else {"code", "message"}
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError
    if not isinstance(value["code"], str) or not isinstance(value["message"], str):
        raise ValueError
    if path_required and value["path"] is not None and not isinstance(value["path"], str):
        raise ValueError


def validate_solver_response(response: Any, exit_code: int, source_revision: int) -> dict[str, Any]:
    try:
        if not isinstance(response, dict):
            raise ValueError
        status = response.get("status")
        expected_exit = {"success": 0, "unsatisfiable": 0, "invalid_input": 2, "internal_error": 3}
        if status not in expected_exit or exit_code != expected_exit[status]:
            raise ValueError
        if (
            not _strict_int(response.get("schema_version"))
            or response["schema_version"] != 1
            or not _strict_int(response.get("source_revision"))
            or response["source_revision"] != source_revision
        ):
            raise ValueError

        if status in ("success", "unsatisfiable"):
            if set(response) != {"schema_version", "source_revision", "status", "assignments"}:
                raise ValueError
            assignments = response["assignments"]
            if not isinstance(assignments, list) or (status == "unsatisfiable" and assignments):
                raise ValueError
            seen: set[int] = set()
            for item in assignments:
                if not isinstance(item, dict) or set(item) != {"praktikum_id", "slot_id", "laboratorium_id"}:
                    raise ValueError
                if not all(_strict_int(item[field], positive=True) for field in item):
                    raise ValueError
                if item["praktikum_id"] in seen:
                    raise ValueError
                seen.add(item["praktikum_id"])
            if [item["praktikum_id"] for item in assignments] != sorted(seen):
                raise ValueError
        elif status == "invalid_input":
            if set(response) != {"schema_version", "source_revision", "status", "error"}:
                raise ValueError
            _validate_error(response["error"], path_required=True)
        else:
            if set(response) != {"schema_version", "source_revision", "status", "error"}:
                raise ValueError
            _validate_error(response["error"], path_required=False)
    except (KeyError, TypeError, ValueError):
        raise _error("SOLVER_PROTOCOL_ERROR", "Mesin penjadwalan menghasilkan respons tidak valid.", 502) from None

    if response["status"] == "invalid_input":
        raise _error("SOLVER_INVALID_INPUT", "Data untuk mesin penjadwalan tidak valid.", 502)
    if response["status"] == "internal_error":
        raise _error("SOLVER_INTERNAL_ERROR", "Mesin penjadwalan gagal memproses permintaan.", 502)
    return response


def run_solver(payload: dict[str, Any], config: SolverConfig) -> dict[str, Any]:
    executable = _resolve_executable(config.executable)
    cli_path = config.cli_path.resolve()
    if not cli_path.is_file() or not cli_path.is_absolute():
        raise _error("SOLVER_UNAVAILABLE", "Mesin penjadwalan tidak tersedia.", 503)
    command = [
        executable, "-q", "-f", "none", "-s", str(cli_path),
        "-g", "solver_cli:main", "-t", "halt",
    ]
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    exit_code, stdout, _stderr = _capture_process(command, encoded, config)
    if exit_code not in (0, 2, 3):
        raise _error("SOLVER_PROCESS_ERROR", "Mesin penjadwalan gagal dijalankan.", 502)
    try:
        text = stdout.decode("utf-8", errors="strict")
        decoder = json.JSONDecoder()
        stripped = text.lstrip()
        response, end = decoder.raw_decode(stripped)
        if stripped[end:].strip():
            raise ValueError
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise _error("SOLVER_PROTOCOL_ERROR", "Mesin penjadwalan menghasilkan respons tidak valid.", 502) from None
    validated = validate_solver_response(response, exit_code, payload["source_revision"])
    if validated["status"] == "success":
        verify_assignments(payload, validated["assignments"])
    return validated
