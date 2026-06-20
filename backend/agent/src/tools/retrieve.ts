/**
 * RAG retrieval tool.
 *
 * HTTP client for the llama-rag Python microservice.
 * Any agent node can import retrieveContext() — it is not tied to the rag agent.
 *
 * Returns top-k chunks from the pgvector index plus a deduplicated source list.
 * Falls back to empty results when the service is unavailable so callers can
 * decide how to handle missing context rather than crashing.
 */

import { GoogleAuth } from "google-auth-library"
import type { ToolResult } from "../types/index.js"

const LLAMA_RAG_URL = process.env["LLAMA_RAG_URL"] ?? "http://localhost:8001"

// Static token for local dev override; auto-fetched from GCP metadata in production.
const STATIC_TOKEN = process.env["LLAMA_RAG_AUTH_TOKEN"] ?? ""
const _auth = new GoogleAuth()

async function getAuthHeader(): Promise<Record<string, string>> {
  if (STATIC_TOKEN) return { Authorization: `Bearer ${STATIC_TOKEN}` }
  // Only attempt GCP metadata fetch if URL is HTTPS (i.e. Cloud Run, not localhost)
  if (!LLAMA_RAG_URL.startsWith("https://")) return {}
  try {
    const client = await _auth.getIdTokenClient(LLAMA_RAG_URL)
    const headers = await client.getRequestHeaders()
    return headers as unknown as Record<string, string>
  } catch {
    return {}
  }
}

export interface RetrievedChunk {
  text: string
  source: string
  score: number
}

export interface RetrieveData {
  chunks: RetrievedChunk[]
  sources: string[]
}

export async function retrieveContext(
  query: string,
  topK = 5
): Promise<ToolResult<RetrieveData>> {
  try {
    const authHeaders = await getAuthHeader()
    const res = await fetch(`${LLAMA_RAG_URL}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ query, top_k: topK }),
    })

    if (!res.ok) {
      return {
        toolName: "retrieve_context",
        success: false,
        error: `llama-rag /retrieve returned ${res.status}`,
      }
    }

    const data = (await res.json()) as RetrieveData
    return { toolName: "retrieve_context", success: true, data }
  } catch (err) {
    return {
      toolName: "retrieve_context",
      success: false,
      error: err instanceof Error ? err.message : "llama-rag unreachable",
    }
  }
}
