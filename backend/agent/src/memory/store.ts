import { createMemoryStore } from "./mem0.adapter.js"
import type { MemoryStore } from "./types.js"

// Singleton — one store instance for the lifetime of the agent process.
export const memoryStore: MemoryStore = createMemoryStore()
