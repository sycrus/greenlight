/**
 * Weather tool — example tool demonstrating the tool pattern.
 *
 * Uses OpenWeatherMap API. All tools follow this shape:
 *   - Zod schema for input validation
 *   - Returns a typed ToolResult
 *   - Throws descriptively so the agent can self-correct
 *
 * To add a new tool:
 *   1. Create a file in src/tools/
 *   2. Export the schema and execute function
 *   3. Register it in src/agents/weather.ts (or whichever agent uses it)
 */

import { z } from "zod"
import type { ToolResult } from "../types/index.js"

// ── Input schema ──────────────────────────────────────────────────────────────

export const WeatherInputSchema = z.object({
  city: z.string().min(1).describe("City name to get weather for"),
  units: z.enum(["metric", "imperial"]).default("metric"),
})

export type WeatherInput = z.infer<typeof WeatherInputSchema>

// ── Output shape ──────────────────────────────────────────────────────────────

export interface WeatherData {
  city: string
  temperature: number
  feelsLike: number
  description: string
  humidity: number
  units: "metric" | "imperial"
}

// ── Tool execution ─────────────────────────────────────────────────────────────

export async function getWeather(
  input: WeatherInput
): Promise<ToolResult<WeatherData>> {
  const apiKey = process.env["WEATHER_API_KEY"]

  if (!apiKey) {
    // Return mock data in dev when API key is not configured
    console.warn("[tool:weather] WEATHER_API_KEY not set — returning mock data")
    return {
      toolName: "get_weather",
      success: true,
      data: {
        city: input.city,
        temperature: 22,
        feelsLike: 21,
        description: "partly cloudy (mock)",
        humidity: 60,
        units: input.units,
      },
    }
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/weather")
  url.searchParams.set("q", input.city)
  url.searchParams.set("units", input.units)
  url.searchParams.set("appid", apiKey)

  const res = await fetch(url.toString())

  if (res.status === 401) {
    console.warn("[tool:weather] WEATHER_API_KEY is set but unauthorized — returning mock data until valid key is available")
    return {
      toolName: "get_weather",
      success: true,
      data: {
        city: input.city,
        temperature: 22,
        feelsLike: 21,
        description: "partly cloudy (mock)",
        humidity: 60,
        units: input.units,
      },
    }
  }

  if (!res.ok) {
    return {
      toolName: "get_weather",
      success: false,
      error: `Weather API error: ${res.status} ${res.statusText}`,
    }
  }

  const raw = (await res.json()) as {
    name: string
    main: { temp: number; feels_like: number; humidity: number }
    weather: Array<{ description: string }>
  }

  return {
    toolName: "get_weather",
    success: true,
    data: {
      city: raw.name,
      temperature: raw.main.temp,
      feelsLike: raw.main.feels_like,
      description: raw.weather[0]?.description ?? "unknown",
      humidity: raw.main.humidity,
      units: input.units,
    },
  }
}
