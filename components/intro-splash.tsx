"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { ShoppingCart } from "lucide-react"

export function IntroSplash() {
  const [step, setStep] = useState<"visible" | "masking" | "hidden">("visible")
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Start progress animation
    const timerProgress = setTimeout(() => setProgress(100), 100)

    // Start masking after 1.5s (loading time)
    const timer1 = setTimeout(() => setStep("masking"), 2000)
    
    // Remove from DOM after transition (1s duration)
    const timer2 = setTimeout(() => setStep("hidden"), 3000)

    return () => {
      clearTimeout(timerProgress)
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [])

  if (step === "hidden") return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 text-white transition-all duration-1000 ease-[cubic-bezier(0.87,0,0.13,1)]",
        step === "masking" ? "pointer-events-none" : ""
      )}
      style={{
        // "Mask In" effect: 
        // We use clip-path to "wipe" the screen up.
        // polygon(0 0, 100% 0, 100% 100%, 0 100%) -> Full screen
        // polygon(0 0, 100% 0, 100% 0, 0 0) -> Top line (revealing from bottom? No, this hides the div by moving bottom edge up)
        clipPath: step === "masking" 
          ? "polygon(0 0, 100% 0, 100% 0, 0 0)" 
          : "polygon(0 0, 100% 0, 100% 100%, 0 100%)"
      }}
    >
      <div className={cn(
        "flex flex-col items-center gap-4 transition-all duration-500",
        step === "masking" ? "opacity-0 scale-95" : "opacity-100 scale-100"
      )}>
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
          <ShoppingCart className="h-24 w-24 text-white relative z-10" />
        </div>
        <h1 className="text-4xl font-bold tracking-tighter">
          General Store POS
        </h1>
        <div className="h-1 w-48 bg-white/10 rounded-full overflow-hidden mt-4">
          <div 
            className="h-full bg-white transition-all duration-[1800ms] ease-out" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
