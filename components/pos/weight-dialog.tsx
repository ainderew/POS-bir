"use client";

import type React from "react";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (isOpen) {
      setWeight("");
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const parsedWeight = Number.parseFloat(weight);
    if (parsedWeight > 0) {
      if (product && parsedWeight > product.stock_level) {
        return; // Guard against confirming invalid weight
      }
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

  const isInvalid = weight !== "" && product !== null && Number.parseFloat(weight) > product.stock_level;

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
            <div className="flex justify-between items-center">
              <Label htmlFor="weight">Weight (kg)</Label>
              {product && (
                <span className="text-xs font-medium text-muted-foreground">
                  Available: {Number(product.stock_level).toFixed(3)} kg
                </span>
              )}
            </div>
            <Input
              id="weight"
              type="number"
              step="0.001"
              min="0.001"
              max={product?.stock_level}
              placeholder="0.000"
              value={weight}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || Number.parseFloat(val) >= 0) {
                  setWeight(val);
                }
              }}
              onKeyDown={handleKeyDown}
              className={isInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
              autoFocus
            />
            {isInvalid && (
              <p className="text-xs font-medium text-destructive">
                Input weight exceeds available stock ({Number(product?.stock_level).toFixed(3)} kg)
              </p>
            )}
          </div>

          {weight && product && !isInvalid && (

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
            disabled={!weight || Number.parseFloat(weight) <= 0 || isInvalid}
          >
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
