import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from .db import SessionLocal
from .views.users import bp as users_bp

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


def create_app(config=None):
    """应用工厂：实例化 + 扩展初始化 + 蓝图注册 + 错误处理 + 会话 teardown。"""
    app = Flask(__name__)
    # 密钥经环境变量注入
    app.config["SECRET_KEY"] = os.environ["FLASK_SECRET_KEY"]
    if config:
        app.config.update(config)

    # CORS 白名单收敛
    CORS(app, origins=["https://app.example.com"])

    limiter.init_app(app)
    app.register_blueprint(users_bp)

    # 统一错误处理
    @app.errorhandler(Exception)
    def handle_error(err):
        return jsonify({"error": type(err).__name__}), 500

    # 会话绑定请求生命周期
    @app.teardown_appcontext
    def remove_session(exc=None):
        SessionLocal.remove()

    return app
