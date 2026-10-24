# langchain fixture 说明

- violating 主触发 4 个 fail 意图：0.1 时代导入路径（langchain.chat_models 等）/ LLMChain + initialize_agent + chain.run 旧链式 API / openai_api_key 与 os.environ 硬编码密钥 / PythonREPLTool 代码执行工具。
- 断言登记：**4/4 主触发已断言**（`violating/expected-fail-ids`：
  `fw_langchain_legacy_imports`、`fw_langchain_legacy_chain`、
  `fw_langchain_hardcoded_key`、`fw_langchain_dangerous_tool`，
  2026-07-20 P1/P2-I2 实跑登记）。
- 附带 warn 覆盖：SQLDatabaseChain / PII 进 prompt / 无 timeout / async 内同步 invoke /
  verbose=True / 记忆无 token 上限 / AgentExecutor 无迭代上限 / 危险反序列化开关（violating/rag.py + agent.py）。
- 门禁无沉睡：声明的 4 个 fail 门禁全部命中，无需唤醒修复。
