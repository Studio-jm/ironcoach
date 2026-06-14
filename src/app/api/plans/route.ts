import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildAthleteSnapshot } from "@/lib/strava/client"
import { generateTrainingPlan } from "@/lib/ai/coach"
import { addWeeks, startOfWeek } from "date-fns"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const userId = session.user.id
  const body = await req.json()

  const {
    name,
    targetEvent = "IRONMAN",
    targetGoal = "Finisher",
    targetDate,
    startDate: requestedStartDate,
    weeklySwimHours = 2,
    weeklyBikeHours = 4,
    restDays = ["monday"],
    strengthDays = [],
    runManagementMode = "external_run",
    externalRunPlan = null,
    targetRaces = [],
  } = body

  const profile = await prisma.athleteProfile.findUnique({ where: { userId } })

  // Analyse Strava si token disponible
  let stravaSnapshot = profile?.stravaSnapshot ?? {}
  const stravaToken = await prisma.stravaToken.findUnique({ where: { userId } })
  if (stravaToken) {
    try {
      stravaSnapshot = await buildAthleteSnapshot(userId)
      await prisma.athleteProfile.upsert({
        where: { userId },
        create: { userId, stravaSnapshot },
        update: { stravaSnapshot },
      })
    } catch {
      // Strava indisponible — on continue sans
    }
  }

  // Date demandée par l'utilisateur, arrondie au lundi
  const baseDate = requestedStartDate ? new Date(requestedStartDate) : new Date()
  const startDate = startOfWeek(baseDate, { weekStartsOn: 1 })

  const aiPlan = await generateTrainingPlan({
    profile: {
      swimLevel: profile?.swimLevel ?? 5,
      bikeLevel: profile?.bikeLevel ?? 5,
      runLevel: profile?.runLevel ?? 5,
      weightKg: profile?.weightKg,
      gender: profile?.gender,
    },
    stravaSnapshot: stravaSnapshot as Record<string, unknown>,
    planConfig: {
      targetEvent,
      targetGoal,
      targetDate: targetDate ?? null,
      weeklySwimHours,
      weeklyBikeHours,
      restDays,
      strengthDays,
      startDate: startDate.toISOString(),
      runManagementMode,
    },
    externalRunPlan,
    targetRaces,
  })

  type AiSession = {
    day: string
    discipline: string
    durationMin: number
    zone: string
    description: string
    tss: number
    source?: string
    externalRef?: string | null
  }

  const buildSessionsCreate = (sessions: AiSession[]) => {
    const dayOrder: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
      friday: 4, saturday: 5, sunday: 6,
    }
    const grouped = new Map<string, number>()
    return sessions
      .slice()
      .sort((a, b) => (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99))
      .map((s) => {
        const order = grouped.get(s.day) ?? 0
        grouped.set(s.day, order + 1)
        return {
          day: s.day,
          orderInDay: order,
          discipline: s.discipline,
          durationMin: s.durationMin,
          zone: s.zone,
          description: s.description,
          plannedTSS: Math.round(s.tss ?? 0),
          source: s.source ?? "ai",
          externalRef: s.externalRef ?? null,
        }
      })
  }

  const allWeeks = [
    ...aiPlan.detailedWeeks.map((w) => ({
      weekNumber: w.weekNumber,
      phase: w.phase,
      startDate: addWeeks(startDate, w.weekNumber - 1),
      endDate: addWeeks(startDate, w.weekNumber),
      status: (w.weekNumber === 1 ? "CURRENT" : "UPCOMING") as "CURRENT" | "UPCOMING",
      plannedSessions: w.sessions as object,
      plannedTSS: w.plannedTSS,
      aiNotes: w.aiNotes,
      sessions: { create: buildSessionsCreate(w.sessions as AiSession[]) },
    })),
    ...aiPlan.skeletonWeeks.map((w) => ({
      weekNumber: w.weekNumber,
      phase: w.phase,
      startDate: addWeeks(startDate, w.weekNumber - 1),
      endDate: addWeeks(startDate, w.weekNumber),
      status: "UPCOMING" as const,
      plannedSessions: [] as object,
      plannedTSS: w.plannedTSS,
      aiNotes: null,
    })),
  ]

  // Historique des plans externes (pour mémoire long terme)
  const externalPlanHistory = externalRunPlan
    ? [{ uploadedAt: new Date().toISOString(), plan: externalRunPlan }]
    : []

  const plan = await prisma.trainingPlan.create({
    data: {
      userId,
      name,
      targetEvent,
      targetGoal,
      targetDate: targetDate ? new Date(targetDate) : null,
      overview: aiPlan.overview as object,
      totalWeeks: allWeeks.length,
      startDate,
      externalRunPlan,
      externalPlanHistory: externalPlanHistory.length > 0 ? externalPlanHistory : undefined,
      targetRaces: targetRaces.length > 0 ? targetRaces : undefined,
      strengthDays,
      runManagementMode,
      weeks: { create: allWeeks },
    },
    include: { weeks: { orderBy: { weekNumber: "asc" }, take: 4 } },
  })

  return NextResponse.json({ plan }, { status: 201 })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const plans = await prisma.trainingPlan.findMany({
    where: { userId: session.user.id },
    include: {
      weeks: {
        where: { status: "CURRENT" },
        take: 1,
      },
      _count: { select: { weeks: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ plans })
}
