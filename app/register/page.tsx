"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Monitor, Save, Loader2 } from "lucide-react"

const schema = z.object({
  ptuNumber: z.string().min(1, "PTU Number is required"),
  serialNumber: z.string().min(1, "Serial Number is required"),
})

type RegisterForm = z.infer<typeof schema>

export default function RegisterPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(schema)
  })

  const onSubmit = async (data: RegisterForm) => {
    setIsSubmitting(true)
    try {
      // 1. Register with Database
      const res = await fetch("/api/terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })

      if (!res.ok) {
        const text = await res.text()
        let message = "Registration failed"
        try {
          const error = JSON.parse(text)
          message = error.error || message
        } catch {
          message = text || message
        }
        throw new Error(message)
      }

      const terminal = await res.json()
      console.log("[Register] Terminal created:", terminal.id)

      // 2. Persist ID Securely
      if (window.electronAPI) {
        await window.electronAPI.saveTerminalId(terminal.id)
      } else {
        localStorage.setItem("pos_terminal_id", terminal.id)
      }

      toast.success("Terminal registered successfully!")

      // 3. Redirect to POS (use window.location as fallback for Electron)
      window.location.href = "/pos"

    } catch (error: any) {
      console.error("[Register] Error:", error)
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Terminal Setup</CardTitle>
          <CardDescription>
            Register this device to start processing sales. 
            Enter the details found on your BIR permit.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ptuNumber">PTU Number</Label>
              <Input 
                id="ptuNumber" 
                placeholder="e.g. FP052023-123-12345" 
                {...register("ptuNumber")}
              />
              {errors.ptuNumber && <p className="text-sm text-red-500">{errors.ptuNumber.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="serialNumber">Device Serial Number</Label>
              <Input 
                id="serialNumber" 
                placeholder="e.g. SN-99887766" 
                {...register("serialNumber")}
              />
              {errors.serialNumber && <p className="text-sm text-red-500">{errors.serialNumber.message}</p>}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Register Terminal
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
