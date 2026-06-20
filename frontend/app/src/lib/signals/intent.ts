/**
 * Rule-based intent signal classifier for Endava lead generation.
 *
 * User persona: technology leader (CTO, VP Eng, digital transformation owner)
 * self-qualifying before committing to a conversation. Not a retail customer.
 *
 * Classifies a chat message into structured signals and formats them as a
 * [intent_signals] block that the proxy appends to the message before Parlant
 * sees it. Parlant's GPT-4.1 guideline evaluation then has explicit signals to
 * work with rather than inferring them from raw text alone.
 *
 * No LLM call — zero latency overhead. Parlant is still the authoritative
 * intent router; these signals are supplementary context.
 */

export type IntentCategory =
  | "deck_request"            // "build me a deck / brief / slide summary"
  | "capability_exploration"  // "what do you do in AI / cloud / data?"
  | "proof_point_request"     // "show me case studies / examples in my space"
  | "pain_point_share"        // "we're struggling with legacy / scaling / migration"
  | "readiness_signal"        // "I'd like to talk / schedule a call"
  | "vertical_fit_check"      // "do you work with fintech / healthcare / retail?"
  | "competitive_evaluation"  // "what makes you different from X?"
  | "general_inquiry"         // fallback

export type Sentiment = "positive" | "neutral" | "skeptical"
export type Urgency = "high" | "normal"
export type QuestionType = "informational" | "transactional" | "navigational" | "statement"
export type Readiness = "exploring" | "evaluating" | "ready"

export interface IntentSignals {
  category: IntentCategory
  sentiment: Sentiment
  urgency: Urgency
  question_type: QuestionType
  readiness: Readiness
}

// Ordered by specificity — first match wins
const CATEGORY_PATTERNS: [IntentCategory, RegExp][] = [
  ["deck_request",           /\b(deck|brief|slide(s|deck)?|presentation|put (this|it|that) together|build (me )?(a )?(deck|brief|slide|summary)|show me (a )?(deck|brief|slide|summary)|give me (a )?(deck|brief|summary of)|summaris(e|ing)|summariz(e|ing)|structured (overview|summary)|pitch (deck)?)\b/i],
  ["readiness_signal",       /\b(speak to someone|talk to|schedule|book a call|get in touch|contact|set up a (call|meeting)|have a conversation|next steps?|how do i (start|get started)|reach out|request a (call|demo|meeting)|15.?minute)\b/i],
  ["proof_point_request",    /\b(case stud(y|ies)|example(s)?|portfolio|past work|previous (clients?|projects?)|success stor(y|ies)|have you worked (with|for)|show me|track record|results|evidence|proof|prove it|done (this|it) before|what have you (done|built|delivered)|asking for proof|need proof)\b/i],
  ["pain_point_share",       /\b(we('re| are) (struggling|trying|looking to|dealing with|facing)|our (challenge|problem|issue|team|system|infrastructure)|can't scale|legacy (system|code|infrastructure|platform)|technical debt|migration|modernis(e|ation)|moderniz(e|ation)|we need (help|to|a partner)|we('re| are) (behind|stuck|blocked))\b/i],
  ["competitive_evaluation", /\b(different from|better than|compared to|why (should i|endava|you|would)|what (sets you apart|makes you unique|differentiates)|vs\.?|versus|over other|alternative(s)?|competitors?|how do you compare)\b/i],
  ["vertical_fit_check",     /\b(financial services|fintech|banking|insurance|healthcare|retail|e-?commerce|telco|telecom|media|energy|manufacturing|logistics|supply chain|public sector|government|sectors? (you work|experience)|industry (experience|expertise)|do you (work with|have experience in|serve))\b/i],
  ["capability_exploration", /\b(what do you (do|offer|specialise|specialize)|tell me about (your|endava)|capabilities|services?|expertise|offerings|ai (and data|capabilities|practice)|cloud (modernisation|modernization|migration)|digital transformation|data engineering|platform engineering|devops|product development)\b/i],
  ["general_inquiry",        /.*/],
]

const POSITIVE  = /\b(impressive|exactly what we need|perfect fit|looks? (great|promising|good)|love what you do|strong (track record|portfolio)|that('s| is) (what|exactly))\b/i
const SKEPTICAL = /\b(not (sure|convinced)|skeptical|unconvinced|concern(s|ed)|worried about|doubt|seems? (expensive|risky|complex|too big)|not seeing|hard to believe|prove it|show me (the )?proof)\b/i

const URGENT = /\b(urgent(ly)?|asap|immediately|this (quarter|month|year)|q[1-4]\s?\d{0,4}|deadline|launching soon|go.?live|by end of|time.?sensitive|critical (timeline|deadline|need)|we need this (now|quickly|fast)|\d+.?month (timeline|deadline|window|timeframe)|on a (tight|short|aggressive) timeline|cto (is asking|wants|needs|asked)|board (is asking|wants|deadline))\b/i

const INFORMATIONAL  = /\b(what|how|when|where|which|who|why|tell me|explain|does|is there|can you (tell|explain|describe))\b/i
const TRANSACTIONAL  = /\b(i('d like to| want to| need to)|can you (help|set up|arrange)|let('s| us)|i('m| am) (interested|ready|looking to)|get started|move forward)\b/i
const NAVIGATIONAL   = /\b(where (can i|do i)|how do i (find|access|get to)|link to|page (for|about)|navigate)\b/i

const READY_PATTERNS: [Readiness, RegExp][] = [
  ["ready",      /\b(ready to|want to talk|schedule|book|next step|move forward|start a project|engage|let('s| us) (talk|connect|discuss))\b/i],
  ["evaluating", /\b(shortlist|compar(ing|e)|assess(ing)?|weigh(ing)?|consider(ing)?|narrow(ing)? down|evaluat(ing|e)|due diligence|RFP|RFI|vendor selection)\b/i],
  ["exploring",  /.*/],
]

export function classifyMessage(message: string): IntentSignals {
  const categoryMatch = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(message))
  const category: IntentCategory = categoryMatch?.[0] ?? "general_inquiry"

  const sentiment: Sentiment = SKEPTICAL.test(message) ? "skeptical"
    : POSITIVE.test(message) ? "positive"
    : "neutral"

  const urgency: Urgency = URGENT.test(message) ? "high" : "normal"

  let question_type: QuestionType = "statement"
  if (NAVIGATIONAL.test(message))        question_type = "navigational"
  else if (TRANSACTIONAL.test(message))  question_type = "transactional"
  else if (INFORMATIONAL.test(message))  question_type = "informational"

  const readinessMatch = READY_PATTERNS.find(([, pattern]) => pattern.test(message))
  const readiness: Readiness = readinessMatch?.[0] ?? "exploring"

  return { category, sentiment, urgency, question_type, readiness }
}

export function formatSignalsBlock(signals: IntentSignals): string {
  return (
    "[intent_signals]\n" +
    `category: ${signals.category}\n` +
    `sentiment: ${signals.sentiment}\n` +
    `urgency: ${signals.urgency}\n` +
    `question_type: ${signals.question_type}\n` +
    `readiness: ${signals.readiness}\n` +
    "[/intent_signals]"
  )
}

export function enrichMessage(message: string): string {
  return `${message}\n\n${formatSignalsBlock(classifyMessage(message))}`
}
