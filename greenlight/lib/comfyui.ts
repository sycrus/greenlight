/**
 * ComfyUI client — local image generation via ComfyUI REST API.
 *
 * ComfyUI runs locally (default http://localhost:8188).
 * Submits a prompt workflow, polls for completion, downloads the output.
 */

const COMFY_URL = process.env["COMFYUI_URL"] ?? "http://localhost:8188"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ComfyPromptResult {
  prompt_id: string
}

export interface ComfyOutputImage {
  filename: string
  subfolder: string
  type: string
}

export interface ComfyHistoryOutput {
  images: ComfyOutputImage[]
}

export interface ComfyHistoryEntry {
  prompt_id: string
  outputs: Record<string, ComfyHistoryOutput>
  status?: {
    completed: boolean
  }
}

export interface ImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  steps?: number
  cfg?: number
  seed?: number
}

export interface ImageGenerationResult {
  imageBuffer: Buffer
  filename: string
  /** Local URL for serving the image from /generated/ */
  localUrl: string
  costUsd: number
  model: string
}

// ── Workflow loading ────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "fs"
import { join } from "path"

const WORKFLOWS_DIR = join(process.cwd(), "comfyui", "workflows")

function loadWorkflow(name: string): Record<string, unknown> | null {
  const filePath = join(WORKFLOWS_DIR, name.endsWith(".json") ? name : `${name}.json`)
  if (!existsSync(filePath)) {
    console.warn(`[comfyui] Workflow not found: ${filePath}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"))
  } catch (err) {
    console.error(`[comfyui] Failed to parse workflow ${filePath}:`, err)
    return null
  }
}

function listWorkflows(): string[] {
  try {
    const { readdirSync } = require("fs")
    return readdirSync(WORKFLOWS_DIR).filter((f: string) => f.endsWith(".json"))
  } catch {
    return []
  }
}

// ── Submit prompt ──────────────────────────────────────────────────────────────

function buildDefaultWorkflow(options: ImageGenerationOptions) {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: options.seed ?? Math.floor(Math.random() * 9999999999),
        steps: options.steps ?? 20,
        cfg: options.cfg ?? 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: options.width ?? 1024,
        height: options.height ?? 1024,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: options.prompt,
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: options.negativePrompt ?? "ugly, blurry, low quality, distorted",
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "greenlight",
        images: ["8", 0],
      },
    },
  }
}

export interface ComfyPromptOptions extends ImageGenerationOptions {
  /** Name of a workflow JSON file in comfyui/workflows/ (without .json extension).
   * If provided, loads that workflow and injects the prompt into it. */
  workflow?: string
}

export async function submitPrompt(
  options: ComfyPromptOptions
): Promise<ComfyPromptResult> {
  let workflow: Record<string, unknown>

  if (options.workflow) {
    const loaded = loadWorkflow(options.workflow)
    if (!loaded) {
      throw new Error(`Workflow '${options.workflow}' not found in comfyui/workflows/`)
    }
    workflow = loaded
    // Inject prompt into the workflow if it has CLIPTextEncode nodes
    injectPrompt(workflow, options.prompt, options.negativePrompt)
  } else {
    workflow = buildDefaultWorkflow(options)
  }

  const body = JSON.stringify({ prompt: workflow })
  console.log(`[comfyui] Submitting to ${COMFY_URL}/prompt`)
  console.log(`[comfyui] Workflow: ${options.workflow ?? "built-in SDXL"}`)
  console.log(`[comfyui] Prompt: ${options.prompt.slice(0, 300)}${options.prompt.length > 300 ? "..." : ""}`)
  if (options.negativePrompt) {
    console.log(`[comfyui] Negative: ${options.negativePrompt.slice(0, 150)}`)
  }

  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[comfyui] Submit failed (${res.status}): ${text.slice(0, 300)}`)
    throw new Error(`ComfyUI prompt failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as ComfyPromptResult
  console.log(`[comfyui] Accepted — prompt_id: ${data.prompt_id}`)
  return data
}

/** Inject positive/negative prompts into CLIPTextEncode nodes in a workflow */
function injectPrompt(
  workflow: Record<string, unknown>,
  positive: string,
  negative?: string
): void {
  for (const [nodeId, node] of Object.entries(workflow)) {
    const n = node as Record<string, unknown>
    if (n["class_type"] === "CLIPTextEncode") {
      const meta = n["_meta"] as Record<string, string> | undefined
      const title = meta?.["title"] ?? ""
      const inputs = n["inputs"] as Record<string, unknown>
      if (title.includes("Positive")) {
        inputs["text"] = positive
        console.log(`[comfyui] Injected positive prompt into node ${nodeId}`)
      } else if (title.includes("Negative")) {
        inputs["text"] = negative ?? "ugly, blurry, low quality, distorted"
        console.log(`[comfyui] Injected negative prompt into node ${nodeId}`)
      }
    }
  }
}

// ── Poll for completion ────────────────────────────────────────────────────────

export async function waitForCompletion(
  promptId: string,
  maxWaitMs: number = 120_000,
  pollIntervalMs: number = 2000
): Promise<ComfyOutputImage[]> {
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${COMFY_URL}/history/${promptId}`)

    if (res.ok) {
      const data = (await res.json()) as Record<string, ComfyHistoryEntry>
      const entry = data[promptId]
      if (entry) {
        const images: ComfyOutputImage[] = []
        for (const [_nodeId, output] of Object.entries(entry.outputs)) {
          if (output.images) {
            images.push(...output.images)
          }
        }
        if (images.length > 0) {
          console.log(`[comfyui] Completed: ${images.length} image(s)`)
          return images
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`ComfyUI prompt ${promptId} timed out after ${maxWaitMs}ms`)
}

// ── Download image ─────────────────────────────────────────────────────────────

export async function downloadImage(
  output: ComfyOutputImage
): Promise<Buffer> {
  const params = new URLSearchParams({
    filename: output.filename,
    subfolder: output.subfolder,
    type: output.type,
  })

  const res = await fetch(`${COMFY_URL}/view?${params.toString()}`)

  if (!res.ok) {
    throw new Error(`ComfyUI download failed (${res.status}): ${output.filename}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ── Generate image (submit + poll + download) ──────────────────────────────────

export async function generateImage(
  options: ComfyPromptOptions
): Promise<ImageGenerationResult> {
  const { prompt_id } = await submitPrompt(options)
  const outputs = await waitForCompletion(prompt_id)
  const firstOutput = outputs[0]

  if (!firstOutput) {
    throw new Error("ComfyUI returned no images")
  }

  const imageBuffer = await downloadImage(firstOutput)

  // Save to public/generated/ for local serving (bypasses GCS moderation)
  const { writeFileSync, mkdirSync, existsSync } = await import("fs")
  const { join } = await import("path")
  const publicDir = join(process.cwd(), "public", "generated")
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true })
  }

  const localFilename = `comfy_${Date.now()}_${firstOutput.filename}`
  const localPath = join(publicDir, localFilename)
  writeFileSync(localPath, imageBuffer)

  const localUrl = `/generated/${localFilename}`
  console.log(`[comfyui] Saved to ${localPath} (${imageBuffer.length} bytes)`)

  return {
    imageBuffer,
    filename: firstOutput.filename,
    localUrl,
    costUsd: 0,
    model: "comfyui-local",
  }
}
