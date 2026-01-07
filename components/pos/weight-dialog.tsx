"use client";

import type React from "react";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Product } from "@/lib/types";

interface WeightDialogProps {
  product: Product | null;
  isOpen: boolean;
  onConfirm: (weight: number) => void;
  onCancel: () => void;
}

export function WeightDialog({
  product,
  isOpen,
  onConfirm,
  onCancel,
}: WeightDialogProps) {
  const [weight, setWeight] = useState("");

  const handleConfirm = () => {
    const parsedWeight = Number.parseFloat(weight);
    if (parsedWeight > 0) {
      onConfirm(parsedWeight);
      setWeight("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter Weight</DialogTitle>
          <DialogDescription>
            How much {product?.name} are you selling?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.001"
              placeholder="0.000"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {weight && product && (
            <div className="bg-muted p-4 rounded-lg">
              <div className="text-sm text-muted-foreground">Total Price</div>
              <div className="text-2xl font-bold">
                P
                {(Number.parseFloat(weight) * product.selling_price).toFixed(2)}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!weight || Number.parseFloat(weight) <= 0}
          >
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
