"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { Terminal } from "@/lib/types"

interface TerminalSelectorProps {
  onSelect: (terminalId: string) => void
  disabled?: boolean
}

export function TerminalSelector({ onSelect, disabled }: TerminalSelectorProps) {
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTerminals()
  }, [])

  const fetchTerminals = async () => {
    try {
      const res = await fetch("/api/terminals")
      const data = await res.json()
      setTerminals(data)

      // Auto-select if only one terminal
      if (data.length === 1) {
        onSelect(data[0].id)
      }
    } catch (err) {
      console.error("Failed to load terminals:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Terminal</Label>
      <Select onValueChange={onSelect} disabled={disabled || loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading..." : "Select terminal"} />
        </SelectTrigger>
        <SelectContent>
          {terminals.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.ptu_number} ({t.serial_number})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
