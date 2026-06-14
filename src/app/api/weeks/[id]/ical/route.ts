import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildWeekICS } from "@/lib/ical"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params

  const week = await prisma.trainingWeek.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: [{ day: "asc" }, { orderInDay: "asc" }] },
      plan: { select: { userId: true, name: true } },
    },
  })

  if (!week || week.plan.userId !== session.user.id) {
    return new Response("Not found", { status: 404 })
  }

  if (week.sessions.length === 0) {
    return new Response("No sessions to export", { status: 400 })
  }

  const ics = buildWeekICS({
    weekStartDate: week.startDate,
    weekNumber: week.weekNumber,
    phase: week.phase,
    sessions: week.sessions.map((s) => ({
      id: s.id,
      day: s.day,
      orderInDay: s.orderInDay,
      discipline: s.discipline,
      durationMin: s.durationMin,
      zone: s.zone,
      description: s.description,
      plannedTSS: s.plannedTSS,
    })),
  })

  const filename = `ironcoach-semaine-${week.weekNumber}.ics`

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
