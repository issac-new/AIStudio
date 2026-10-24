# 违规：initialize_agent 已移除（须 create_react_agent / create_agent）
from langchain.agents import initialize_agent, AgentExecutor, AgentType
from langchain_community.chat_models import ChatOpenAI
from langchain_experimental.tools import PythonREPLTool

llm = ChatOpenAI(model="gpt-4o")

# 违规：PythonREPL 代码执行工具（prompt 注入即 RCE，CVE-2023-44467；仅可沙箱内用）
tools = [PythonREPLTool()]

agent = initialize_agent(tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)

# 违规：verbose=True 泄露 prompt/中间步（CWE-532）；无 max_iterations 死循环烧钱
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)


def run_agent(task):
    return executor.run(task)
