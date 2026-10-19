"""TASK 12C fault injection and bounded stress tests for solver integration."""

import json
import shutil
import subprocess
import threading
import time
from pathlib import Path

import pytest

import backend.app.solver_adapter as adapter
from backend.app.errors import APIError
from backend.app.solver_adapter import SolverConfig, run_solver, validate_solver_response


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "prolog" / "tests" / "fixtures"


def load(name="valid.json"):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def config(path: Path, **changes):
    values = dict(
        executable=shutil.which("swipl") or "swipl",
        cli_path=path,
        timeout_seconds=3,
        stdout_limit=1024 * 1024,
        stderr_limit=256 * 1024,
    )
    values.update(changes)
    return SolverConfig(**values)


def cli(tmp_path: Path, body: str, name="fault.pl") -> Path:
    path = tmp_path / name
    path.write_text(":- module(solver_cli,[main/0]).\nmain :- " + body + ".\n", encoding="utf-8")
    return path


def code(expected, operation):
    with pytest.raises(APIError) as caught:
        operation()
    assert caught.value.code == expected
    assert caught.value.details is None


class FaultStream:
    def __init__(self, *, read_error=None, write_error=None, close_error=None, data=b""):
        self.read_error = read_error
        self.write_error = write_error
        self.close_error = close_error
        self.data = data
        self.read_done = False
        self.closed = False

    def read(self, _size):
        if self.read_error is not None:
            raise self.read_error
        if self.read_done:
            return b""
        self.read_done = True
        return self.data

    def write(self, _payload):
        if self.write_error is not None:
            raise self.write_error
        return len(_payload)

    def flush(self):
        return None

    def close(self):
        self.closed = True
        if self.close_error is not None:
            raise self.close_error


class FinishedProcess:
    def __init__(self, stdin=None, stdout=None, stderr=None, returncode=0):
        self.stdin = stdin or FaultStream()
        self.stdout = stdout or FaultStream(data=b"{}")
        self.stderr = stderr or FaultStream()
        self.returncode = returncode

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        return self.returncode

    def terminate(self):
        raise AssertionError("finished process must not be terminated")

    def kill(self):
        raise AssertionError("finished process must not be killed")


@pytest.mark.parametrize(
    "stream_name,error",
    (("stdout", OSError("read stdout")), ("stderr", OSError("read stderr"))),
)
def test_reader_exception_is_process_error(monkeypatch, stream_name, error):
    streams = {"stdin": FaultStream(), "stdout": FaultStream(), "stderr": FaultStream()}
    streams[stream_name] = FaultStream(read_error=error)
    process = FinishedProcess(**streams)
    monkeypatch.setattr(adapter.subprocess, "Popen", lambda *args, **kwargs: process)
    code("SOLVER_PROCESS_ERROR", lambda: adapter._capture_process(["fake"], b"{}", SolverConfig("x", Path("x"))))
    assert all(stream.closed for stream in streams.values())


def test_broken_pipe_and_close_failure_are_process_errors(monkeypatch):
    for stdin in (
        FaultStream(write_error=BrokenPipeError("closed")),
        FaultStream(close_error=OSError("close failed")),
    ):
        process = FinishedProcess(stdin=stdin)
        monkeypatch.setattr(adapter.subprocess, "Popen", lambda *args, **kwargs: process)
        code("SOLVER_PROCESS_ERROR", lambda: adapter._capture_process(["fake"], b"payload", SolverConfig("x", Path("x"))))
        assert stdin.closed


def test_invalid_utf8_empty_stdout_and_unknown_exit(tmp_path):
    code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load(), config(cli(tmp_path, "put_byte(255)", "utf8.pl"))))
    code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load(), config(cli(tmp_path, "true", "empty.pl"))))
    code("SOLVER_PROCESS_ERROR", lambda: run_solver(load(), config(cli(tmp_path, "halt(17)", "crash.pl"))))


def test_exit_status_mismatch_and_two_json_objects(tmp_path):
    mismatch = cli(
        tmp_path,
        "write('{\"schema_version\":1,\"source_revision\":7,\"status\":\"invalid_input\",\"error\":{\"code\":\"X\",\"message\":\"x\",\"path\":null}}')",
        "mismatch.pl",
    )
    code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load(), config(mismatch)))
    double = cli(tmp_path, "write('{}{}')", "double.pl")
    code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load(), config(double)))


def test_simultaneous_stdout_stderr_does_not_deadlock(tmp_path):
    body = (
        "forall(between(1,10000,_),put_code(user_error,65)),"
        "write('{\"schema_version\":1,\"source_revision\":7,"
        "\"status\":\"unsatisfiable\",\"assignments\":[]}')"
    )
    result = run_solver(load(), config(cli(tmp_path, body, "both.pl")))
    assert result["status"] == "unsatisfiable"


def test_contract_sized_stdout_and_stderr_overflow_are_bounded(tmp_path):
    stdout = cli(tmp_path, "forall(between(1,1048577,_),put_code(65))", "stdout_over.pl")
    code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load(), config(stdout)))
    stderr = cli(tmp_path, "forall(between(1,262145,_),put_code(user_error,65))", "stderr_over.pl")
    code("SOLVER_PROCESS_ERROR", lambda: run_solver(load(), config(stderr)))


class BlockingStream(FaultStream):
    def __init__(self, released):
        super().__init__()
        self.released = released

    def read(self, _size):
        self.released.wait(2)
        return b""


class KillRequiredProcess:
    def __init__(self):
        self.released = threading.Event()
        self.stdin = FaultStream()
        self.stdout = BlockingStream(self.released)
        self.stderr = BlockingStream(self.released)
        self.returncode = None
        self.terminate_calls = 0
        self.kill_calls = 0

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminate_calls += 1
        raise subprocess.TimeoutExpired("fake", 1)

    def kill(self):
        self.kill_calls += 1
        self.returncode = -9
        self.released.set()

    def wait(self, timeout=None):
        if self.returncode is None:
            raise subprocess.TimeoutExpired("fake", timeout)
        return self.returncode


def test_timeout_falls_back_from_terminate_to_kill(monkeypatch):
    process = KillRequiredProcess()
    monkeypatch.setattr(adapter.subprocess, "Popen", lambda *args, **kwargs: process)
    before = {thread.ident for thread in threading.enumerate()}
    code(
        "SOLVER_TIMEOUT",
        lambda: adapter._capture_process(
            ["fake"], b"{}", SolverConfig("x", Path("x"), timeout_seconds=0.01)
        ),
    )
    assert process.terminate_calls == 1
    assert process.kill_calls == 1
    assert process.poll() == -9
    assert {thread.ident for thread in threading.enumerate()} == before


class UnkillableProcess(KillRequiredProcess):
    def kill(self):
        self.kill_calls += 1
        raise OSError("kill failed")


def test_stop_process_reports_unreaped_process():
    process = UnkillableProcess()
    assert adapter._stop_process(process) is False
    process.released.set()


def test_large_blocked_writer_and_early_process_exit_leave_no_threads(tmp_path):
    baseline = {thread.ident for thread in threading.enumerate()}
    sleeping = cli(tmp_path, "sleep(5)", "blocked.pl")
    large = load() | {"padding": "x" * (2 * 1024 * 1024)}
    code("SOLVER_TIMEOUT", lambda: run_solver(large, config(sleeping, timeout_seconds=0.05)))
    early = cli(tmp_path, "halt(19)", "early.pl")
    code("SOLVER_PROCESS_ERROR", lambda: run_solver(large, config(early)))
    assert {thread.ident for thread in threading.enumerate()} == baseline


def test_repeated_sat_unsat_timeout_and_overflow_are_deterministic(tmp_path):
    solver = ROOT / "prolog" / "solver_cli.pl"
    sat = [run_solver(load(), config(solver)) for _ in range(3)]
    unsat = [run_solver(load("unsatisfiable.json"), config(solver)) for _ in range(3)]
    assert sat[1:] == sat[:-1]
    assert unsat[1:] == unsat[:-1]

    baseline = {thread.ident for thread in threading.enumerate()}
    sleeper = cli(tmp_path, "sleep(2)", "repeat_timeout.pl")
    overflow = cli(tmp_path, "forall(between(1,1000,_),put_code(65))", "repeat_overflow.pl")
    for _ in range(3):
        code("SOLVER_TIMEOUT", lambda: run_solver(load(), config(sleeper, timeout_seconds=0.02)))
        code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load(), config(overflow, stdout_limit=64)))
    assert {thread.ident for thread in threading.enumerate()} == baseline


def test_additional_strict_protocol_shapes():
    protocol = "SOLVER_PROTOCOL_ERROR"
    code(protocol, lambda: validate_solver_response(
        {"schema_version":True,"source_revision":7,"status":"unsatisfiable","assignments":[]}, 0, 7
    ))
    code(protocol, lambda: validate_solver_response(
        {"schema_version":1,"source_revision":True,"status":"unsatisfiable","assignments":[]}, 0, 1
    ))
    code(protocol, lambda: validate_solver_response(
        {"schema_version":1,"source_revision":7,"status":"unsatisfiable","assignments":[{}]}, 0, 7
    ))
    code(protocol, lambda: validate_solver_response(
        {"schema_version":1,"source_revision":7,"status":"invalid_input","error":{"code":"X","message":"x"}}, 2, 7
    ))
