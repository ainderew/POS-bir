import { render, act } from '@testing-library/react';
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

describe('GlobalScanHandler', () => {
  let addItemMock: jest.Mock;
  let handleInventoryScanMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    addItemMock = jest.fn().mockResolvedValue(true);
    handleInventoryScanMock = jest.fn();

    // Fix Zustand Mocks to handle selector
    (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        if (selector) return selector({ addItem: addItemMock });
        return { addItem: addItemMock };
    });

    (useInventoryStore as unknown as jest.Mock).mockImplementation((selector) => {
        if (selector) return selector({ handleScan: handleInventoryScanMock });
        return { handleScan: handleInventoryScanMock };
    });
    
    // Mock global fetch for POS product lookup
    (global.fetch as jest.Mock).mockResolvedValue({
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
});
