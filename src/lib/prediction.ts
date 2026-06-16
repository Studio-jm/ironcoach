type EventType = "IRONMAN" | "HALF_IRONMAN" | "OLYMPIC" | "SPRINT"

const DISTANCES: Record<EventType, { swimM: number; bikeKm: number; runKm: number; transitionSec: number }> = {
  IRONMAN: { swimM: 3800, bikeKm: 180, runKm: 42.2, transitionSec: 12 * 60 },
  HALF_IRONMAN: { swimM: 1900, bikeKm: 90, runKm: 21.1, transitionSec: 8 * 60 },
  OLYMPIC: { swimM: 1500, bikeKm: 40, runKm: 10, transitionSec: 4 * 60 },
  SPRINT: { swimM: 750, bikeKm: 20, runKm: 5, transitionSec: 3 * 60 },
}

// Snapshot Strava agrégé (cf. buildAthleteSnapshot)
type DisciplineSummary = {
  count?: number
  totalDistanceKm?: number
  totalTimeHours?: number
}
type StravaSnapshot = {
  swim?: DisciplineSummary
  bike?: DisciplineSummary
  run?: DisciplineSummary
}

export type SplitPrediction = {
  discipline: "swim" | "bike" | "run" | "transition"
  seconds: number
  detail: string
}

export type RacePrediction = {
  available: boolean
  reason?: string
  // Estimation centrale (réaliste-prudente) + fourchette
  realisticSec: number
  optimisticSec: number
  conservativeSec: number
  splits: SplitPrediction[]
  confidence: "faible" | "moyenne" | "élevée"
  // 0-1 : à quel point la prépa est avancée (resserre la fourchette)
  readiness: number
  // Comparaison à l'objectif chiffré si défini
  goalSec: number | null
  goalVerdict: "ahead" | "on_track" | "behind" | null
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function paceFromSummary(s: DisciplineSummary | undefined) {
  if (!s || !s.totalDistanceKm || !s.totalTimeHours || s.totalDistanceKm <= 0) return null
  return {
    speedKmh: s.totalDistanceKm / s.totalTimeHours,
    secPerKm: (s.totalTimeHours * 3600) / s.totalDistanceKm,
    distanceKm: s.totalDistanceKm,
    count: s.count ?? 0,
  }
}

// Parse un objectif texte type "Sub 12h", "Sub 10h30" → secondes
function parseGoal(goal: string | null | undefined): number | null {
  if (!goal) return null
  const m = goal.match(/(\d{1,2})\s*h\s*(\d{0,2})/i)
  if (!m) return null
  const h = parseInt(m[1])
  const min = m[2] ? parseInt(m[2]) : 0
  return h * 3600 + min * 60
}

export function formatHMS(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.round(totalSec % 60)
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`
  return `${m}min${String(s).padStart(2, "0")}`
}

/**
 * Prédiction de chrono volontairement PRUDENTE.
 * - S'appuie sur les allures réelles Strava (12 sem.)
 * - Applique des facteurs d'effort course + fade endurance conservateurs
 * - La "readiness" (avancement du plan + forme CTL) resserre la fourchette
 *   et autorise un peu plus d'ambition, sans jamais devenir présomptueuse
 */
export function predictRaceTime(params: {
  eventType: EventType
  snapshot: StravaSnapshot | null
  ctl: number // forme actuelle (CTL)
  progress: number // 0-1 : semaines complétées / total
  targetGoal?: string | null
}): RacePrediction {
  const dist = DISTANCES[params.eventType]
  const swim = paceFromSummary(params.snapshot?.swim)
  const bike = paceFromSummary(params.snapshot?.bike)
  const run = paceFromSummary(params.snapshot?.run)

  // Sans aucune donnée d'allure exploitable → pas de prédiction
  if (!swim && !bike && !run) {
    return {
      available: false,
      reason: "Pas encore assez de données Strava pour estimer un chrono.",
      realisticSec: 0, optimisticSec: 0, conservativeSec: 0,
      splits: [], confidence: "faible", readiness: 0,
      goalSec: null, goalVerdict: null,
    }
  }

  // Readiness : combine avancement du plan et forme (CTL plafonné).
  // Bornée pour rester prudent même très en forme.
  const ctlNorm = clamp01(params.ctl / 80)
  const readiness = clamp01(0.55 * clamp01(params.progress) + 0.45 * ctlNorm)

  // Facteurs d'effort course (du plus prudent au moins prudent selon readiness).
  // Volontairement conservateurs pour éviter la frustration le jour J.
  const swimFactor = lerp(1.1, 1.0, readiness) // open water + continu = plus lent qu'à l'entraînement
  const bikeFactor = lerp(0.8, 0.92, readiness) // allure IM = endurance, sous la vitesse d'entraînement
  const runFactor = lerp(1.32, 1.13, readiness) // marathon après le vélo = grosse décote

  const splits: SplitPrediction[] = []

  // Valeurs par défaut prudentes si une discipline manque (basées sur des allures débutant/inter)
  const swimSecPerKm = swim ? swim.secPerKm * swimFactor : 130 * 10 // ~2:10/100m
  const bikeSpeed = bike ? bike.speedKmh * bikeFactor : 26 // 26 km/h prudent
  const runSecPerKm = run ? run.secPerKm * runFactor : 390 // 6:30/km prudent

  const swimSec = (dist.swimM / 1000) * swimSecPerKm
  const bikeSec = (dist.bikeKm / bikeSpeed) * 3600
  const runSec = dist.runKm * runSecPerKm

  splits.push({
    discipline: "swim",
    seconds: swimSec,
    detail: `${formatHMS(swimSec)} · ${Math.round((swimSecPerKm / 10))}s/100m`,
  })
  splits.push({
    discipline: "bike",
    seconds: bikeSec,
    detail: `${formatHMS(bikeSec)} · ${bikeSpeed.toFixed(1)} km/h`,
  })
  splits.push({
    discipline: "run",
    seconds: runSec,
    detail: `${formatHMS(runSec)} · ${Math.floor(runSecPerKm / 60)}:${String(Math.round(runSecPerKm % 60)).padStart(2, "0")}/km`,
  })
  splits.push({
    discipline: "transition",
    seconds: dist.transitionSec,
    detail: `${formatHMS(dist.transitionSec)} (T1 + T2)`,
  })

  const realisticSec = swimSec + bikeSec + runSec + dist.transitionSec

  // Fourchette : se resserre quand la readiness augmente
  const spread = lerp(0.1, 0.04, readiness) // ±10% tôt → ±4% près de la course
  const optimisticSec = realisticSec * (1 - spread)
  const conservativeSec = realisticSec * (1 + spread)

  // Confiance : volume de données + avancement
  const dataPoints = (swim?.count ?? 0) + (bike?.count ?? 0) + (run?.count ?? 0)
  let confidence: RacePrediction["confidence"] = "faible"
  if (dataPoints >= 30 && readiness > 0.5) confidence = "élevée"
  else if (dataPoints >= 12) confidence = "moyenne"

  // Objectif chiffré
  const goalSec = parseGoal(params.targetGoal)
  let goalVerdict: RacePrediction["goalVerdict"] = null
  if (goalSec) {
    if (optimisticSec <= goalSec) goalVerdict = "ahead"
    else if (realisticSec <= goalSec * 1.03) goalVerdict = "on_track"
    else goalVerdict = "behind"
  }

  return {
    available: true,
    realisticSec,
    optimisticSec,
    conservativeSec,
    splits,
    confidence,
    readiness,
    goalSec,
    goalVerdict,
  }
}
