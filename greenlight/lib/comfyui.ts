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
  costUsd: number
  model: string
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

export async function submitPrompt(
  options: ImageGenerationOptions
): Promise<ComfyPromptResult> {
  const workflow = buildDefaultWorkflow(options)

  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ComfyUI prompt failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as ComfyPromptResult
  console.log(`[comfyui] Prompt submitted: ${data.prompt_id}`)
  return data
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
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  const { prompt_id } = await submitPrompt(options)
  const outputs = await waitForCompletion(prompt_id)
  const firstOutput = outputs[0]

  if (!firstOutput) {
    throw new Error("ComfyUI returned no images")
  }

  const imageBuffer = await downloadImage(firstOutput)

  return {
    imageBuffer,
    filename: firstOutput.filename,
    costUsd: 0, // Local — free
    model: "comfyui-local",
  }
}
