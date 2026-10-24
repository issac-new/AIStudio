from flask import Blueprint, current_app, jsonify, request
from pydantic import BaseModel, ValidationError

# 蓝图不反向 import 应用模块；用 current_app 延迟引用
bp = Blueprint('users', __name__, url_prefix='/users')


class UserIn(BaseModel):
    name: str


@bp.route('', methods=['POST'])
def create_user():
    # pydantic Schema 校验请求体
    try:
        payload = UserIn.model_validate(request.get_json())
    except ValidationError as exc:
        return jsonify({"error": "invalid", "detail": exc.errors()}), 400
    current_app.logger.info("create user %s", payload.name)
    return jsonify({"name": payload.name}), 201


@bp.route('/list')
def list_users():
    # dict 直返自动 jsonify
    return {"users": []}
