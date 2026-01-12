"use client"

import { useState, useEffect } from "react"
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
import { Loader2, Landmark } from "lucide-react"

interface ShiftOpeningDialogProps {
  isOpen: boolean
  onConfirm: (openingFund: number) => void
}

export function ShiftOpeningDialog({ isOpen, onConfirm }: ShiftOpeningDialogProps) {
  const [openingFund, setOpeningFund] = useState("1000")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false)
      setOpeningFund("1000")
    }
  }, [isOpen])

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm(parseFloat(openingFund) || 0)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Open New Shift
          </DialogTitle>
          <DialogDescription>
            Enter the beginning cash (Petty Cash/Float) for this shift.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="openingFund">Beginning Fund (₱)</Label>
            <Input
              id="openingFund"
              type="number"
              value={openingFund}
              onChange={(e) => setOpeningFund(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleConfirm} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Open Shift & Start Sales
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
