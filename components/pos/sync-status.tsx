"use client"

import { useState, useEffect } from "react"
import { Cloud, CloudOff, Info, RefreshCw } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function SyncStatus() {
  const [status, setStatus] = useState<any>({
    connected: false,
    lastSync: null,
    pendingTransactions: 0,
    error: null
  })
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    // Initial fetch
    if (window.electronAPI) {
      window.electronAPI.getSyncStatus().then(setStatus)

      // Listen for updates
      window.electronAPI.onSyncStatusUpdate((newStatus: any) => {
        setStatus(newStatus)
      })
    }
  }, [])

  const isWarning = status.pendingTransactions > 0 || !status.connected
  const isError = !status.connected && status.lastSync && (new Date().getTime() - new Date(status.lastSync).getTime() > 24 * 60 * 60 * 1000)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className="cursor-pointer p-2 rounded-full hover:bg-accent transition-colors"
            onClick={() => setIsDialogOpen(true)}
          >
            {status.connected ? (
              <Cloud className={`h-5 w-5 ${isWarning ? 'text-yellow-500' : 'text-green-500'}`} />
            ) : (
              <CloudOff className={`h-5 w-5 ${isError ? 'text-destructive' : 'text-yellow-500'}`} />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{status.connected ? 'Cloud Connected' : 'Working Offline'}</p>
          {status.pendingTransactions > 0 && <p className="text-xs">{status.pendingTransactions} pending sync</p>}
        </TooltipContent>
      </Tooltip>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              Sync Health Status
            </DialogTitle>
            <DialogDescription>
              Detailed information about your POS cloud backup.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Connectivity:</span>
              <Badge variant={status.connected ? "default" : "secondary"}>
                {status.connected ? "Online" : "Offline"}
              </Badge>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Last Backup:</span>
              <span className="font-medium">
                {status.lastSync ? new Date(status.lastSync).toLocaleString() : "Never"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Pending Transactions:</span>
              <Badge variant={status.pendingTransactions > 0 ? "destructive" : "outline"}>
                {status.pendingTransactions}
              </Badge>
            </div>

            {!status.connected && (
              <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-md border border-yellow-200 dark:border-yellow-900 mt-4">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    The POS is currently offline. All sales are being recorded locally. They will be backed up to the cloud automatically once internet is restored.
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />
          
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="h-8" disabled={!status.connected}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Sync Now
            </Button>
            <Button size="sm" className="h-8" onClick={() => setIsDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
