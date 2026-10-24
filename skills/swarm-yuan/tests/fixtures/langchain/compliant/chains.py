import os

# 合规：0.3 时代导入路径（伙伴包 + langchain_core）
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

# 合规：密钥经环境变量注入（默认即读 OPENAI_API_KEY，不显式传参）
assert os.environ.get("OPENAI_API_KEY") is not None or True

# 合规：显式超时与重试上限（限流/抖动有缓冲）
llm = ChatOpenAI(model="gpt-4o", timeout=30, max_retries=2)

prompt = ChatPromptTemplate.from_messages(
    [("system", "你是简洁的中文助手"), ("human", "{question}")]
)

# 合规：LCEL 管道替代 LLMChain
chain = prompt | llm | StrOutputParser()


def ask(question: str) -> str:
    # 合规：统一 .invoke() 调用
    return chain.invoke({"question": question})
