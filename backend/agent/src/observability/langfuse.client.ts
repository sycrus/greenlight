import Langfuse from "langfuse"

let _client: Langfuse | null = null

export function getLangfuse(): Langfuse | null {
  const baseUrl = process.env["LANGFUSE_BASEURL"]
  const publicKey = process.env["LANGFUSE_PUBLIC_KEY"]
  const secretKey = process.env["LANGFUSE_SECRET_KEY"]

  if (!baseUrl || !publicKey || !secretKey) return null

  if (!_client) {
    _client = new Langfuse({ publicKey, secretKey, baseUrl, flushAt: 1 })
  }
  return _client
}
