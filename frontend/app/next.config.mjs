/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages
  transpilePackages: ["@gen-ux/design-system"],

  // @react-pdf/renderer uses internal async imports that conflict with
  // Next.js App Router's webpack. Externalising it makes Next.js load it
  // via Node.js require() instead — no webpack bundling, no chunk errors.
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
}

export default nextConfig
