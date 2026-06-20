/**
 * Weather agent node.
 *
 * Specialist agent for weather-related queries.
 * Extracts the city from the user message, calls the weather tool,
 * and generates a natural language response.
 *
 * This agent demonstrates the pattern for all specialist agents:
 *   1. Read relevant state (messages, userContext)
 *   2. Call tools as needed
 *   3. Generate a response via Claude
 *   4. Write response back to state
 *   5. Optionally write to memory
 */

import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages"
import { callClaude } from "../providers/anthropic.adapter.js"
import { getWeather, WeatherInputSchema } from "../tools/weather.js"
import { withSpan } from "../observability/otel.js"
import type { GraphState } from "../types/index.js"

const WEATHER_SYSTEM_PROMPT = `You are a weather data agent. Given weather data, return a factual summary of the conditions. Include temperature, feels-like, conditions, and humidity. No tone, no advice — just the data.`

export async function weatherAgentNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  return withSpan("weather_agent", { userId: state.userId, sessionId: state.sessionId, agentNode: "weather_agent" }, async () => {
    const lastMessage = state.messages.at(-1)
    const userText = typeof lastMessage?.content === "string" ? lastMessage.content : ""

    // ── Extract city from user message ────────────────────────────────────────
    // Handles: "weather in X", "X weather", "weather X", "what's the weather in X"
    const cityMatch =
      userText.match(/weather\s+(?:in|for|at)\s+([A-Za-z][A-Za-z\s,]+?)(?:\?|!|$)/i) ??
      userText.match(/([A-Za-z][A-Za-z\s,]+?)\s+weather/i) ??
      userText.match(/weather\s+([A-Za-z][A-Za-z\s,]+)/i)
    const city = cityMatch?.[1]?.trim() ?? "London"

    const parsed = WeatherInputSchema.safeParse({ city })
    if (!parsed.success) {
      return { response: "I couldn't determine which city you're asking about. Could you specify?" }
    }

    // ── Call weather tool ─────────────────────────────────────────────────────
    const weatherResult = await getWeather(parsed.data)

    if (!weatherResult.success || !weatherResult.data) {
      return {
        response: `I'm having trouble fetching weather data right now. ${weatherResult.error ?? "Please try again."}`,
      }
    }

    const { temperature, feelsLike, description, humidity, units } = weatherResult.data
    const unit = units === "metric" ? "°C" : "°F"

    const weatherSummary = `City: ${weatherResult.data.city}, Temperature: ${temperature}${unit}, Feels like: ${feelsLike}${unit}, Conditions: ${description}, Humidity: ${humidity}%`

    // ── Generate response ─────────────────────────────────────────────────────
    const response = await callClaude([
      new SystemMessage(WEATHER_SYSTEM_PROMPT),
      new HumanMessage(userText),
      new AIMessage(`Weather data: ${weatherSummary}`),
      new HumanMessage("Based on this data, give me a helpful weather summary."),
    ], { agentNode: "weather_agent", userId: state.userId, sessionId: state.sessionId })

    const responseText = typeof response.content === "string" ? response.content : ""

    // ── Memory placeholder ────────────────────────────────────────────────────
    // TODO (phase 2): store user's city preference if they mention it often
    // await memoryStore.add(state.userId, `User asked about weather in ${city}`, { type: "episodic" })

    return {
      response: responseText,
      messages: [...state.messages, response],
      componentSpec: {
        component: "WeatherCard",
        props: {
          city: weatherResult.data.city,
          temperature: temperature,
          feelsLike: feelsLike,
          description: description,
          humidity: humidity,
          units: units,
        },
      },
    }
  })
}
