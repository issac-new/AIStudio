from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI

# Embedding model with :latest tag
embeddings = OpenAIEmbeddings(model="text-embedding-ada-002:latest")
vectorstore = Chroma(embedding_function=embeddings)

# No similarity threshold — uses default
docs = vectorstore.similarity_search("query")

# Prompt injection vulnerability: direct user input concatenation
user_query = input("Ask: ")
prompt = "Answer based on context: " + user_query

# No rerank, no grounding, no fallback
llm = ChatOpenAI(model_name="gpt-4")
response = llm.predict(prompt)
print(response)
