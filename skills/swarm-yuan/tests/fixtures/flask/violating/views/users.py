import json
from flask import Blueprint, request, Markup
# 违规：蓝图反向 import 应用模块 → 循环导入
from app import app

bp = Blueprint('users', __name__, url_prefix='/users')


@bp.route('', methods=['POST'])
def create_user():
    # 违规：request 数据无 Schema 校验
    data = request.get_json()
    name = data['name']
    # 违规：Markup 拼接用户输入 → XSS
    return Markup('<b>' + name + '</b>')


@bp.route('/list')
def list_users():
    # 违规：return json.dumps 缺 application/json mimetype
    return json.dumps({'users': []})
