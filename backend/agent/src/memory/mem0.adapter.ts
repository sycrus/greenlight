/**
 * Mem0 adapter — implements MemoryStore using Mem0 (mem0ai).
 *
 * Mem0 handles: storage, semantic search, deduplication, contradiction resolution.
 * This adapter is the only file that knows about Mem0. Everything else uses MemoryStore.
 *
 * Config:
 *   MEM0_API_KEY set  → uses Mem0 cloud (managed)
 *   MEM0_API_KEY unset → uses Mem0 OSS local instance (MEM0_BASE_URL)
 *
 * To swap to bespoke adapters later:
 *   1. Write BespokeAdapter implements MemoryStore
 *   2. Change the export at the bottom of this file (or DI it in server.ts)
 *   3. Done — no other files change
 *
 * TODO (phase 2): configure Mem0 to use pgvector as its vector backend
 * instead of the default so all data stays in our Cloud SQL instance.
 */

import MemoryClient from "mem0ai"
import type { MemoryEntry, MemoryStore } from "./types.js"
import type { MemoryType } from "./types.js"

function toMemoryType(value: unknown): MemoryType {
  if (value === "episodic" || value === "procedural") return value
  return "semantic"
}
import { VertexMemoryAdapter } from "./vertex.adapter.js"

// ── Placeholder memory store ───────────────────────────────────────────────────
// Used in tests and when Mem0 is not configured, so the graph can run
// without memory infrastructure.

export class PlaceholderMemoryStore implements MemoryStore {
  private store = new Map<string, MemoryEntry[]>()

  async add(userId: string, content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const id = crypto.randomUUID()
    const entries = this.store.get(userId) ?? []
    entries.push({ id, content, type: toMemoryType(metadata["type"]), metadata })
    this.store.set(userId, entries)
    // TODO (phase 2): replace with real storage
    console.log(`[memory:placeholder] add — user=${userId} id=${id}`)
    return id
  }

  async search(userId: string, query: string, topK = 5): Promise<MemoryEntry[]> {
    // TODO (phase 2): replace with semantic search
    const entries = this.store.get(userId) ?? []
    console.log(`[memory:placeholder] search — user=${userId} query="${query}"`)
    return entries.slice(0, topK)
  }

  async getAll(userId: string): Promise<MemoryEntry[]> {
    return this.store.get(userId) ?? []
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    const entries = this.store.get(userId) ?? []
    this.store.set(userId, entries.filter((e) => e.id !== memoryId))
  }

  async deleteAll(userId: string): Promise<void> {
    this.store.delete(userId)
  }
}

// ── Mem0 adapter ───────────────────────────────────────────────────────────────
// Client is constructed lazily on first use so the SDK's startup ping doesn't
// crash the process when Mem0 isn't reachable (e.g. local dev without Docker).

export class Mem0Adapter implements MemoryStore {
  private _client: MemoryClient | undefined

  private get client(): MemoryClient {
    if (!this._client) {
      const apiKey = process.env["MEM0_API_KEY"]
      const baseUrl = process.env["MEM0_BASE_URL"]
      this._client = new MemoryClient({
        apiKey: apiKey ?? "local",
        ...(baseUrl ? { host: baseUrl } : {}),
      })
    }
    return this._client
  }

  async add(
    userId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    try {
      const result = await this.client.add(
        [{ role: "user", content }],
        { user_id: userId, metadata }
      )
      const first = Array.isArray(result) ? result[0] : result
      return (first as { id?: string }).id ?? crypto.randomUUID()
    } catch (e) {
      console.warn("[memory] Mem0 add failed — memory not persisted:", e)
      return crypto.randomUUID()
    }
  }

  async search(userId: string, query: string, topK = 5): Promise<MemoryEntry[]> {
    try {
      const raw = await this.client.search(query, { user_id: userId, limit: topK })
      const results = Array.isArray(raw)
        ? raw
        : ((raw as { results?: unknown[] }).results ?? [])
      return (results as Array<{ id: string; memory: string; score?: number; metadata?: Record<string, unknown> }>).map((r) => ({
        id: r.id,
        content: r.memory,
        type: toMemoryType(r.metadata?.["type"]),
        metadata: r.metadata ?? {},
        ...(r.score !== undefined && { score: r.score }),
      }))
    } catch (e) {
      console.warn("[memory] Mem0 search failed:", e)
      return []
    }
  }

  async getAll(userId: string): Promise<MemoryEntry[]> {
    try {
      const raw = await this.client.getAll({ user_id: userId })
      const results = Array.isArray(raw)
        ? raw
        : ((raw as { results?: unknown[] }).results ?? [])
      return (results as Array<{ id: string; memory: string; metadata?: Record<string, unknown> }>).map((r) => ({
        id: r.id,
        content: r.memory,
        type: toMemoryType(r.metadata?.["type"]),
        metadata: r.metadata ?? {},
      }))
    } catch (e) {
      console.warn("[memory] Mem0 getAll failed:", e)
      return []
    }
  }

  async delete(_userId: string, memoryId: string): Promise<void> {
    try {
      await this.client.delete(memoryId)
    } catch (e) {
      console.warn("[memory] Mem0 delete failed:", e)
    }
  }

  async deleteAll(userId: string): Promise<void> {
    try {
      await this.client.deleteAll({ user_id: userId })
    } catch (e) {
      console.warn("[memory] Mem0 deleteAll failed:", e)
    }
  }
}

// ── Factory — resolves which adapter to use at startup ────────────────────────

export function createMemoryStore(): MemoryStore {
  const baseUrl = process.env["MEM0_BASE_URL"]
  const apiKey = process.env["MEM0_API_KEY"]
  const vertexProject = process.env["VERTEX_PROJECT"]

  if (baseUrl) {
    console.log(`[memory] Using self-hosted Mem0 adapter → ${baseUrl}`)
    return new Mem0Adapter()
  }

  if (apiKey) {
    console.log("[memory] Using Mem0 cloud adapter")
    return new Mem0Adapter()
  }

  if (vertexProject) {
    console.log("[memory] Using Vertex AI + Cloud SQL adapter")
    return new VertexMemoryAdapter()
  }

  console.warn("[memory] No memory backend configured — using in-memory placeholder (no persistence)")
  return new PlaceholderMemoryStore()
}
