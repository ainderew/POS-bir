"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ShieldCheck, Loader2 } from "lucide-react"

interface ManagerAuthDialogProps {
  isOpen: boolean
  onClose: () => void
  onAuthenticated: (managerPin: string) => void
  title?: string
  description?: string
}

export function ManagerAuthDialog({
  isOpen,
  onClose,
  onAuthenticated,
  title = "Manager Authorization Required",
  description = "This action requires a manager's PIN to proceed.",
}: ManagerAuthDialogProps) {
  const [pin, setPin] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)

  const handleVerify = async () => {
    if (!pin) {
      toast.error("Please enter the manager PIN")
      return
    }

    setIsVerifying(true)
    try {
      const response = await fetch("/api/settings/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })

      const data = await response.json()

      if (response.ok && data.valid) {
        onAuthenticated(pin)
        setPin("")
        onClose()
      } else {
        toast.error(data.error || "Invalid Manager PIN")
        setPin("")
      }
    } catch (error) {
      toast.error("Failed to verify PIN")
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="pin">Manager PIN</Label>
            <Input
              id="pin"
              type="password"
              placeholder="Enter 4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerify()
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={isVerifying}>
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Authorize"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
