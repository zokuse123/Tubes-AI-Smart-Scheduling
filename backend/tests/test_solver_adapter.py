"""Contract and process tests for the bounded SWI-Prolog adapter."""

import json
import shutil
import sqlite3
import time
from pathlib import Path

import pytest

from backend.app.errors import APIError
from backend.app.solver_adapter import (
    SolverConfig,
    run_solver,
    validate_solver_cli_response,
    validate_solver_response,
)


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "prolog" / "tests" / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def config(path=None, **changes):
    values = {
        "executable": shutil.which("swipl") or "swipl",
        "cli_path": path or ROOT / "prolog" / "solver_cli.pl",
        "timeout_seconds": 5,
        "stdout_limit": 1024 * 1024,
        "stderr_limit": 256 * 1024,
    }
    values.update(changes)
    return SolverConfig(**values)


def fake_cli(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "fake_cli.pl"
    path.write_text(":- module(solver_cli,[main/0]).\nmain :- " + body + ".\n", encoding="utf-8")
    return path


def assert_code(code, operation):
    with pytest.raises(APIError) as caught:
        operation()
    assert caught.value.code == code
    assert caught.value.details is None


def test_real_solver_success_and_unsatisfiable():
    success = run_solver(load("valid.json"), config())
    unsat = run_solver(load("unsatisfiable.json"), config())
    assert success["status"] == "success"
    assert success.domain_candidates == [
        {"praktikum_id": 1, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
        {"praktikum_id": 2, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
    ]
    assert success.verification_overall == "passed"
    assert unsat == {"schema_version":1,"source_revision":8,"status":"unsatisfiable","assignments":[]}
    assert unsat.domain_candidates == [
        {"praktikum_id": 1, "slot_count": 1, "laboratory_count": 0, "theoretical_pairs": 0}
    ]
    assert unsat.verification_overall == "not_applicable"


def test_cli_v2_domain_diagnostics_are_strictly_validated():
    payload = load("valid.json")
    response = {
        "schema_version": 2,
        "source_revision": 7,
        "status": "unsatisfiable",
        "assignments": [],
        "domain_candidates": [
            {"praktikum_id": 1, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
            {"praktikum_id": 2, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
        ],
    }
    execution = validate_solver_cli_response(response, 0, payload)
    assert execution == {
        "schema_version": 1,
        "source_revision": 7,
        "status": "unsatisfiable",
        "assignments": [],
    }
    assert execution.domain_candidates == response["domain_candidates"]


@pytest.mark.parametrize("mutation", (
    lambda r: r["domain_candidates"].reverse(),
    lambda r: r["domain_candidates"].pop(),
    lambda r: r["domain_candidates"][0].update(praktikum_id=2),
    lambda r: r["domain_candidates"][0].update(slot_count=True),
    lambda r: r["domain_candidates"][0].update(slot_count=-1),
    lambda r: r["domain_candidates"][0].update(theoretical_pairs=99),
    lambda r: r.update(source_revision=8),
    lambda r: r["domain_candidates"][0].update(extra=1),
))
def test_malformed_cli_v2_domain_diagnostics_are_rejected(mutation):
    payload = load("valid.json")
    response = {
        "schema_version": 2,
        "source_revision": 7,
        "status": "unsatisfiable",
        "assignments": [],
        "domain_candidates": [
            {"praktikum_id": 1, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
            {"praktikum_id": 2, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
        ],
    }
    mutation(response)
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: validate_solver_cli_response(response, 0, payload))


def test_real_solver_invalid_input_and_internal_error():
    invalid = load("valid.json"); invalid["schema_version"] = 2
    assert_code("SOLVER_INVALID_INPUT", lambda: run_solver(invalid, config()))
    internal = {
        "schema_version": 1, "source_revision": 7, "status": "internal_error",
        "error": {"code": "SOLVER_INTERNAL_ERROR", "message": "Solver gagal memproses permintaan."},
    }
    assert_code("SOLVER_INTERNAL_ERROR", lambda: validate_solver_response(internal, 3, 7))


def test_missing_executable_and_cli_are_unavailable(tmp_path):
    assert_code("SOLVER_UNAVAILABLE", lambda: run_solver(load("valid.json"), config(executable="definitely-missing-swipl")))
    assert_code("SOLVER_UNAVAILABLE", lambda: run_solver(load("valid.json"), config(tmp_path / "missing.pl")))


def test_timeout_terminates_process(tmp_path):
    cli = fake_cli(tmp_path, "sleep(5)")
    started = time.monotonic()
    assert_code("SOLVER_TIMEOUT", lambda: run_solver(load("valid.json"), config(cli, timeout_seconds=0.05)))
    assert time.monotonic() - started < 2


def test_stdout_and_stderr_limits(tmp_path):
    stdout_cli = fake_cli(tmp_path, "forall(between(1,1000,_),put_code(65))")
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load("valid.json"), config(stdout_cli, stdout_limit=64)))
    stderr_cli = fake_cli(tmp_path, "forall(between(1,1000,_),put_code(user_error,65))")
    assert_code("SOLVER_PROCESS_ERROR", lambda: run_solver(load("valid.json"), config(stderr_cli, stderr_limit=64)))


@pytest.mark.parametrize("body", (
    "write('{bad json')",
    "write('{\"schema_version\":1} {\"schema_version\":1}')",
    "write('debug {\"schema_version\":1}')",
))
def test_malformed_multiple_or_prefixed_stdout(tmp_path, body):
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load("valid.json"), config(fake_cli(tmp_path, body))))


def test_schema_revision_exit_and_shape_mismatch(tmp_path):
    payload = load("valid.json")
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: validate_solver_response(
        {"schema_version":2,"source_revision":7,"status":"unsatisfiable","assignments":[]}, 0, 7
    ))
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: validate_solver_response(
        {"schema_version":1,"source_revision":8,"status":"unsatisfiable","assignments":[]}, 0, 7
    ))
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: validate_solver_response(
        {"schema_version":1,"source_revision":7,"status":"success","assignments":[],"extra":1}, 0, 7
    ))
    cli = fake_cli(tmp_path, "write('{\"schema_version\":1,\"source_revision\":7,\"status\":\"success\",\"assignments\":[]}'),halt(9)")
    assert_code("SOLVER_PROCESS_ERROR", lambda: run_solver(payload, config(cli)))


def test_success_is_independently_verified(tmp_path):
    response = {
        "schema_version": 2,
        "source_revision": 7,
        "status": "success",
        "assignments": [],
        "domain_candidates": [
            {"praktikum_id": 1, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
            {"praktikum_id": 2, "slot_count": 2, "laboratory_count": 1, "theoretical_pairs": 2},
        ],
    }
    cli = fake_cli(
        tmp_path,
        "write('" + json.dumps(response, separators=(",", ":")) + "')",
    )
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: run_solver(load("valid.json"), config(cli)))


def test_duplicate_assignment_and_strict_integer_rejected():
    base = {"schema_version":1,"source_revision":7,"status":"success"}
    duplicate = base | {"assignments":[
        {"praktikum_id":1,"slot_id":1,"laboratorium_id":1},
        {"praktikum_id":1,"slot_id":2,"laboratorium_id":1},
    ]}
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: validate_solver_response(duplicate, 0, 7))
    boolean = base | {"assignments":[{"praktikum_id":True,"slot_id":1,"laboratorium_id":1}]}
    assert_code("SOLVER_PROTOCOL_ERROR", lambda: validate_solver_response(boolean, 0, 7))


def test_solver_does_not_modify_sqlite(tmp_path):
    path = tmp_path / "untouched.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE marker(value TEXT)")
        db.execute("INSERT INTO marker VALUES ('before')")
    run_solver(load("valid.json"), config())
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT value FROM marker").fetchall() == [("before",)]
