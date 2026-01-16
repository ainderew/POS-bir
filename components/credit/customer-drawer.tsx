"use client"

import { useState, useEffect } from "react"
import { CustomerCreditSummary, CollectionLog, LedgerEntry } from "@/lib/credit-types"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Loader2, Send, Edit, Check } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface CustomerDrawerProps {
  customer: CustomerCreditSummary | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
}

export function CustomerDrawer({ customer, open, onClose, onUpdate }: CustomerDrawerProps) {
  const [logs, setLogs] = useState<CollectionLog[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [newNote, setNewNote] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Credit Limit Edit State
  const [isEditingLimit, setIsEditingLimit] = useState(false)
  const [newLimit, setNewLimit] = useState("")
  const [isSavingLimit, setIsSavingLimit] = useState(false)

  useEffect(() => {
    if (customer && open) {
        fetchData(customer.id)
        setNewLimit(customer.credit_limit.toString())
        setIsEditingLimit(false)
    }
  }, [customer, open])

  const fetchData = async (id: string) => {
      setIsLoading(true)
      try {
          // Fetch Logs
          const logsRes = await fetch(`/api/customers/${id}/logs`)
          const logsData = await logsRes.json()
          setLogs(Array.isArray(logsData) ? logsData : [])

          // Fetch Ledger (SOA data)
          // We can reuse the SOA endpoint for this view
          const soaRes = await fetch(`/api/customers/${id}/soa`)
          const soaData = await soaRes.json()
          if (soaData.entries) {
              setLedger(soaData.entries)
          }
      } catch (error) {
          console.error("Fetch details error", error)
      } finally {
          setIsLoading(false)
      }
  }

  const handleAddNote = async () => {
      if (!customer || !newNote.trim()) return
      setIsSubmitting(true)
      try {
          const res = await fetch(`/api/customers/${customer.id}/logs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ note: newNote, userId: null }) // TODO: Pass actual user ID
          })
          if (res.ok) {
              toast.success("Note added")
              setNewNote("")
              fetchData(customer.id)
          }
      } catch (error) {
          toast.error("Failed to add note")
      } finally {
          setIsSubmitting(false)
      }
  }

  const handleUpdateLimit = async () => {
      if (!customer || !newLimit) return
      setIsSavingLimit(true)
      try {
          const res = await fetch(`/api/customers/${customer.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credit_limit: parseFloat(newLimit) })
          })
          
          if (!res.ok) throw new Error("Failed to update limit")
          
          toast.success("Credit limit updated")
          setIsEditingLimit(false)
          onUpdate() // Refresh parent to update local customer state
      } catch (error) {
          toast.error("Failed to update limit")
      } finally {
          setIsSavingLimit(false)
      }
  }

  if (!customer) return null

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col gap-0 p-0">
         <div className="p-6 pb-2 border-b bg-muted/20">
            <SheetHeader>
                <SheetTitle className="text-2xl">{customer.full_name}</SheetTitle>
                <SheetDescription>
                    {customer.phone_number} • {customer.credit_status}
                </SheetDescription>
            </SheetHeader>
            <div className="mt-4 flex items-center justify-between">
                <div>
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Current Debt</div>
                    <div className="text-3xl font-black text-red-600">₱{customer.current_debt_balance.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        Limit: 
                        {isEditingLimit ? (
                            <div className="flex items-center gap-1">
                                <Input 
                                    className="h-6 w-20 text-xs" 
                                    value={newLimit} 
                                    onChange={e => setNewLimit(e.target.value)}
                                    type="number"
                                />
                                <Button size="icon" className="h-6 w-6" onClick={handleUpdateLimit} disabled={isSavingLimit}>
                                    <Check className="h-3 w-3" />
                                </Button>
                            </div>
                        ) : (
                            <>
                                <span className="font-bold">₱{customer.credit_limit.toLocaleString()}</span>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-4 w-4 ml-1 opacity-50 hover:opacity-100"
                                    onClick={() => setIsEditingLimit(true)}
                                >
                                    <Edit className="h-3 w-3" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                <Badge variant={customer.credit_status === 'ACTIVE' ? "default" : "destructive"} className="text-base px-3 py-1">
                    {customer.credit_status}
                </Badge>
            </div>
         </div>

         <Tabs defaultValue="ledger" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-2">
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="ledger">Ledger History</TabsTrigger>
                    <TabsTrigger value="logs">Collection Logs</TabsTrigger>
                </TabsList>
            </div>
            
            <TabsContent value="ledger" className="flex-1 overflow-hidden p-0 m-0">
                <ScrollArea className="h-full px-6 py-4">
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : ledger.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No transaction history.</p>
                    ) : (
                        <div className="space-y-6 relative border-l-2 border-muted ml-3 pl-6">
                            {ledger.map((entry) => (
                                <div key={entry.id} className="relative">
                                    <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-background bg-muted-foreground/30 ring-4 ring-background" />
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-sm">
                                            {entry.entry_type === 'CHARGE' ? 'Bought Items' : entry.entry_type}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(entry.occurred_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div className="text-sm">
                                        {entry.entry_type === 'CHARGE' ? (
                                            <span className="text-red-600 font-medium">+₱{entry.amount.toLocaleString()}</span>
                                        ) : (
                                            <span className="text-green-600 font-medium">-₱{entry.amount.toLocaleString()}</span>
                                        )}
                                        <span className="mx-2 text-muted-foreground">→</span>
                                        <span className="text-muted-foreground text-xs">Bal: ₱{entry.running_balance.toLocaleString()}</span>
                                    </div>
                                    {entry.notes && <div className="text-xs text-muted-foreground mt-1 italic">"{entry.notes}"</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </TabsContent>
            
            <TabsContent value="logs" className="flex-1 flex flex-col overflow-hidden p-0 m-0">
                <ScrollArea className="flex-1 px-6 py-4">
                    {isLoading ? (
                         <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : logs.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No collection notes yet.</p>
                    ) : (
                        <div className="space-y-4">
                            {logs.map(log => (
                                <div key={log.id} className="bg-muted/50 p-3 rounded-lg border">
                                    <p className="text-sm">{log.note}</p>
                                    <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground uppercase">
                                        <span>{log.user_name || "System"}</span>
                                        <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
                <div className="p-4 border-t bg-background">
                    <div className="flex gap-2">
                        <Textarea 
                            placeholder="Log a visit, call, or promise to pay..." 
                            className="resize-none min-h-[60px]" 
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                        />
                        <Button size="icon" className="h-auto w-14" onClick={handleAddNote} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </TabsContent>
         </Tabs>
      </SheetContent>
    </Sheet>
  )
}
