import { create } from 'zustand';
import { Product } from '@/lib/types';

interface InventoryState {
  isRestockModalOpen: boolean;
  isAddModalOpen: boolean;
  activeProduct: Product | null;
  scannedBarcode: string | null;

  setRestockModalOpen: (isOpen: boolean) => void;
  setAddModalOpen: (isOpen: boolean) => void;
  
  setActiveProduct: (product: Product | null) => void;
  setScannedBarcode: (barcode: string | null) => void;
  
  handleScan: (barcode: string) => Promise<void>;
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
        const res = await fetch(`/api/products?search=${barcode}`);
        const data = await res.json();
        
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
    } catch (error) {
        console.error("Scan Error", error);
    }
  },

  closeModals: () => set({ 
      isRestockModalOpen: false, 
      isAddModalOpen: false, 
      activeProduct: null, 
      scannedBarcode: null 
  }),
}));
