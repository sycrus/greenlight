#!/usr/bin/env python3
"""
Local RAG ingest script.

Reads scraped pages from disk and sends them to the llama-rag service for
chunking, embedding, and indexing into pgvector.

Supports two input layouts:

  1. endava-scrape layout (index + markdown files):
       --pages-dir ~/Downloads/endava-scrape/endava-pages
       --index     ~/Downloads/endava-scrape/endava-pages-index.json
     Index entries: { url, title, file, chars }

  2. Generic directory of JSON files:
       --json-dir /path/to/scraped
     Each file: { url, title, content }

  3. Generic directory of markdown files (no metadata):
       --pages-dir /path/to/markdown

Usage:
  # Ingest full endava-scrape
  python scripts/ingest_local.py \\
    --pages-dir ~/Downloads/endava-scrape/endava-pages \\
    --index     ~/Downloads/endava-scrape/endava-pages-index.json

  # Dry run (print stats, don't POST)
  python scripts/ingest_local.py --pages-dir ... --dry-run

  # Override service URL
  LLAMA_RAG_URL=http://localhost:8001 python scripts/ingest_local.py ...

Requires the llama-rag service to be running:
  docker compose up llama-rag  (uses postgres from docker compose)
  OR:
  cd backend/llama-rag && pip install -r requirements.txt
  DB_HOST=localhost OPENAI_API_KEY=sk-... uvicorn main:app --port 8001
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

LLAMA_RAG_URL = os.environ.get("LLAMA_RAG_URL", "http://localhost:8001")
LLAMA_RAG_AUTH_TOKEN = os.environ.get("LLAMA_RAG_AUTH_TOKEN", "")
BATCH_SIZE = int(os.environ.get("INGEST_BATCH_SIZE", "25"))


# ── Loaders ────────────────────────────────────────────────────────────────────


def load_index(index_path: Path) -> dict[str, dict[str, str]]:
    """Map relative file path → { url, title } from endava-pages-index.json."""
    with open(index_path) as f:
        entries: list[dict] = json.load(f)
    return {
        e["file"]: {"url": e.get("url", ""), "title": e.get("title", "")}
        for e in entries
    }


def documents_from_pages_dir(
    pages_dir: Path,
    index: dict[str, dict[str, str]],
) -> list[dict[str, Any]]:
    md_files = sorted(pages_dir.glob("*.md"))
    print(f"  Found {len(md_files)} .md files in {pages_dir.name}/")

    docs: list[dict[str, Any]] = []
    skipped = 0
    for md_file in md_files:
        text = md_file.read_text(encoding="utf-8").strip()
        if not text:
            skipped += 1
            continue
        relative_key = f"{pages_dir.name}/{md_file.name}"
        meta = index.get(relative_key, {})
        docs.append({
            "text": text,
            "metadata": {
                "url": meta.get("url", ""),
                "title": meta.get("title", ""),
                "source_file": md_file.name,
            },
        })

    if skipped:
        print(f"  Skipped {skipped} empty file(s)")
    return docs


def documents_from_json_dir(json_dir: Path) -> list[dict[str, Any]]:
    json_files = sorted(json_dir.glob("*.json"))
    print(f"  Found {len(json_files)} .json files in {json_dir.name}/")

    docs: list[dict[str, Any]] = []
    skipped = 0
    for f in json_files:
        try:
            data: dict = json.loads(f.read_text())
            content = data.get("content", "").strip()
            if not content:
                skipped += 1
                continue
            docs.append({
                "text": content,
                "metadata": {
                    "url": data.get("url", ""),
                    "title": data.get("title", ""),
                    "source_file": f.name,
                },
            })
        except Exception as e:
            print(f"  Warning: could not read {f.name}: {e}")
    if skipped:
        print(f"  Skipped {skipped} empty file(s)")
    return docs


# ── Ingest ─────────────────────────────────────────────────────────────────────


def _auth_headers() -> dict[str, str]:
    if LLAMA_RAG_AUTH_TOKEN:
        return {"Authorization": f"Bearer {LLAMA_RAG_AUTH_TOKEN}"}
    return {}


def check_service() -> None:
    try:
        httpx.get(f"{LLAMA_RAG_URL}/health", timeout=5, headers=_auth_headers()).raise_for_status()
    except Exception as e:
        print(f"\nError: llama-rag not reachable at {LLAMA_RAG_URL}", file=sys.stderr)
        print(f"  {e}", file=sys.stderr)
        print("\nStart it with:", file=sys.stderr)
        print("  docker compose up llama-rag", file=sys.stderr)
        print("\nFor Cloud Run:", file=sys.stderr)
        print("  LLAMA_RAG_AUTH_TOKEN=$(gcloud auth print-identity-token) python scripts/ingest_local.py ...", file=sys.stderr)
        sys.exit(1)


def post_batch(documents: list[dict[str, Any]]) -> tuple[int, int]:
    with httpx.Client(timeout=120.0) as client:
        res = client.post(
            f"{LLAMA_RAG_URL}/ingest",
            json={"documents": documents},
            headers=_auth_headers(),
        )
        res.raise_for_status()
        body = res.json()
        docs = int(body.get("documents", len(documents)))
        chunks = int(body.get("chunks", body.get("ingested", 0)))
        return docs, chunks


def run_ingest(documents: list[dict[str, Any]], dry_run: bool) -> None:
    if not documents:
        print("\nNothing to ingest.")
        return

    total_chars = sum(len(d["text"]) for d in documents)
    print(f"\n  {len(documents)} documents  |  {total_chars:,} total chars  |  batch size {BATCH_SIZE}")

    if dry_run:
        print("\n[dry-run] Skipping POST — remove --dry-run to ingest.")
        for doc in documents[:3]:
            url = doc["metadata"].get("url") or doc["metadata"].get("source_file", "")
            print(f"  • {url[:80]}  ({len(doc['text'])} chars)")
        if len(documents) > 3:
            print(f"  ... and {len(documents) - 3} more")
        return

    total_batches = (len(documents) + BATCH_SIZE - 1) // BATCH_SIZE
    total_docs = 0
    total_chunks = 0
    errors = 0

    print(f"\nIngesting → {LLAMA_RAG_URL}")
    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i: i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        try:
            docs, chunks = post_batch(batch)
            total_docs += docs
            total_chunks += chunks
            pct = int(100 * (i + len(batch)) / len(documents))
            print(f"  [{batch_num}/{total_batches}] {pct:3d}%  {docs} docs → {chunks} chunks")
        except Exception as e:
            print(f"  [{batch_num}/{total_batches}] FAILED: {e}", file=sys.stderr)
            errors += 1

    print(f"\nDone.  {total_docs} documents → {total_chunks} chunks indexed.")
    if errors:
        print(f"  {errors} batch(es) failed — re-run to retry.", file=sys.stderr)
        sys.exit(1)


# ── CLI ────────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest local scraped pages into llama-rag",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--pages-dir", type=Path, metavar="DIR",
                        help="Directory of .md files (endava-pages/ or similar)")
    source.add_argument("--json-dir", type=Path, metavar="DIR",
                        help="Directory of .json files with {url, title, content}")
    parser.add_argument("--index", type=Path, metavar="FILE",
                        help="endava-pages-index.json (adds URL/title metadata to --pages-dir)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be ingested without POSTing")
    args = parser.parse_args()

    if not args.dry_run:
        check_service()

    index: dict[str, dict[str, str]] = {}
    if args.index:
        index_path = args.index.expanduser().resolve()
        index = load_index(index_path)
        print(f"\nIndex loaded: {len(index)} entries from {index_path.name}")

    if args.pages_dir:
        pages_dir = args.pages_dir.expanduser().resolve()
        if not pages_dir.exists():
            print(f"Error: --pages-dir {pages_dir} not found", file=sys.stderr)
            sys.exit(1)
        documents = documents_from_pages_dir(pages_dir, index)
    else:
        json_dir = args.json_dir.expanduser().resolve()
        if not json_dir.exists():
            print(f"Error: --json-dir {json_dir} not found", file=sys.stderr)
            sys.exit(1)
        documents = documents_from_json_dir(json_dir)

    run_ingest(documents, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
