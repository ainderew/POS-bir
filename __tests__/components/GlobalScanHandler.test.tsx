import { render, act, screen, fireEvent } from '@testing-library/react';
import { GlobalScanHandler } from '../../components/global-scan-handler';
import { useCartStore } from '../../stores/use-cart-store';
import { useInventoryStore } from '../../stores/use-inventory-store';

// Mock dependencies
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('../../stores/use-cart-store');
jest.mock('../../stores/use-inventory-store');
jest.mock('../../utils/audio', () => ({
  playSound: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

const mockUsePathname = require('next/navigation').usePathname;
const { toast: mockToast } = require('sonner');
const { playSound: mockPlaySound } = require('../../utils/audio');
const actualInventoryStore = jest.requireActual('../../stores/use-inventory-store').useInventoryStore;

const flushPromises = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};

describe('GlobalScanHandler', () => {
  let addItemMock: jest.Mock;
  let handleInventoryScanMock: jest.Mock;
  let activeShift: { id: string } | null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    addItemMock = jest.fn().mockResolvedValue(true);
    activeShift = { id: 'shift-1' };
    handleInventoryScanMock = jest.fn().mockResolvedValue(true);

    // Fix Zustand Mocks to handle selector
    (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = { addItem: addItemMock, activeShift };
        if (selector) return selector(state);
        return state;
    });

    (useInventoryStore as unknown as jest.Mock).mockImplementation((selector) => {
        if (selector) return selector({ handleScan: handleInventoryScanMock });
        return { handleScan: handleInventoryScanMock };
    });
    
    // Mock global fetch for POS product lookup
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ([{ barcode: '123', name: 'Test Product' }])
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const simulateScan = (barcode: string) => {
    let currentTime = 1000;
    const fireKey = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: true });
      jest.setSystemTime(currentTime);
      window.dispatchEvent(event);
      currentTime += 10;
    };

    act(() => {
      barcode.split('').forEach(char => fireKey(char));
      fireKey('Enter');
    });
  };

  test('Test Case 1: POS Routing', async () => {
    mockUsePathname.mockReturnValue('/pos');
    render(<GlobalScanHandler />);

    simulateScan('123');

    await act(async () => {
        await Promise.resolve(); // Flush promises
        await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('123'));
    expect(addItemMock).toHaveBeenCalled();
    expect(handleInventoryScanMock).not.toHaveBeenCalled();
  });

  test('POS: scans are refused until a shift is open (cashier login / shift-open screens)', async () => {
    mockUsePathname.mockReturnValue('/pos');
    activeShift = null;
    render(<GlobalScanHandler />);

    simulateScan('123');
    await flushPromises();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(addItemMock).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith('Open a shift before scanning items');
  });

  test('the home page is not a POS screen: scans there are ignored', async () => {
    mockUsePathname.mockReturnValue('/');
    render(<GlobalScanHandler />);

    simulateScan('123');
    await flushPromises();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(addItemMock).not.toHaveBeenCalled();
  });

  test('POS: a scan into a focused field (e.g. amount tendered) still goes to the cart', async () => {
    mockUsePathname.mockReturnValue('/pos');
    render(<GlobalScanHandler />);
    const tendered = document.createElement('input');
    tendered.value = '500';
    document.body.appendChild(tendered);
    tendered.focus();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ([{ barcode: '1234', name: 'Soap' }]) });

    let t = 1000;
    act(() => {
      for (const key of [...'1234', 'Enter']) {
        jest.setSystemTime((t += 10));
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        tendered.dispatchEvent(event);
        if (key !== 'Enter' && !event.defaultPrevented) tendered.value += key;
      }
    });
    await flushPromises();

    expect(tendered.value).toBe('500');
    expect(global.fetch).toHaveBeenCalledWith('/api/products?search=1234');
    expect(addItemMock).toHaveBeenCalledWith({ barcode: '1234', name: 'Soap' }, 1);
    document.body.removeChild(tendered);
  });

  test('Test Case 2: Inventory Routing', async () => {
    mockUsePathname.mockReturnValue('/inventory');
    render(<GlobalScanHandler />);

    simulateScan('456');

    await act(async () => {
        await Promise.resolve();
    });

    expect(handleInventoryScanMock).toHaveBeenCalledWith('456');
    expect(addItemMock).not.toHaveBeenCalled();
  });

  test('POS: a server error is reported as an error, not as "Product not found"', async () => {
    mockUsePathname.mockReturnValue('/pos');
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to fetch products' })
    });
    render(<GlobalScanHandler />);

    simulateScan('123');
    await flushPromises();

    expect(addItemMock).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to look up/i));
    expect(mockToast.error).not.toHaveBeenCalledWith('Product not found');
    expect(mockPlaySound).toHaveBeenCalledWith('error');
  });

  test('POS: an OK empty result is "Product not found"', async () => {
    mockUsePathname.mockReturnValue('/pos');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ([]) });
    render(<GlobalScanHandler />);

    simulateScan('999');
    await flushPromises();

    expect(addItemMock).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith('Product not found');
  });

  test('POS: a WEIGHT product asks for the weight before adding to the cart', async () => {
    mockUsePathname.mockReturnValue('/pos');
    const rice = { id: 'rice', barcode: '789', name: 'Rice', unit_type: 'WEIGHT', stock_level: 10, selling_price: 50 };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ([rice]) });
    render(<GlobalScanHandler />);

    simulateScan('789');
    await flushPromises();

    expect(addItemMock).not.toHaveBeenCalled();
    expect(screen.getByText('Enter Weight')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await flushPromises();

    expect(addItemMock).toHaveBeenCalledWith(rice, 1.5);
  });

  describe('Inventory scan lookup (real inventory store)', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/inventory');
      actualInventoryStore.getState().closeModals();
      (useInventoryStore as unknown as jest.Mock).mockImplementation((selector) => actualInventoryStore(selector));
    });

    test('a server error does not open the Add Product modal', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Failed to fetch products' })
      });
      render(<GlobalScanHandler />);

      simulateScan('456');
      await flushPromises();

      expect(actualInventoryStore.getState().isAddModalOpen).toBe(false);
      expect(actualInventoryStore.getState().isRestockModalOpen).toBe(false);
      expect(mockToast.error).toHaveBeenCalled();
      expect(mockPlaySound).toHaveBeenCalledWith('error');
    });

    test('an OK empty result opens the Add Product modal with the barcode', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ([]) });
      render(<GlobalScanHandler />);

      simulateScan('456');
      await flushPromises();

      expect(actualInventoryStore.getState().isAddModalOpen).toBe(true);
      expect(actualInventoryStore.getState().scannedBarcode).toBe('456');
      expect(mockToast.error).not.toHaveBeenCalled();
    });
  });
});
