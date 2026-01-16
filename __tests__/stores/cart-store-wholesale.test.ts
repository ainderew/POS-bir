import { act } from '@testing-library/react';
import { useCartStore } from '../../stores/use-cart-store';
import { Product } from '../../lib/types';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

const mockProduct = (overrides?: Partial<Product>): Product => ({
  id: 'prod-wholesale',
  name: 'Wholesale Test',
  barcode: '999999',
  selling_price: 100,
  cost_price: 80,
  stock_level: 100,
  unit_type: 'QUANTITY',
  category_id: 'cat-1',
  tax_category: 'VATABLE',
  supplier_type: 'WHOLESALER',
  is_low_stock: false,
  low_stock_threshold: 5,
  notify_low_stock: true,
  is_promo: false,
  promo_price: null,
  wholesale_price: 90,
  wholesale_threshold: 10,
  pos_id: 'pos-1',
  is_synced: true,
  ...overrides,
});

describe('Cart Store Wholesale Logic', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  test('Test Case 1: Triggering the Discount', async () => {
    const product = mockProduct({ selling_price: 100, wholesale_price: 90, wholesale_threshold: 10 });

    // Add 9 items
    await act(async () => {
      for (let i = 0; i < 9; i++) {
        await useCartStore.getState().addItem(product);
      }
    });

    let items = useCartStore.getState().items;
    expect(items[0]?.quantity).toBe(9);
    expect(items[0]?.active_price).toBe(100);

    // Add 1 more (Total 10)
    await act(async () => {
      await useCartStore.getState().addItem(product);
    });

    items = useCartStore.getState().items;
    expect(items[0]?.quantity).toBe(10);
    expect(items[0]?.active_price).toBe(90);
    expect((items[0]?.active_price || 0) * (items[0]?.quantity || 0)).toBe(900);
  });

  test('Test Case 2: Reverting', async () => {
    const product = mockProduct({ selling_price: 100, wholesale_price: 90, wholesale_threshold: 10 });

    // Start with 10 items
    await act(async () => {
      await useCartStore.getState().addItem(product, 10);
    });

    let items = useCartStore.getState().items;
    expect(items[0]?.active_price).toBe(90);

    // Update quantity to 9
    await act(async () => {
      useCartStore.getState().updateQuantity(product.id, 9);
    });

    items = useCartStore.getState().items;
    expect(items[0]?.quantity).toBe(9);
    expect(items[0]?.active_price).toBe(100);
  });
});
