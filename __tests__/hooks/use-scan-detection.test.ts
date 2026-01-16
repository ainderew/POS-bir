import { renderHook, act } from '@testing-library/react';
import { useScanDetection } from '../../hooks/use-scan-detection';

describe('useScanDetection', () => {
  let callback: jest.Mock;

  beforeEach(() => {
    callback = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const fireKey = (key: string, timestamp: number, target?: HTMLElement) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    Object.defineProperty(event, 'target', { value: target || document.body, writable: true });
    
    // We mock Date.now() for the hook logic
    jest.setSystemTime(timestamp);
    
    window.dispatchEvent(event);
  };

  test('Test Case 1: The "Scanner" Simulation', () => {
    renderHook(() => useScanDetection(callback, { timeThreshold: 50, minLength: 3 }));

    const barcode = '123456';
    let currentTime = 1000;

    act(() => {
        barcode.split('').forEach((char) => {
            fireKey(char, currentTime);
            currentTime += 10; // 10ms delay (fast)
        });
        fireKey('Enter', currentTime + 10);
    });

    expect(callback).toHaveBeenCalledWith(barcode);
  });

  test('Test Case 2: The "Human" Simulation', () => {
    renderHook(() => useScanDetection(callback, { timeThreshold: 50 }));

    const input = 'human';
    let currentTime = 1000;

    act(() => {
        input.split('').forEach((char) => {
            fireKey(char, currentTime);
            currentTime += 100; // 100ms delay (slow)
        });
        fireKey('Enter', currentTime + 100);
    });

    // Buffer should reset after each key due to timeout
    // So 'Enter' might trigger with empty buffer or just 'n' if logic allows short buffer
    // But buffer logic: if timeGap > threshold, reset buffer.
    // So h -> u (reset) -> m (reset)...
    // Final buffer when Enter is pressed is likely empty or too short.
    expect(callback).not.toHaveBeenCalled();
  });

  test('Test Case 3: Input Ignoring', () => {
    renderHook(() => useScanDetection(callback));

    const inputElement = document.createElement('input');
    document.body.appendChild(inputElement);
    inputElement.focus();

    const barcode = '123456';
    let currentTime = 1000;

    act(() => {
        barcode.split('').forEach((char) => {
            fireKey(char, currentTime, inputElement);
            currentTime += 10;
        });
        fireKey('Enter', currentTime + 10, inputElement);
    });

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(inputElement);
  });
});
