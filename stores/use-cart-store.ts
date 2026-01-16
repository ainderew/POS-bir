import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem, Product, Shift } from '@/lib/types';
import { toast } from 'sonner';

interface CartState {
  items: CartItem[];
  activeShift: Shift | null;
  addItem: (product: Product, quantity?: number) => Promise<boolean>;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setActiveShift: (shift: Shift | null) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      activeShift: null,

      addItem: async (product: Product, quantity = 1) => {
        const { items } = get();
        const existingItem = items.find((item) => item.product.id === product.id);
        const stockLevel = Number(product.stock_level);

        // Basic Stock Check
        if (stockLevel <= 0) {
            toast.error(`${product.name} is out of stock`);
            return false;
        }

        if (existingItem) {
          const newQuantity = existingItem.quantity + quantity;
          if (newQuantity > stockLevel) {
            toast.error(`Only ${stockLevel} available`);
            return false;
          }
          set({
            items: items.map((item) =>
              item.product.id === product.id
                ? { ...item, quantity: newQuantity }
                : item
            ),
          });
        } else {
            // New Item
            if (quantity > stockLevel) {
                toast.error(`Only ${stockLevel} available`);
                return false;
            }
            set({ items: [...items, { product, quantity }] });
        }
        return true;
      },

      removeItem: (productId: string) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        }));
      },

      updateQuantity: (productId: string, quantity: number) => {
        set((state) => ({
            items: state.items.map(item => 
                item.product.id === productId ? { ...item, quantity } : item
            )
        }));
      },

      clearCart: () => set({ items: [] }),
      
      setActiveShift: (shift) => set({ activeShift: shift }),
    }),
    {
      name: 'pos-cart-storage',
      partialize: (state) => ({ items: state.items, activeShift: state.activeShift }), // Only persist data, not actions
    }
  )
);
