import { describe, it, expect, vi, beforeEach } from "vitest"
import { getWeather, WeatherInputSchema } from "../../src/tools/weather.js"

describe("getWeather", () => {
  describe("input validation (WeatherInputSchema)", () => {
    it("accepts a valid city", () => {
      const result = WeatherInputSchema.safeParse({ city: "London" })
      expect(result.success).toBe(true)
    })

    it("rejects an empty city", () => {
      const result = WeatherInputSchema.safeParse({ city: "" })
      expect(result.success).toBe(false)
    })

    it("defaults units to metric", () => {
      const result = WeatherInputSchema.safeParse({ city: "Tokyo" })
      expect(result.success && result.data.units).toBe("metric")
    })

    it("accepts imperial units", () => {
      const result = WeatherInputSchema.safeParse({ city: "New York", units: "imperial" })
      expect(result.success && result.data.units).toBe("imperial")
    })
  })

  describe("mock data fallback (no API key)", () => {
    beforeEach(() => {
      vi.stubEnv("WEATHER_API_KEY", "")
    })

    it("returns success with mock data when no API key is set", async () => {
      const result = await getWeather({ city: "Paris", units: "metric" })
      expect(result.success).toBe(true)
      expect(result.data?.city).toBe("Paris")
      expect(result.data?.description).toContain("mock")
    })

    it("returns a temperature value", async () => {
      const result = await getWeather({ city: "Berlin", units: "metric" })
      expect(typeof result.data?.temperature).toBe("number")
    })
  })

  describe("live API (skipped without key)", () => {
    it.skipIf(!process.env["WEATHER_API_KEY"])(
      "fetches real weather data",
      async () => {
        const result = await getWeather({ city: "London", units: "metric" })
        expect(result.success).toBe(true)
        expect(result.data?.city).toBeTruthy()
        expect(result.data?.temperature).toBeDefined()
      }
    )
  })
})
