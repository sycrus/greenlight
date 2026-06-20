import { Document, Page, Text, View, Image, StyleSheet, Link, Font } from "@react-pdf/renderer"
import type { Slide } from "@gen-ux/design-system"

// Disable automatic hyphenation — let words wrap whole.
Font.registerHyphenationCallback((word) => [word])

// Poppins via Google Fonts GitHub TTF files.
// Font.register is idempotent — safe to call at module load time.
Font.register({
  family: "Poppins",
  fonts: [
    {
      src: "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf",
      fontWeight: 400,
    },
    {
      src: "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf",
      fontWeight: 600,
    },
    {
      src: "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf",
      fontWeight: 700,
    },
  ],
})

// 1440 × 1024 pt — widescreen presentation canvas
const W = 1440
const H = 1024
const PAD_H = 96   // horizontal padding
const PAD_V = 72   // vertical padding
const COL_GAP = 56
const COVER_LEFT_W = Math.round(W * 0.55)  // ~792

const CONTENT_W = W - PAD_H * 2          // 1248
const LEFT_W = Math.round(CONTENT_W * 0.52)   // ~648
const RIGHT_W = CONTENT_W - LEFT_W - COL_GAP  // ~544

const TAG_COLORS: Record<Slide["tag"], { bg: string; text: string; label: string }> = {
  "Problem":     { bg: "#FEF3C7", text: "#92400E",  label: "PROBLEM" },
  "Agitate":     { bg: "#FEE2E2", text: "#991B1B",  label: "AGITATE" },
  "Proof Point": { bg: "#DBEAFE", text: "#1E40AF",  label: "PROOF POINT" },
  "Solution":    { bg: "#EDE9FE", text: "#5B21B6",  label: "SOLUTION" },
  "Next Step":   { bg: "#D1FAE5", text: "#065F46",  label: "NEXT STEP" },
}

const s = StyleSheet.create({
  // ── Cover page ───────────────────────────────────────────────────────────────
  coverPage: {
    width: W,
    height: H,
    backgroundColor: "#122d38",
    fontFamily: "Poppins",
    flexDirection: "row",
  },
  coverLeft: {
    width: COVER_LEFT_W,
    flexDirection: "column",
    justifyContent: "center",
    paddingHorizontal: PAD_H,
    paddingVertical: PAD_V,
  },
  coverTitle: {
    fontSize: 60,
    fontWeight: 700,
    color: "white",
    lineHeight: 1.15,
    marginBottom: 28,
  },
  coverDate: {
    fontSize: 18,
    fontWeight: 600,
    color: "#e94e1b",
  },
  coverRight: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  // ── Content pages ────────────────────────────────────────────────────────────
  page: {
    width: W,
    height: H,
    backgroundColor: "#FFFFFF",
    fontFamily: "Poppins",
    paddingTop: PAD_V,
    paddingBottom: PAD_V + 40,  // extra space for footer dots
    paddingHorizontal: PAD_H,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  },
  deckTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  slideCounter: {
    fontSize: 11,
    fontWeight: 400,
    color: "#9CA3AF",
  },
  // Two-column body
  body: {
    flexDirection: "row",
    flex: 1,
    gap: COL_GAP,
  },
  leftCol: {
    width: LEFT_W,
    flexDirection: "column",
    justifyContent: "center",
  },
  rightCol: {
    width: RIGHT_W,
    flexDirection: "column",
    justifyContent: "center",
  },
  tagBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 24,
  },
  tagText: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.5,
  },
  headline: {
    fontSize: 48,
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.2,
    marginBottom: 20,
  },
  bodyText: {
    fontSize: 15,
    fontWeight: 400,
    color: "#4B5563",
    lineHeight: 1.75,
  },
  // Case study card
  caseStudyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    backgroundColor: "#F9FAFB",
  },
  ogImage: {
    width: RIGHT_W,
    height: Math.round(RIGHT_W / 1.91),  // 1200:630 OG aspect ratio
    objectFit: "cover",
    objectPosition: "top",
  },
  caseStudyBody: {
    padding: 20,
  },
  caseStudyTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#111827",
    marginBottom: 8,
  },
  caseStudyPreamble: {
    fontSize: 12,
    fontWeight: 400,
    color: "#6B7280",
    lineHeight: 1.65,
    marginBottom: 12,
  },
  caseStudyLink: {
    fontSize: 11,
    fontWeight: 600,
    color: "#2563EB",
    textDecoration: "none",
  },
  // Single-column body (no case study)
  singleCol: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    maxWidth: LEFT_W + COL_GAP + Math.round(RIGHT_W * 0.5),
  },
  // Stat callout (Problem / Agitate)
  statCallout: {
    marginTop: 24,
    marginBottom: 24,
  },
  statValue: {
    fontSize: 80,
    fontWeight: 700,
    color: "#e94e1b",
    lineHeight: 1,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: 400,
    color: "#4B5563",
    lineHeight: 1.4,
  },
  // Stat pills (Solution)
  statPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 28,
  },
  statPill: {
    borderWidth: 1,
    borderColor: "rgba(44,65,76,0.15)",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: "48%",
  },
  statPillValue: {
    fontSize: 32,
    fontWeight: 700,
    color: "#e94e1b",
    lineHeight: 1,
    marginBottom: 4,
  },
  statPillLabel: {
    fontSize: 12,
    fontWeight: 400,
    color: "#4B5563",
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: PAD_V,
    left: PAD_H,
    right: PAD_H,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerDot: {
    height: 6,
    borderRadius: 4,
    marginHorizontal: 4,
  },
})

export interface SlideDeckDocumentProps {
  title: string
  slides: Slide[]
  ogImages?: Record<string, string>         // caseStudy.url → base64 data URI
  coverImageDataUri?: string                // hero-shapes.png as base64 data URI
}

export function SlideDeckDocument({ title, slides, ogImages = {}, coverImageDataUri }: SlideDeckDocumentProps) {
  const totalPages = slides.length + 1  // cover + content slides
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  return (
    <Document title={title} author="Endava" creator="Gen UX">
      {/* ── Cover page ─────────────────────────────────────────────────────── */}
      <Page size={[W, H]} style={s.coverPage}>
        <View style={s.coverLeft}>
          <Text style={s.coverTitle}>{title}</Text>
          <Text style={s.coverDate}>{date}</Text>
        </View>
        <View style={s.coverRight}>
          {coverImageDataUri && (
            <Image
              src={coverImageDataUri}
              style={{ position: "absolute", right: 0, top: H * 0.05, height: H * 0.9, width: "auto" }}
            />
          )}
        </View>
      </Page>

      {/* ── Content slides ─────────────────────────────────────────────────── */}
      {slides.map((slide, i) => {
        const tag = TAG_COLORS[slide.tag]
        const imageDataUri = slide.caseStudy ? ogImages[slide.caseStudy.url] : undefined
        const hasCaseStudy = !!slide.caseStudy
        const pageNumber = i + 2  // cover is page 1

        return (
          <Page key={i} size={[W, H]} style={s.page}>
            {/* Header */}
            <View style={s.header}>
              <Text style={s.deckTitle}>{title}</Text>
              <Text style={s.slideCounter}>{pageNumber} / {totalPages}</Text>
            </View>

            {/* Body — two columns when a case study is present, single otherwise */}
            {hasCaseStudy ? (
              <View style={s.body}>
                {/* Left: tag + headline + body */}
                <View style={s.leftCol}>
                  <View style={[s.tagBadge, { backgroundColor: tag.bg }]}>
                    <Text style={[s.tagText, { color: tag.text }]}>{tag.label}</Text>
                  </View>
                  <Text style={s.headline}>{slide.headline}</Text>
                  <Text style={s.bodyText}>{slide.body}</Text>
                </View>

                {/* Right: case study card */}
                <View style={s.rightCol}>
                  <Link src={slide.caseStudy!.url} style={{ textDecoration: "none" }}>
                    <View style={s.caseStudyCard}>
                      {imageDataUri && (
                        <Image src={imageDataUri} style={s.ogImage} />
                      )}
                      <View style={s.caseStudyBody}>
                        <Text style={s.caseStudyTitle}>{slide.caseStudy!.title}</Text>
                        <Text style={s.caseStudyPreamble}>{slide.caseStudy!.preamble}</Text>
                        <Text style={s.caseStudyLink}>Read case study →</Text>
                      </View>
                    </View>
                  </Link>
                </View>
              </View>
            ) : (
              <View style={s.singleCol}>
                <View style={[s.tagBadge, { backgroundColor: tag.bg }]}>
                  <Text style={[s.tagText, { color: tag.text }]}>{tag.label}</Text>
                </View>
                <Text style={s.headline}>{slide.headline}</Text>

                {/* Stat callout between headline and body — Problem and Agitate */}
                {(slide.tag === "Problem" || slide.tag === "Agitate") && slide.stat && (
                  <View style={s.statCallout}>
                    <Text style={s.statValue}>{slide.stat.value}</Text>
                    <Text style={s.statLabel}>{slide.stat.label}</Text>
                  </View>
                )}

                <Text style={s.bodyText}>{slide.body}</Text>

                {/* Stat pills after body — Solution */}
                {slide.tag === "Solution" && slide.stats && slide.stats.length > 0 && (
                  <View style={s.statPillsRow}>
                    {slide.stats.map((st, j) => (
                      <View key={j} style={s.statPill}>
                        <Text style={s.statPillValue}>{st.value}</Text>
                        <Text style={s.statPillLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Footer dots — cover is dot 0, this slide is dot pageNumber-1 */}
            <View style={s.footer}>
              {Array.from({ length: totalPages }).map((_, j) => (
                <View
                  key={j}
                  style={[
                    s.footerDot,
                    {
                      width: j === pageNumber - 1 ? 24 : 6,
                      backgroundColor: j === pageNumber - 1 ? "#111827" : "#D1D5DB",
                    },
                  ]}
                />
              ))}
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
