import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { retrieveContext } from "../../src/tools/retrieve.js"

const MOCK_RETRIEVE_RESPONSE = {
  chunks: [
    { text: "Product X comes in blue and red.", source: "https://example.com/products", score: 0.95 },
    { text: "Shipping takes 3–5 business days.", source: "https://example.com/shipping", score: 0.87 },
  ],
  sources: ["https://example.com/products", "https://example.com/shipping"],
}

function makeFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

describe("retrieveContext", () => {
  afterEach(() => vi.unstubAllGlobals())

  // ── Success ───────────────────────────────────────────────────────────────

  describe("success", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", makeFetch(MOCK_RETRIEVE_RESPONSE))
    })

    it("returns success with chunks and sources", async () => {
      const result = await retrieveContext("what colours does Product X come in?")
      expect(result.success).toBe(true)
      expect(result.data?.chunks).toHaveLength(2)
      expect(result.data?.sources).toEqual(["https://example.com/products", "https://example.com/shipping"])
    })

    it("returns toolName 'retrieve_context'", async () => {
      const result = await retrieveContext("query")
      expect(result.toolName).toBe("retrieve_context")
    })

    it("sends POST to /retrieve with JSON content-type", async () => {
      const mockFetch = makeFetch(MOCK_RETRIEVE_RESPONSE)
      vi.stubGlobal("fetch", mockFetch)
      await retrieveContext("query")
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain("/retrieve")
      expect(options.method).toBe("POST")
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
    })

    it("sends query in request body", async () => {
      const mockFetch = makeFetch(MOCK_RETRIEVE_RESPONSE)
      vi.stubGlobal("fetch", mockFetch)
      await retrieveContext("my specific query")
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string) as { query: string; top_k: number }
      expect(body.query).toBe("my specific query")
    })

    it("defaults top_k to 5", async () => {
      const mockFetch = makeFetch(MOCK_RETRIEVE_RESPONSE)
      vi.stubGlobal("fetch", mockFetch)
      await retrieveContext("query")
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string) as { query: string; top_k: number }
      expect(body.top_k).toBe(5)
    })

    it("sends custom top_k when provided", async () => {
      const mockFetch = makeFetch(MOCK_RETRIEVE_RESPONSE)
      vi.stubGlobal("fetch", mockFetch)
      await retrieveContext("query", 3)
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string) as { query: string; top_k: number }
      expect(body.top_k).toBe(3)
    })
  })

  // ── Service errors ────────────────────────────────────────────────────────

  describe("service errors", () => {
    it("returns error result when fetch throws (service unreachable)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
      const result = await retrieveContext("query")
      expect(result.success).toBe(false)
      expect(result.error).toContain("ECONNREFUSED")
    })

    it("returns error result on 503 (index not ready)", async () => {
      vi.stubGlobal("fetch", makeFetch({ detail: "Index not initialised" }, 503))
      const result = await retrieveContext("query")
      expect(result.success).toBe(false)
      expect(result.error).toContain("503")
    })

    it("returns error result on 500", async () => {
      vi.stubGlobal("fetch", makeFetch({ detail: "Internal error" }, 500))
      const result = await retrieveContext("query")
      expect(result.success).toBe(false)
    })

    it("returns toolName on error results", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")))
      const result = await retrieveContext("query")
      expect(result.toolName).toBe("retrieve_context")
    })

    it("does not throw — callers decide how to handle failures", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
      await expect(retrieveContext("query")).resolves.not.toThrow()
    })
  })

  // ── Live integration (skipped without llama-rag running) ─────────────────

  describe("live integration", () => {
    it.skipIf(!process.env["LLAMA_RAG_URL"])(
      "hits real llama-rag /retrieve and returns shaped response",
      async () => {
        const result = await retrieveContext("test query", 3)
        // Index may be empty — assert shape only
        expect(result.success).toBe(true)
        expect(Array.isArray(result.data?.chunks)).toBe(true)
        expect(Array.isArray(result.data?.sources)).toBe(true)
      }
    )
  })
})
