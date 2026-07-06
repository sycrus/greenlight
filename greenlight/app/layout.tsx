import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Greenlight — Pre-Production Intelligence",
  description: "Governed pre-production pipeline for short-form branded video.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  )
}
