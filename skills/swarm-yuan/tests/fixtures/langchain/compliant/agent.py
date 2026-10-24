from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", timeout=30, max_retries=2)


@tool
def search_wiki(keyword: str) -> str:
    """检索内部知识库（只读、无代码执行能力）。"""
    return f"关于 {keyword} 的检索结果"


prompt = ChatPromptTemplate.from_messages(
    [
        ("system", "你可以调用检索工具回答问题。"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ]
)

agent = create_tool_calling_agent(llm, [search_wiki], prompt)

# 合规：迭代上限+执行时限双兜底，生产不开 verbose
executor = AgentExecutor(
    agent=agent,
    tools=[search_wiki],
    max_iterations=5,
    max_execution_time=60,
)


def run_agent(task: str) -> str:
    return executor.invoke({"input": task})["output"]
