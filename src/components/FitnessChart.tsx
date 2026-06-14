import type { FitnessModel } from "@/lib/fitness"
import { interpretTSB } from "@/lib/fitness"
import InfoTooltip from "./InfoTooltip"

const W = 800
const H = 260
const PAD = { top: 20, right: 16, bottom: 24, left: 32 }

const TONE_COLORS: Record<string, string> = {
  fresh: "text-green-400",
  neutral: "text-zinc-300",
  tired: "text-orange-400",
  risk: "text-red-400",
}

export default function FitnessChart({ model }: { model: FitnessModel }) {
  if (model.points.length < 3 || !model.current) {
    return (
      <div className="bg-zinc-900 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold">Courbe de forme</h2>
        <p className="text-sm text-zinc-500">
          Disponible après quelques séances réalisées (synchronise tes activités Strava ou valide tes séances).
        </p>
      </div>
    )
  }

  const { points, todayIndex, current } = model
  const n = points.length

  // Échelle Y : couvre CTL/ATL (positifs) et TSB (peut être négatif)
  const allVals = points.flatMap((p) => [p.ctl, p.atl, p.tsb])
  const yMax = Math.max(...allVals, 10)
  const yMin = Math.min(...allVals, 0)
  const yRange = yMax - yMin || 1

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const x = (i: number) => PAD.left + (i / (n - 1)) * plotW
  const y = (v: number) => PAD.top + (1 - (v - yMin) / yRange) * plotH

  const buildPath = (key: "ctl" | "atl" | "tsb", from: number, to: number) =>
    points
      .slice(from, to)
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(from + idx).toFixed(1)} ${y(p[key]).toFixed(1)}`)
      .join(" ")

  const splitAt = todayIndex >= 0 ? todayIndex + 1 : n
  const zeroY = y(0)
  const todayX = todayIndex >= 0 ? x(todayIndex) : null

  const tsb = interpretTSB(current.tsb)

  const lines: { key: "ctl" | "atl" | "tsb"; color: string; label: string }[] = [
    { key: "ctl", color: "#60a5fa", label: "Forme (CTL)" },
    { key: "atl", color: "#fb923c", label: "Fatigue (ATL)" },
    { key: "tsb", color: "#4ade80", label: "Fraîcheur (TSB)" },
  ]

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold">Courbe de forme</h2>
        <InfoTooltip title="Performance Management Chart">
          <p className="mb-1">Le modèle de charge utilisé par TrainingPeaks/Garmin :</p>
          <ul className="space-y-0.5">
            <li>• <b className="text-blue-400">CTL / Forme</b> : ta condition de fond (charge moyenne 42j)</li>
            <li>• <b className="text-orange-400">ATL / Fatigue</b> : ta fatigue récente (7j)</li>
            <li>• <b className="text-green-400">TSB / Fraîcheur</b> : Forme − Fatigue. Positif = frais, négatif = chargé.</li>
          </ul>
          <p className="mt-1.5 text-zinc-500">La partie pointillée projette la suite selon ton plan.</p>
        </InfoTooltip>
      </div>

      {/* Valeurs actuelles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Forme</p>
          <p className="text-lg font-bold text-blue-400">{current.ctl}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fatigue</p>
          <p className="text-lg font-bold text-orange-400">{current.atl}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fraîcheur</p>
          <p className={`text-lg font-bold ${TONE_COLORS[tsb.tone]}`}>
            {current.tsb > 0 ? "+" : ""}{current.tsb}
          </p>
        </div>
      </div>
      <p className={`text-xs ${TONE_COLORS[tsb.tone]}`}>État actuel : {tsb.label}</p>

      {/* Graphique */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Ligne zéro */}
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="#3f3f46" strokeWidth={1} strokeDasharray="2 3" />

        {/* Marqueur "aujourd'hui" */}
        {todayX != null && (
          <>
            <line x1={todayX} y1={PAD.top} x2={todayX} y2={H - PAD.bottom} stroke="#52525b" strokeWidth={1} />
            <text x={todayX} y={PAD.top - 6} fill="#a1a1aa" fontSize={10} textAnchor="middle">
              auj.
            </text>
          </>
        )}

        {/* Lignes : partie réalisée (pleine) + projetée (pointillée) */}
        {lines.map((l) => (
          <g key={l.key}>
            <path d={buildPath(l.key, 0, splitAt)} fill="none" stroke={l.color} strokeWidth={2} />
            {splitAt < n && (
              <path
                d={buildPath(l.key, splitAt - 1, n)}
                fill="none"
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray="4 4"
                opacity={0.6}
              />
            )}
          </g>
        ))}
      </svg>

      {/* Légende */}
      <div className="flex flex-wrap gap-4">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: l.color }} />
            <span className="text-xs text-zinc-400">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
