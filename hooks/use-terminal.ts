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
      // 1. Check Electron Storage (Main Process)
      if (window.electronAPI) {
        const id = await window.electronAPI.getTerminalId()
        if (id) {
          setTerminalId(id)
          setLoading(false)
          return
        }
      } else {
        // Fallback for Web Browser (Development only)
        const storedId = localStorage.getItem("pos_terminal_id")
        if (storedId) {
          setTerminalId(storedId)
          setLoading(false)
          return
        }
      }

      // 2. No ID found -> Redirect to Registration
      console.log("[useTerminal] No terminal ID found. Redirecting to register...")
      router.push("/register")
      
    } catch (error) {
      console.error("[useTerminal] Error checking config:", error)
      toast.error("Failed to load terminal configuration")
    } finally {
      setLoading(false)
    }
  }

  return { terminalId, loading }
}
