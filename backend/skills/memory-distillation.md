---
skill: memory-distillation
version: 0.1
trigger: at session end, or when agent flags a high-importance signal mid-conversation
owner: platform-team
status: placeholder — memory layer not built in MVP
---

## Purpose
Define what the distillation job extracts from a conversation and writes to the memory store.
The distillation job runs at session end and uses an LLM-as-judge to score candidate memories.

## Memory Types

| Type | Store | Written when |
|---|---|---|
| Semantic | Postgres + pgvector | User states a preference, fact, or account detail explicitly |
| Episodic | pgvector | A significant interaction completes (complaint resolved, purchase made) |
| Procedural | Postgres JSONB | A pattern emerges that should inform future routing or escalation logic |

## Extraction Rules

**Write to semantic memory when the user:**
- States a preference explicitly ("I prefer email over phone", "I always order size M")
- Corrects the agent ("No, my name is…", "That's the wrong account")
- Confirms account details (delivery address, subscription tier)

**Write to episodic memory when:**
- A complaint or issue is resolved
- A multi-step workflow completes (e.g. return initiated)
- The session involved a significant escalation

**Write to procedural memory when (LLM-as-judge only):**
- A routing pattern repeats across multiple sessions for this user segment
- An escalation condition consistently triggers in a specific context

**Do NOT write:**
- Routine questions and answers (no signal value)
- Weather queries (ephemeral — no future relevance)
- Content that is already in memory without meaningful update

## Scoring (LLM-as-judge prompt shape)

```
Given this conversation excerpt:
[EXCERPT]

Score the following candidate memory on a scale of 1-5 for:
- Importance: how useful is this for future sessions?
- Recency relevance: will this still be true in 3 months?
- Specificity: is this specific enough to be actionable?

Output JSON: { "score": 1-5, "type": "semantic|episodic|procedural", "content": "...", "write": true|false }

Write = true if score >= 3, false otherwise.
```

## Hot-Path Signals (immediate write, no distillation job)

These bypass the end-of-session job and write immediately:
- User explicitly states a preference ("I prefer to be contacted by…")
- User confirms or corrects their account details
- Agent detects consent change

## MVP Status
Memory is placeholder in the current build. The `MemoryStore` interface is wired,
and `PlaceholderMemoryStore` is used until Mem0 is configured.
All memory write points are marked with `TODO (phase 2)` comments in the agent code.
