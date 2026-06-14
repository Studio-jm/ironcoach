"use client"

import { useState, useRef, useEffect } from "react"
import { Info } from "lucide-react"

type Props = {
  title: string
  children: React.ReactNode
  side?: "top" | "bottom"
}

export default function InfoTooltip({ title, children, side = "bottom" }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center w-4 h-4 text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label="Plus d'infos"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={`absolute left-0 z-20 w-72 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-xl ${
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <p className="text-xs font-semibold text-white mb-1.5">{title}</p>
          <div className="text-xs text-zinc-400 leading-relaxed space-y-1.5">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
