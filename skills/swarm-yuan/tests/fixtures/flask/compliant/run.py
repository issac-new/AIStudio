from app import create_app

app = create_app()

if __name__ == '__main__':
    # 本地启动禁 debug；生产经 gunicorn 'run:app'
    app.run()
