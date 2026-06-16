"use client"

import { useState, useTransition } from "react"
import { Check, X, MinusCircle, FileText, Loader2 } from "lucide-react"
import { updateSessionStatus, generateSessionDebriefAction } from "@/app/dashboard/actions"
import InfoTooltip from "./InfoTooltip"

const ZONE_INFO: Record<string, { name: string; desc: string }> = {
  Z1: { name: "Récupération active", desc: "Très facile, conversation aisée. ~50-60% FCmax." },
  Z2: { name: "Endurance fondamentale", desc: "Facile, peut parler en phrases. ~60-70% FCmax. Base de toute prépa." },
  Z3: { name: "Tempo", desc: "Modéré-soutenu. ~70-80% FCmax. Phrases courtes." },
  Z4: { name: "Seuil lactique", desc: "Dur, soutenable 30-60min. ~80-90% FCmax. Séances clés." },
  Z5: { name: "VO2max", desc: "Très dur, intervalles courts (1-5min). ~90-100% FCmax." },
}

type SessionStatus = "PLANNED" | "COMPLETED" | "SKIPPED" | "PARTIAL"

const DISCIPLINE_COLORS: Record<string, string> = {
  swim: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  bike: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  run: "bg-green-500/10 text-green-400 border-green-500/20",
  brick: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  strength: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
}

const DISCIPLINE_LABELS: Record<string, string> = {
  swim: "Natation", bike: "Vélo", run: "Course",
  brick: "Brique", strength: "Force",
}

const STATUS_STYLES: Record<SessionStatus, string> = {
  PLANNED: "",
  COMPLETED: "border-green-500/40 bg-green-500/5",
  SKIPPED: "border-red-500/30 bg-red-500/5 opacity-60",
  PARTIAL: "border-yellow-500/30 bg-yellow-500/5",
}

type Props = {
  id: string
  discipline: string
  durationMin: number
  zone: string
  description: string
  plannedTSS: number
  status: SessionStatus
  feeling: number | null
  editable: boolean
  source?: string
  actualDurationMin?: number | null
  actualDistanceKm?: number | null
  avgHeartrate?: number | null
  fromStrava?: boolean
  compteRendu?: string | null
}

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  external: {
    label: "Campus Coach",
    className: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  },
  strength: {
    label: "Renfo libre",
    className: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  },
}

export default function SessionCard(props: Props) {
  const [isPending, startTransition] = useTransition()
  const [optimisticStatus, setOptimisticStatus] = useState<SessionStatus>(props.status)

  const updateStatus = (newStatus: SessionStatus) => {
    const target = optimisticStatus === newStatus ? "PLANNED" : newStatus
    setOptimisticStatus(target)
    startTransition(async () => {
      try {
        await updateSessionStatus(props.id, target)
      } catch {
        setOptimisticStatus(props.status)
      }
    })
  }

  const colorClass = DISCIPLINE_COLORS[props.discipline] ?? DISCIPLINE_COLORS.strength
  const statusClass = STATUS_STYLES[optimisticStatus] ?? ""
  const sourceBadge = props.source ? SOURCE_BADGES[props.source] : null

  // Compte rendu de séance
  const [debriefPending, startDebrief] = useTransition()
  const [debrief, setDebrief] = useState<string | null>(props.compteRendu ?? null)
  const [debriefError, setDebriefError] = useState("")
  const canDebrief = optimisticStatus === "COMPLETED" || optimisticStatus === "PARTIAL"

  const runDebrief = () => {
    setDebriefError("")
    startDebrief(async () => {
      const res = await generateSessionDebriefAction(props.id)
      if (res.ok && res.text) setDebrief(res.text)
      else setDebriefError(res.message ?? "Erreur")
    })
  }

  // Rendu simple du markdown gras (**texte**) du compte rendu
  const renderDebrief = (text: string) =>
    text.split("\n").map((line, i) => (
      <p key={i} className={line.trim() === "" ? "h-1.5" : ""}>
        {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j} className="text-zinc-200 font-medium">{part.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{part}</span>
          )
        )}
      </p>
    ))

  return (
    <div className={`bg-zinc-900 rounded-xl p-4 border border-transparent transition-all ${statusClass} ${isPending ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="flex flex-col gap-1 shrink-0 items-start">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-md border ${colorClass}`}>
            {DISCIPLINE_LABELS[props.discipline] ?? props.discipline}
          </span>
          {sourceBadge && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${optimisticStatus === "SKIPPED" ? "line-through text-zinc-500" : "text-white"}`}>
            {props.description}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-500">
            <span>{props.durationMin}min</span>
            <span>·</span>
            <span>{props.zone}</span>
            {ZONE_INFO[props.zone] && (
              <InfoTooltip title={`${props.zone} — ${ZONE_INFO[props.zone].name}`}>
                <p>{ZONE_INFO[props.zone].desc}</p>
              </InfoTooltip>
            )}
            <span>·</span>
            <span>TSS {props.plannedTSS}</span>
          </div>
        </div>

        {props.editable && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => updateStatus("COMPLETED")}
              disabled={isPending}
              title="Faite"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                optimisticStatus === "COMPLETED"
                  ? "bg-green-500 text-black"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-green-400"
              }`}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => updateStatus("PARTIAL")}
              disabled={isPending}
              title="Partielle"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                optimisticStatus === "PARTIAL"
                  ? "bg-yellow-500 text-black"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-yellow-400"
              }`}
            >
              <MinusCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => updateStatus("SKIPPED")}
              disabled={isPending}
              title="Sautée"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                optimisticStatus === "SKIPPED"
                  ? "bg-red-500 text-black"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Données réelles Strava + ressenti */}
      {(props.fromStrava || (props.feeling != null && optimisticStatus !== "PLANNED")) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {props.fromStrava && (
            <span className="text-[#FC4C02] font-medium flex items-center gap-1">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Réalisé
            </span>
          )}
          {props.actualDurationMin != null && <span>{props.actualDurationMin}min</span>}
          {props.actualDistanceKm != null && props.actualDistanceKm > 0 && (
            <span>{props.actualDistanceKm}km</span>
          )}
          {props.avgHeartrate != null && <span>♥ {props.avgHeartrate} bpm</span>}
          {props.feeling != null && optimisticStatus !== "PLANNED" && (
            <span className="ml-auto">Ressenti {props.feeling}/10</span>
          )}
        </div>
      )}

      {/* Compte rendu de séance (coach) */}
      {canDebrief && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-2">
          {debrief ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Compte rendu du coach
                </span>
                <button
                  type="button"
                  onClick={runDebrief}
                  disabled={debriefPending}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {debriefPending ? "..." : "Régénérer"}
                </button>
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed space-y-1">
                {renderDebrief(debrief)}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={runDebrief}
              disabled={debriefPending}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {debriefPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyse en cours...</>
              ) : (
                <><FileText className="w-3.5 h-3.5" /> Générer le compte rendu</>
              )}
            </button>
          )}
          {debriefError && <p className="text-xs text-red-400">{debriefError}</p>}
        </div>
      )}
    </div>
  )
}
