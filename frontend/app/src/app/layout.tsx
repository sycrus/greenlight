import type { Metadata } from "next"
import { Poppins } from "next/font/google"
import "./globals.css"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: "Gen UX — Agentic AI Platform",
  description: "Generative UI powered by LangGraph and Parlant",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={poppins.variable}>
        {/* TODO (phase 2): wrap with <CopilotKit url="/api/copilotkit"> provider */}
        {children}
      </body>
    </html>
  )
}
