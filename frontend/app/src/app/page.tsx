import { LandingPage } from "@/components/landing/LandingPage"

function generateSessionId(): string {
  return `session-${Date.now()}`
}

export default function HomePage() {
  const sessionId = generateSessionId()
  return <LandingPage sessionId={sessionId} />
}
