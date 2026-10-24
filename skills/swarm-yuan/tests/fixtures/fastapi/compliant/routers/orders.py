import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from schemas import OrderIn, OrderOut

# 认证依赖：OAuth2 Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

# APIRouter 按域模块化
router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
async def list_orders(token: str = Depends(oauth2_scheme)):
    # async 路由内用 httpx.AsyncClient（非阻塞 IO）
    async with httpx.AsyncClient() as client:
        _ = client
    return []


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(payload: OrderIn, token: str = Depends(oauth2_scheme)):
    if not payload.name:
        # 业务错误用 HTTPException 带状态码
        raise HTTPException(status_code=422, detail="name required")
    return OrderOut(id=1, name=payload.name)


def export_orders_csv():
    # 阻塞 IO 用 def 路由（Starlette 自动放线程池）
    return "id,name\n"
