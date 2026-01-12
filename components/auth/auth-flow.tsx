"use client"

import { useState } from "react"
import { UserGrid } from "./user-grid"
import { PinPad } from "./pin-pad"
import { captureOptimizedAuditPhoto } from "@/lib/audit-service"
import type { User, AuthResponse } from "@/lib/types"
import type { AuditCaptureResult } from "@/lib/audit-service"

type AuthStatus = 'SELECTING_USER' | 'ENTERING_PIN' | 'AUTHENTICATING' | 'AUTHENTICATED'

interface AuthFlowProps {
  onAuthenticated: (user: User, auditResult?: AuditCaptureResult) => void
  terminalId?: string | null
}

export function AuthFlow({ onAuthenticated, terminalId }: AuthFlowProps) {
  const [status, setStatus] = useState<AuthStatus>('SELECTING_USER')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectUser = (user: User) => {
    setSelectedUser(user)
    setStatus('ENTERING_PIN')
    setError(null)
  }

  const handleBack = () => {
    setStatus('SELECTING_USER')
    setSelectedUser(null)
    setError(null)
  }

  /**
   * CRITICAL: Zero-Friction Auto-Camera Sequence
   *
   * When user submits PIN, two things happen in parallel:
   * 1. Camera captures audit photo (silent, automatic)
   * 2. PIN is validated against database
   *
   * User sees no camera UI - it happens seamlessly in background
   */
  const handlePinSubmit = async (pin: string) => {
    if (!selectedUser) return

    console.log('[AuthFlow] Starting authentication for user:', selectedUser.full_name)
    setStatus('AUTHENTICATING')
    setError(null)

    try {
      // 1. Capture camera photo first (background, silent)
      console.log('[AuthFlow] Step 1: Capturing camera photo...')
      const cameraResult = await captureOptimizedAuditPhoto()
      console.log('[AuthFlow] Camera capture completed:', {
        hasImage: !!cameraResult.image,
        metadata: cameraResult.metadata
      })

      // 2. Validate PIN with backend (includes camera image)
      // IF we have a terminal ID (Shift Open flow), we SKIP the audit log here
      // because the Shift Open API will create the unified log.
      const skipAudit = !!terminalId

      console.log('[AuthFlow] Step 2: Sending authentication request...', { skipAudit })
      const authResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          pin: pin,
          auditImage: cameraResult.image,  // Include captured image (or null if failed)
          auditMetadata: cameraResult.metadata,
          skipAudit // NEW: Tell API to verify only
        })
      })

      console.log('[AuthFlow] Auth response received:', {
        status: authResponse.status,
        ok: authResponse.ok
      })

      // Check if authentication succeeded
      if (!authResponse.ok) {
        const errorData = await authResponse.json()
        console.error('[AuthFlow] Auth failed - server error:', errorData)
        throw new Error(errorData.error || 'Authentication failed')
      }

      const authData: AuthResponse = await authResponse.json()
      console.log('[AuthFlow] Auth data parsed:', {
        success: authData.success,
        hasUser: !!authData.user,
        user: authData.user
      })

      if (!authData.success || !authData.user) {
        console.error('[AuthFlow] Auth failed - invalid response:', authData)
        throw new Error(authData.error || 'Authentication failed')
      }

      // Success! Transition to authenticated state
      console.log('[AuthFlow] Authentication successful! Transitioning to authenticated state')
      setStatus('AUTHENTICATED')
      onAuthenticated(authData.user, cameraResult)

    } catch (err: any) {
      console.error('[AuthFlow] Authentication error:', err)
      setError(err.message || 'Invalid PIN. Please try again.')
      setStatus('ENTERING_PIN')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full">
        {status === 'SELECTING_USER' && (
          <UserGrid onSelectUser={handleSelectUser} />
        )}

        {(status === 'ENTERING_PIN' || status === 'AUTHENTICATING') && selectedUser && (
          <PinPad
            userName={selectedUser.full_name}
            onSubmit={handlePinSubmit}
            onBack={handleBack}
            isLoading={status === 'AUTHENTICATING'}
            error={error}
          />
        )}

        {status === 'AUTHENTICATING' && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Authenticating...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
