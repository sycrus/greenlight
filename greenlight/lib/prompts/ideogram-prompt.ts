/**
 * Ideogram prompt assembly — converts Visual DNA ingredients into
 * structured prompts with bbox positioning for ComfyUI/Ideogram.
 */

export interface IdeogramElement {
  type: "char" | "loc" | "obj"
  bbox: [number, number, number, number] // [x, y, width, height]
  desc: string
}

export interface IdeogramPrompt {
  high_level_description: string
  style_description: {
    aesthetics: string
    lighting: string
    photo: string
    medium: string
    color_palette: string[]
  }
  compositional_deconstruction: {
    background: string
    elements: IdeogramElement[]
  }
}

/**
 * Build an Ideogram-format prompt from a single ingredient for a product/reference shot.
 * For storyboards, use buildScenePrompt instead.
 */
export function buildIngredientPrompt(params: {
  description: string
  flowPrompt: string
  palette: string[]
  cinematography: {
    style: string
    lighting: string
    shotTypes: string[]
  }
  negativePrompts: string[]
}): IdeogramPrompt {
  const shot = params.cinematography.shotTypes[0] ?? "medium shot"
  const lens = params.cinematography.style.includes("macro") ? "100mm macro, f/2.8"
    : params.cinematography.style.includes("handheld") ? "35mm, f/2.0"
    : "85mm, f/2.0"

  return {
    high_level_description: `${params.description}. ${params.flowPrompt}`,
    style_description: {
      aesthetics: params.cinematography.style + ", photorealistic, professional",
      lighting: params.cinematography.lighting,
      photo: `${lens}, detailed texture, cinematic depth of field`,
      medium: "photograph",
      color_palette: params.palette.length >= 3 ? params.palette.slice(0, 6) : [
        ...params.palette,
        "#1A1A1A", "#FFFFFF", "#888888",
      ].slice(0, 6),
    },
    compositional_deconstruction: {
      background: `Studio or environmental backdrop matching ${params.cinematography.style} aesthetic`,
      elements: [{
        type: "obj",
        bbox: [128, 128, 768, 768], // center subject
        desc: params.description,
      }],
    },
  }
}

/**
 * Build a storyboard scene prompt from a scene brief + Visual DNA context.
 */
export function buildScenePrompt(params: {
  sceneDescription: string
  territoryName: string
  palette: string[]
  cinematography: {
    style: string
    lighting: string
    shotTypes: string[]
  }
  characters: string[]
  location: string
}): IdeogramPrompt {
  return {
    high_level_description: `${params.sceneDescription}. Territory: ${params.territoryName}.`,
    style_description: {
      aesthetics: params.cinematography.style + ", cinematic, professional",
      lighting: params.cinematography.lighting,
      photo: "35mm, f/2.8, detailed texture, cinematic depth of field",
      medium: "photograph",
      color_palette: params.palette.length >= 3 ? params.palette.slice(0, 6) : [
        ...params.palette, "#1A1A1A", "#FFFFFF",
      ].slice(0, 6),
    },
    compositional_deconstruction: {
      background: params.location,
      elements: params.characters.map((char, i) => ({
        type: "char" as const,
        bbox: positionCharacter(i, params.characters.length),
        desc: char,
      })),
    },
  }
}

function positionCharacter(index: number, total: number): [number, number, number, number] {
  // Spread characters across the frame
  const positions: [number, number, number, number][] = [
    [100, 200, 350, 500],   // left third
    [350, 150, 400, 600],   // center
    [600, 200, 350, 500],   // right third
  ]
  return positions[index] ?? [256, 200, 512, 600]
}
