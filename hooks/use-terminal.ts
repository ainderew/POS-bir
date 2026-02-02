"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function useTerminal() {
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkTerminalConfig()
  }, [])

  const checkTerminalConfig = async () => {
    try {
      let id: string | null = null

      // 1. Check Electron Storage (Main Process)
      if (window.electronAPI) {
        id = await window.electronAPI.getTerminalId()
      } else {
        // Fallback for Web Browser (Development only)
        id = localStorage.getItem("pos_terminal_id")
      }

      if (!id) {
        console.log("[useTerminal] No terminal ID found. Redirecting to register...")
        router.push("/register")
        return
      }

      // 2. Validate terminal ID exists in database
      const res = await fetch(`/api/terminals/${id}`)
      if (!res.ok) {
        console.log("[useTerminal] Terminal ID not found in DB. Clearing stale ID...")
        if (window.electronAPI) {
          await window.electronAPI.saveTerminalId("")
        }
        localStorage.removeItem("pos_terminal_id")
        router.push("/register")
        return
      }

      setTerminalId(id)
    } catch (error) {
      console.error("[useTerminal] Error checking config:", error)
      toast.error("Failed to load terminal configuration")
    } finally {
      setLoading(false)
    }
  }

  return { terminalId, loading }
}
