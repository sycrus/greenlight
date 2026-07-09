/**
 * GCS client — upload reference images to Cloud Storage.
 *
 * Stores generated images in the project bucket under:
 *   gs://{GCS_BUCKET_NAME}/runs/{runId}/references/{ingredientId}_{timestamp}.png
 *
 * Returns both gs:// and https:// URIs for different consumers:
 *   - gs:// URIs for Firestore, Imagen, Slides API, Flow package
 *   - https:// URIs for UI display and Slides deck embedding
 */

import { Storage } from "@google-cloud/storage"
import type { Storage as StorageType } from "@google-cloud/storage"

// ── Client ──────────────────────────────────────────────────────────────────────

const BUCKET = process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802"

let _storage: StorageType | null = null
function storage(): StorageType {
  if (!_storage) {
    const keyJson = process.env["GCP_SERVICE_ACCOUNT_KEY"]
    const projectId = process.env["GCP_PROJECT_ID"] ?? ""
    if (keyJson) {
      _storage = new Storage({
        projectId,
        credentials: JSON.parse(keyJson),
      })
    } else {
      _storage = new Storage({ projectId })
    }
  }
  return _storage
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function iso8601Compact(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "T")
}

function gcsUri(bucket: string, path: string): string {
  return `gs://${bucket}/${path}`
}

function publicUrl(bucket: string, path: string): string {
  return `https://storage.googleapis.com/${bucket}/${path}`
}

// ── Upload ─────────────────────────────────────────────────────────────────────

export interface GcsUploadResult {
  gcsUri: string
  publicUrl: string
  sizeBytes: number
  contentType: string
}

/**
 * Upload a buffer to GCS under the reference images path for a run.
 *
 * Path pattern: runs/{runId}/references/{ingredientId}_{timestamp}.png
 */
export async function uploadToGcs(
  buffer: Buffer,
  options: { runId: string; ingredientId: string }
): Promise<GcsUploadResult> {
  const timestamp = iso8601Compact()
  const objectPath = `runs/${options.runId}/references/${options.ingredientId}_${timestamp}.png`
  const contentType = "image/png"

  const bucket = storage().bucket(BUCKET)
  const file = bucket.file(objectPath)

  await file.save(buffer, {
    contentType,
    metadata: {
      contentType,
      ...(options.runId !== undefined && { metadata: { runId: options.runId, ingredientId: options.ingredientId } }),
    },
  })

  const [metadata] = await file.getMetadata()
  const sizeBytes = Number(metadata.size) || buffer.length

  return {
    gcsUri: gcsUri(BUCKET, objectPath),
    publicUrl: publicUrl(BUCKET, objectPath),
    sizeBytes,
    contentType,
  }
}

/** Convert a gs:// URI to an https:// public URL for UI display. */
export function gcsToHttps(uri: string): string {
  const m = uri.match(/^gs:\/\/([^\/]+)\/(.+)$/)
  if (!m) return uri
  return publicUrl(m[1]!, m[2]!)
}
