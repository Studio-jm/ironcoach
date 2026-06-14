import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getRecentActivities } from "@/lib/strava/client"
import { generateWeekAdjustment } from "@/lib/ai/coach"
import type { StravaActivity } from "@/lib/strava/client"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const userId = session.user.id
  const body = await req.json()

  const {
    planId,
    weekId,
    fatigueScore,
    motivationScore,
    sorenessScore,
    sessionsDone,
    sessionsPlanned,
    notes = "",
    sickDays = 0,
    travelDays = 0,
  } = body

  const [currentWeek, nextWeek, plan] = await Promise.all([
    prisma.trainingWeek.findUnique({ where: { id: weekId } }),
    prisma.trainingWeek.findFirst({
      where: { planId, status: "UPCOMING" },
      orderBy: { weekNumber: "asc" },
    }),
    prisma.trainingPlan.findUnique({ where: { id: planId } }),
  ])

  if (!currentWeek || !nextWeek || !plan) {
    return NextResponse.json({ error: "Semaine introuvable" }, { status: 404 })
  }

  // Récupère les activités Strava de la semaine
  let recentActivities: StravaActivity[] = []
  const stravaToken = await prisma.stravaToken.findUnique({ where: { userId } })
  if (stravaToken) {
    try {
      recentActivities = (await getRecentActivities(userId, 1)) as StravaActivity[]
    } catch {
      // Continue sans Strava
    }
  }

  const adjustment = await generateWeekAdjustment({
    currentWeek: {
      weekNumber: currentWeek.weekNumber,
      phase: currentWeek.phase,
      sessions: currentWeek.plannedSessions,
    },
    nextWeekDraft: {
      weekNumber: nextWeek.weekNumber,
      phase: nextWeek.phase,
      sessions: nextWeek.plannedSessions,
    },
    checkIn: {
      fatigueScore,
      motivationScore,
      sorenessScore,
      sessionsDone,
      sessionsPlanned,
      notes,
      sickDays,
      travelDays,
    },
    externalRunPlan: plan.externalRunPlan as Parameters<typeof generateWeekAdjustment>[0]["externalRunPlan"],
    targetRaces: plan.targetRaces as Parameters<typeof generateWeekAdjustment>[0]["targetRaces"],
    strengthDays: plan.strengthDays,
    runManagementMode: plan.runManagementMode as "external_run" | "manage_run",
    recentStravaActivities: recentActivities.map((a) => ({
      type: a.sport_type,
      distanceKm: +(a.distance / 1000).toFixed(1),
      durationMin: Math.round(a.moving_time / 60),
      avgHr: a.average_heartrate,
      sufferScore: a.suffer_score,
    })) as Record<string, unknown>[],
  })

  // Construit les sessions de la semaine suivante
  type AiSession = {
    day: string; discipline: string; durationMin: number
    zone: string; description: string; tss: number
    source?: string; externalRef?: string | null
  }
  const dayOrder: Record<string, number> = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
    friday: 4, saturday: 5, sunday: 6,
  }
  const grouped = new Map<string, number>()
  const sessionsToCreate = (adjustment.adjustedSessions as AiSession[])
    .slice()
    .sort((a, b) => (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99))
    .map((s) => {
      const order = grouped.get(s.day) ?? 0
      grouped.set(s.day, order + 1)
      return {
        weekId: nextWeek.id,
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

  const [checkIn] = await prisma.$transaction([
    prisma.checkIn.create({
      data: {
        userId,
        planId,
        weekId,
        fatigueScore,
        motivationScore,
        sorenessScore,
        sessionsDone,
        sessionsPlanned,
        notes,
        sickDays,
        travelDays,
        aiAdjustment: adjustment.coachMessage,
        aiRationale: adjustment.rationale,
      },
    }),
    prisma.trainingWeek.update({
      where: { id: currentWeek.id },
      data: { status: "COMPLETED" },
    }),
    prisma.trainingSession.deleteMany({ where: { weekId: nextWeek.id } }),
    prisma.trainingSession.createMany({ data: sessionsToCreate }),
    prisma.trainingWeek.update({
      where: { id: nextWeek.id },
      data: {
        status: "CURRENT",
        plannedSessions: adjustment.adjustedSessions as object,
        plannedTSS: adjustment.plannedTSS,
        aiNotes: `${adjustment.rationale}\n\n${nextWeek.aiNotes ?? ""}`.trim(),
      },
    }),
  ])

  return NextResponse.json({ checkIn, adjustment })
}
