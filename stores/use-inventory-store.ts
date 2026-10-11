import { create } from 'zustand';
import { toast } from 'sonner';
import type { Product } from '@/lib/types';

interface InventoryState {
  isRestockModalOpen: boolean;
  isAddModalOpen: boolean;
  activeProduct: Product | null;
  scannedBarcode: string | null;

  setRestockModalOpen: (isOpen: boolean) => void;
  setAddModalOpen: (isOpen: boolean) => void;
  
  setActiveProduct: (product: Product | null) => void;
  setScannedBarcode: (barcode: string | null) => void;
  
  /** Resolves true once the lookup completed (found or not found), false if it failed. */
  handleScan: (barcode: string) => Promise<boolean>;
  closeModals: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  isRestockModalOpen: false,
  isAddModalOpen: false,
  activeProduct: null,
  scannedBarcode: null,

  setRestockModalOpen: (isOpen) => set({ isRestockModalOpen: isOpen }),
  setAddModalOpen: (isOpen) => set({ isAddModalOpen: isOpen }),
  setActiveProduct: (product) => set({ activeProduct: product }),
  setScannedBarcode: (barcode) => set({ scannedBarcode: barcode }),

  handleScan: async (barcode: string) => {
    try {
        // 1. Check if product exists
        // Note: For a "Scan-First" architecture to be truly snappy, we ideally want a local cache 
        // of all barcodes. For now, we fetch from API.
        const res = await fetch(`/api/products?search=${encodeURIComponent(barcode)}`);
        const data = res.ok ? await res.json() : null;

        // A server error is not "barcode not found" - don't open the Add Product modal for it
        if (!Array.isArray(data)) {
            toast.error("Failed to look up product. Please try again.");
            return false;
        }

        // Exact Match Logic
        const exactMatch = data.find((p: Product) => p.barcode === barcode);

        if (exactMatch) {
            // Path A: Product Exists -> Restock
            set({ 
                activeProduct: exactMatch, 
                isRestockModalOpen: true, 
                isAddModalOpen: false,
                scannedBarcode: null 
            });
            // playSound('success'); // Handled by Global Handler
        } else {
            // Path B: New Product -> Create
            set({ 
                activeProduct: null, 
                isRestockModalOpen: false, 
                isAddModalOpen: true, 
                scannedBarcode: barcode 
            });
            // playSound('new_item'); // Handled by Global Handler
        }
        return true;
    } catch (error) {
        console.error("Scan Error", error);
        toast.error("Failed to look up product. Please try again.");
        return false;
    }
  },

  closeModals: () => set({ 
      isRestockModalOpen: false, 
      isAddModalOpen: false, 
      activeProduct: null, 
      scannedBarcode: null 
  }),
}));
