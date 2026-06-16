import type { RacePrediction } from "@/lib/prediction"
import { formatHMS } from "@/lib/prediction"
import InfoTooltip from "./InfoTooltip"

const DISCIPLINE_LABELS: Record<string, string> = {
  swim: "Natation",
  bike: "Vélo",
  run: "Course",
  transition: "Transitions",
}

const CONFIDENCE_COLORS: Record<string, string> = {
  faible: "text-zinc-500",
  moyenne: "text-blue-400",
  élevée: "text-green-400",
}

const VERDICT: Record<string, { label: string; color: string }> = {
  ahead: { label: "En avance sur l'objectif", color: "text-green-400" },
  on_track: { label: "Objectif atteignable", color: "text-blue-400" },
  behind: { label: "Objectif ambitieux pour l'instant", color: "text-orange-400" },
}

export default function PredictionCard({ prediction }: { prediction: RacePrediction }) {
  if (!prediction.available) {
    return (
      <div className="bg-zinc-900 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold">Prévision de chrono</h2>
        <p className="text-sm text-zinc-500">{prediction.reason}</p>
      </div>
    )
  }

  const verdict = prediction.goalVerdict ? VERDICT[prediction.goalVerdict] : null

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold">Prévision de chrono</h2>
        <InfoTooltip title="Estimation prudente">
          <p>
            Basée sur tes allures Strava réelles, avec des marges volontairement
            prudentes (effort course, fatigue d&apos;endurance, marathon après le vélo).
          </p>
          <p className="mt-1.5 text-zinc-500">
            La fourchette se resserre à mesure que ta forme monte et que le plan
            avance. Mieux vaut viser large et finir devant.
          </p>
        </InfoTooltip>
        <span className={`text-xs ml-auto ${CONFIDENCE_COLORS[prediction.confidence]}`}>
          Confiance {prediction.confidence}
        </span>
      </div>

      {/* Chrono central + fourchette */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">{formatHMS(prediction.realisticSec)}</span>
          <span className="text-sm text-zinc-500">estimation réaliste</span>
        </div>
        <p className="text-xs text-zinc-500">
          Fourchette : {formatHMS(prediction.optimisticSec)} – {formatHMS(prediction.conservativeSec)}
        </p>
        {verdict && (
          <p className={`text-xs font-medium ${verdict.color}`}>
            {verdict.label}
            {prediction.goalSec ? ` (objectif ${formatHMS(prediction.goalSec)})` : ""}
          </p>
        )}
      </div>

      {/* Splits par discipline */}
      <div className="space-y-1.5 pt-1">
        {prediction.splits.map((s) => (
          <div key={s.discipline} className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{DISCIPLINE_LABELS[s.discipline]}</span>
            <span className="text-zinc-300">{s.detail}</span>
          </div>
        ))}
      </div>

      {/* Barre de progression de la fiabilité (readiness) */}
      <div className="space-y-1 pt-1">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Fiabilité de l&apos;estimation</span>
          <span>{Math.round(prediction.readiness * 100)}%</span>
        </div>
        <div className="bg-zinc-800 rounded-full h-1.5">
          <div
            className="bg-white rounded-full h-1.5 transition-all"
            style={{ width: `${Math.round(prediction.readiness * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-zinc-600">
          S&apos;affine à chaque séance synchronisée et au fil des semaines.
        </p>
      </div>
    </div>
  )
}
