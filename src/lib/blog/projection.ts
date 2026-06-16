import { prisma } from "@/lib/prisma"
import { addDays } from "date-fns"

const DAY_OFFSET: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
}

// discipline interne → vocabulaire blog (brief)
const SPORT_MAP: Record<string, string> = {
  swim: "natation",
  bike: "velo",
  run: "course",
  brick: "velo",
  strength: "muscu",
}

function mapStatut(status: string): string {
  // realise dès que la séance est faite/partielle ; sinon planifie.
  // (brouillon_genere / publie sont posés par le pipeline blog)
  if (status === "COMPLETED" || status === "PARTIAL") return "realise"
  return "planifie"
}

/**
 * Projette une séance d'entraînement dans la table partagée `seances`
 * (contrat de données consommé par le pipeline blog). Idempotent (upsert).
 */
export async function upsertBlogSeance(sessionId: string): Promise<void> {
  const s = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      week: {
        include: {
          plan: {
            select: {
              userId: true,
              name: true,
              targetEvent: true,
              targetGoal: true,
              targetDate: true,
              targetRaces: true,
            },
          },
        },
      },
    },
  })
  if (!s) return

  const date = addDays(new Date(s.week.startDate), DAY_OFFSET[s.day] ?? 0)
  const plan = s.week.plan

  const planPrevu = {
    discipline: s.discipline,
    durationMin: s.durationMin,
    zone: s.zone,
    description: s.description,
    plannedTSS: s.plannedTSS,
    source: s.source,
  }

  const dataRealisee =
    s.status === "COMPLETED" || s.status === "PARTIAL"
      ? {
          status: s.status,
          durationMin: s.actualDurationMin,
          distanceKm: s.actualDistanceKm,
          tss: s.actualTSS,
          avgHeartrate: s.avgHeartrate,
          feeling: s.feeling,
          fromStrava: s.stravaActivityId != null,
        }
      : undefined

  const contexteNarratif = {
    weekNumber: s.week.weekNumber,
    phase: s.week.phase,
    planName: plan.name,
    targetEvent: plan.targetEvent,
    targetGoal: plan.targetGoal,
    targetDate: plan.targetDate,
    races: plan.targetRaces ?? undefined,
  }

  const common = {
    userId: plan.userId,
    date,
    type: s.zone === "Z1" ? "recup" : "entrainement",
    sport: SPORT_MAP[s.discipline] ?? s.discipline,
    statut: mapStatut(s.status),
    planPrevu,
    dataRealisee: dataRealisee ?? undefined,
    compteRenduCoach: s.compteRendu,
    contexteNarratif,
    // notes athlète → mémo (le ressenti texte). Whisper viendra compléter.
    memoTranscription: s.notes,
  }

  await prisma.blogSeance.upsert({
    where: { sessionId },
    create: { sessionId, ...common },
    update: common,
  })
}
