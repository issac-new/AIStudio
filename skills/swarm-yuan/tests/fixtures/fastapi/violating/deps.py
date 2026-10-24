from fastapi import Depends


def get_db():
    db = object()
    # 违规：yield 依赖无 try/finally，异常路径资源不释放
    yield db
    db.close = None


def dep_stub(x=Depends(get_db)):
    return x
