// Génération de fichier .ics (RFC 5545) pour Apple Calendar / Google Cal / Outlook

const DAY_TO_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
}

const DISCIPLINE_LABELS: Record<string, string> = {
  swim: "🏊 Natation",
  bike: "🚴 Vélo",
  run: "🏃 Course",
  brick: "⚡️ Brique (vélo + course)",
  strength: "💪 Renforcement",
}

// Heures par défaut selon le jour et l'ordre dans la journée
function getSessionTime(day: string, orderInDay: number): { hours: number; minutes: number } {
  const isWeekend = day === "saturday" || day === "sunday"

  if (isWeekend) {
    // Weekend : matin (8h) puis après-midi (14h)
    if (orderInDay === 0) return { hours: 8, minutes: 0 }
    return { hours: 14, minutes: 0 }
  }

  // Semaine : 7h du matin (avant le boulot) ou 18h (après) si plusieurs
  if (orderInDay === 0) return { hours: 7, minutes: 0 }
  return { hours: 18, minutes: 0 }
}

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

function formatICalDate(date: Date): string {
  // Format: YYYYMMDDTHHMMSS (heure locale, sans timezone explicite)
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}${m}${d}T${hh}${mm}${ss}`
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

type SessionForICal = {
  id: string
  day: string
  orderInDay: number
  discipline: string
  durationMin: number
  zone: string
  description: string
  plannedTSS: number
}

export function buildWeekICS(params: {
  weekStartDate: Date
  weekNumber: number
  phase: string
  sessions: SessionForICal[]
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IronCoach//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]

  for (const session of params.sessions) {
    const dayIndex = DAY_TO_INDEX[session.day] ?? 0
    const time = getSessionTime(session.day, session.orderInDay)

    const start = new Date(params.weekStartDate)
    start.setDate(start.getDate() + dayIndex)
    start.setHours(time.hours, time.minutes, 0, 0)

    const end = new Date(start)
    end.setMinutes(end.getMinutes() + session.durationMin)

    const summary = `${DISCIPLINE_LABELS[session.discipline] ?? session.discipline} — ${session.durationMin}min ${session.zone}`
    const description = [
      session.description,
      "",
      `Discipline : ${session.discipline}`,
      `Zone : ${session.zone}`,
      `Durée : ${session.durationMin} min`,
      `TSS : ${session.plannedTSS}`,
      `Semaine #${params.weekNumber} — ${params.phase}`,
      "",
      "Généré par IronCoach",
    ].join("\n")

    lines.push(
      "BEGIN:VEVENT",
      `UID:ironcoach-${session.id}@ironcoach.app`,
      `DTSTAMP:${formatICalDate(new Date())}`,
      `DTSTART:${formatICalDate(start)}`,
      `DTEND:${formatICalDate(end)}`,
      `SUMMARY:${escapeICalText(summary)}`,
      `DESCRIPTION:${escapeICalText(description)}`,
      `CATEGORIES:Sport,Triathlon,${session.discipline}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT",
    )
  }

  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}
