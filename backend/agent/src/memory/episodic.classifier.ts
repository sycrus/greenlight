/**
 * Episodic event classifier.
 *
 * After a customer-service response, determines whether the response contains
 * an event worth storing as an episodic memory (resolution, confirmation, escalation).
 *
 * Uses a single Claude Haiku call — cheap (~$0.0002) and reliable.
 * Returns a one-sentence summary if the response is episodic, null otherwise.
 *
 * Called fire-and-forget from server.ts — never blocks the response stream.
 */

import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })

const CLASSIFIER_PROMPT = `You are classifying a customer service agent response to determine if it describes a significant event that should be remembered for future sessions.

An episodic event is one of:
- A complaint or issue was resolved ("your refund has been processed", "the issue is fixed")
- An account detail was confirmed or changed ("your address is now updated", "subscription cancelled")
- An escalation occurred ("I've passed this to a specialist", "a manager will contact you")
- A multi-step workflow completed ("your return has been initiated", "order successfully amended")

Routine Q&A, general information, or partial responses are NOT episodic.

Respond with JSON only, no markdown:
{ "episodic": true, "summary": "one sentence describing the event" }
or
{ "episodic": false }`

export async function classifyEpisodicEvent(
  userMessage: string,
  agentResponse: string
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: process.env["DEFAULT_MODEL"] ?? "claude-haiku-4-5-20251001",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: `User said: "${userMessage}"\n\nAgent responded: "${agentResponse}"`,
        },
      ],
      system: CLASSIFIER_PROMPT,
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : ""
    const parsed = JSON.parse(text) as { episodic: boolean; summary?: string }

    return parsed.episodic && parsed.summary ? parsed.summary : null
  } catch {
    return null
  }
}
