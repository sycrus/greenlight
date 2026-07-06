# Subagent: Brief Parsing

| Field | Value |
|---|---|
| Model | gemini-2.5-flash |
| Duration | 6.4s |
| Input tokens | 643 |
| Output tokens | 272 |
| Cost | $0.00003 |

## Verification

| Check |
|---|
| ✅ schema valid |
| ✅ confidence ≥ 0.5 — confidence: 0.8 |
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
```

## User message

Netflix wants a YouTube Shorts campaign for Stranger Things season 5. Target existing fans and new viewers. Dark, mysterious, nostalgic 80s tone. Must include the Stranger Things logo and the new Vecna character.

## Raw response

```json
```json
{
  "brand": "Netflix",
  "campaign_objective": "Promote Stranger Things Season 5",
  "target_audience": {
    "primary": "existing Stranger Things fans",
    "secondary": "new viewers"
  },
  "key_message": "Anticipate the dark, mysterious, and nostalgic return of Stranger Things with Season 5.",
  "mandatory_elements": [
    "Netflix logo",
    "Stranger Things logo",
    "new Vecna character"
  ],
  "tone_descriptors": [
    "dark",
    "mysterious",
    "nostalgic 80s"
  ],
  "format": {
    "duration_seconds": 30,
    "aspect_ratio": "9:16",
    "platform": "YouTube Shorts"
  },
  "brief_gaps": [
    "Specific call to action (CTA) for viewers",
    "No brand palette or visual guidelines provided",
    "Specific plot points or themes to highlight for Season 5",
    "Specific age range or detailed demographics for target audience"
  ],
  "confidence_score": 0.8
}
```
```

## Parsed output

```json
{
  "brand": "Netflix",
  "campaign_objective": "Promote Stranger Things Season 5",
  "target_audience": {
    "primary": "existing Stranger Things fans",
    "secondary": "new viewers"
  },
  "key_message": "Anticipate the dark, mysterious, and nostalgic return of Stranger Things with Season 5.",
  "mandatory_elements": [
    "Netflix logo",
    "Stranger Things logo",
    "new Vecna character"
  ],
  "tone_descriptors": [
    "dark",
    "mysterious",
    "nostalgic 80s"
  ],
  "format": {
    "duration_seconds": 30,
    "aspect_ratio": "9:16",
    "platform": "YouTube Shorts"
  },
  "brief_gaps": [
    "Specific call to action (CTA) for viewers",
    "No brand palette or visual guidelines provided",
    "Specific plot points or themes to highlight for Season 5",
    "Specific age range or detailed demographics for target audience"
  ],
  "confidence_score": 0.8
}
```
