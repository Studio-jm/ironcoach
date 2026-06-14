"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

type SessionStatus = "PLANNED" | "COMPLETED" | "SKIPPED" | "PARTIAL"

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
