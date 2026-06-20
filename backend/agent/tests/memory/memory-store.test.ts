import { describe, it, expect, vi, afterEach } from "vitest"

// Mock SDK constructors so factory tests don't require real credentials
vi.mock("mem0ai", () => ({ default: vi.fn().mockReturnValue({}) }))
vi.mock("@google-cloud/aiplatform", () => ({
  PredictionServiceClient: vi.fn().mockReturnValue({}),
  helpers: { toValue: vi.fn(), fromValue: vi.fn() },
}))
vi.mock("pg", () => ({ default: { Pool: vi.fn().mockReturnValue({}) } }))

import {
  PlaceholderMemoryStore,
  createMemoryStore,
} from "../../src/memory/mem0.adapter.js"

// ── PlaceholderMemoryStore ─────────────────────────────────────────────────────

describe("PlaceholderMemoryStore", () => {
  it("add returns a uuid", async () => {
    const store = new PlaceholderMemoryStore()
    const id = await store.add("user-1", "bought blue shoes")
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("getAll returns entries after add", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "prefers email notifications")
    await store.add("user-1", "lives in Sydney")
    const entries = await store.getAll("user-1")
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.content)).toContain("lives in Sydney")
  })

  it("getAll is scoped per user", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "user 1 memory")
    await store.add("user-2", "user 2 memory")
    expect(await store.getAll("user-1")).toHaveLength(1)
    expect(await store.getAll("user-2")).toHaveLength(1)
    expect(await store.getAll("user-3")).toHaveLength(0)
  })

  it("search returns up to topK entries", async () => {
    const store = new PlaceholderMemoryStore()
    for (let i = 0; i < 10; i++) await store.add("user-1", `memory ${i}`)
    const results = await store.search("user-1", "anything", 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it("delete removes a specific entry", async () => {
    const store = new PlaceholderMemoryStore()
    const id = await store.add("user-1", "to be deleted")
    await store.add("user-1", "to keep")
    await store.delete("user-1", id)
    const entries = await store.getAll("user-1")
    expect(entries).toHaveLength(1)
    expect(entries[0]?.content).toBe("to keep")
  })

  it("deleteAll removes all entries for that user", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "memory a")
    await store.add("user-1", "memory b")
    await store.add("user-2", "untouched")
    await store.deleteAll("user-1")
    expect(await store.getAll("user-1")).toHaveLength(0)
    expect(await store.getAll("user-2")).toHaveLength(1)
  })

  it("stores and returns metadata", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "bought red shoes", { category: "purchase", sku: "SHO-123" })
    const entries = await store.getAll("user-1")
    expect(entries[0]?.metadata).toMatchObject({ category: "purchase", sku: "SHO-123" })
  })
})

// ── createMemoryStore factory ──────────────────────────────────────────────────

describe("createMemoryStore factory", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("returns PlaceholderMemoryStore when no env vars set", () => {
    vi.stubEnv("MEM0_BASE_URL", "")
    vi.stubEnv("MEM0_API_KEY", "")
    vi.stubEnv("VERTEX_PROJECT", "")
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    createMemoryStore()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("placeholder"))
    spy.mockRestore()
  })

  it("selects self-hosted Mem0 when MEM0_BASE_URL is set", () => {
    vi.stubEnv("MEM0_BASE_URL", "http://localhost:8080")
    vi.stubEnv("MEM0_API_KEY", "")
    vi.stubEnv("VERTEX_PROJECT", "")
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    createMemoryStore()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("self-hosted Mem0"))
    spy.mockRestore()
  })

  it("selects Mem0 cloud when only MEM0_API_KEY is set", () => {
    vi.stubEnv("MEM0_BASE_URL", "")
    vi.stubEnv("MEM0_API_KEY", "m0-test-key")
    vi.stubEnv("VERTEX_PROJECT", "")
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    createMemoryStore()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Mem0 cloud"))
    spy.mockRestore()
  })

  it("selects Vertex when only VERTEX_PROJECT is set", () => {
    vi.stubEnv("MEM0_BASE_URL", "")
    vi.stubEnv("MEM0_API_KEY", "")
    vi.stubEnv("VERTEX_PROJECT", "my-project")
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    createMemoryStore()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Vertex"))
    spy.mockRestore()
  })

  it("MEM0_BASE_URL takes priority over VERTEX_PROJECT", () => {
    vi.stubEnv("MEM0_BASE_URL", "http://localhost:8080")
    vi.stubEnv("VERTEX_PROJECT", "my-project")
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    createMemoryStore()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("self-hosted Mem0"))
    spy.mockRestore()
  })
})

// Integration tests live in user-flows.test.ts to avoid mock conflicts.
