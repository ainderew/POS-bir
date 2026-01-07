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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserCheck } from "lucide-react"

export interface SCPWDData {
  name: string
  idNumber: string
  type: "SENIOR" | "PWD"
  paxCount: number
  seniorCount: number
}

interface SCPWDDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: SCPWDData) => void
}

export function SCPWDDialog({ isOpen, onClose, onConfirm }: SCPWDDialogProps) {
  const [data, setData] = useState<SCPWDData>({
    name: "",
    idNumber: "",
    type: "SENIOR",
    paxCount: 1,
    seniorCount: 1,
  })

  const handleConfirm = () => {
    onConfirm(data)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Apply Senior/PWD Discount
          </DialogTitle>
          <DialogDescription>
            Input mandatory details for BIR audit compliance.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="e.g. Juan Dela Cruz"
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idNumber">OSCA / PWD ID Number</Label>
            <Input
              id="idNumber"
              placeholder="ID Number"
              value={data.idNumber}
              onChange={(e) => setData({ ...data, idNumber: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">ID Type</Label>
              <Select
                value={data.type}
                onValueChange={(value: "SENIOR" | "PWD") =>
                  setData({ ...data, type: value })
                }
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SENIOR">Senior Citizen</SelectItem>
                  <SelectItem value="PWD">PWD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paxCount">Total Pax</Label>
              <Input
                id="paxCount"
                type="number"
                min={1}
                value={data.paxCount}
                onChange={(e) =>
                  setData({ ...data, paxCount: parseInt(e.target.value) || 1 })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seniorCount">No. of Senior/PWDs</Label>
            <Input
              id="seniorCount"
              type="number"
              min={1}
              max={data.paxCount}
              value={data.seniorCount}
              onChange={(e) =>
                setData({ ...data, seniorCount: parseInt(e.target.value) || 1 })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!data.name || !data.idNumber}>
            Apply Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
