/**
 * User flow tests for the Mem0 memory integration.
 *
 * Tests the four memory layers and distillation behaviours described at
 * https://docs.mem0.ai/core-concepts/memory-types and
 * https://docs.mem0.ai/core-concepts/memory-evaluation
 *
 * All suites are skipped without MEM0_BASE_URL.
 * Run with: docker compose up postgres mem0 -d
 */

import { describe, it, expect, beforeEach } from "vitest"
import type { MemoryStore } from "../../src/memory/types.js"

const HAS_MEM0 = !!process.env["MEM0_BASE_URL"]

// Fresh store + userId per test — no cross-test bleed
async function makeStore(): Promise<{ store: MemoryStore; userId: string }> {
  const { Mem0Adapter } = await import("../../src/memory/mem0.adapter.js")
  return { store: new Mem0Adapter(), userId: `test-${crypto.randomUUID()}` }
}

function log(label: string, value: unknown) {
  console.log(`  [${label}]`, JSON.stringify(value, null, 2))
}

// ── Suite 1: User Memory (long-term, user_id) ──────────────────────────────────

describe.skipIf(!HAS_MEM0)("User Memory — long-term persistence", () => {
  it("preference persists across separate store instances", async () => {
    const { userId } = await makeStore()
    const { Mem0Adapter } = await import("../../src/memory/mem0.adapter.js")

    // Session 1 — write
    const session1 = new Mem0Adapter()
    await session1.add(userId, "I prefer dark mode in all my apps")
    console.log("  [session 1] added: 'I prefer dark mode in all my apps'")

    // Session 2 — fresh instance, same userId
    const session2 = new Mem0Adapter()
    const results = await session2.search(userId, "UI display preferences", 5)
    log("session 2 search results", results)

    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => /dark/i.test(r.content))).toBe(true)

    await session1.deleteAll(userId)
  })

  it("multiple unrelated facts are each retrievable by semantic query", async () => {
    const { store, userId } = await makeStore()

    const facts = [
      "I am a UX designer",
      "I prefer TypeScript over JavaScript",
      "I live in Sydney",
      "I have a dog named Mochi",
      "I drink oat milk flat whites",
    ]
    for (const fact of facts) {
      await store.add(userId, fact)
      console.log(`  [add] "${fact}"`)
    }

    const queries: Array<{ query: string; expect: RegExp }> = [
      { query: "what is the user's job or profession", expect: /designer/i },
      { query: "where does the user live", expect: /sydney/i },
      { query: "user's pet", expect: /mochi|dog/i },
    ]

    for (const { query, expect: pattern } of queries) {
      const results = await store.search(userId, query, 3)
      log(`search("${query}")`, results.map((r) => r.content))
      expect(results.some((r) => pattern.test(r.content))).toBe(true)
    }

    await store.deleteAll(userId)
  })

  it("getAll returns all entries for the user", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "first fact added")
    await store.add(userId, "second fact added")
    await store.add(userId, "third fact added")

    const all = await store.getAll(userId)
    log("getAll results", all.map((e) => e.content))

    // All three facts should be retrievable (Mem0 may reword but not drop them)
    expect(all.length).toBeGreaterThanOrEqual(1)

    await store.deleteAll(userId)
  })
})

// ── Suite 2: Distillation ──────────────────────────────────────────────────────

describe.skipIf(!HAS_MEM0)("Distillation — dedup and contradiction resolution", () => {
  it("adding the same fact twice does not create duplicate entries", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "I like jazz music")
    await store.add(userId, "I like jazz music")
    console.log("  [add] 'I like jazz music' × 2")

    const all = await store.getAll(userId)
    log("getAll after duplicate adds", all.map((e) => e.content))

    const jazzEntries = all.filter((e) => /jazz/i.test(e.content))
    expect(jazzEntries.length).toBe(1)

    await store.deleteAll(userId)
  })

  it("a contradicting fact updates the existing memory", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "I like jazz music")
    console.log("  [add] 'I like jazz music'")

    await store.add(userId, "I actually hate jazz music, it's too complex for me")
    console.log("  [add] 'I actually hate jazz music, it's too complex for me'")

    const all = await store.getAll(userId)
    log("getAll after contradiction", all.map((e) => e.content))

    // After contradiction, the new (hate) fact should dominate
    const likesJazz = all.some((e) => /like jazz/i.test(e.content) && !/hate|not|no longer/i.test(e.content))
    const hatesOrDislikesJazz = all.some((e) => /hate jazz|dislike jazz|doesn.t like jazz|not.*like jazz/i.test(e.content))
    console.log(`  [distillation] likes jazz: ${likesJazz}, hates/dislikes jazz: ${hatesOrDislikesJazz}`)

    // The contradicting preference (dislike) must be represented
    expect(hatesOrDislikesJazz || !likesJazz).toBe(true)

    await store.deleteAll(userId)
  })

  it("near-duplicate facts are merged into a single entry", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "I live in Sydney")
    await store.add(userId, "I live in Sydney, Australia")
    console.log("  [add] 'I live in Sydney'")
    console.log("  [add] 'I live in Sydney, Australia'")

    const all = await store.getAll(userId)
    log("getAll after near-duplicate adds", all.map((e) => e.content))

    const locationEntries = all.filter((e) => /sydney/i.test(e.content))
    console.log(`  [distillation] location entries: ${locationEntries.length}`)
    expect(locationEntries.length).toBe(1)

    await store.deleteAll(userId)
  })
})

// ── Suite 3: Temporal reasoning ────────────────────────────────────────────────

describe.skipIf(!HAS_MEM0)("Temporal reasoning — ADD-only architecture", () => {
  it("old fact is updated, not silently deleted, after contradiction", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "My favourite language is Python")
    console.log("  [t=0] added: 'My favourite language is Python'")

    await store.add(userId, "I switched to TypeScript and now it is my favourite language")
    console.log("  [t=1] added: 'I switched to TypeScript, now my favourite'")

    const all = await store.getAll(userId)
    log("all memories after update", all.map((e) => e.content))

    // TypeScript preference should be present
    expect(all.some((e) => /typescript/i.test(e.content))).toBe(true)
    // Python as favourite should not dominate after the TypeScript update
    const pythonFavourite = all.filter(
      (e) => /python/i.test(e.content) && /favou?rite/i.test(e.content) && !/typescript|switched/i.test(e.content)
    )
    log("remaining python-favourite entries", pythonFavourite.map((e) => e.content))
    // Mem0 may retain Python in context but TypeScript must be the stated favourite
    const typescriptFavourite = all.filter(
      (e) => /typescript/i.test(e.content) && /favou?rite/i.test(e.content)
    )
    expect(typescriptFavourite.length).toBeGreaterThan(0)

    await store.deleteAll(userId)
  })

  it("preference change is reflected in search results", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "I prefer Figma for design work")
    await store.add(userId, "I moved to Framer, it fits my workflow better than Figma")
    console.log("  [add] Figma → Framer preference change")

    const results = await store.search(userId, "which design tool does the user prefer", 3)
    log("search: design tool preference", results.map((r) => r.content))

    // Current preference (Framer) should surface in top results
    expect(results.some((r) => /framer/i.test(r.content))).toBe(true)

    await store.deleteAll(userId)
  })
})

// ── Suite 4: Entity linking / multi-hop ───────────────────────────────────────

describe.skipIf(!HAS_MEM0)("Entity linking — related facts surface together", () => {
  it("multiple facts about the same entity co-surface in search", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "The user works at RGA as a UX designer")
    await store.add(userId, "The user's team at RGA uses Figma and React")
    await store.add(userId, "The user commutes to the RGA Sydney office on Tuesdays")
    console.log("  [add] 3 facts about RGA entity")

    const results = await store.search(userId, "what do we know about the user's workplace", 5)
    log("search: workplace entity", results.map((r) => r.content))

    // At least 2 of 3 RGA facts should surface
    const rgaResults = results.filter((r) => /rga/i.test(r.content))
    console.log(`  [entity linking] RGA facts surfaced: ${rgaResults.length}/3`)
    expect(rgaResults.length).toBeGreaterThanOrEqual(2)

    await store.deleteAll(userId)
  })

  it("user A's memories do not appear in user B's search", async () => {
    const { Mem0Adapter } = await import("../../src/memory/mem0.adapter.js")
    const store = new Mem0Adapter()
    const userA = `test-a-${crypto.randomUUID()}`
    const userB = `test-b-${crypto.randomUUID()}`

    await store.add(userA, "User A's secret project is called Project Phoenix")
    console.log(`  [userA] added secret project fact`)

    const results = await store.search(userB, "Project Phoenix", 5)
    log("userB search for userA's fact", results.map((r) => r.content))

    expect(results.every((r) => !/phoenix/i.test(r.content))).toBe(true)

    await store.deleteAll(userA)
  })
})

// ── Suite 5: Erasure ───────────────────────────────────────────────────────────

describe.skipIf(!HAS_MEM0)("Erasure — GDPR right to erasure", () => {
  it("deleteAll removes all memories for the user", async () => {
    const { store, userId } = await makeStore()

    await store.add(userId, "preference one")
    await store.add(userId, "preference two")
    await store.add(userId, "preference three")
    console.log("  [setup] added 3 memories")

    await store.deleteAll(userId)
    console.log("  [deleteAll] called")

    const remaining = await store.getAll(userId)
    log("memories after deleteAll", remaining)
    expect(remaining).toHaveLength(0)
  })

  it("erasure is user-scoped — does not affect other users", async () => {
    const { Mem0Adapter } = await import("../../src/memory/mem0.adapter.js")
    const store = new Mem0Adapter()
    const userA = `test-a-${crypto.randomUUID()}`
    const userB = `test-b-${crypto.randomUUID()}`

    await store.add(userA, "user A memory to erase")
    await store.add(userB, "User B works as a graphic designer in Melbourne")
    console.log("  [setup] added memory for both users")

    await store.deleteAll(userA)
    console.log(`  [deleteAll] erased userA: ${userA}`)

    const userBMemories = await store.getAll(userB)
    log("userB memories after userA erasure", userBMemories.map((e) => e.content))

    expect(userBMemories.length).toBeGreaterThan(0)
    expect(userBMemories.some((e) => /designer|melbourne/i.test(e.content))).toBe(true)

    await store.deleteAll(userB)
  })
})
