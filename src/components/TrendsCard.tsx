import type { Trends } from "@/lib/trends"
import InfoTooltip from "./InfoTooltip"

function MiniBars({ values, max, suffix = "" }: { values: number[]; max: number; suffix?: string }) {
  if (values.length === 0) return <span className="text-xs text-zinc-600">—</span>
  return (
    <div className="flex items-end gap-1 h-10">
      {values.map((v, i) => {
        const h = max > 0 ? Math.max(8, (v / max) * 100) : 8
        const isLast = i === values.length - 1
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div
              className={`w-full rounded-sm ${isLast ? "bg-white" : "bg-zinc-700"}`}
              style={{ height: `${h}%` }}
              title={`${v}${suffix}`}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function TrendsCard({ trends }: { trends: Trends }) {
  if (trends.weekCount === 0) return null

  const maxLoad = Math.max(...trends.loadTrend, 1)

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold">Tendances</h2>
        <InfoTooltip title="Analyse long terme">
          <p>
            Le coach utilise ces tendances pour adapter ton plan : fatigue qui
            monte, charge qui rampe trop vite, ou discipline régulièrement
            négligée.
          </p>
        </InfoTooltip>
        <span className="text-xs text-zinc-500 ml-auto">{trends.weekCount} sem.</span>
      </div>

      {/* Alertes */}
      {(trends.fatigueRising || trends.loadRampingTooFast || trends.disciplineConcerns.length > 0) && (
        <div className="space-y-1.5">
          {trends.fatigueRising && (
            <div className="text-xs text-orange-400 bg-orange-500/10 rounded-lg px-3 py-2">
              ⚠️ Fatigue en hausse continue — récupération à surveiller
            </div>
          )}
          {trends.loadRampingTooFast && (
            <div className="text-xs text-orange-400 bg-orange-500/10 rounded-lg px-3 py-2">
              ⚠️ Charge en hausse rapide ({trends.rampRatePct > 0 ? "+" : ""}{trends.rampRatePct}%/sem)
            </div>
          )}
          {trends.disciplineConcerns.map((d) => (
            <div key={d.discipline} className="text-xs text-yellow-400/90 bg-yellow-500/10 rounded-lg px-3 py-2">
              {d.label} : compliance faible récurrente ({d.avgCompliance}%)
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Charge */}
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Charge (TSS)</p>
          <MiniBars values={trends.loadTrend} max={maxLoad} />
          <p className="text-xs text-zinc-400">
            {trends.acuteLoad} <span className="text-zinc-600">/ {trends.chronicLoad} moy.</span>
          </p>
        </div>

        {/* Fatigue */}
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Fatigue /10</p>
          <MiniBars values={trends.fatigueTrend} max={10} />
          <p className="text-xs text-zinc-400">
            {trends.fatigueTrend.length > 0 ? trends.fatigueTrend[trends.fatigueTrend.length - 1] : "—"}
            <span className="text-zinc-600"> dernier</span>
          </p>
        </div>

        {/* Compliance */}
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Compliance %</p>
          <MiniBars values={trends.complianceTrend} max={100} suffix="%" />
          <p className="text-xs text-zinc-400">
            {trends.complianceTrend.length > 0 ? trends.complianceTrend[trends.complianceTrend.length - 1] : "—"}%
            <span className="text-zinc-600"> dernier</span>
          </p>
        </div>
      </div>
    </div>
  )
}
