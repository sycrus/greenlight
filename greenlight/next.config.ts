import type { NextConfig } from "next"

const config: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin", "@google-cloud/aiplatform"],
  },
}

export default config
