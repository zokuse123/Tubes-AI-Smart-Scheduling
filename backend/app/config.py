"""Konfigurasi Flask untuk development lokal dan pengujian terisolasi."""

import os
from pathlib import Path


class BaseConfig:
    DATABASE = os.environ.get(
        "SMART_LAB_DATABASE",
        str(Path(__file__).resolve().parents[1] / "db" / "lab_scheduling.db"),
    )
    MAX_CONTENT_LENGTH = 256 * 1024
    SQLITE_TIMEOUT_SECONDS = 5.0
    SWIPL_EXECUTABLE = os.environ.get("SMART_LAB_SWIPL", "swipl")
    SOLVER_CLI_PATH = str(Path(__file__).resolve().parents[2] / "prolog" / "solver_cli.pl")
    SOLVER_TIMEOUT_SECONDS = 30.0
    SOLVER_STDOUT_LIMIT = 1024 * 1024
    SOLVER_STDERR_LIMIT = 256 * 1024
    CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    TESTING = False


class TestingConfig(BaseConfig):
    DEBUG = False
    TESTING = True
