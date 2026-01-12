"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, Check, X, Loader2 } from "lucide-react"
import { captureOptimizedAuditPhoto, type AuditCaptureResult } from "@/lib/audit-service"

interface AuditCameraProps {
  onCapture: (result: AuditCaptureResult) => void
  disabled?: boolean
}

export function AuditCamera({ onCapture, disabled }: AuditCameraProps) {
  const [isCapturing, setIsCapturing] = useState(false)
  const [lastCapture, setLastCapture] = useState<AuditCaptureResult | null>(null)

  const handleCapture = async () => {
    setIsCapturing(true)
    try {
      const result = await captureOptimizedAuditPhoto()
      setLastCapture(result)
      onCapture(result)
    } catch (err) {
      console.error('[audit-camera] Capture error:', err)
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleCapture}
          disabled={disabled || isCapturing}
          className="flex-1"
        >
          {isCapturing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          {isCapturing ? "Capturing..." : "Capture Audit Photo"}
        </Button>

        {lastCapture && (
          <div className="flex items-center gap-2">
            {lastCapture.status === 'SUCCESS' ? (
              <Check className="h-5 w-5 text-green-600" />
            ) : (
              <X className="h-5 w-5 text-amber-600" />
            )}
          </div>
        )}
      </div>

      {lastCapture && lastCapture.image && (
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <img
            src={lastCapture.image}
            alt="Audit capture"
            className="w-16 h-16 rounded object-cover"
          />
          <div className="text-xs text-green-800">
            <p className="font-semibold">Photo captured successfully</p>
            <p className="text-[10px] opacity-70">
              {lastCapture.metadata.compressedSize
                ? `${Math.round(lastCapture.metadata.compressedSize / 1024)}KB`
                : "Size unknown"}
            </p>
          </div>
        </div>
      )}

      {lastCapture && !lastCapture.image && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-800">
            <strong>Camera unavailable:</strong>{" "}
            {lastCapture.metadata.error || "Unknown error"}
          </p>
          <p className="text-[10px] text-amber-700 mt-1">
            Shift will open without audit photo. Check camera permissions.
          </p>
        </div>
      )}
    </div>
  )
}
