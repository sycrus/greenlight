---
skill: rag-query-construction
version: 0.1
trigger: when the agent constructs a retrieval query for the knowledge base
owner: platform-team
status: placeholder — LlamaIndex/RAG not built in MVP (phase 2)
---

## Purpose
Define how the agent constructs retrieval queries when searching the brand knowledge base.
Good query construction directly determines retrieval quality.

## When to Retrieve
The agent should call `retrieve_documents(query)` when:
- The user asks about brand policies, product details, or compliance rules
- The agent needs to validate a decision against brand guidelines
- The orchestrator determines the question is knowledge-dependent (not weather/CS workflow)

Do NOT retrieve:
- For general conversational exchanges
- When the answer is already in the current conversation context
- For weather queries (handled by the weather tool, not RAG)

## Query Construction Rules

### 1. Decompose the user's question
Extract the core information need, stripped of conversational framing.

```
User: "hey can you tell me what your return policy is for items bought on sale?"
Query: "return policy sale items"
```

### 2. Add context signals
If user context is available from memory, add relevant signals.

```
User: "what are my options here?"  (in context of a damaged product complaint)
Query: "damaged product resolution options customer complaint"
```

### 3. Prefer specific over broad
Specific queries retrieve higher-precision chunks. Broad queries retrieve noise.

```
Too broad: "brand guidelines"
Better:    "brand tone guidelines customer complaint response"
Better:    "approved terminology banned words customer service"
```

### 4. One query per distinct need
If the user's question spans two topics, issue two queries and merge results.

```
User: "what's your return policy and do you offer price matching?"
Query 1: "return policy timeframe conditions"
Query 2: "price matching policy eligibility"
```

## Reranking
LlamaIndex is configured with a reranker (FlagEmbeddingReranker or CohereRerank).
The agent receives pre-ranked results. Use the top 3 chunks unless the question
requires comprehensive coverage (e.g. "list all compliance rules for EU customers").

## MVP Status
LlamaIndex and RAG are deferred to phase 2. This skill defines the query construction
pattern so it can be implemented consistently when the retrieval layer is added.
The `retrieve_documents(query)` tool call site is marked in the agent code with
`TODO (phase 2): add RAG retrieval here`.
