# Subagent: Brief Parsing

| Field | Value |
|---|---|
| Model | gemini-2.5-flash |
| Duration | 7.5s |
| Input tokens | 805 |
| Output tokens | 221 |
| Cost | $0.00003 |

## Verification

| Check |
|---|
| ✅ schema valid |
| ✅ confidence ≥ 0.5 — confidence: 0.85 |
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
  "palette": "volt green `#CCFF00`, total orange `#FF6200`, black `#000000`",
  "typography": "",
  "logoUsage": "Nike swoosh visible in first and last 3 seconds",
  "restrictedImagery": "no competitor logos, no alcohol, no political imagery",
  "competitorNames": "Adidas, Puma"
}
```

## User message

We're launching the Nike Air Max Dn to Gen Z. This is the first Air Max with Dynamic Air — four tubes that shift pressure as you move. We want a TikTok-first campaign that feels raw and real, not polished. The shoe is available in volt green and total orange colorways. Must include the visible Air unit in every shot. No competitor footwear. Target: 18–24, sneaker culture, streetwear adjacent. Key message: "Feel the Unreal." We need this in 30 seconds vertical. Go.

## Raw response

```json
{"brand": "Nike", "campaign_objective": "Launch the new Nike Air Max Dn shoe, highlighting its unique Dynamic Air technology to Gen Z.", "target_audience": {"primary": "Gen Z (18\u201324), sneaker culture, streetwear adjacent", "secondary": null}, "key_message": "Feel the Unreal.", "mandatory_elements": ["visible Air unit in every shot", "Nike swoosh visible in first and last 3 seconds", "brand tagline: Feel the Unreal", "no competitor footwear"], "tone_descriptors": ["raw", "real", "unpolished", "authentic"], "format": {"duration_seconds": 30, "aspect_ratio": "9:16", "platform": "TikTok"}, "brief_gaps": ["Explicit call to action missing", "Specific music direction not provided", "Talent/influencer strategy not specified", "Specific scenarios or activities to showcase the shoe are not detailed", "Budget information not provided"], "confidence_score": 0.85}
```

## Parsed output

```json
{
  "brand": "Nike",
  "campaign_objective": "Launch the new Nike Air Max Dn shoe, highlighting its unique Dynamic Air technology to Gen Z.",
  "target_audience": {
    "primary": "Gen Z (18–24), sneaker culture, streetwear adjacent",
    "secondary": null
  },
  "key_message": "Feel the Unreal.",
  "mandatory_elements": [
    "visible Air unit in every shot",
    "Nike swoosh visible in first and last 3 seconds",
    "brand tagline: Feel the Unreal",
    "no competitor footwear"
  ],
  "tone_descriptors": [
    "raw",
    "real",
    "unpolished",
    "authentic"
  ],
  "format": {
    "duration_seconds": 30,
    "aspect_ratio": "9:16",
    "platform": "TikTok"
  },
  "brief_gaps": [
    "Explicit call to action missing",
    "Specific music direction not provided",
    "Talent/influencer strategy not specified",
    "Specific scenarios or activities to showcase the shoe are not detailed",
    "Budget information not provided"
  ],
  "confidence_score": 0.85
}
```
