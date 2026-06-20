#!/usr/bin/env python3
"""
RAG Ingestion Job — Cloud Run.

Reads scraped JSON documents from a GCS bucket, then calls the llama-rag
/ingest endpoint to chunk, embed, and upsert them into pgvector.

Expected GCS document shape (one JSON file per page):
  {
    "url": "https://example.com/page",
    "title": "Page Title",
    "content": "Full page text..."
  }

Deployment:
  - Triggered by Eventarc (GCS object finalize) for incremental ingestion
  - Also schedulable via Cloud Scheduler for full re-index
  - Pass a specific GCS blob path as argv[1] for Eventarc single-file mode

Environment:
  RAG_GCS_BUCKET   — GCS bucket containing scraped content
  RAG_GCS_PREFIX   — object prefix to scan (default: "scraped/")
  LLAMA_RAG_URL    — llama-rag service URL (default: http://llama-rag:8001)

Auth: Cloud Run uses the service account automatically via ADC.
      Locally: run `gcloud auth application-default login`.
"""

import json
import os
import sys
from typing import Any

import httpx
from google.cloud import storage

GCS_BUCKET = os.environ["RAG_GCS_BUCKET"]
GCS_PREFIX = os.environ.get("RAG_GCS_PREFIX", "scraped/")
LLAMA_RAG_URL = os.environ.get("LLAMA_RAG_URL", "http://llama-rag:8001")
BATCH_SIZE = int(os.environ.get("INGEST_BATCH_SIZE", "50"))


def list_gcs_files(bucket_name: str, prefix: str) -> list[str]:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    return [b.name for b in bucket.list_blobs(prefix=prefix) if b.name.endswith(".json")]


def read_gcs_file(bucket_name: str, blob_name: str) -> dict[str, Any]:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    return json.loads(bucket.blob(blob_name).download_as_text())  # type: ignore[no-any-return]


def ingest_batch(documents: list[dict[str, Any]]) -> tuple[int, int]:
    """Returns (documents_ingested, chunks_created)."""
    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            f"{LLAMA_RAG_URL}/ingest",
            json={"documents": documents},
        )
        response.raise_for_status()
        result = response.json()
        docs = int(result.get("documents", len(documents)))
        chunks = int(result.get("chunks", result.get("ingested", 0)))
        return docs, chunks


def main() -> None:
    # Eventarc passes the specific blob path as argv[1]
    if len(sys.argv) > 1:
        blob_names = [sys.argv[1]]
        print(f"[ingest] Single-file mode: {blob_names[0]}")
    else:
        blob_names = list_gcs_files(GCS_BUCKET, GCS_PREFIX)
        print(f"[ingest] Full re-index: {len(blob_names)} file(s) in gs://{GCS_BUCKET}/{GCS_PREFIX}")

    documents: list[dict[str, Any]] = []
    errors = 0

    for blob_name in blob_names:
        try:
            data = read_gcs_file(GCS_BUCKET, blob_name)
            content = data.get("content", "").strip()
            if not content:
                continue
            documents.append(
                {
                    "text": content,
                    "metadata": {
                        "url": data.get("url", ""),
                        "title": data.get("title", ""),
                        "source_file": blob_name,
                    },
                }
            )
        except Exception as e:
            print(f"[ingest] Error reading {blob_name}: {e}")
            errors += 1

    if not documents:
        print("[ingest] No documents to ingest.")
        return

    # Batch to avoid oversized payloads
    total_docs = 0
    total_chunks = 0
    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i : i + BATCH_SIZE]
        try:
            docs, chunks = ingest_batch(batch)
            total_docs += docs
            total_chunks += chunks
            print(f"[ingest] Batch {i // BATCH_SIZE + 1}: {docs} docs → {chunks} chunks")
        except Exception as e:
            print(f"[ingest] Batch {i // BATCH_SIZE + 1} failed: {e}")
            errors += 1

    print(f"[ingest] Done. {total_docs} documents → {total_chunks} chunks. Errors: {errors}.")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
