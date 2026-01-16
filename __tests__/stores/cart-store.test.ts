import { act } from '@testing-library/react';
import { useCartStore } from '../../stores/use-cart-store';
import { calculateTransactionTotals } from '../../lib/ph-tax';
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
  id: 'prod-1',
  name: 'Test Product',
  barcode: '123456',
  selling_price: 100,
  cost_price: 80,
  stock_level: 10,
  unit_type: 'QUANTITY',
  category_id: 'cat-1',
  tax_category: 'VATABLE',
  supplier_type: 'WHOLESALER',
  is_low_stock: false,
  low_stock_threshold: 5,
  notify_low_stock: true,
  is_promo: false,
  promo_price: null,
  pos_id: 'pos-1',
  is_synced: true,
  ...overrides,
});

describe('Cart Store', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  test('Test Case 1: addItem logic', async () => {
    const product = mockProduct({ stock_level: 10, selling_price: 100 });

    await act(async () => {
      await useCartStore.getState().addItem(product);
      await useCartStore.getState().addItem(product);
    });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].product.selling_price * items[0].quantity).toBe(200);
  });

  test('Test Case 2: Stock Limit Prevention', async () => {
    const product = mockProduct({ stock_level: 1 });

    let firstResult, secondResult;
    await act(async () => {
        firstResult = await useCartStore.getState().addItem(product);
        secondResult = await useCartStore.getState().addItem(product);
    });

    const { items } = useCartStore.getState();
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(items[0].quantity).toBe(1);
  });

  test('Test Case 3: Totals Calculation', async () => {
    const vatableItem = mockProduct({ 
        id: 'vat-1', 
        name: 'Vatable Item', 
        selling_price: 112, 
        tax_category: 'VATABLE', 
        stock_level: 100 
    });
    
    const exemptItem = mockProduct({ 
        id: 'exempt-1', 
        name: 'Exempt Item', 
        selling_price: 100, 
        tax_category: 'VAT_EXEMPT', 
        stock_level: 100 
    });

    await act(async () => {
        await useCartStore.getState().addItem(vatableItem);
        await useCartStore.getState().addItem(exemptItem);
    });

    const { items } = useCartStore.getState();
    const totals = calculateTransactionTotals(items);

    // Vatable Item: 112 Gross -> 100 Net + 12 VAT
    // Exempt Item: 100 Gross -> 100 Net + 0 VAT
    // Total Net Sales: 100 + 12 + 100 = 212? No wait.
    // calculateTransactionTotals logic:
    // vatableSales (Net) = 100
    // vatAmount = 12
    // vatExemptSales = 100
    // netSales = 100 + 12 + 100 = 212.
    
    expect(totals.vatableSales).toBeCloseTo(100, 2);
    expect(totals.vatAmount).toBeCloseTo(12, 2);
    expect(totals.vatExemptSales).toBe(100);
    expect(totals.netSales).toBe(212);
  });
});
