"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Wallet,
  Loader2,
  Banknote,
  Smartphone,
  CreditCard,
  CheckCircle2,
} from "lucide-react";

interface ShiftClosingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: {
    actualCash: number;
    actualGcash: number;
    actualMaya: number;
    actualCard: number;
  }) => void;
}

const DENOMINATIONS = [
  { label: "₱1,000", value: 1000 },
  { label: "₱500", value: 500 },
  { label: "₱200", value: 200 },
  { label: "₱100", value: 100 },
  { label: "₱50", value: 50 },
  { label: "₱20", value: 20 },
  { label: "₱10", value: 10 },
  { label: "₱5", value: 5 },
  { label: "₱1", value: 1 },
];

export function ShiftClosingDialog({
  isOpen,
  onClose,
  onConfirm,
}: ShiftClosingDialogProps) {
  const [step, setStep] = useState(1);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [actualGcash, setActualGcash] = useState("");
  const [actualMaya, setActualMaya] = useState("");
  const [actualCard, setActualCard] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCounts({});
      setActualGcash("");
      setActualMaya("");
      setActualCard("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const calculateTotalCash = () => {
    return DENOMINATIONS.reduce((sum, d) => {
      const count = parseFloat(counts[d.label] || "0");
      return sum + count * d.value;
    }, 0);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        actualCash: calculateTotalCash(),
        actualGcash: parseFloat(actualGcash || "0"),
        actualMaya: parseFloat(actualMaya || "0"),
        actualCard: parseFloat(actualCard || "0"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            End Shift - Blind Balance Audit
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Step 1: Count physical cash in the drawer."
              : "Step 2: Audit digital payments from store phone/terminal."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {DENOMINATIONS.map((d) => (
                <div key={d.label} className="flex items-center gap-2">
                  <Label className="w-16 text-right text-xs font-bold">
                    {d.label}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-9 font-mono"
                    value={counts[d.label] || ""}
                    onChange={(e) =>
                      setCounts({ ...counts, [d.label]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <span className="text-sm font-bold uppercase">
                Total Cash Counted:
              </span>
              <span className="text-xl font-mono font-black text-green-700">
                ₱{" "}
                {calculateTotalCash().toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <Button className="w-full h-12" onClick={() => setStep(2)}>
              Next: Digital Payments Audit
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-blue-600" />
                  <Label
                    htmlFor="actualGcash"
                    className="text-xs font-bold uppercase"
                  >
                    Total GCash Received
                  </Label>
                </div>
                <Input
                  id="actualGcash"
                  type="number"
                  placeholder="Check store phone GCash history"
                  className="h-12 text-lg font-mono font-bold"
                  value={actualGcash}
                  onChange={(e) => setActualGcash(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  <Label
                    htmlFor="actualMaya"
                    className="text-xs font-bold uppercase"
                  >
                    Total Maya Received
                  </Label>
                </div>
                <Input
                  id="actualMaya"
                  type="number"
                  placeholder="Check store phone Maya history"
                  className="h-12 text-lg font-mono font-bold"
                  value={actualMaya}
                  onChange={(e) => setActualMaya(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-slate-700" />
                  <Label
                    htmlFor="actualCard"
                    className="text-xs font-bold uppercase"
                  >
                    Total Card Sales
                  </Label>
                </div>
                <Input
                  id="actualCard"
                  type="number"
                  placeholder="Sum up all terminal credit slips"
                  className="h-12 text-lg font-mono font-bold"
                  value={actualCard}
                  onChange={(e) => setActualCard(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] text-amber-800 font-medium uppercase leading-tight">
                Warning: Do not copy numbers from the POS. Use the actual phone
                and terminal to verify these amounts.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                className="flex-[2] h-12"
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Finalize & Close Shift
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
