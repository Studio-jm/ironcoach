import type { TrainingSession, TrainingWeek, CheckIn } from "@prisma/client"
import { computeWeekBreakdown } from "@/lib/sessions"

const DISCIPLINE_LABELS: Record<string, string> = {
  swim: "Natation",
  bike: "Vélo",
  run: "Course",
  brick: "Brique",
  strength: "Renforcement",
}

export type WeekTrendPoint = {
  weekNumber: number
  phase: string
  fatigue: number | null
  motivation: number | null
  soreness: number | null
  compliancePct: number
  plannedTSS: number
  realizedTSS: number
  byDiscipline: { discipline: string; compliancePct: number; planned: number }[]
}

export type DisciplineConcern = {
  discipline: string
  label: string
  recentCompliance: number[] // du plus ancien au plus récent
  avgCompliance: number
}

export type Trends = {
  weekCount: number
  perWeek: WeekTrendPoint[]
  // Tendances récentes (max 4 dernières semaines complétées)
  fatigueTrend: number[]
  complianceTrend: number[]
  loadTrend: number[]
  // Modèle de charge simplifié (hebdomadaire)
  chronicLoad: number // moyenne TSS réalisé sur les 4 dernières semaines (forme de fond)
  acuteLoad: number // TSS réalisé de la dernière semaine (fatigue récente)
  rampRatePct: number // variation de charge semaine sur semaine
  // Alertes
  fatigueRising: boolean
  loadRampingTooFast: boolean
  disciplineConcerns: DisciplineConcern[]
  // Mémoire : dernières décisions du coach
  recentCoachNotes: { weekNumber: number; rationale: string }[]
}

type WeekWithData = TrainingWeek & {
  sessions: TrainingSession[]
  checkIn: CheckIn | null
}

/**
 * Calcule les tendances sur l'historique des semaines complétées.
 * Sert à donner au coach une vision long terme (fatigue, charge, disciplines).
 */
export function computeTrends(completedWeeks: WeekWithData[]): Trends {
  const ordered = [...completedWeeks].sort((a, b) => a.weekNumber - b.weekNumber)

  const perWeek: WeekTrendPoint[] = ordered.map((w) => {
    const breakdown = computeWeekBreakdown(w.sessions)
    return {
      weekNumber: w.weekNumber,
      phase: w.phase,
      fatigue: w.checkIn?.fatigueScore ?? null,
      motivation: w.checkIn?.motivationScore ?? null,
      soreness: w.checkIn?.sorenessScore ?? null,
      compliancePct: breakdown.compliancePct,
      plannedTSS: breakdown.plannedTSS,
      realizedTSS: w.actualTSS != null ? Math.round(w.actualTSS) : breakdown.realizedTSS,
      byDiscipline: breakdown.byDiscipline.map((d) => ({
        discipline: d.discipline,
        planned: d.planned,
        compliancePct:
          d.planned > 0
            ? Math.round(((d.completed + d.partial * 0.5) / d.planned) * 100)
            : 0,
      })),
    }
  })

  const last4 = perWeek.slice(-4)
  const fatigueTrend = last4.map((w) => w.fatigue).filter((v): v is number => v != null)
  const complianceTrend = last4.map((w) => w.compliancePct)
  const loadTrend = last4.map((w) => w.realizedTSS)

  const chronicLoad =
    loadTrend.length > 0
      ? Math.round(loadTrend.reduce((s, v) => s + v, 0) / loadTrend.length)
      : 0
  const acuteLoad = loadTrend.length > 0 ? loadTrend[loadTrend.length - 1] : 0

  // Ramp rate : variation entre la dernière semaine et la précédente
  let rampRatePct = 0
  if (loadTrend.length >= 2) {
    const prev = loadTrend[loadTrend.length - 2]
    const curr = loadTrend[loadTrend.length - 1]
    if (prev > 0) rampRatePct = Math.round(((curr - prev) / prev) * 100)
  }

  // Fatigue en hausse : 3 dernières valeurs croissantes
  const fatigueRising =
    fatigueTrend.length >= 3 &&
    fatigueTrend[fatigueTrend.length - 1] >= fatigueTrend[fatigueTrend.length - 2] &&
    fatigueTrend[fatigueTrend.length - 2] >= fatigueTrend[fatigueTrend.length - 3] &&
    fatigueTrend[fatigueTrend.length - 1] - fatigueTrend[0] >= 2

  const loadRampingTooFast = rampRatePct > 10

  // Disciplines à surveiller : compliance moyenne < 70% sur les dernières semaines
  const disciplineMap = new Map<string, number[]>()
  for (const w of last4) {
    for (const d of w.byDiscipline) {
      if (d.discipline === "strength") continue // renfo géré par l'athlète
      if (!disciplineMap.has(d.discipline)) disciplineMap.set(d.discipline, [])
      disciplineMap.get(d.discipline)!.push(d.compliancePct)
    }
  }
  const disciplineConcerns: DisciplineConcern[] = []
  for (const [discipline, values] of disciplineMap) {
    if (values.length < 2) continue
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length)
    if (avg < 70) {
      disciplineConcerns.push({
        discipline,
        label: DISCIPLINE_LABELS[discipline] ?? discipline,
        recentCompliance: values,
        avgCompliance: avg,
      })
    }
  }

  const recentCoachNotes = ordered
    .slice(-3)
    .filter((w) => w.checkIn?.aiRationale)
    .map((w) => ({ weekNumber: w.weekNumber, rationale: w.checkIn!.aiRationale! }))

  return {
    weekCount: perWeek.length,
    perWeek,
    fatigueTrend,
    complianceTrend,
    loadTrend,
    chronicLoad,
    acuteLoad,
    rampRatePct,
    fatigueRising,
    loadRampingTooFast,
    disciplineConcerns,
    recentCoachNotes,
  }
}

/** Génère le bloc texte des tendances pour le prompt du coach. */
export function renderTrendsForPrompt(t: Trends): string {
  if (t.weekCount === 0) return ""

  const lines: string[] = [`\n## Tendances sur ${t.weekCount} semaine(s) complétée(s)`]

  if (t.fatigueTrend.length > 0)
    lines.push(`- Fatigue (récent → ancien inversé) : ${t.fatigueTrend.join(" → ")}/10`)
  if (t.complianceTrend.length > 0)
    lines.push(`- Compliance : ${t.complianceTrend.join("% → ")}%`)
  if (t.loadTrend.length > 0)
    lines.push(`- Charge réalisée (TSS) : ${t.loadTrend.join(" → ")}`)

  lines.push(
    `- Charge de fond (chronic, moy. 4 sem.) : ${t.chronicLoad} · Charge récente (acute) : ${t.acuteLoad} · Ramp : ${t.rampRatePct > 0 ? "+" : ""}${t.rampRatePct}%`
  )

  if (t.fatigueRising)
    lines.push(`- ⚠️ ALERTE : fatigue en hausse continue → envisage une semaine de récupération proactive`)
  if (t.loadRampingTooFast)
    lines.push(`- ⚠️ ALERTE : charge en hausse trop rapide (>10%/sem) → plafonne la progression`)

  if (t.disciplineConcerns.length > 0) {
    lines.push(`\n### Disciplines à retravailler (compliance faible récurrente)`)
    for (const d of t.disciplineConcerns) {
      lines.push(
        `- ${d.label} : ${d.recentCompliance.join("% → ")}% (moy. ${d.avgCompliance}%) → repense le placement ou réduis le volume plutôt que de répéter le même format`
      )
    }
  }

  if (t.recentCoachNotes.length > 0) {
    lines.push(`\n### Tes décisions récentes (pour cohérence)`)
    for (const n of t.recentCoachNotes) {
      lines.push(`- Semaine ${n.weekNumber} : ${n.rationale}`)
    }
  }

  return lines.join("\n")
}
