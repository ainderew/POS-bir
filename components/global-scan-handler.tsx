"use client"

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useScanDetection } from '@/hooks/use-scan-detection';
import { useCartStore } from '@/stores/use-cart-store';
import { useInventoryStore } from '@/stores/use-inventory-store';
import { WeightDialog } from '@/components/pos/weight-dialog';
import { playSound } from '@/utils/audio';
import { toast } from 'sonner';
import type { Product } from '@/lib/types';

export function GlobalScanHandler() {
  const pathname = usePathname();
  const addItem = useCartStore((state) => state.addItem);
  // Set by the POS page only once /api/shifts/current confirms an open shift
  const activeShift = useCartStore((state) => state.activeShift);
  const isPos = pathname === '/pos';
  const handleInventoryScan = useInventoryStore((state) => state.handleScan);
  // WEIGHT products need a weight before going into the cart (same dialog the POS grid/search uses)
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  const addToCart = async (product: Product, quantity: number) => {
    const success = await addItem(product, quantity);
    if (success) {
        playSound('success');
        toast.success(`Added ${product.name}`);
    } else {
        playSound('error');
    }
  };

  const onBarcodeScan = async (barcode: string) => {
    // 1. POS Mode (only with an open shift: not on the cashier login / shift-open screens)
    if (isPos) {
        if (!activeShift) {
            playSound('error');
            toast.error("Open a shift before scanning items");
            return;
        }
        // We need to fetch product by barcode first since addItem expects a Product object
        // The store currently expects a product object, let's quick fetch it
        // Optimally, the store's addItem should handle the lookup to be self-contained.
        // For this refactor, let's do the lookup here to keep the store clean or update store?
        // The prompt says "addItem(barcode)" in Part 2A instructions but the store implementation used Product object.
        // Let's update the store to accept barcode overload or handle lookup here.
        // I'll handle lookup here for safety.
        try {
            const res = await fetch(`/api/products?search=${encodeURIComponent(barcode)}`);
            const data = res.ok ? await res.json() : null;

            // A server error is not "not found" - only an OK (possibly empty) array is a real result
            if (!Array.isArray(data)) {
                playSound('error');
                toast.error("Failed to look up product. Please try again.");
                return;
            }

            const product = data.find((p: Product) => p.barcode === barcode);

            if (!product) {
                playSound('error');
                toast.error("Product not found");
            } else if (product.unit_type === 'WEIGHT') {
                if (Number(product.stock_level) <= 0) {
                    playSound('error');
                    toast.error(`${product.name} is out of stock`);
                } else {
                    setWeightProduct(product);
                }
            } else {
                await addToCart(product, 1);
            }
        } catch (e) {
            playSound('error');
            toast.error("Failed to look up product. Please try again.");
        }
    } 
    // 2. Inventory Mode
    else if (pathname.startsWith('/inventory')) {
        // The store opens the Restock / Add Product modal; it resolves false if the lookup failed
        const ok = await handleInventoryScan(barcode);
        playSound(ok ? 'success' : 'error');
    }
  };

  const handleWeightConfirm = async (weight: number) => {
    if (!weightProduct) return;
    const product = weightProduct;
    setWeightProduct(null);
    await addToCart(product, weight);
  };

  // On the POS screen a scan always goes to the cart, even while a field (search box,
  // amount tendered, a dialog input) has focus
  useScanDetection(onBarcodeScan, { captureInInputs: isPos });

  // Otherwise headless: only renders the weight prompt for scanned WEIGHT products
  return (
    <WeightDialog
      product={weightProduct}
      isOpen={weightProduct !== null}
      onConfirm={handleWeightConfirm}
      onCancel={() => setWeightProduct(null)}
    />
  );
}
