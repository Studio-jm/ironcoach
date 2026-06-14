import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import Link from "next/link"
import SessionCard from "@/components/SessionCard"
import InfoTooltip from "@/components/InfoTooltip"

const DAY_LABELS: Record<string, string> = {
  monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi",
  thursday: "Jeudi", friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche",
}

const DAYS_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  CURRENT: { label: "En cours", color: "bg-white text-black" },
  UPCOMING: { label: "À venir", color: "bg-zinc-800 text-zinc-400" },
  COMPLETED: { label: "Terminée", color: "bg-green-500/10 text-green-400" },
  SKIPPED: { label: "Sautée", color: "bg-red-500/10 text-red-400" },
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const userId = session.user.id
  const { week: weekParam } = await searchParams

  const activePlan = await prisma.trainingPlan.findFirst({
    where: { userId, status: "ACTIVE" },
    include: {
      weeks: {
        orderBy: { weekNumber: "asc" },
        include: {
          sessions: {
            orderBy: [{ day: "asc" }, { orderInDay: "asc" }],
          },
        },
      },
      _count: { select: { weeks: true, checkIns: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  if (!activePlan) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Aucun plan actif</h1>
          <p className="text-zinc-400">Crée ton premier plan d'entraînement</p>
        </div>
        <Link
          href="/onboarding"
          className="bg-white text-black font-semibold px-6 py-3 rounded-lg hover:bg-zinc-100 transition-colors"
        >
          Créer un plan
        </Link>
      </div>
    )
  }

  const requestedWeekNum = weekParam ? parseInt(weekParam) : null
  const selectedWeek =
    activePlan.weeks.find((w) => w.weekNumber === requestedWeekNum) ??
    activePlan.weeks.find((w) => w.status === "CURRENT") ??
    activePlan.weeks[0]

  const sessions = selectedWeek?.sessions ?? []
  const sessionsByDay = DAYS_ORDER.reduce<Record<string, typeof sessions>>((acc, day) => {
    acc[day] = sessions.filter((s) => s.day === day)
    return acc
  }, {})

  const weeksCompleted = activePlan._count.checkIns
  const isCurrentWeek = selectedWeek?.status === "CURRENT"
  const hasDetailedSessions = sessions.length > 0

  // Stats de la semaine sélectionnée
  const completedCount = sessions.filter((s) => s.status === "COMPLETED").length
  const skippedCount = sessions.filter((s) => s.status === "SKIPPED").length
  const partialCount = sessions.filter((s) => s.status === "PARTIAL").length
  const completionRate = sessions.length > 0
    ? Math.round(((completedCount + partialCount * 0.5) / sessions.length) * 100)
    : 0

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-zinc-500 text-sm">Plan actif</p>
            <h1 className="text-2xl font-bold">{activePlan.name}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {activePlan.targetEvent.replace("_", "-")} · {activePlan.targetGoal}
            </p>
          </div>
          <Link
            href="/onboarding"
            className="text-sm text-zinc-500 hover:text-white transition-colors"
          >
            + Nouveau plan
          </Link>
        </div>

        {/* Sélecteur de semaines */}
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Semaines</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6">
            {activePlan.weeks.map((w) => {
              const isSelected = w.id === selectedWeek?.id
              const hasSessions = w.sessions.length > 0
              return (
                <Link
                  key={w.id}
                  href={`/dashboard?week=${w.weekNumber}`}
                  className={`shrink-0 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-white text-black border-white"
                      : w.status === "CURRENT"
                      ? "bg-zinc-900 text-white border-zinc-700"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">S{w.weekNumber}</span>
                    {w.status === "CURRENT" && !isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                    {!hasSessions && (
                      <span className="opacity-50 text-[10px]">·</span>
                    )}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${isSelected ? "text-zinc-600" : "text-zinc-500"}`}>
                    {w.phase}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-zinc-900 rounded-xl p-3 space-y-1">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Semaine</p>
            <p className="text-base font-bold truncate">
              {selectedWeek ? `#${selectedWeek.weekNumber}` : "—"}
            </p>
          </div>

          <div className="bg-zinc-900 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Phase</p>
              <InfoTooltip title="Phases d'entraînement">
                <p>Le plan est divisé en phases de progression :</p>
                <ul className="space-y-0.5 mt-1">
                  <li>• <b>Base</b> : endurance fondamentale</li>
                  <li>• <b>Build</b> : intensité progressive</li>
                  <li>• <b>Peak</b> : charge maximale</li>
                  <li>• <b>Taper</b> : affûtage avant course</li>
                </ul>
              </InfoTooltip>
            </div>
            <p className="text-base font-bold truncate">{selectedWeek?.phase ?? "—"}</p>
          </div>

          <div className="bg-zinc-900 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide">TSS prévu</p>
              <InfoTooltip title="Training Stress Score">
                <p>
                  Mesure de la charge d&apos;entraînement, combinant durée et
                  intensité. <b>100 = 1h à effort maximal soutenable</b>.
                </p>
                <ul className="space-y-0.5 mt-1">
                  <li>• &lt;150 : séance facile</li>
                  <li>• 150-300 : séance dure</li>
                  <li>• &gt;300 : très dure (1-2j de récup)</li>
                </ul>
                <p className="mt-1.5 text-zinc-500">
                  Permet d&apos;éviter le surentraînement (+10% max/semaine).
                </p>
              </InfoTooltip>
            </div>
            <p className="text-base font-bold truncate">
              {selectedWeek?.plannedTSS ? Math.round(selectedWeek.plannedTSS).toString() : "—"}
            </p>
          </div>

          <div className="bg-zinc-900 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Complétion</p>
              <InfoTooltip title="Taux de complétion">
                <p>
                  Pourcentage des séances réalisées cette semaine. Les séances
                  partielles comptent pour 50%.
                </p>
                <p className="mt-1.5 text-zinc-500">
                  Claude utilise ce score au check-in pour ajuster la semaine
                  suivante.
                </p>
              </InfoTooltip>
            </div>
            <p className="text-base font-bold truncate">
              {hasDetailedSessions ? `${completionRate}%` : "—"}
            </p>
          </div>
        </div>

        {/* Statut */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedWeek && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${STATUS_LABELS[selectedWeek.status]?.color ?? ""}`}>
              {STATUS_LABELS[selectedWeek.status]?.label ?? selectedWeek.status}
            </span>
          )}
          {selectedWeek && (
            <span className="text-xs text-zinc-500">
              {formatDate(selectedWeek.startDate)} → {formatDate(selectedWeek.endDate)}
            </span>
          )}
          {hasDetailedSessions && (
            <span className="text-xs text-zinc-500 ml-auto">
              ✓ {completedCount} · ⊘ {skippedCount} · ⊙ {partialCount}
            </span>
          )}
        </div>

        {selectedWeek?.aiNotes && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Note du coach</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{selectedWeek.aiNotes}</p>
          </div>
        )}

        {/* Sessions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Programme de la semaine</h2>
            <div className="flex items-center gap-2">
              {hasDetailedSessions && selectedWeek && (
                <a
                  href={`/api/weeks/${selectedWeek.id}/ical`}
                  download
                  title="Exporter dans Apple Calendar / Google Calendar"
                  className="text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  📅 Calendrier
                </a>
              )}
              {isCurrentWeek && (
                <Link
                  href="/dashboard/checkin"
                  className="text-sm bg-white text-black font-medium px-4 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  Check-in
                </Link>
              )}
            </div>
          </div>

          {hasDetailedSessions ? (
            DAYS_ORDER.map((day) => {
              const daySessions = sessionsByDay[day]
              if (!daySessions?.length) return null
              return (
                <div key={day} className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">{DAY_LABELS[day]}</p>
                  {daySessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      id={s.id}
                      discipline={s.discipline}
                      durationMin={s.durationMin}
                      zone={s.zone}
                      description={s.description}
                      plannedTSS={s.plannedTSS}
                      status={s.status}
                      feeling={s.feeling}
                      source={s.source}
                      editable={isCurrentWeek || selectedWeek?.status === "COMPLETED"}
                    />
                  ))}
                </div>
              )
            })
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-6 text-center space-y-2">
              <p className="text-zinc-400 text-sm">
                Sessions non encore générées
              </p>
              <p className="text-zinc-600 text-xs">
                Cette semaine fait partie du squelette. Elle sera générée en détail à l&apos;approche, en fonction de tes progrès.
              </p>
            </div>
          )}
        </div>

        {/* Progression */}
        <div className="bg-zinc-900 rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium">Progression du plan</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-zinc-800 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all"
                style={{
                  width: `${Math.min(100, (weeksCompleted / activePlan.totalWeeks) * 100)}%`,
                }}
              />
            </div>
            <span className="text-sm text-zinc-400 shrink-0">
              {weeksCompleted} / {activePlan.totalWeeks} semaines
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
