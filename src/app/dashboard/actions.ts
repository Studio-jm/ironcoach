"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getActivitiesInRange } from "@/lib/strava/client"
import { matchActivitiesToSessions } from "@/lib/strava/matcher"

type SessionStatus = "PLANNED" | "COMPLETED" | "SKIPPED" | "PARTIAL"

export type SyncResult = {
  ok: boolean
  matched: number
  message: string
}

/**
 * Synchronise une semaine avec Strava : matche les activités aux séances
 * planifiées, préremplit les données réelles et valide automatiquement.
 * Ne touche que les séances encore non suivies (les validations manuelles priment).
 */
export async function syncWeekFromStrava(weekId: string): Promise<SyncResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, matched: 0, message: "Non autorisé" }

  const week = await prisma.trainingWeek.findUnique({
    where: { id: weekId },
    include: {
      sessions: true,
      plan: { select: { userId: true } },
    },
  })

  if (!week || week.plan.userId !== session.user.id) {
    return { ok: false, matched: 0, message: "Semaine introuvable" }
  }

  const stravaToken = await prisma.stravaToken.findUnique({
    where: { userId: session.user.id },
  })
  if (!stravaToken) {
    return { ok: false, matched: 0, message: "Strava non connecté" }
  }

  let activities
  try {
    activities = await getActivitiesInRange(session.user.id, week.startDate, week.endDate)
  } catch {
    return { ok: false, matched: 0, message: "Strava indisponible, réessaie" }
  }

  const updates = matchActivitiesToSessions(week.sessions, activities)

  if (updates.length === 0) {
    return {
      ok: true,
      matched: 0,
      message: activities.length === 0
        ? "Aucune activité Strava cette semaine"
        : "Aucune nouvelle séance à associer",
    }
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.trainingSession.update({
        where: { id: u.sessionId },
        data: {
          stravaActivityId: u.stravaActivityId,
          actualDurationMin: u.actualDurationMin,
          actualDistanceKm: u.actualDistanceKm,
          avgHeartrate: u.avgHeartrate,
          actualTSS: u.actualTSS,
          status: u.status,
          completedAt: new Date(),
        },
      })
    )
  )

  revalidatePath("/dashboard")
  return {
    ok: true,
    matched: updates.length,
    message: `${updates.length} séance${updates.length > 1 ? "s" : ""} synchronisée${updates.length > 1 ? "s" : ""} depuis Strava`,
  }
}

export async function updateSessionStatus(sessionId: string, status: SessionStatus) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Non autorisé")

  // Vérifie que la session appartient bien à l'utilisateur
  const trainingSession = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    include: { week: { include: { plan: { select: { userId: true } } } } },
  })

  if (!trainingSession || trainingSession.week.plan.userId !== session.user.id) {
    throw new Error("Session introuvable")
  }

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      status,
      completedAt: status === "COMPLETED" || status === "PARTIAL" ? new Date() : null,
    },
  })

  revalidatePath("/dashboard")
}

export async function setSessionFeeling(sessionId: string, feeling: number, notes?: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Non autorisé")

  const trainingSession = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    include: { week: { include: { plan: { select: { userId: true } } } } },
  })

  if (!trainingSession || trainingSession.week.plan.userId !== session.user.id) {
    throw new Error("Session introuvable")
  }

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { feeling, notes: notes ?? null },
  })

  revalidatePath("/dashboard")
}
