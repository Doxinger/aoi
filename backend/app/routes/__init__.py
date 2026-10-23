from .anilist import anilist_bp
from .auth import auth_bp
from .catalog import catalog_bp
from .kodik import kodik_bp
from .pages import pages_bp
from .profile import profile_bp
from .user import user_bp

BLUEPRINTS = (pages_bp, catalog_bp, kodik_bp, anilist_bp, auth_bp, user_bp, profile_bp)


def register_routes(app):
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)
