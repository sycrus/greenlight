/**
 * LangGraph graph definition.
 *
 * Graph topology:
 *
 *   START
 *     ↓ (conditional on state.route — set by Parlant before graph.invoke)
 *   weather_agent ──────┐
 *   rag_agent ──────────┼── END
 *   customer_service ───┘
 *
 * Routing is Parlant's responsibility. The agent field in the POST /chat
 * request maps directly to state.route, so no LLM routing call is needed here.
 *
 * Checkpointing (LangGraph thread_id):
 *   thread_id = sessionId — enables human-in-the-loop and session resume.
 *   TODO (phase 2): replace with PostgresSaver from @langchain/langgraph-checkpoint-postgres
 *   pointed at Cloud SQL. thread_id = sessionId for cross-session continuity.
 */

import { StateGraph, START, END, MemorySaver, Annotation } from "@langchain/langgraph"
import { BaseMessage } from "@langchain/core/messages"
import { weatherAgentNode } from "../agents/weather.js"
import { customerServiceAgentNode } from "../agents/customer-service.js"
import { ragAgentNode } from "../agents/rag.js"
import { slideDeckAgentNode } from "../agents/slide-deck.js"
import type { AgentRoute, ComponentSpec, ComponentSpecItem, GraphState } from "../types/index.js"

// ── State definition ──────────────────────────────────────────────────────────

const GraphStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),
  userId: Annotation<string>({ value: (_, update) => update, default: () => "" }),
  sessionId: Annotation<string>({ value: (_, update) => update, default: () => "" }),
  route: Annotation<AgentRoute | null>({ value: (_, update) => update, default: () => null }),
  response: Annotation<string | null>({ value: (_, update) => update, default: () => null }),
  componentSpec: Annotation<ComponentSpec | null>({ value: (_, update) => update, default: () => null }),
  componentSpecItems: Annotation<ComponentSpecItem[] | null>({ value: (_, update) => update, default: () => null }),
  memories: Annotation<string[]>({ value: (_, update) => update, default: () => [] }),
})

// ── Checkpointer ──────────────────────────────────────────────────────────────

const checkpointer = new MemorySaver()

// ── Routing function ──────────────────────────────────────────────────────────

function routeFromStart(
  state: GraphState
): "weather_agent" | "rag_agent" | "slide_deck_agent" | "customer_service_agent" {
  if (state.route?.agent === "weather") return "weather_agent"
  if (state.route?.agent === "rag") return "rag_agent"
  if (state.route?.agent === "slide_deck") return "slide_deck_agent"
  return "customer_service_agent"
}

// ── Graph construction ────────────────────────────────────────────────────────

const builder = new StateGraph(GraphStateAnnotation)
  .addNode("weather_agent", weatherAgentNode)
  .addNode("customer_service_agent", (state) => customerServiceAgentNode(state))
  .addNode("rag_agent", ragAgentNode)
  .addNode("slide_deck_agent", slideDeckAgentNode)
  .addConditionalEdges(START, routeFromStart, {
    weather_agent: "weather_agent",
    rag_agent: "rag_agent",
    slide_deck_agent: "slide_deck_agent",
    customer_service_agent: "customer_service_agent",
  })
  .addEdge("weather_agent", END)
  .addEdge("rag_agent", END)
  .addEdge("slide_deck_agent", END)
  .addEdge("customer_service_agent", END)

export const graph = builder.compile({ checkpointer })

export type { GraphStateAnnotation }
