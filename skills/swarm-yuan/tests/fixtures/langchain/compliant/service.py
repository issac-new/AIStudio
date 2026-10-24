from chains import chain


async def ask_async(question: str) -> str:
    # 合规：async 路径用 await ainvoke，不阻塞事件循环
    return await chain.ainvoke({"question": question})
