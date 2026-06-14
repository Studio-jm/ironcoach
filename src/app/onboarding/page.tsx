"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"

type Step = "profile" | "plan" | "external" | "generating"

const EVENT_OPTIONS = [
  { value: "IRONMAN", label: "IRONMAN", sub: "3,8km / 180km / 42,2km" },
  { value: "HALF_IRONMAN", label: "Half-IRONMAN", sub: "1,9km / 90km / 21,1km" },
  { value: "OLYMPIC", label: "Olympique", sub: "1,5km / 40km / 10km" },
  { value: "SPRINT", label: "Sprint", sub: "750m / 20km / 5km" },
]

const RACE_PRIORITIES = [
  { value: "A", label: "A — Objectif principal" },
  { value: "B", label: "B — Course secondaire" },
  { value: "C", label: "C — Entraînement / fun" },
]

const RACE_TYPES = [
  { value: "trail", label: "Trail" },
  { value: "road_run", label: "Course sur route" },
  { value: "triathlon", label: "Triathlon" },
  { value: "cycling", label: "Cyclo / gravel" },
  { value: "swimming", label: "Open water" },
  { value: "other", label: "Autre" },
]

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
const DAYS_FR: Record<string, string> = {
  monday: "Lun", tuesday: "Mar", wednesday: "Mer",
  thursday: "Jeu", friday: "Ven", saturday: "Sam", sunday: "Dim",
}

type Race = {
  date: string
  name: string
  distanceKm: number
  elevationM: number
  priority: "A" | "B" | "C"
  type: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("profile")
  const [error, setError] = useState("")

  const [profile, setProfile] = useState({
    swimLevel: 5, bikeLevel: 5, runLevel: 5,
    weightKg: "", gender: "M",
  })

  // Lundi de la semaine en cours (par défaut)
  const today = new Date()
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const defaultStartDate = new Date(today)
  defaultStartDate.setDate(today.getDate() + mondayOffset)

  const [plan, setPlan] = useState({
    name: "Mon IRONMAN",
    targetEvent: "IRONMAN",
    targetGoal: "Finisher",
    targetDate: "",
    startDate: defaultStartDate.toISOString().slice(0, 10),
    weeklySwimHours: 2,
    weeklyBikeHours: 4,
    weeklyRunHours: 3,
    restDays: ["monday"] as string[],
    strengthDays: ["friday"] as string[],
  })

  const [external, setExternal] = useState({
    runManagementMode: "external_run" as "external_run" | "manage_run",
    campusCoachJson: "",
    jsonError: "",
    races: [] as Race[],
  })

  const [newRace, setNewRace] = useState<Race>({
    date: "",
    name: "",
    distanceKm: 0,
    elevationM: 0,
    priority: "B",
    type: "trail",
  })

  function toggleRestDay(day: string) {
    setPlan((p) => ({
      ...p,
      restDays: p.restDays.includes(day)
        ? p.restDays.filter((d) => d !== day)
        : [...p.restDays, day],
    }))
  }

  function toggleStrengthDay(day: string) {
    setPlan((p) => ({
      ...p,
      strengthDays: p.strengthDays.includes(day)
        ? p.strengthDays.filter((d) => d !== day)
        : [...p.strengthDays, day],
    }))
  }

  function addRace() {
    if (!newRace.date || !newRace.name) return
    setExternal((e) => ({ ...e, races: [...e.races, newRace] }))
    setNewRace({ date: "", name: "", distanceKm: 0, elevationM: 0, priority: "B", type: "trail" })
  }

  function removeRace(idx: number) {
    setExternal((e) => ({ ...e, races: e.races.filter((_, i) => i !== idx) }))
  }

  function validateCampusCoachJson() {
    if (!external.campusCoachJson.trim()) {
      setExternal((e) => ({ ...e, jsonError: "" }))
      return true
    }
    try {
      const parsed = JSON.parse(external.campusCoachJson)
      if (!parsed.programme_running?.semaines) {
        setExternal((e) => ({ ...e, jsonError: "JSON invalide : champ programme_running.semaines manquant" }))
        return false
      }
      setExternal((e) => ({ ...e, jsonError: "" }))
      return true
    } catch {
      setExternal((e) => ({ ...e, jsonError: "JSON malformé" }))
      return false
    }
  }

  async function submit() {
    if (external.runManagementMode === "external_run" && !validateCampusCoachJson()) {
      return
    }

    setStep("generating")
    setError("")
    try {
      const externalRunPlan = external.campusCoachJson.trim()
        ? JSON.parse(external.campusCoachJson)
        : null

      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          ...plan,
          runManagementMode: external.runManagementMode,
          externalRunPlan,
          targetRaces: external.races,
        }),
      })
      if (!res.ok) throw new Error()
      router.push("/dashboard")
    } catch {
      setError("Une erreur est survenue. Réessaie.")
      setStep("external")
    }
  }

  if (step === "generating") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <div className="text-center space-y-2">
          <p className="text-white font-semibold">IronCoach analyse ton profil...</p>
          <p className="text-zinc-400 text-sm">Génération de ton plan personnalisé (30-90 secondes)</p>
        </div>
      </div>
    )
  }

  const stepTitle = {
    profile: "Ton profil athlète",
    plan: "Configure ton plan",
    external: "Plans externes & courses",
  }[step]

  const stepNum = { profile: 1, plan: 2, external: 3 }[step]

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{stepTitle}</h1>
          <p className="text-zinc-400 text-sm">Étape {stepNum} / 3</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* ───── ÉTAPE 1 : PROFIL ───── */}
        {step === "profile" && (
          <div className="space-y-6">
            <div className="space-y-4">
              {(["swim", "bike", "run"] as const).map((d) => {
                const key = `${d}Level` as "swimLevel" | "bikeLevel" | "runLevel"
                const labels = { swim: "Natation", bike: "Vélo", run: "Course à pied" }
                return (
                  <div key={d} className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-medium">{labels[d]}</label>
                      <span className="text-sm text-zinc-400">{profile[key]}/10</span>
                    </div>
                    <input
                      type="range" min={1} max={10}
                      value={profile[key]}
                      onChange={(e) => setProfile((p) => ({ ...p, [key]: +e.target.value }))}
                      className="w-full accent-white"
                    />
                    <div className="flex justify-between text-xs text-zinc-600">
                      <span>Débutant</span><span>Expert</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Poids (kg)</label>
                <input
                  type="number" placeholder="70"
                  value={profile.weightKg}
                  onChange={(e) => setProfile((p) => ({ ...p, weightKg: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Genre</label>
                <select
                  value={profile.gender}
                  onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                >
                  <option value="M">Homme</option>
                  <option value="F">Femme</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setStep("plan")}
              className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Continuer
            </button>
          </div>
        )}

        {/* ───── ÉTAPE 2 : PLAN ───── */}
        {step === "plan" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nom du plan</label>
              <input
                type="text"
                value={plan.name}
                onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Épreuve cible</label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPlan((p) => ({ ...p, targetEvent: opt.value }))}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      plan.targetEvent === opt.value
                        ? "border-white bg-white/10"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-zinc-400">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Objectif</label>
              <select
                value={plan.targetGoal}
                onChange={(e) => setPlan((p) => ({ ...p, targetGoal: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
              >
                <option value="Finisher">Finisher (terminer la course)</option>
                <option value="Sub 14h">Sub 14h</option>
                <option value="Sub 12h">Sub 12h</option>
                <option value="Sub 11h">Sub 11h</option>
                <option value="Sub 10h">Sub 10h</option>
                <option value="Podium AG">Podium tranche d&apos;âge</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Début du plan</label>
                <input
                  type="date"
                  value={plan.startDate}
                  onChange={(e) => setPlan((p) => ({ ...p, startDate: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                />
                <p className="text-xs text-zinc-600">Arrondi au lundi</p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Date IRONMAN <span className="text-zinc-500">(opt.)</span>
                </label>
                <input
                  type="date"
                  value={plan.targetDate}
                  onChange={(e) => setPlan((p) => ({ ...p, targetDate: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Disponibilités hebdo natation / vélo</label>
              <p className="text-xs text-zinc-500 -mt-1">
                Le run est géré séparément (étape suivante)
              </p>
              {(["swim", "bike"] as const).map((d) => {
                const key = `weekly${d.charAt(0).toUpperCase() + d.slice(1)}Hours` as
                  "weeklySwimHours" | "weeklyBikeHours"
                const labels = { swim: "Natation", bike: "Vélo" }
                return (
                  <div key={d} className="flex items-center gap-4">
                    <span className="text-sm text-zinc-400 w-20">{labels[d]}</span>
                    <input
                      type="range" min={1} max={15} step={0.5}
                      value={plan[key]}
                      onChange={(e) => setPlan((p) => ({ ...p, [key]: +e.target.value }))}
                      className="flex-1 accent-white"
                    />
                    <span className="text-sm w-12 text-right">{plan[key]}h</span>
                  </div>
                )
              })}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Jours de repos</label>
              <div className="flex gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleRestDay(day)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      plan.restDays.includes(day)
                        ? "bg-white text-black"
                        : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {DAYS_FR[day]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Jours de renforcement</label>
              <p className="text-xs text-zinc-500 -mt-1">
                Tu gères ton renfo toi-même (CrossFit, haltéro, etc.). IronCoach réservera ces jours sans planifier dessus.
              </p>
              <div className="flex gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleStrengthDay(day)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      plan.strengthDays.includes(day)
                        ? "bg-orange-500 text-black"
                        : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {DAYS_FR[day]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("profile")}
                className="flex-1 border border-zinc-700 text-zinc-300 font-semibold py-3 rounded-lg hover:bg-zinc-900 transition-colors"
              >
                Retour
              </button>
              <button
                onClick={() => setStep("external")}
                className="flex-1 bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {/* ───── ÉTAPE 3 : EXTERNAL ───── */}
        {step === "external" && (
          <div className="space-y-8">

            {/* Mode de gestion du run */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Gestion de la course à pied</label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setExternal((e) => ({ ...e, runManagementMode: "external_run" }))}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    external.runManagementMode === "external_run"
                      ? "border-white bg-white/10"
                      : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="text-sm font-medium">📋 Coach externe (Campus Coach, etc.)</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Tu colles ton plan run, IronCoach le respecte et le place dans la semaine
                  </div>
                </button>
                <button
                  onClick={() => setExternal((e) => ({ ...e, runManagementMode: "manage_run" }))}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    external.runManagementMode === "manage_run"
                      ? "border-white bg-white/10"
                      : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="text-sm font-medium">🤖 IronCoach gère tout</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Claude génère aussi les séances de course (mode dégradé sans coach trail)
                  </div>
                </button>
              </div>
            </div>

            {/* Campus Coach JSON */}
            {external.runManagementMode === "external_run" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Plan Campus Coach (JSON)</label>
                  <span className="text-xs text-zinc-500">4 prochaines semaines</span>
                </div>
                <p className="text-xs text-zinc-500">
                  Colle ici le JSON formaté de ton plan de course. Tu le mettras à jour tous les 4 blocs.
                </p>
                <textarea
                  rows={10}
                  placeholder='{ "programme_running": { "duree_semaines": 4, "seances_par_semaine": 3, "semaines": [...] } }'
                  value={external.campusCoachJson}
                  onChange={(e) => setExternal((ex) => ({ ...ex, campusCoachJson: e.target.value, jsonError: "" }))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-zinc-600 resize-none"
                />
                {external.jsonError && (
                  <p className="text-xs text-red-400">{external.jsonError}</p>
                )}
                {!external.campusCoachJson.trim() && (
                  <p className="text-xs text-zinc-600">
                    ⚠️ Sans plan, le run sera généré en mode dégradé pour ce bloc
                  </p>
                )}
              </div>
            )}

            {/* Courses intermédiaires */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Courses intermédiaires</label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Trails, semis, triathlons courts… IronCoach adaptera la charge avant/après.
                </p>
              </div>

              {external.races.length > 0 && (
                <div className="space-y-2">
                  {external.races.map((r, i) => (
                    <div key={i} className="bg-zinc-900 rounded-lg p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{r.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            r.priority === "A" ? "bg-red-500/20 text-red-400" :
                            r.priority === "B" ? "bg-orange-500/20 text-orange-400" :
                            "bg-zinc-700 text-zinc-400"
                          }`}>{r.priority}</span>
                        </div>
                        <p className="text-xs text-zinc-500">
                          {r.date} · {r.distanceKm}km
                          {r.elevationM > 0 && ` · ${r.elevationM}m D+`}
                        </p>
                      </div>
                      <button
                        onClick={() => removeRace(i)}
                        className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-500 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Form ajout course */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Ajouter une course</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={newRace.date}
                    onChange={(e) => setNewRace((r) => ({ ...r, date: e.target.value }))}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  />
                  <input
                    type="text"
                    placeholder="Nom de la course"
                    value={newRace.name}
                    onChange={(e) => setNewRace((r) => ({ ...r, name: e.target.value }))}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Distance (km)"
                    value={newRace.distanceKm || ""}
                    onChange={(e) => setNewRace((r) => ({ ...r, distanceKm: +e.target.value }))}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  />
                  <input
                    type="number"
                    placeholder="D+ (m)"
                    value={newRace.elevationM || ""}
                    onChange={(e) => setNewRace((r) => ({ ...r, elevationM: +e.target.value }))}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newRace.type}
                    onChange={(e) => setNewRace((r) => ({ ...r, type: e.target.value }))}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  >
                    {RACE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <select
                    value={newRace.priority}
                    onChange={(e) => setNewRace((r) => ({ ...r, priority: e.target.value as "A" | "B" | "C" }))}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
                  >
                    {RACE_PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={addRace}
                  disabled={!newRace.date || !newRace.name}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("plan")}
                className="flex-1 border border-zinc-700 text-zinc-300 font-semibold py-3 rounded-lg hover:bg-zinc-900 transition-colors"
              >
                Retour
              </button>
              <button
                onClick={submit}
                className="flex-1 bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Générer mon plan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
