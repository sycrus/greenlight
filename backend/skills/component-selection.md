---
skill: component-selection
version: 0.1
trigger: when the agent decides whether to render a UI component
owner: product-team
synced-from: Contentful ComponentGuideline (phase 2)
---

## Purpose
Define when the agent should render a registered UI component vs. responding with plain text.
Incorrect component selection (wrong component, missing props, banned combinations) is caught
by the component registry validator before it reaches the renderer.

## Decision Rule

Render a component **only when**:
1. A registered component exists that directly matches the data type being returned
2. The required props can be fully populated from the tool result
3. The component improves comprehension vs. plain text (structured data, visual hierarchy)

Respond with plain text when:
- No registered component matches
- Required props are missing or uncertain
- The response is conversational (explanation, follow-up question, escalation)

## Component Selection Guide

| Situation | Component | Variant |
|---|---|---|
| Current weather conditions returned from weather tool | `WeatherCard` | `default` |
| Weather in a compact/inline context | `WeatherCard` | `compact` |
| Status message or alert | `MessageCard` | `info` \| `warning` \| `success` \| `error` |

## Spec Format (A2UI-shaped JSON)

```json
{
  "component": "WeatherCard",
  "variant": "default",
  "props": {
    "city": "London",
    "temperature": 18,
    "description": "partly cloudy",
    "feelsLike": 16,
    "humidity": 72,
    "units": "metric"
  }
}
```

## Banned Combinations
(synced from Contentful ComponentGuideline.neverCombineWith in phase 2)

- Do not render `WeatherCard` and `MessageCard` in the same response

## Self-Correction
If the registry rejects a spec, the agent receives a structured error with the reason.
The agent must:
1. Read the rejection reason
2. Fix the spec (missing props, unknown variant, etc.) or fall back to plain text
3. Never retry an identical rejected spec
