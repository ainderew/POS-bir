"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Plus, User, Phone, MapPin, Loader2, History } from "lucide-react"
import { Customer } from "@/lib/types"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface CustomerSelectDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (customer: Customer) => void
}

export function CustomerSelectDialog({ isOpen, onClose, onSelect }: CustomerSelectDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<Customer[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [createMode, setCreateMode] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  
  // New Customer Form State
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newAddress, setNewAddress] = useState("")

  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Debounced Search
  useEffect(() => {
    if (!isOpen) return
    
    // Reset state on open
    if (searchQuery === "" && !createMode) {
        setResults([])
    }
    
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2 && !createMode) {
        setIsSearching(true)
        try {
          const res = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`)
          const data = await res.json()
          setResults(Array.isArray(data) ? data : [])
        } catch (error) {
          console.error("Search failed", error)
        } finally {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery, isOpen, createMode])

  useEffect(() => {
    if (isOpen && !createMode) {
        setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen, createMode])

  const handleCreate = async () => {
    if (!newName || !newPhone) {
        toast.error("Name and Phone Number are required")
        return
    }

    setIsCreating(true)
    try {
        const res = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: newName,
                phone_number: newPhone,
                address: newAddress,
                credit_limit: 1000 // Default limit, can be changed by manager later
            })
        })

        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || "Failed to create customer")
        }

        const newCustomer = await res.json()
        toast.success("Customer created")
        onSelect(newCustomer)
        onClose()
    } catch (error: any) {
        toast.error(error.message)
    } finally {
        setIsCreating(false)
    }
  }

  const switchToCreate = () => {
      setNewName(searchQuery) // Pre-fill name
      setCreateMode(true)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>{createMode ? "New Customer" : "Find Customer"}</DialogTitle>
        </DialogHeader>
        
        <div className="p-4 pt-0">
          {!createMode ? (
            <div className="space-y-4">
               <div className="relative">
                 <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                 <Input 
                   ref={searchInputRef}
                   placeholder="Search by Name or Phone..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="pl-9 h-12 text-lg"
                 />
                 {isSearching && (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                 )}
               </div>
               
               <div className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-2">
                  {results.length === 0 && searchQuery.length >= 2 && !isSearching ? (
                      <div className="text-center py-8">
                          <p className="text-muted-foreground mb-4">No customer found for "{searchQuery}"</p>
                          <Button onClick={switchToCreate} className="w-full">
                              <Plus className="mr-2 h-4 w-4" />
                              Create New Customer
                          </Button>
                      </div>
                  ) : results.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                          <User className="h-8 w-8 mb-2 opacity-50" />
                          Start typing to search...
                      </div>
                  ) : (
                      results.map(c => (
                          <div 
                            key={c.id} 
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer group transition-colors"
                            onClick={() => {
                                onSelect(c)
                                onClose()
                            }}
                          >
                             <div className="flex-1">
                                 <div className="flex items-center gap-2">
                                     <span className="font-bold text-base">{c.full_name}</span>
                                     {c.credit_status === 'BLOCKED' && <Badge variant="destructive" className="h-5 text-[10px]">BLOCKED</Badge>}
                                     {c.credit_status === 'OVERDUE' && <Badge variant="outline" className="text-orange-500 border-orange-500 h-5 text-[10px]">OVERDUE</Badge>}
                                 </div>
                                 <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                     <span className="flex items-center gap-1 text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                                         <Phone className="h-3 w-3" />
                                         {c.phone_number || "No Phone"}
                                     </span>
                                     {c.address && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {c.address}
                                        </span>
                                     )}
                                 </div>
                                 <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                                    <History className="h-3 w-3" />
                                    Last visit: {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString() : 'Never'}
                                 </div>
                             </div>
                             <div className="text-right">
                                 <div className={cn(
                                     "font-bold",
                                     c.current_debt_balance > 0 ? "text-red-600" : "text-green-600"
                                 )}>
                                     ₱{c.current_debt_balance.toFixed(2)}
                                 </div>
                                 <div className="text-[10px] text-muted-foreground">Balance</div>
                             </div>
                          </div>
                      ))
                  )}
                  
                  {results.length > 0 && (
                      <div className="pt-2 border-t">
                          <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={switchToCreate}>
                              <Plus className="mr-2 h-4 w-4" />
                              Not in list? Create New
                          </Button>
                      </div>
                  )}
               </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Full Name</label>
                    <Input 
                        value={newName} 
                        onChange={e => setNewName(e.target.value)} 
                        placeholder="Juan Dela Cruz"
                        autoFocus
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Mobile Number <span className="text-red-500">*</span></label>
                    <Input 
                        value={newPhone} 
                        onChange={e => setNewPhone(e.target.value)} 
                        placeholder="0917..."
                    />
                    <p className="text-[11px] text-muted-foreground">Required for unique identification.</p>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Address / Barangay</label>
                    <Input 
                        value={newAddress} 
                        onChange={e => setNewAddress(e.target.value)} 
                        placeholder="Brgy. Poblacion"
                    />
                </div>
                
                <DialogFooter className="mt-6 gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setCreateMode(false)} type="button">Back</Button>
                    <Button onClick={handleCreate} disabled={isCreating || !newName || !newPhone} type="button">
                        {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Customer
                    </Button>
                </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
