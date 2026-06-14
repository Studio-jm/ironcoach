import type { TrainingSession, TrainingWeek } from "@prisma/client"
import { addDays } from "date-fns"

const DAY_OFFSET: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export type PmcPoint = {
  date: string
  tss: number
  ctl: number // forme de fond (fitness)
  atl: number // fatigue récente
  tsb: number // fraîcheur (form) = ctl - atl
  isFuture: boolean
}

export type FitnessModel = {
  points: PmcPoint[]
  todayIndex: number // index du dernier jour passé (pour séparer réalisé / projeté)
  current: { ctl: number; atl: number; tsb: number } | null
}

type WeekWithSessions = TrainingWeek & { sessions: TrainingSession[] }

/**
 * Construit la série quotidienne de TSS :
 * - jours passés → TSS réalisé (séances COMPLETED/PARTIAL)
 * - jours futurs → TSS planifié (projection de la courbe)
 */
function buildDailyTSS(weeks: WeekWithSessions[], today: Date) {
  const realized = new Map<string, number>()
  const planned = new Map<string, number>()
  let minDate: Date | null = null
  let maxDate: Date | null = null

  for (const week of weeks) {
    for (const s of week.sessions) {
      const offset = DAY_OFFSET[s.day] ?? 0
      const date = addDays(new Date(week.startDate), offset)
      const key = dateKey(date)

      if (!minDate || date < minDate) minDate = date
      if (!maxDate || date > maxDate) maxDate = date

      planned.set(key, (planned.get(key) ?? 0) + s.plannedTSS)

      if (s.status === "COMPLETED") {
        realized.set(key, (realized.get(key) ?? 0) + (s.actualTSS ?? s.plannedTSS))
      } else if (s.status === "PARTIAL") {
        realized.set(key, (realized.get(key) ?? 0) + (s.actualTSS ?? Math.round(s.plannedTSS * 0.5)))
      }
    }
  }

  return { realized, planned, minDate, maxDate }
}

/**
 * Calcule le Performance Management Chart (CTL/ATL/TSB) jour par jour.
 * Formules impulse-response standard (constantes 42j / 7j).
 */
export function computeFitness(weeks: WeekWithSessions[], today = new Date()): FitnessModel {
  const { realized, planned, minDate, maxDate } = buildDailyTSS(weeks, today)
  if (!minDate || !maxDate) {
    return { points: [], todayIndex: -1, current: null }
  }

  const todayKey = dateKey(today)
  const points: PmcPoint[] = []
  let ctl = 0
  let atl = 0
  let todayIndex = -1

  let cursor = new Date(minDate)
  let i = 0
  while (cursor <= maxDate) {
    const key = dateKey(cursor)
    const isFuture = key > todayKey
    // Jour passé : TSS réalisé (0 si rien). Jour futur : TSS planifié (projection).
    const tss = isFuture ? (planned.get(key) ?? 0) : (realized.get(key) ?? 0)

    ctl = ctl + (tss - ctl) / 42
    atl = atl + (tss - atl) / 7
    const tsb = ctl - atl

    points.push({
      date: key,
      tss,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      isFuture,
    })

    if (!isFuture) todayIndex = i
    cursor = addDays(cursor, 1)
    i++
  }

  const current = todayIndex >= 0
    ? {
        ctl: points[todayIndex].ctl,
        atl: points[todayIndex].atl,
        tsb: points[todayIndex].tsb,
      }
    : null

  return { points, todayIndex, current }
}

/** Interprétation de la fraîcheur (TSB) pour l'athlète. */
export function interpretTSB(tsb: number): { label: string; tone: "fresh" | "neutral" | "tired" | "risk" } {
  if (tsb > 15) return { label: "Très frais (affûté)", tone: "fresh" }
  if (tsb > 5) return { label: "Frais", tone: "fresh" }
  if (tsb >= -10) return { label: "Équilibré", tone: "neutral" }
  if (tsb >= -30) return { label: "Fatigué (charge lourde)", tone: "tired" }
  return { label: "Surcharge — risque", tone: "risk" }
}
