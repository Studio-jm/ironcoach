import { prisma } from "@/lib/prisma"

const STRAVA_API = "https://www.strava.com/api/v3"
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"

async function refreshStravaToken(userId: string) {
  const token = await prisma.stravaToken.findUnique({ where: { userId } })
  if (!token) throw new Error("No Strava token found")

  if (token.expiresAt > new Date()) return token.accessToken

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  })

  if (!res.ok) throw new Error("Failed to refresh Strava token")

  const data = await res.json()

  await prisma.stravaToken.update({
    where: { userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at * 1000),
    },
  })

  return data.access_token as string
}

async function stravaFetch(userId: string, path: string, params?: Record<string, string>) {
  const token = await refreshStravaToken(userId)
  const url = new URL(`${STRAVA_API}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`Strava API error: ${res.status}`)
  return res.json()
}

export async function getAthleteProfile(userId: string) {
  return stravaFetch(userId, "/athlete")
}

export async function getAthleteStats(userId: string, athleteId: number) {
  return stravaFetch(userId, `/athletes/${athleteId}/stats`)
}

export async function getRecentActivities(userId: string, weeks = 12) {
  const after = Math.floor(Date.now() / 1000) - weeks * 7 * 24 * 3600
  return stravaFetch(userId, "/athlete/activities", {
    after: after.toString(),
    per_page: "200",
  })
}

// Activités entre deux dates (pour matcher une semaine d'entraînement)
export async function getActivitiesInRange(userId: string, start: Date, end: Date) {
  const after = Math.floor(start.getTime() / 1000) - 1
  const before = Math.floor(end.getTime() / 1000) + 1
  return stravaFetch(userId, "/athlete/activities", {
    after: after.toString(),
    before: before.toString(),
    per_page: "100",
  }) as Promise<StravaActivity[]>
}

export type StravaActivity = {
  id: number
  name: string
  type: string
  sport_type: string
  distance: number        // metres
  moving_time: number     // seconds
  elapsed_time: number
  total_elevation_gain: number
  average_speed: number
  average_heartrate?: number
  max_heartrate?: number
  suffer_score?: number
  start_date: string
  start_date_local?: string
  average_watts?: number
  weighted_average_watts?: number
}

// Résume les 12 dernières semaines pour l'analyse Claude
export async function buildAthleteSnapshot(userId: string) {
  const [profile, activities] = await Promise.all([
    getAthleteProfile(userId),
    getRecentActivities(userId, 12),
  ])

  const typed = activities as StravaActivity[]

  const byType = (sport: string[]) =>
    typed.filter((a) => sport.some((s) => a.sport_type?.toLowerCase().includes(s)))

  const summarize = (acts: StravaActivity[]) => ({
    count: acts.length,
    totalDistanceKm: +(acts.reduce((s, a) => s + a.distance, 0) / 1000).toFixed(1),
    totalTimeHours: +(acts.reduce((s, a) => s + a.moving_time, 0) / 3600).toFixed(1),
    avgDurationMin: acts.length
      ? +(acts.reduce((s, a) => s + a.moving_time, 0) / acts.length / 60).toFixed(0)
      : 0,
    avgHeartrate: acts.filter((a) => a.average_heartrate).length
      ? +(
          acts.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) /
          acts.filter((a) => a.average_heartrate).length
        ).toFixed(0)
      : null,
  })

  return {
    athlete: {
      firstname: profile.firstname,
      lastname: profile.lastname,
      sex: profile.sex,
      weight: profile.weight,
      ftp: profile.ftp,
    },
    period: "12 dernières semaines",
    swim: summarize(byType(["swim"])),
    bike: summarize(byType(["ride", "virtual"])),
    run: summarize(byType(["run"])),
    other: summarize(byType(["workout", "weight"])),
    rawActivityCount: typed.length,
  }
}
