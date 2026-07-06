/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin", "@google-cloud/aiplatform"],
  },
}

export default config
