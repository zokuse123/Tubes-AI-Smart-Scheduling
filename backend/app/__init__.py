"""Flask application factory Smart Lab Scheduling System."""

from flask import Flask
from flask_cors import CORS

from .api import api
from .config import DevelopmentConfig, TestingConfig
from .db import init_app as init_db_lifecycle
from .errors import register_error_handlers


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    config_class = TestingConfig if test_config and test_config.get("TESTING") else DevelopmentConfig
    app.config.from_object(config_class)
    if test_config:
        app.config.from_mapping(test_config)

    init_db_lifecycle(app)
    register_error_handlers(app)
    app.register_blueprint(api)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    return app
