from flask import Flask, request
from flask_cors import CORS
from views.users import bp as users_bp

# 违规：顶层全局 app + SECRET_KEY 硬编码
app = Flask(__name__)
app.secret_key = "hardcoded-flask-secret-key"

# 违规：CORS 全开放
CORS(app)

app.register_blueprint(users_bp)


@app.route('/login', methods=['POST'])
def login():
    # 违规：无校验 + 无限流 + 无错误处理器
    data = request.get_json()
    return {'token': 't-' + data.get('username', '')}


if __name__ == '__main__':
    # 违规：debug=True 上生产风险（Werkzeug 调试器 RCE）
    app.run(debug=True)
