import type { TrainingSession } from "@prisma/client"

const DISCIPLINE_LABELS: Record<string, string> = {
  swim: "Natation",
  bike: "Vélo",
  run: "Course",
  brick: "Brique",
  strength: "Renforcement",
}

export type DisciplineBreakdown = {
  discipline: string
  label: string
  planned: number
  completed: number
  partial: number
  skipped: number
  untracked: number // séances laissées en PLANNED (ni validées ni sautées)
}

export type WeekBreakdown = {
  totalPlanned: number
  totalCompleted: number // COMPLETED uniquement
  totalPartial: number
  totalSkipped: number
  totalUntracked: number
  // Compliance pondérée : COMPLETED = 1, PARTIAL = 0.5
  compliancePct: number
  // TSS planifié vs réalisé (pondéré)
  plannedTSS: number
  realizedTSS: number
  byDiscipline: DisciplineBreakdown[]
  // Détail séance par séance pour le coach
  sessions: {
    discipline: string
    day: string
    description: string
    status: string
    plannedTSS: number
    feeling: number | null
  }[]
}

/**
 * Calcule le bilan d'une semaine à partir des séances réellement validées
 * par l'athlète (boutons fait/partiel/sauté du dashboard).
 */
export function computeWeekBreakdown(sessions: TrainingSession[]): WeekBreakdown {
  const byDisciplineMap = new Map<string, DisciplineBreakdown>()

  let totalCompleted = 0
  let totalPartial = 0
  let totalSkipped = 0
  let totalUntracked = 0
  let plannedTSS = 0
  let realizedTSS = 0

  for (const s of sessions) {
    plannedTSS += s.plannedTSS

    if (!byDisciplineMap.has(s.discipline)) {
      byDisciplineMap.set(s.discipline, {
        discipline: s.discipline,
        label: DISCIPLINE_LABELS[s.discipline] ?? s.discipline,
        planned: 0,
        completed: 0,
        partial: 0,
        skipped: 0,
        untracked: 0,
      })
    }
    const d = byDisciplineMap.get(s.discipline)!
    d.planned += 1

    switch (s.status) {
      case "COMPLETED":
        totalCompleted += 1
        d.completed += 1
        realizedTSS += s.plannedTSS
        break
      case "PARTIAL":
        totalPartial += 1
        d.partial += 1
        realizedTSS += s.plannedTSS * 0.5
        break
      case "SKIPPED":
        totalSkipped += 1
        d.skipped += 1
        break
      default: // PLANNED = non suivi
        totalUntracked += 1
        d.untracked += 1
    }
  }

  const totalPlanned = sessions.length
  // Compliance basée uniquement sur les séances suivies (on ignore les untracked
  // pour ne pas pénaliser un athlète qui a juste oublié de cocher)
  const tracked = totalCompleted + totalPartial + totalSkipped
  const compliancePct =
    tracked > 0
      ? Math.round(((totalCompleted + totalPartial * 0.5) / tracked) * 100)
      : 0

  return {
    totalPlanned,
    totalCompleted,
    totalPartial,
    totalSkipped,
    totalUntracked,
    compliancePct,
    plannedTSS: Math.round(plannedTSS),
    realizedTSS: Math.round(realizedTSS),
    byDiscipline: Array.from(byDisciplineMap.values()),
    sessions: sessions.map((s) => ({
      discipline: s.discipline,
      day: s.day,
      description: s.description,
      status: s.status,
      plannedTSS: s.plannedTSS,
      feeling: s.feeling,
    })),
  }
}
