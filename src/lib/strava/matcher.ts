import type { StravaActivity } from "./client"

// Mappe un sport_type Strava vers nos disciplines
export function stravaToDiscipline(sportType: string): string | null {
  const s = sportType.toLowerCase()
  if (s.includes("swim")) return "swim"
  if (s.includes("ride") || s.includes("velomobile") || s.includes("ebike")) return "bike"
  if (s.includes("run")) return "run"
  if (s.includes("weight") || s.includes("workout") || s.includes("crossfit") || s.includes("strength"))
    return "strength"
  return null
}

const DAYS_ORDER = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]

export type MatchableSession = {
  id: string
  day: string
  discipline: string
  durationMin: number
  plannedTSS: number
  status: string
  stravaActivityId: bigint | null
}

export type SessionUpdate = {
  sessionId: string
  stravaActivityId: bigint
  actualDurationMin: number
  actualDistanceKm: number
  avgHeartrate: number | null
  actualTSS: number
  status: "COMPLETED" | "PARTIAL"
}

/**
 * Associe les activités Strava aux séances planifiées d'une semaine.
 * - matche par jour + discipline
 * - ne touche que les séances encore PLANNED (les validations manuelles priment)
 * - une activité ne peut matcher qu'une seule séance
 */
export function matchActivitiesToSessions(
  sessions: MatchableSession[],
  activities: StravaActivity[]
): SessionUpdate[] {
  const updates: SessionUpdate[] = []
  const usedActivityIds = new Set<number>()

  // Séances candidates : non encore suivies et sans activité déjà liée
  const candidates = sessions.filter((s) => s.status === "PLANNED" && !s.stravaActivityId)

  for (const session of candidates) {
    const match = activities.find((a) => {
      if (usedActivityIds.has(a.id)) return false
      const disc = stravaToDiscipline(a.sport_type)
      // start_date_local = heure locale de l'athlète (jour d'entraînement fiable)
      const activityDay = DAYS_ORDER[new Date(a.start_date_local ?? a.start_date).getUTCDay()]
      // Pour une brique, on accepte vélo ou course
      const disciplineMatch =
        session.discipline === "brick"
          ? disc === "bike" || disc === "run"
          : disc === session.discipline
      return disciplineMatch && activityDay === session.day
    })

    if (!match) continue
    usedActivityIds.add(match.id)

    const actualDurationMin = Math.round(match.moving_time / 60)
    const actualDistanceKm = +(match.distance / 1000).toFixed(1)
    const avgHeartrate = match.average_heartrate ? Math.round(match.average_heartrate) : null

    // TSS réel : suffer_score si dispo, sinon estimation au prorata de la durée
    let actualTSS: number
    if (match.suffer_score != null) {
      actualTSS = Math.round(match.suffer_score)
    } else if (session.durationMin > 0) {
      actualTSS = Math.round(session.plannedTSS * (actualDurationMin / session.durationMin))
    } else {
      actualTSS = session.plannedTSS
    }

    // Statut : COMPLETED si >= 70% de la durée prévue, sinon PARTIAL
    const ratio = session.durationMin > 0 ? actualDurationMin / session.durationMin : 1
    const status = ratio >= 0.7 ? "COMPLETED" : "PARTIAL"

    updates.push({
      sessionId: session.id,
      stravaActivityId: BigInt(match.id),
      actualDurationMin,
      actualDistanceKm,
      avgHeartrate,
      actualTSS,
      status,
    })
  }

  return updates
}
