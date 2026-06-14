"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Step = "loading" | "form" | "submitting" | "done"

type ScoreFieldKey = "fatigueScore" | "motivationScore" | "sorenessScore"

const SCORE_FIELDS: { key: ScoreFieldKey; label: string; lowLabel: string; highLabel: string }[] = [
  { key: "fatigueScore", label: "Niveau de fatigue", lowLabel: "Épuisé", highLabel: "Frais" },
  { key: "motivationScore", label: "Motivation", lowLabel: "À plat", highLabel: "Ultra motivé" },
  { key: "sorenessScore", label: "Courbatures / douleurs", lowLabel: "Intenses", highLabel: "Aucune" },
]

type DisciplineBreakdown = {
  discipline: string
  label: string
  planned: number
  completed: number
  partial: number
  skipped: number
  untracked: number
}

type Breakdown = {
  totalPlanned: number
  totalCompleted: number
  totalPartial: number
  totalSkipped: number
  totalUntracked: number
  compliancePct: number
  plannedTSS: number
  realizedTSS: number
  byDiscipline: DisciplineBreakdown[]
}

type Context = {
  planId: string
  weekId: string
  weekNumber: number
  phase: string
  breakdown: Breakdown
}

export default function CheckInPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("loading")
  const [ctx, setCtx] = useState<Context | null>(null)
  const [coachMessage, setCoachMessage] = useState("")
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    fatigueScore: 7,
    motivationScore: 7,
    sorenessScore: 8,
    sessionsDone: 0,
    sessionsPlanned: 0,
    notes: "",
    sickDays: 0,
    travelDays: 0,
  })

  // Charge le bilan réel de la semaine en cours
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/checkin")
        if (!res.ok) {
          setError("Aucune semaine en cours trouvée.")
          setStep("form")
          return
        }
        const data: Context = await res.json()
        setCtx(data)
        setForm((f) => ({
          ...f,
          sessionsDone: data.breakdown.totalCompleted,
          sessionsPlanned: data.breakdown.totalPlanned,
        }))
        setStep("form")
      } catch {
        setError("Erreur de chargement.")
        setStep("form")
      }
    })()
  }, [])

  async function submit() {
    if (!ctx) {
      setError("Contexte manquant.")
      return
    }
    setStep("submitting")
    setError("")
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: ctx.planId,
          weekId: ctx.weekId,
          ...form,
        }),
      })

      if (!res.ok) throw new Error()
      const data = await res.json()
      setCoachMessage(data.adjustment?.coachMessage ?? "Plan mis à jour !")
      setStep("done")
    } catch {
      setError("Erreur lors de l'envoi. Réessaie.")
      setStep("form")
    }
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Chargement de ta semaine...</p>
      </div>
    )
  }

  if (step === "submitting") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <p className="text-white font-semibold">IronCoach analyse ta semaine...</p>
      </div>
    )
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="text-5xl">✓</div>
          <h2 className="text-xl font-bold text-white">Plan mis à jour</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Message de ton coach</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{coachMessage}</p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Voir ma semaine
          </button>
        </div>
      </div>
    )
  }

  const b = ctx?.breakdown
  const hasTracked = b && (b.totalCompleted + b.totalPartial + b.totalSkipped) > 0

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Check-in hebdomadaire</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {ctx ? `Semaine #${ctx.weekNumber} · ${ctx.phase}` : "Comment s'est passée ta semaine ?"}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Bilan réel des séances */}
        {b && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Bilan de ta semaine</p>
              <span className="text-2xl font-bold">{hasTracked ? `${b.compliancePct}%` : "—"}</span>
            </div>

            {hasTracked ? (
              <>
                <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                  <span>✓ {b.totalCompleted} faites</span>
                  {b.totalPartial > 0 && <span>⊙ {b.totalPartial} partielles</span>}
                  {b.totalSkipped > 0 && <span>✕ {b.totalSkipped} sautées</span>}
                  {b.totalUntracked > 0 && <span className="text-zinc-600">{b.totalUntracked} non cochées</span>}
                  <span className="ml-auto text-zinc-500">TSS {b.realizedTSS}/{b.plannedTSS}</span>
                </div>

                <div className="space-y-2 pt-1">
                  {b.byDiscipline.map((d) => (
                    <div key={d.discipline} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 w-20 shrink-0">{d.label}</span>
                      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-green-500 h-full rounded-full transition-all"
                          style={{ width: `${d.planned > 0 ? ((d.completed + d.partial * 0.5) / d.planned) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 w-10 text-right shrink-0">
                        {d.completed}/{d.planned}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500">
                Tu n&apos;as coché aucune séance cette semaine. Renseigne manuellement ci-dessous, ou retourne au dashboard pour valider tes séances.
              </p>
            )}
          </div>
        )}

        <div className="space-y-6">
          {SCORE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium">{field.label}</label>
                <span className="text-sm text-zinc-400">{form[field.key]}/10</span>
              </div>
              <input
                type="range" min={1} max={10}
                value={form[field.key]}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: +e.target.value }))}
                className="w-full accent-white"
              />
              <div className="flex justify-between text-xs text-zinc-600">
                <span>{field.lowLabel}</span>
                <span>{field.highLabel}</span>
              </div>
            </div>
          ))}

          {/* Séances : éditable seulement si rien n'a été coché */}
          {!hasTracked && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Séances réalisées</label>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-zinc-500">Réalisées</p>
                  <input
                    type="number" min={0} max={14}
                    value={form.sessionsDone}
                    onChange={(e) => setForm((f) => ({ ...f, sessionsDone: +e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-zinc-500">Planifiées</p>
                  <input
                    type="number" min={0} max={14}
                    value={form.sessionsPlanned}
                    onChange={(e) => setForm((f) => ({ ...f, sessionsPlanned: +e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Jours maladie</label>
              <input
                type="number" min={0} max={7}
                value={form.sickDays}
                onChange={(e) => setForm((f) => ({ ...f, sickDays: +e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Jours voyage / contrainte</label>
              <input
                type="number" min={0} max={7}
                value={form.travelDays}
                onChange={(e) => setForm((f) => ({ ...f, travelDays: +e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Notes libres <span className="text-zinc-500">(optionnel)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Douleur au genou, voyage ce weekend, grosse course de vélo..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          <button
            onClick={submit}
            className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Envoyer le check-in
          </button>
        </div>
      </div>
    </div>
  )
}
