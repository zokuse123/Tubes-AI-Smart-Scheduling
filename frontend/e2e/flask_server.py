"""Test-only launcher: verify environment-derived DB configuration BEFORE binding."""

import argparse
import os
from pathlib import Path
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    expected = Path(args.database)
    if not expected.is_absolute() or not expected.is_file():
        raise RuntimeError("E2E database must be an initialized absolute file")
    expected = expected.resolve(strict=True)
    if (expected.name != "test.sqlite"
            or not expected.parent.name.startswith("smart-lab-e2e-")
            or expected.parent.parent != Path(tempfile.gettempdir()).resolve()):
        raise RuntimeError("Refusing non-fixture database")
    configured = os.environ.get("SMART_LAB_DATABASE")
    if not configured or not Path(configured).is_absolute():
        raise RuntimeError("SMART_LAB_DATABASE is required; no default is permitted")
    if Path(configured).resolve(strict=True) != expected:
        raise RuntimeError("E2E database environment mismatch")

    root = Path(__file__).resolve().parents[2]
    if expected == (root / "backend/db/lab_scheduling.db").resolve():
        raise RuntimeError("Refusing primary database")
    sys.path.insert(0, str(root))
    from backend.app import create_app
    from werkzeug.serving import make_server

    app = create_app({"DEBUG": False})
    # Do not override DATABASE in create_app: test that Flask really reads env.
    if Path(app.config["DATABASE"]).resolve(strict=True) != expected:
        raise RuntimeError("Flask database configuration mismatch")
    with make_server("127.0.0.1", 5007, app, threaded=True) as server:
        print("SMART_LAB_E2E_DATABASE_VERIFIED_AND_BOUND", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
