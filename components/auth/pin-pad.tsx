"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Delete, ArrowRight } from "lucide-react"

interface PinPadProps {
  userName: string
  onSubmit: (pin: string) => void
  onBack: () => void
  isLoading?: boolean
  error?: string | null
}

export function PinPad({ userName, onSubmit, onBack, isLoading = false, error = null }: PinPadProps) {
  const [pin, setPin] = useState("")
  const maxLength = 6

  useEffect(() => {
    // Reset PIN when error changes (to clear on wrong PIN)
    if (error) {
      setPin("")
    }
  }, [error])

  const handleNumberClick = (num: string) => {
    if (pin.length < maxLength && !isLoading) {
      setPin(pin + num)
    }
  }

  const handleClear = () => {
    if (!isLoading) {
      setPin("")
    }
  }

  const handleSubmit = () => {
    if (pin.length >= 4 && pin.length <= maxLength && !isLoading) {
      onSubmit(pin)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (isLoading) return

    if (e.key >= '0' && e.key <= '9') {
      handleNumberClick(e.key)
    } else if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Backspace') {
      setPin(pin.slice(0, -1))
    } else if (e.key === 'Escape') {
      handleClear()
    }
  }

  return (
    <div className="w-full max-w-md mx-auto px-4" onKeyDown={handleKeyPress} tabIndex={0}>
      <div className="text-center mb-8">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-flex items-center"
        >
          ← Back to users
        </button>
        <h2 className="text-2xl font-bold mb-2">Enter PIN</h2>
        <p className="text-gray-600">Welcome, {userName}</p>
      </div>

      {/* PIN Display */}
      <div className="mb-8 bg-gray-100 rounded-lg p-6">
        <div className="flex justify-center items-center gap-3 min-h-[60px]">
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                i < pin.length
                  ? 'bg-primary border-primary scale-110'
                  : 'bg-white border-gray-300'
              }`}
            />
          ))}
        </div>
        {error && (
          <p className="text-center text-red-600 text-sm mt-3 font-medium">{error}</p>
        )}
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Button
            key={num}
            variant="outline"
            size="lg"
            onClick={() => handleNumberClick(num.toString())}
            disabled={isLoading || pin.length >= maxLength}
            className="h-16 text-2xl font-semibold hover:bg-primary hover:text-white transition-colors"
          >
            {num}
          </Button>
        ))}

        {/* Clear Button */}
        <Button
          variant="outline"
          size="lg"
          onClick={handleClear}
          disabled={isLoading || pin.length === 0}
          className="h-16 hover:bg-red-500 hover:text-white transition-colors"
        >
          <Delete className="h-5 w-5" />
        </Button>

        {/* Zero Button */}
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("0")}
          disabled={isLoading || pin.length >= maxLength}
          className="h-16 text-2xl font-semibold hover:bg-primary hover:text-white transition-colors"
        >
          0
        </Button>

        {/* Enter Button */}
        <Button
          variant="default"
          size="lg"
          onClick={handleSubmit}
          disabled={isLoading || pin.length < 4}
          className="h-16 bg-primary hover:bg-primary/90"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowRight className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Helper Text */}
      <p className="text-center text-sm text-gray-500">
        Enter 4-6 digit PIN
      </p>
    </div>
  )
}
