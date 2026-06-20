#!/usr/bin/env python3
"""
Conversation test runner for Parlant.

Sends a sequence of messages to a fresh Parlant session and prints a clean
transcript. Edit MESSAGES below to test different user flows.

Usage:
    python backend/parlant/test_conversation.py
    python backend/parlant/test_conversation.py --url http://localhost:8800
    python backend/parlant/test_conversation.py --messages "Hi" "We're in fintech" "Our main challenge is real-time fraud detection"
"""

import argparse
import sys
import time

import httpx

PARLANT_URL = "http://localhost:8800"
CUSTOMER_ID = "test-conversation-user"

# ── Edit these to test different conversation flows ───────────────────────────

MESSAGES = [
    "Hi, I'm looking at Endava as a potential partner",
    "We're a mid-size bank — around 3,000 employees. Main challenge is modernising our core banking platform without service disruption",
    "We're on a 12-month timeline and the CTO is asking for proof that this kind of migration has been done before",
]

# ─────────────────────────────────────────────────────────────────────────────

POLL_INTERVAL = 0.5   # seconds between event polls
TIMEOUT = 120         # seconds to wait for each response


def get_or_create_customer(client: httpx.Client) -> str:
    r = client.get(f"{PARLANT_URL}/customers/{CUSTOMER_ID}")
    if r.status_code == 200:
        return CUSTOMER_ID
    r = client.post(f"{PARLANT_URL}/customers", json={"id": CUSTOMER_ID, "name": CUSTOMER_ID})
    if r.status_code not in (200, 201):
        # race-created by a previous run — check again
        r2 = client.get(f"{PARLANT_URL}/customers/{CUSTOMER_ID}")
        if not r2.is_success:
            raise RuntimeError(f"Could not create customer: {r.status_code}")
    return CUSTOMER_ID


def get_agent_id(client: httpx.Client) -> str:
    r = client.get(f"{PARLANT_URL}/agents")
    r.raise_for_status()
    agents = r.json()
    if not agents:
        raise RuntimeError("No agents registered in Parlant")
    return agents[0]["id"]


def create_session(client: httpx.Client, agent_id: str, customer_id: str) -> str:
    r = client.post(
        f"{PARLANT_URL}/sessions",
        json={"agent_id": agent_id, "customer_id": customer_id},
    )
    r.raise_for_status()
    return r.json()["id"]


def send_message(client: httpx.Client, session_id: str, message: str) -> int:
    r = client.post(
        f"{PARLANT_URL}/sessions/{session_id}/events",
        json={"source": "customer", "kind": "message", "message": message},
    )
    r.raise_for_status()
    return r.json()["offset"]


def wait_for_reply(client: httpx.Client, session_id: str, after_offset: int) -> list[str]:
    deadline = time.time() + TIMEOUT
    seen = set()
    parts: list[str] = []

    while time.time() < deadline:
        time.sleep(POLL_INTERVAL)
        r = client.get(f"{PARLANT_URL}/sessions/{session_id}/events")
        if not r.is_success:
            continue

        events = r.json()
        new_events = [e for e in events if e["offset"] > after_offset]

        for e in new_events:
            if (
                e["source"] == "ai_agent"
                and e["kind"] == "message"
                and e["offset"] not in seen
                and "__preamble__" not in (e.get("data", {}).get("tags") or [])
                and e.get("data", {}).get("message")
            ):
                parts.append(e["data"]["message"])
                seen.add(e["offset"])

        completed = next(
            (
                e for e in new_events
                if e["source"] == "ai_agent"
                and e["kind"] == "status"
                and (e.get("data") or {}).get("status") == "ready"
                and ((e.get("data") or {}).get("data") or {}).get("stage") == "completed"
            ),
            None,
        )
        if completed:
            return parts

    raise TimeoutError(f"No response after {TIMEOUT}s")


def divider(char: str = "─", width: int = 72) -> str:
    return char * width


def run(messages: list[str], parlant_url: str) -> None:
    global PARLANT_URL
    PARLANT_URL = parlant_url

    with httpx.Client(timeout=30) as client:
        print(f"\n{divider('═')}")
        print(f"  Parlant conversation test  →  {parlant_url}")
        print(divider('═'))

        customer_id = get_or_create_customer(client)
        agent_id = get_agent_id(client)
        session_id = create_session(client, agent_id, customer_id)
        print(f"  Session: {session_id}  |  Customer: {customer_id}\n")

        last_offset = -1

        for i, message in enumerate(messages, 1):
            print(f"{divider()}")
            print(f"  [{i}/{len(messages)}] USER")
            print(f"  {message}")
            print(divider())

            customer_offset = send_message(client, session_id, message)
            last_offset = customer_offset

            print("  AGENT  ", end="", flush=True)
            try:
                start = time.time()
                reply_parts = wait_for_reply(client, session_id, after_offset=last_offset)
                elapsed = time.time() - start
                reply = "\n\n".join(reply_parts)
                # indent continuation lines
                indented = reply.replace("\n", "\n  ")
                print(f"({elapsed:.1f}s)")
                print(f"  {indented}")
            except TimeoutError as e:
                print(f"\n  ⚠ {e}")

            print()

        print(divider('═'))
        print(f"  Done — {len(messages)} turn(s)  |  session: {session_id}")
        print(f"  Parlant inspector: {parlant_url}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Test a Parlant conversation flow")
    parser.add_argument("--url", default=PARLANT_URL, help="Parlant base URL")
    parser.add_argument("--messages", nargs="+", help="Override message sequence")
    args = parser.parse_args()

    messages = args.messages if args.messages else MESSAGES

    try:
        run(messages, args.url)
    except KeyboardInterrupt:
        print("\n  Interrupted.")
        sys.exit(0)
    except Exception as e:
        print(f"\n  Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
