"""
Pytest configuration for llama-rag unit tests.

Sets dummy environment variables before any test module imports main.py,
so module-level code (OpenAIEmbedding init) doesn't error without real creds.
"""
import os

# Must happen before main.py is imported by any test
os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy-for-unit-tests")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "agent_memory")
os.environ.setdefault("DB_USER", "agent")
os.environ.setdefault("DB_PASSWORD", "localdev")
