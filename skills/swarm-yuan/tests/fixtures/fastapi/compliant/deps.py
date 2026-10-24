from fastapi import Depends


def get_db():
    db = object()
    try:
        yield db
    finally:
        # 异常路径也保证资源释放
        pass


def dep_stub(x=Depends(get_db)):
    return x
