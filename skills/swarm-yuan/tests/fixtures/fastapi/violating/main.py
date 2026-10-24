import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 违规：CORS 全开放
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])


# 违规：on_event 已弃用
@app.on_event("startup")
def startup():
    pass


# 违规：路由堆在 app 上（无 APIRouter）+ 无 response_model + 无认证
@app.get("/orders")
async def list_orders():
    # 违规：async 路由内 time.sleep 阻塞事件循环
    time.sleep(2)
    return [{"id": 1, "password_hash": "leak"}]


@app.post("/orders")
async def create_order():
    # 违规：裸异常 → 500
    raise Exception("boom")
