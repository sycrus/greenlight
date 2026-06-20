/**
 * VertexMemoryAdapter — implements MemoryStore using:
 *   - Vertex AI text-embedding-004 for semantic embeddings (768 dimensions)
 *   - Cloud SQL (PostgreSQL + pgvector) for storage and similarity search
 *
 * Auth: Application Default Credentials (ADC) — run `gcloud auth application-default login`
 * once per machine. No key file required.
 *
 * Required env vars:
 *   VERTEX_PROJECT   — GCP project ID
 *   VERTEX_LOCATION  — GCP region (e.g. australia-southeast1)
 *   MEMORY_DB_URL    — PostgreSQL connection string (Cloud SQL socket or TCP)
 */

import { PredictionServiceClient, helpers } from "@google-cloud/aiplatform"
import pg from "pg"
import type { MemoryEntry, MemoryStore } from "./types.js"

const { Pool } = pg

const EMBEDDING_MODEL = "text-embedding-004"

export class VertexMemoryAdapter implements MemoryStore {
  private db: pg.Pool
  private client: PredictionServiceClient
  private project: string
  private location: string

  constructor() {
    this.project = process.env["VERTEX_PROJECT"] ?? ""
    this.location = process.env["VERTEX_LOCATION"] ?? "us-central1"

    this.db = new Pool({ connectionString: process.env["MEMORY_DB_URL"] })

    this.client = new PredictionServiceClient({
      apiEndpoint: `${this.location}-aiplatform.googleapis.com`,
    })
  }

  private async embed(text: string): Promise<number[]> {
    const endpoint = [
      "projects", this.project,
      "locations", this.location,
      "publishers", "google",
      "models", EMBEDDING_MODEL,
    ].join("/")

    const [response] = await this.client.predict({
      endpoint,
      instances: [helpers.toValue({ content: text, task_type: "SEMANTIC_SIMILARITY" }) ?? {}],
    })

    const prediction = helpers.fromValue(
      (response.predictions?.[0] ?? {}) as Parameters<typeof helpers.fromValue>[0]
    ) as { embeddings?: { values?: number[] } }

    const values = prediction.embeddings?.values
    if (!values?.length) throw new Error("Vertex AI returned no embedding values")

    return values
  }

  async add(userId: string, content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const embedding = await this.embed(content)
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO memories (user_id, content, embedding, metadata)
       VALUES ($1, $2, $3::vector, $4)
       RETURNING id`,
      [userId, content, JSON.stringify(embedding), JSON.stringify(metadata)]
    )
    return result.rows[0]?.id ?? crypto.randomUUID()
  }

  async search(userId: string, query: string, topK = 5): Promise<MemoryEntry[]> {
    const embedding = await this.embed(query)
    const result = await this.db.query<{
      id: string
      content: string
      metadata: Record<string, unknown>
      score: number
    }>(
      `SELECT id, content, metadata,
              1 - (embedding <=> $2::vector) AS score
       FROM memories
       WHERE user_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [userId, JSON.stringify(embedding), topK]
    )
    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      type: (row.metadata?.["type"] === "episodic" || row.metadata?.["type"] === "procedural") ? row.metadata["type"] : "semantic" as const,
      metadata: row.metadata,
      score: row.score,
    }))
  }

  async getAll(userId: string): Promise<MemoryEntry[]> {
    const result = await this.db.query<{
      id: string
      content: string
      metadata: Record<string, unknown>
    }>(
      `SELECT id, content, metadata
       FROM memories
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    )
    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      type: (row.metadata?.["type"] === "episodic" || row.metadata?.["type"] === "procedural") ? row.metadata["type"] : "semantic" as const,
      metadata: row.metadata,
    }))
  }

  async delete(_userId: string, memoryId: string): Promise<void> {
    await this.db.query("DELETE FROM memories WHERE id = $1", [memoryId])
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.query("DELETE FROM memories WHERE user_id = $1", [userId])
  }
}
