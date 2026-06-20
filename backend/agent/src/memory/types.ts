/**
 * MemoryStore interface — the single seam between agent logic and storage.
 *
 * All agents and graph nodes interact with memory only through this interface.
 * Swapping storage backends (Mem0 → bespoke adapters) means writing a new
 * class that satisfies this interface — zero changes elsewhere.
 *
 * Current implementation: Mem0Adapter (see mem0.adapter.ts)
 * Future: BespokeAdapter with Redis (working) + pgvector (episodic/semantic)
 */

/** What kind of memory this entry represents.
 *
 * semantic   — a timeless user fact: preference, name, account detail
 * episodic   — a time-stamped event: complaint resolved, workflow completed
 * procedural — an inferred pattern across sessions (LLM-as-judge only, phase 2)
 */
export type MemoryType = "semantic" | "episodic" | "procedural"

export interface MemoryEntry {
  id: string
  content: string
  type: MemoryType
  metadata: Record<string, unknown>
  score?: number  // relevance score when returned from semantic search
}

export interface MemoryStore {
  /**
   * Add a memory entry for a user.
   * Mem0 handles deduplication and contradiction resolution internally.
   */
  add(userId: string, content: string, metadata?: Record<string, unknown>): Promise<string>

  /**
   * Semantic search over a user's memories.
   * Returns entries ranked by relevance to the query.
   */
  search(userId: string, query: string, topK?: number): Promise<MemoryEntry[]>

  /**
   * Retrieve all memories for a user (used at session start for context hydration).
   */
  getAll(userId: string): Promise<MemoryEntry[]>

  /**
   * Delete a specific memory entry (GDPR right to erasure at entry level).
   * Full user erasure is handled by the erasure workflow — not this method.
   */
  delete(userId: string, memoryId: string): Promise<void>

  /**
   * Delete ALL memory for a user.
   * Used by the GDPR erasure workflow — call only from that job.
   */
  deleteAll(userId: string): Promise<void>
}
