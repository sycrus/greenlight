# Subagent: Brief Parsing

| Field | Value |
|---|---|
| Model | deepseek-chat |
| Duration | 2.4s |
| Input tokens | 800 |
| Output tokens | 245 |
| Cost | $0.00049 |

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
  "palette": "earth tones #8B7355, #D4C5B2, #4A7C59, navy #1B2A3D",
  "typography": "Belwe Bold for headlines",
  "logoUsage": "Patagonia logo on repair station signage",
  "restrictedImagery": "no new products, no fast fashion brands, no models — real people only",
  "competitorNames": "The North Face, Arc'teryx, Columbia"
}
```

## User message

Patagonia wants to promote its Worn Wear repair and resale program. Target audience is environmentally conscious 25–40 year-olds who value sustainability over fast fashion. We need a 45-second video for Instagram and YouTube that feels authentic and documentary-style — no glossy production. Key message: "The most sustainable jacket is the one you already own." Show real repairs, real people, real stories. No new product shots. Must include the Patagonia logo and Worn Wear patch. Tone: honest, warm, activist-lite.

## Raw response

```json
{
  "brand": "Patagonia",
  "campaign_objective": "Promote the Worn Wear repair and resale program to drive awareness and participation",
  "target_audience": {
    "primary": "Environmentally conscious 25–40 year-olds who value sustainability over fast fashion",
    "secondary": null
  },
  "key_message": "The most sustainable jacket is the one you already own.",
  "mandatory_elements": ["Patagonia logo", "Worn Wear patch", "real repairs footage", "real people footage", "real stories footage"],
  "tone_descriptors": ["honest", "warm", "activist-lite", "authentic", "documentary-style"],
  "format": {
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "platform": "Instagram, YouTube"
  },
  "brief_gaps": [
    "No brand palette or typography specified for video graphics",
    "No call-to-action (CTA) specified",
    "No music or sound design direction provided"
  ],
  "confidence_score": 0.88
}
```

## Parsed output

```json
{
  "brand": "Patagonia",
  "campaign_objective": "Promote the Worn Wear repair and resale program to drive awareness and participation",
  "target_audience": {
    "primary": "Environmentally conscious 25–40 year-olds who value sustainability over fast fashion",
    "secondary": null
  },
  "key_message": "The most sustainable jacket is the one you already own.",
  "mandatory_elements": [
    "Patagonia logo",
    "Worn Wear patch",
    "real repairs footage",
    "real people footage",
    "real stories footage"
  ],
  "tone_descriptors": [
    "honest",
    "warm",
    "activist-lite",
    "authentic",
    "documentary-style"
  ],
  "format": {
    "duration_seconds": 45,
    "aspect_ratio": "9:16",
    "platform": "Instagram, YouTube"
  },
  "brief_gaps": [
    "No brand palette or typography specified for video graphics",
    "No call-to-action (CTA) specified",
    "No music or sound design direction provided"
  ],
  "confidence_score": 0.88
}
```
