# Subagent: Brief Parsing

| Field | Value |
|---|---|
| Model | vertexai/gemini-2.5-flash |
| Duration | 11.6s |
| Input tokens | 847 |
| Output tokens | 311 |
| Cost | $0.00004 |

## Verification

| Check |
|---|
| ✅ schema valid |
| ✅ confidence ≥ 0.5 — confidence: 0.88 |
| ✅ brief_gaps populated |

## System prompt

```
You are a brief parsing agent. Your job is to extract structured data from a freeform creative brief for short-form branded video (30s).

Output ONLY a raw JSON object — no markdown fences, no prose, no explanation. The JSON must match this schema exactly:

{
  "brand": "string — the brand or company name",
  "campaign_objective": "string — what the campaign aims to achieve",
  "target_audience": {
    "primary": "string — primary demographic or audience segment",
    "secondary": "string | null — secondary audience, or null if not specified in the brief"
  },
  "key_message": "string — the single most important message to communicate",
  "mandatory_elements": ["string — required elements: logo, tagline, product shot, etc."],
  "tone_descriptors": ["string — 2-5 words describing the desired tone"],
  "format": {
    "duration_seconds": 30,
    "aspect_ratio": "16:9 | 9:16 — infer from platform context, default to 16:9",
    "platform": "string — TikTok, YouTube Shorts, Instagram Reels, etc. Infer if not explicit"
  },
  "brief_gaps": ["string — information the brief DOES NOT specify that would affect creative direction. Always include at least 1-3 items."],
  "confidence_score": 0.85
}

Rules:
1. Extract everything the brief explicitly states. Be precise — do not invent details not in the brief.
2. For fields the brief does not address: use your best inference (e.g. if the brief mentions "TikTok" then aspect_ratio is "9:16" and platform is "TikTok"). Mark inferred fields in brief_gaps.
3. brief_gaps MUST include concrete, actionable gaps — things a creative director would need to know. Examples: "Target platform not specified", "No brand palette provided", "Audience age range not specified". Never leave brief_gaps empty.
4. confidence_score: 0.9+ if the brief is detailed and complete, 0.7-0.89 if some key fields required inference, 0.5-0.69 if the brief is thin and most fields were inferred.
5. tone_descriptors: if the brief doesn't specify tone, infer from the brand and platform. A luxury brand on YouTube gets different tone descriptors than a snack brand on TikTok.
6. mandatory_elements: include any brand assets, logos, taglines, or product elements the brief mentions as required. Include "brand logo" and "brand tagline" by default.
7. Return ONLY the JSON object. No markdown, no explanation.

Brand rules:
{
  "palette": "Oatly blue #005BAA, cream #FFF8E7, black #1A1A1A",
  "typography": "Oatly定制字体 (custom Oatly sans-serif), all lowercase preferred",
  "logoUsage": "Oatly logo on carton, no isolated logo placements",
  "restrictedImagery": "no dairy products, no cows, no traditional milk packaging",
  "competitorNames": "Alpro, Minor Figures, Califia Farms"
}
```

## User message

Launch Oatly's new Barista Edition oat milk in Singapore. Target: 22–35 urban professionals who go to specialty coffee shops. 15-second vertical for TikTok and Instagram Reels. The tone is Oatly's signature weird-confident — self-aware, a little absurd, never corny. Key message: "It's just oat milk. But better. Way better." Show the carton in a real café setting, barista pouring latte art, customer reaction. No dairy comparisons — we're post-milk, not anti-milk. Must include the Oatly logo and the phrase "Post Milk Generation."

## Raw response

```json
{
  "brand": "Oatly",
  "campaign_objective": "Launch Oatly's new Barista Edition oat milk in Singapore.",
  "target_audience": {
    "primary": "22–35 urban professionals who go to specialty coffee shops",
    "secondary": null
  },
  "key_message": "It's just oat milk. But better. Way better.",
  "mandatory_elements": [
    "Oatly logo",
    "the phrase 'Post Milk Generation'",
    "Oatly Barista Edition carton in a real café setting",
    "barista pouring latte art",
    "customer reaction"
  ],
  "tone_descriptors": [
    "weird-confident",
    "self-aware",
    "absurd"
  ],
  "format": {
    "duration_seconds": 30,
    "aspect_ratio": "9:16",
    "platform": "TikTok"
  },
  "brief_gaps": [
    "Specific Call to Action (CTA) not provided.",
    "Music style or sound design preferences not specified.",
    "Detailed guidance on the desired 'customer reaction' is missing.",
    "Brief specified 15-second duration, which differs from the required 30-second schema duration."
  ],
  "confidence_score": 0.88
}
```

## Parsed output

```json
{
  "brand": "Oatly",
  "campaign_objective": "Launch Oatly's new Barista Edition oat milk in Singapore.",
  "target_audience": {
    "primary": "22–35 urban professionals who go to specialty coffee shops",
    "secondary": null
  },
  "key_message": "It's just oat milk. But better. Way better.",
  "mandatory_elements": [
    "Oatly logo",
    "the phrase 'Post Milk Generation'",
    "Oatly Barista Edition carton in a real café setting",
    "barista pouring latte art",
    "customer reaction"
  ],
  "tone_descriptors": [
    "weird-confident",
    "self-aware",
    "absurd"
  ],
  "format": {
    "duration_seconds": 30,
    "aspect_ratio": "9:16",
    "platform": "TikTok"
  },
  "brief_gaps": [
    "Specific Call to Action (CTA) not provided.",
    "Music style or sound design preferences not specified.",
    "Detailed guidance on the desired 'customer reaction' is missing.",
    "Brief specified 15-second duration, which differs from the required 30-second schema duration."
  ],
  "confidence_score": 0.88
}
```
