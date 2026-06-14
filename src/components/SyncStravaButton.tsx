"use client"

import { useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { syncWeekFromStrava, type SyncResult } from "@/app/dashboard/actions"

export default function SyncStravaButton({ weekId }: { weekId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SyncResult | null>(null)

  function sync() {
    setResult(null)
    startTransition(async () => {
      const res = await syncWeekFromStrava(weekId)
      setResult(res)
      // Efface le message après 4s
      setTimeout(() => setResult(null), 4000)
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={sync}
        disabled={isPending}
        title="Synchroniser les séances avec Strava"
        className="text-xs bg-[#FC4C02]/10 hover:bg-[#FC4C02]/20 border border-[#FC4C02]/30 text-[#FC4C02] font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Sync..." : "Sync Strava"}
      </button>
      {result && (
        <div
          className={`absolute right-0 top-full mt-1.5 z-10 text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg ${
            result.ok
              ? result.matched > 0
                ? "bg-green-500/15 text-green-400 border border-green-500/30"
                : "bg-zinc-800 text-zinc-300 border border-zinc-700"
              : "bg-red-500/15 text-red-400 border border-red-500/30"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  )
}
