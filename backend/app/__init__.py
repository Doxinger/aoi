import logging

from quart import Quart, jsonify, request
from werkzeug.exceptions import HTTPException

from .config import FRONTEND_DIR
from .db import close_db, init_db
from .errors import AppError

logger = logging.getLogger("aoi")


def _register_error_handlers(app):
    @app.errorhandler(AppError)
    async def handle_app_error(error):
        body = {"detail": error.message}
        if error.code:
            body["code"] = error.code
        return jsonify(body), error.status

    @app.errorhandler(HTTPException)
    async def handle_http_error(error):
        detail = "Не найдено" if error.code == 404 else error.description
        return jsonify({"detail": detail}), error.code

    @app.errorhandler(Exception)
    async def handle_unexpected(error):
        logger.error("[%s] %s", request.path, error)
        return jsonify({"detail": str(error)}), 502


def create_app():
    app = Quart(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
    _register_error_handlers(app)

    @app.before_serving
    async def _startup():
        await init_db()

    @app.after_serving
    async def _shutdown():
        await close_db()

    from .routes import register_routes

    register_routes(app)
    return app
