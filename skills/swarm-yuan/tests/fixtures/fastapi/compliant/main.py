from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import orders


# lifespan 管理启动/关闭（替代弃用的 on_event）
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # 关闭逻辑：释放连接池等资源


app = FastAPI(lifespan=lifespan)

# CORS 白名单收敛
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_methods=["GET", "POST"],
)

app.include_router(orders.router)
