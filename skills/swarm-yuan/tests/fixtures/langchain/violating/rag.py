from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate
from langchain_community.chat_models import ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_experimental.sql import SQLDatabaseChain

# 违规：Chat 模型构造无 timeout/max_retries（限流抖动即雪崩）
llm = ChatOpenAI(model="gpt-4o")

# 违规：PII（身份证）拼进 prompt 直送第三方 LLM（CWE-359 / GB/T 35273）
prompt = PromptTemplate(
    input_variables=["name", "id_card", "question"],
    template="用户 {name}（身份证 {id_card}）提问：{question}",
)

# 违规：ConversationBufferMemory 无 max_token_limit（历史无限增长撑爆上下文）
memory = ConversationBufferMemory()

# 违规：SQLDatabaseChain 模型生成 SQL 直执行（CVE-2023-36189；须只读凭证+人工复核）
db_chain = SQLDatabaseChain(llm=llm, database=None)

# 违规：危险反序列化开关（CWE-502；仅可加载自产可信索引）
index = FAISS.load_local("/tmp/faiss_index", embeddings=None, allow_dangerous_deserialization=True)


async def query_rag(question):
    # 违规：async 函数内同步 .invoke() 阻塞事件循环（须 await ainvoke）
    return db_chain.invoke(question)
