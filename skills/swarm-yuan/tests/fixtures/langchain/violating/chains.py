import os

# 违规：0.1 时代导入路径（0.3 已弃用/移除，须迁 langchain_openai/langchain_core）
from langchain.chat_models import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

# 违规：密钥硬编码进源码（CWE-798）
os.environ["OPENAI_API_KEY"] = "sk-test00000000000000000000000000000000"

llm = ChatOpenAI(model="gpt-4o", openai_api_key="sk-test11111111111111111111111111111111")

prompt = PromptTemplate(input_variables=["question"], template="回答：{question}")

# 违规：LLMChain 已弃用（须 LCEL 管道 prompt | llm | parser）
chain = LLMChain(llm=llm, prompt=prompt)


def ask(question):
    # 违规：.run() 已弃用（须 .invoke()）
    return chain.run(question)
