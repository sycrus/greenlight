/**
 * GET /api/comfyui-workflows
 *
 * Lists available ComfyUI workflow JSON files from comfyui/workflows/
 */

import { NextResponse } from "next/server"
import { readdirSync, existsSync } from "fs"
import { join } from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  try {
    const dir = join(process.cwd(), "comfyui", "workflows")
    if (!existsSync(dir)) {
      return NextResponse.json({ workflows: [] })
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
    return NextResponse.json({ workflows: files })
  } catch {
    return NextResponse.json({ workflows: [] })
  }
}
