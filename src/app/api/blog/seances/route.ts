import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// API consommée par le pipeline blog (WordPress/cron Infomaniak).
// Auth par token statique partagé (Bearer) — suffisant pour un usage perso.
function authorize(req: Request): boolean {
  const token = process.env.BLOG_API_TOKEN
  if (!token) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${token}`
}

// GET /api/blog/seances?statut=realise&limit=1
// Retourne les séances prêtes pour le blog. Par défaut : 1 séance "realise"
// complète et pas encore traitée (un tick de cron = une séance).
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const url = new URL(req.url)
  const statut = url.searchParams.get("statut") ?? "realise"
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "1") || 1, 50)

  const seances = await prisma.blogSeance.findMany({
    where: {
      statut,
      // "complète" = compte rendu présent (data + contexte le sont par construction)
      compteRenduCoach: { not: null },
    },
    orderBy: { date: "asc" },
    take: limit,
  })

  return NextResponse.json({ count: seances.length, seances })
}

// PATCH /api/blog/seances : le pipeline blog écrit ses sorties
// body: { sessionId, statut?, brouillonArticle?, articleFinal?, urlPubliee?, memoTranscription? }
export async function PATCH(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.sessionId) {
    return NextResponse.json({ error: "sessionId requis" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const f of ["statut", "brouillonArticle", "articleFinal", "urlPubliee", "memoTranscription"]) {
    if (body[f] !== undefined) data[f] = body[f]
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 })
  }

  try {
    const updated = await prisma.blogSeance.update({
      where: { sessionId: body.sessionId },
      data,
    })
    return NextResponse.json({ ok: true, seance: updated })
  } catch {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 })
  }
}
