import Anthropic from "@anthropic-ai/sdk"
import { IRONMAN_SYSTEM_PROMPT, buildPlanPrompt, buildCheckInPrompt } from "./prompts"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// claude-sonnet-4-5 = bon ratio qualité/prix pour génération de plans
// Pour plus de qualité, passer à claude-opus-4-5 (5x plus cher)
const MODEL = "claude-sonnet-4-5"

async function callClaude(userMessage: string, maxTokens = 16384): Promise<string> {
  // Streaming requis par le SDK pour les requêtes longues
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system: IRONMAN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  })

  const finalMessage = await stream.finalMessage()

  if (finalMessage.stop_reason === "max_tokens") {
    console.warn("[claude] Response was truncated. Consider increasing max_tokens.")
  }

  const block = finalMessage.content[0]
  if (block.type !== "text") throw new Error("Unexpected response type")
  return block.text
}

function parseJSON(raw: string): unknown {
  // Tente d'abord d'extraire le contenu entre ```json ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    return JSON.parse(fenced[1].trim())
  }

  // Sinon — fallback robuste : trouve le premier { et le dernier }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.substring(firstBrace, lastBrace + 1))
  }

  // Dernier recours
  return JSON.parse(raw.trim())
}

export async function generateTrainingPlan(params: Parameters<typeof buildPlanPrompt>[0]) {
  const prompt = buildPlanPrompt(params)
  // Overview + 4 semaines détaillées + squelette = ~10-14K tokens (avec Campus Coach)
  const raw = await callClaude(prompt, 20000)
  return parseJSON(raw) as {
    overview: Record<string, unknown>
    detailedWeeks: Array<{
      weekNumber: number
      phase: string
      plannedTSS: number
      aiNotes: string
      sessions: Array<{
        day: string
        discipline: string
        durationMin: number
        zone: string
        description: string
        tss: number
        source?: string
        externalRef?: string | null
      }>
    }>
    skeletonWeeks: Array<{
      weekNumber: number
      phase: string
      plannedTSS: number
    }>
  }
}

export async function generateWeekAdjustment(params: Parameters<typeof buildCheckInPrompt>[0]) {
  const prompt = buildCheckInPrompt(params)
  // Une seule semaine — 4096 tokens largement suffisant
  const raw = await callClaude(prompt, 4096)
  return parseJSON(raw) as {
    adjustment: "normal" | "reduce" | "increase" | "recovery"
    rationale: string
    adjustedSessions: unknown[]
    plannedTSS: number
    coachMessage: string
  }
}
