"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, User, Monitor, FileJson } from "lucide-react"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AuditLog {
  id: string
  action_type: string
  created_at: string
  user_name: string | null
  terminal_ptu: string | null
  audit_image: string | null
  audit_metadata: any
}

interface AuditLogsTableProps {
  logs: AuditLog[]
}

export function AuditLogsTable({ logs }: AuditLogsTableProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedMetadata, setSelectedMetadata] = useState<any | null>(null)

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Terminal</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead className="text-right">Image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No audit logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">
                    {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{log.user_name || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getBadgeVariant(log.action_type, log.audit_metadata)}>
                      {formatActionType(log.action_type, log.audit_metadata)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.terminal_ptu ? (
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span>{log.terminal_ptu}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 text-muted-foreground"
                      onClick={() => setSelectedMetadata(log.audit_metadata)}
                    >
                      <FileJson className="h-4 w-4" />
                      <span className="text-xs">View Details</span>
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    {log.audit_image ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedImage(log.audit_image)}
                      >
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No Image</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Audit Photo</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-4 bg-black/5 rounded-lg">
            {selectedImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={selectedImage}
                alt="Audit Capture"
                className="max-w-full max-h-[400px] rounded-md border shadow-sm"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedMetadata} onOpenChange={(open) => !open && setSelectedMetadata(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Metadata</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/50 p-4">
            <pre className="text-sm font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(selectedMetadata, null, 2)}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

function getBadgeVariant(action: string, metadata: any): "default" | "secondary" | "destructive" | "outline" {
  if (action === "MANUAL_AUDIT" && metadata?.event === "USER_LOGIN") {
    return "default"
  }

  switch (action) {
    case "SHIFT_OPEN":
      return "default"
    case "SHIFT_CLOSE":
    case "Z_READING":
      return "secondary"
    case "SAFE_DROP":
    case "CASH_OUT":
    case "LINE_VOID":
    case "TRANSACTION_VOID":
      return "destructive"
    default:
      return "outline"
  }
}

function formatActionType(action: string, metadata: any) {
  if (action === "MANUAL_AUDIT" && metadata?.event === "USER_LOGIN") {
    return "USER LOGIN"
  }
  return action.replace(/_/g, " ")
}
