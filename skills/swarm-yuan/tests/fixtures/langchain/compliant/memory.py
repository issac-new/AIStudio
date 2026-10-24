from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_community.vectorstores import FAISS
from langchain_core.messages import trim_messages
from langchain_core.runnables.history import RunnableWithMessageHistory

from chains import chain

_store = {}


def get_session_history(session_id: str) -> ChatMessageHistory:
    if session_id not in _store:
        _store[session_id] = ChatMessageHistory()
    return _store[session_id]


# 合规：RunnableWithMessageHistory + trim_messages 封顶历史 token（替代无上限 BufferMemory）
chain_with_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key="question",
    history_messages_key="history",
)

_trimmer = trim_messages(max_tokens=2000, strategy="last", token_counter=len)


def load_local_index(path, embeddings):
    # 合规：只加载本系统自产索引，不打开危险反序列化开关
    return FAISS.load_local(path, embeddings)
