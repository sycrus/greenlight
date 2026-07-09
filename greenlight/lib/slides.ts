/**
 * Google Slides + Drive adapter — wraps the Google APIs SDK.
 *
 * Pattern: single file wraps Slides + Drive APIs. Everything else calls
 * these functions. Based on the same adapter pattern as lib/gemini.ts
 * and lib/gcs.ts.
 *
 * Authentication: Uses the same service account as Vertex AI + GCS.
 * Requires Slides + Drive API scopes (enabled Day 1 GCP setup).
 */

import { google } from "googleapis"
import type { slides_v1, drive_v3 } from "googleapis"

// ── Client ──────────────────────────────────────────────────────────────────────

let _slides: slides_v1.Slides | null = null
let _drive: drive_v3.Drive | null = null

function slidesClient(): slides_v1.Slides {
  if (!_slides) {
    _slides = google.slides({ version: "v1", auth: getAuth() })
  }
  return _slides
}

function driveClient(): drive_v3.Drive {
  if (!_drive) {
    _drive = google.drive({ version: "v3", auth: getAuth() })
  }
  return _drive
}

function getAuth() {
  // Use OAuth2 with refresh token — creates files in your personal Google Drive
  const clientId = process.env["OAUTH_CLIENT_ID"]
  const clientSecret = process.env["OAUTH_CLIENT_SECRET"]
  const refreshToken = process.env["OAUTH_REFRESH_TOKEN"]

  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
    oauth2.setCredentials({ refresh_token: refreshToken })
    return oauth2
  }

  // Fallback to service account (won't work for Drive/Slides in personal projects)
  const keyFile = "./sa-key.json"
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: [
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/drive",
    ],
  })
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SlideCreateResult {
  presentationId: string
  url: string
}

export interface ShareResult {
  permissionId: string
  url: string
}

// ── Create deck ─────────────────────────────────────────────────────────────────

/**
 * Create a new Google Slides presentation.
 * Returns the presentation ID and the Google Slides URL.
 */
export async function createDeck(title: string): Promise<SlideCreateResult> {
  const response = await slidesClient().presentations.create({
    requestBody: { title },
  })

  const presentationId = response.data.presentationId
  if (!presentationId) {
    throw new Error("Slides API returned no presentation ID")
  }

  return {
    presentationId,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  }
}

// ── Populate slides ─────────────────────────────────────────────────────────────

/**
 * Populate a presentation with slides using batchUpdate.
 * `requests` is an array of Slides API request objects.
 */
export async function populateSlides(
  presentationId: string,
  requests: slides_v1.Schema$Request[]
): Promise<void> {
  await slidesClient().presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  })
}

// ── Build slide creation requests ───────────────────────────────────────────────

/**
 * Build the full request array for creating a pre-production deck.
 * Returns an array of Slides API request objects that can be sent to batchUpdate.
 */
export function buildDeckRequests(datas: {
  brand: string
  titleSlide: { headline: string; subtitle: string }
  territories: Array<{
    coverHeadline: string
    propositionBlurb: string
    visualSummary: string
    toneDescriptor: string
    sceneArcNotes: string
    sceneCount: number
    flowPromptStyle: string
    riskFlag: string | null
    palettePrimary: string[]
    paletteAccent: string[]
  }>
  visualOverview: {
    summary: string
    paletteComparison: string
    cinematographyComparison: string
    ingredientComparison: string
  }
  brandAlignment: {
    territoryNotes: string
    divergenceNotes: string
    riskSummary: string
  }
  approvalSlide: {
    instructions: string
    territoryOptions: Array<{ id: string; name: string; summary: string }>
  }
  nextSteps: string
}): slides_v1.Schema$Request[] {
  const requests: slides_v1.Schema$Request[] = []

  // Slide 1: Title
  requests.push({
    createSlide: {
      slideLayoutReference: { predefinedLayout: "TITLE" },
      placeholderIdMappings: [
        {
          layoutPlaceholder: { type: "TITLE", index: 0 },
          objectId: "title-headline",
        },
        {
          layoutPlaceholder: { type: "SUBTITLE", index: 0 },
          objectId: "title-subtitle",
        },
      ],
    },
  })
  requests.push({
    insertText: {
      objectId: "title-headline",
      text: datas.titleSlide.headline,
    },
  })
  requests.push({
    insertText: {
      objectId: "title-subtitle",
      text: datas.titleSlide.subtitle,
    },
  })

  // Slide 2: Brief Summary
  const briefSlideId = "brief-summary"
  requests.push({
    createSlide: {
      slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
      placeholderIdMappings: [
        {
          layoutPlaceholder: { type: "TITLE", index: 0 },
          objectId: `${briefSlideId}-title`,
        },
        {
          layoutPlaceholder: { type: "BODY", index: 0 },
          objectId: `${briefSlideId}-body`,
        },
      ],
    },
  })
  requests.push({
    insertText: {
      objectId: `${briefSlideId}-title`,
      text: "Brief Summary",
    },
  })
  // Body text will be set via replaceAllText below

  // Slides 3-11: 3 territories × 3 slides each
  for (let i = 0; i < 3; i++) {
    const t = datas.territories[i]
    if (!t) continue
    const tid = `t${i + 1}`

    // Cover slide
    const coverId = `${tid}-cover`
    requests.push({
      createSlide: {
        slideLayoutReference: { predefinedLayout: "SECTION_HEADER" },
        placeholderIdMappings: [
          {
            layoutPlaceholder: { type: "TITLE", index: 0 },
            objectId: `${coverId}-title`,
          },
          {
            layoutPlaceholder: { type: "BODY", index: 0 },
            objectId: `${coverId}-body`,
          },
        ],
      },
    })
    requests.push({
      insertText: { objectId: `${coverId}-title`, text: t.coverHeadline },
    })
    requests.push({
      insertText: { objectId: `${coverId}-body`, text: t.propositionBlurb },
    })

    // Visual slide
    const visId = `${tid}-visual`
    requests.push({
      createSlide: {
        slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        placeholderIdMappings: [
          {
            layoutPlaceholder: { type: "TITLE", index: 0 },
            objectId: `${visId}-title`,
          },
          {
            layoutPlaceholder: { type: "BODY", index: 0 },
            objectId: `${visId}-body`,
          },
        ],
      },
    })
    requests.push({
      insertText: { objectId: `${visId}-title`, text: `Visual Language — ${t.coverHeadline}` },
    })
    requests.push({
      insertText: {
        objectId: `${visId}-body`,
        text: [
          `Mood: ${t.visualSummary}`,
          `Tone: ${t.toneDescriptor}`,
          `Palette Primary: ${t.palettePrimary.join(", ")}`,
          `Palette Accent: ${t.paletteAccent.join(", ")}`,
        ].join("\n\n"),
      },
    })

    // Details slide
    const detId = `${tid}-details`
    requests.push({
      createSlide: {
        slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        placeholderIdMappings: [
          {
            layoutPlaceholder: { type: "TITLE", index: 0 },
            objectId: `${detId}-title`,
          },
          {
            layoutPlaceholder: { type: "BODY", index: 0 },
            objectId: `${detId}-body`,
          },
        ],
      },
    })
    requests.push({
      insertText: { objectId: `${detId}-title`, text: `Production Notes — ${t.coverHeadline}` },
    })
    const riskText = t.riskFlag ? `⚠ Risk: ${t.riskFlag}` : "No risk flags"
    requests.push({
      insertText: {
        objectId: `${detId}-body`,
        text: [
          `Scene Arc: ${t.sceneArcNotes}`,
          `Suggested Scenes: ${t.sceneCount}`,
          `Flow Prompt Style: ${t.flowPromptStyle}`,
          riskText,
        ].join("\n\n"),
      },
    })
  }

  // Slide 12: Visual DNA Overview
  const overviewId = "visual-overview"
  requests.push({
    createSlide: {
      slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
      placeholderIdMappings: [
        {
          layoutPlaceholder: { type: "TITLE", index: 0 },
          objectId: `${overviewId}-title`,
        },
        {
          layoutPlaceholder: { type: "BODY", index: 0 },
          objectId: `${overviewId}-body`,
        },
      ],
    },
  })
  requests.push({
    insertText: { objectId: `${overviewId}-title`, text: "Visual DNA Overview" },
  })
  requests.push({
    insertText: {
      objectId: `${overviewId}-body`,
      text: [
        datas.visualOverview.summary,
        `Palettes: ${datas.visualOverview.paletteComparison}`,
        `Cinematography: ${datas.visualOverview.cinematographyComparison}`,
        `Ingredients: ${datas.visualOverview.ingredientComparison}`,
      ].join("\n\n"),
    },
  })

  // Slide 13: Brand Alignment (ECD only)
  const brandId = "brand-alignment"
  requests.push({
    createSlide: {
      slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
      placeholderIdMappings: [
        {
          layoutPlaceholder: { type: "TITLE", index: 0 },
          objectId: `${brandId}-title`,
        },
        {
          layoutPlaceholder: { type: "BODY", index: 0 },
          objectId: `${brandId}-body`,
        },
      ],
    },
  })
  requests.push({
    insertText: { objectId: `${brandId}-title`, text: "Brand Alignment" },
  })
  requests.push({
    insertText: {
      objectId: `${brandId}-body`,
      text: [
        datas.brandAlignment.territoryNotes,
        `Divergence: ${datas.brandAlignment.divergenceNotes}`,
        `Risk: ${datas.brandAlignment.riskSummary}`,
      ].join("\n\n"),
    },
  })

  // Slide 14: Approval
  const approvalId = "approval"
  requests.push({
    createSlide: {
      slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
      placeholderIdMappings: [
        {
          layoutPlaceholder: { type: "TITLE", index: 0 },
          objectId: `${approvalId}-title`,
        },
        {
          layoutPlaceholder: { type: "BODY", index: 0 },
          objectId: `${approvalId}-body`,
        },
      ],
    },
  })
  requests.push({
    insertText: { objectId: `${approvalId}-title`, text: "Approval" },
  })
  const territoryList = datas.approvalSlide.territoryOptions
    .map((opt) => `□ ${opt.name} (${opt.id})\n   ${opt.summary}`)
    .join("\n\n")
  requests.push({
    insertText: {
      objectId: `${approvalId}-body`,
      text: `${datas.approvalSlide.instructions}\n\n${territoryList}`,
    },
  })

  // Slide 15: Next Steps
  const nextId = "next-steps"
  requests.push({
    createSlide: {
      slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
      placeholderIdMappings: [
        {
          layoutPlaceholder: { type: "TITLE", index: 0 },
          objectId: `${nextId}-title`,
        },
        {
          layoutPlaceholder: { type: "BODY", index: 0 },
          objectId: `${nextId}-body`,
        },
      ],
    },
  })
  requests.push({
    insertText: { objectId: `${nextId}-title`, text: "Next Steps" },
  })
  requests.push({
    insertText: { objectId: `${nextId}-body`, text: datas.nextSteps },
  })

  return requests
}

// ── Share deck ──────────────────────────────────────────────────────────────────

/**
 * Share a presentation with a user via Drive API.
 * `role`: "reader" (view-only) or "commenter" (can comment).
 * Returns the permission ID and the deck URL.
 */
export async function shareDeck(
  presentationId: string,
  email: string,
  role: "reader" | "commenter"
): Promise<ShareResult> {
  const response = await driveClient().permissions.create({
    fileId: presentationId,
    requestBody: {
      role,
      type: "user",
      emailAddress: email,
    },
  })

  const permissionId = response.data.id ?? "unknown"

  const urlSuffix = role === "commenter" ? "edit" : "view"
  const url = `https://docs.google.com/presentation/d/${presentationId}/${urlSuffix}`

  return { permissionId, url }
}

// ── Duplicate deck ──────────────────────────────────────────────────────────────

/**
 * Create a copy of a presentation (for client version).
 * Returns the new presentation ID.
 */
export async function duplicateDeck(
  sourcePresentationId: string,
  newTitle: string
): Promise<SlideCreateResult> {
  const response = await driveClient().files.copy({
    fileId: sourcePresentationId,
    requestBody: { name: newTitle },
  })

  const newId = response.data.id
  if (!newId) {
    throw new Error("Drive copy returned no file ID")
  }

  return {
    presentationId: newId,
    url: `https://docs.google.com/presentation/d/${newId}/view`,
  }
}

// ── Remove slides ───────────────────────────────────────────────────────────────

/**
 * Remove specific slides from a presentation by object ID.
 * Used to strip internal-only slides from client deck.
 */
export async function removeSlides(
  presentationId: string,
  slideObjectIds: string[]
): Promise<void> {
  const requests: slides_v1.Schema$Request[] = slideObjectIds.map(
    (objectId) => ({ deleteObject: { objectId } })
  )

  await slidesClient().presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  })
}

// ── Get slide IDs ───────────────────────────────────────────────────────────────

/**
 * Get all slide object IDs from a presentation.
 */
export async function getSlideIds(presentationId: string): Promise<string[]> {
  const response = await slidesClient().presentations.get({ presentationId })
  const slides = response.data.slides ?? []
  return slides
    .map((s) => s.objectId)
    .filter((id): id is string => id !== null && id !== undefined)
}

// ── Generate signed URL for GCS (Flow handoff) ─────────────────────────────────

import { Storage } from "@google-cloud/storage"
import type { Storage as StorageType } from "@google-cloud/storage"

let _gcs: StorageType | null = null

function gcsClient(): StorageType {
  if (!_gcs) {
    const keyJson = process.env["GCP_SERVICE_ACCOUNT_KEY"]
    const projectId = process.env["GCP_PROJECT_ID"] ?? ""
    if (keyJson) {
      _gcs = new Storage({
        projectId,
        credentials: JSON.parse(keyJson),
      })
    } else {
      _gcs = new Storage({ projectId })
    }
  }
  return _gcs
}

const GCS_BUCKET = process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802"

/**
 * Generate a signed URL for a GCS object with configurable expiry.
 * Used for Flow package handoff (48-hour expiry).
 */
export async function generateSignedUrl(
  objectPath: string,
  expiryHours: number = 48
): Promise<string> {
  const [url] = await gcsClient()
    .bucket(GCS_BUCKET)
    .file(objectPath)
    .getSignedUrl({
      action: "read",
      expires: Date.now() + expiryHours * 60 * 60 * 1000,
    })

  return url
}
