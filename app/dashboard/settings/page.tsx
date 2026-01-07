"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { 
  Store, 
  ShieldCheck, 
  Receipt, 
  Calculator, 
  Save, 
  Loader2, 
  ArrowLeft,
  FileText,
  History
} from "lucide-react"
import Link from "next/link"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { ManagerAuthDialog } from "@/components/pos/manager-auth-dialog"

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isZReadingLoading, setIsZReadingLoading] = useState(false)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  
  const [settings, setSettings] = useState({
    business_name: "",
    business_address: "",
    business_tin: "",
    manager_pin: "",
    vat_rate: "12",
    auto_print: false,
    accumulated_grand_total: "0.00"
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      const data = await response.json()
      if (response.ok) {
        setSettings({
          ...data,
          auto_print: data.auto_print === "true"
        })
      }
    } catch (error) {
      toast.error("Failed to load settings")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      })
      if (response.ok) {
        toast.success("Settings saved successfully")
      } else {
        toast.error("Failed to save settings")
      }
    } catch (error) {
      toast.error("An error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const handleZReadingTrigger = () => {
    setIsAuthDialogOpen(true)
  }

  const [lastZData, setLastZData] = useState<any>(null)
  const [isZSummaryOpen, setIsZSummaryOpen] = useState(false)

  const runZReading = async (pin: string) => {
    setIsZReadingLoading(true)
    try {
      const response = await fetch("/api/reports/z-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      })
      const data = await response.json()
      
      if (response.ok) {
        toast.success("Z-Reading completed successfully!")
        setLastZData(data)
        setIsZSummaryOpen(true)
        fetchSettings() // Refresh grand total
      } else {
        toast.error(data.error || "Z-Reading failed")
      }
    } catch (error) {
      toast.error("An error occurred during Z-reading")
    } finally {
      setIsZReadingLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">System Settings</h1>
              <p className="text-muted-foreground">Manage business info and compliance protocols</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Business Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Business Profile
              </CardTitle>
              <CardDescription>Required for BIR compliant receipts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_name">Registered Business Name</Label>
                <Input 
                  id="business_name" 
                  value={settings.business_name} 
                  onChange={(e) => setSettings({...settings, business_name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_tin">Business TIN</Label>
                <Input 
                  id="business_tin" 
                  value={settings.business_tin} 
                  onChange={(e) => setSettings({...settings, business_tin: e.target.value})}
                  placeholder="000-000-000-000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_address">Registered Address</Label>
                <Input 
                  id="business_address" 
                  value={settings.business_address} 
                  onChange={(e) => setSettings({...settings, business_address: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>

          {/* Security & Compliance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Security & Tax
              </CardTitle>
              <CardDescription>Authentication and tax rates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manager_pin">Manager PIN</Label>
                <Input 
                  id="manager_pin" 
                  type="password" 
                  maxLength={4}
                  value={settings.manager_pin} 
                  onChange={(e) => setSettings({...settings, manager_pin: e.target.value})}
                />
                <p className="text-[10px] text-muted-foreground italic">Required for Voids and Z-Readings</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat_rate">VAT Rate (%)</Label>
                <Input 
                  id="vat_rate" 
                  type="number"
                  value={settings.vat_rate} 
                  onChange={(e) => setSettings({...settings, vat_rate: e.target.value})}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-print Receipt</Label>
                  <p className="text-xs text-muted-foreground">Print immediately after checkout</p>
                </div>
                <Switch 
                  checked={settings.auto_print} 
                  onCheckedChange={(checked) => setSettings({...settings, auto_print: checked})}
                />
              </div>
            </CardContent>
          </Card>

          {/* Audit & Readings */}
          <Card className="md:col-span-2 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                BIR Audit & Readings
              </CardTitle>
              <CardDescription>Critical end-of-day operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 bg-background rounded-lg border shadow-sm">
                  <p className="text-sm text-muted-foreground mb-1">Accumulated Grand Total</p>
                  <p className="text-2xl font-bold">₱ {parseFloat(settings.accumulated_grand_total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-destructive mt-1 font-medium">NON-RESETTABLE</p>
                </div>
                <div className="md:col-span-2 flex flex-col justify-center gap-4">
                  <div className="flex gap-4">
                    <Button 
                      className="flex-1 h-12 text-lg" 
                      variant="destructive"
                      onClick={handleZReadingTrigger}
                      disabled={isZReadingLoading}
                    >
                      {isZReadingLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5 mr-2" />}
                      Run Z-Reading
                    </Button>
                    <Button className="flex-1 h-12 text-lg" variant="outline">
                      <History className="h-5 w-5 mr-2" />
                      Reading History
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Note: Z-Reading will close the day, update the Grand Total, and reset the daily counter. This action cannot be undone.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ManagerAuthDialog 
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        onAuthenticated={runZReading}
        title="Authorize Z-Reading"
        description="Please enter the manager PIN to close the business day and update the grand total."
      />

      <Dialog open={isZSummaryOpen} onOpenChange={setIsZSummaryOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Z-Reading Summary
            </DialogTitle>
            <DialogDescription>
              Business day successfully closed.
            </DialogDescription>
          </DialogHeader>
          {lastZData && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Reading Date:</span>
                <span className="text-right font-medium">{new Date(lastZData.reading_date).toLocaleString()}</span>
                <span className="text-muted-foreground">Invoice Range:</span>
                <span className="text-right font-medium">{lastZData.beginning_invoice} - {lastZData.ending_invoice}</span>
                <Separator className="col-span-2 my-2" />
                
                <span className="text-muted-foreground font-bold">Today's Sales:</span>
                <span className="text-right font-bold text-primary">₱ {parseFloat(lastZData.total_sales).toFixed(2)}</span>
                
                <Separator className="col-span-2 my-2" />
                <div className="col-span-2 bg-muted/30 p-2 rounded text-[10px] space-y-1">
                    <p className="font-bold uppercase text-[8px] text-muted-foreground mb-2">Cash Breakdown</p>
                    <div className="flex justify-between">
                        <span>Beginning Funds:</span>
                        <span>₱{lastZData.cash_breakdown.beginning_funds.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Cash Sales:</span>
                        <span>₱{lastZData.cash_breakdown.cash_sales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Cash In:</span>
                        <span>₱{lastZData.cash_breakdown.cash_in.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                        <span>Cash Out:</span>
                        <span>(₱{lastZData.cash_breakdown.cash_out.toFixed(2)})</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                        <span>Safe Drops:</span>
                        <span>(₱{lastZData.cash_breakdown.safe_drops.toFixed(2)})</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-bold">
                        <span>Theoretical Cash:</span>
                        <span>₱{lastZData.cash_breakdown.theoretical_cash.toFixed(2)}</span>
                    </div>
                </div>

                <Separator className="col-span-2 my-2" />
                <span className="text-muted-foreground font-bold">New Grand Total:</span>
                <span className="text-right font-bold text-destructive">₱ {parseFloat(lastZData.accumulated_grand_total).toFixed(2)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => window.print()} variant="outline">
              <Receipt className="h-4 w-4 mr-2" />
              Print Report
            </Button>
            <Button onClick={() => setIsZSummaryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
