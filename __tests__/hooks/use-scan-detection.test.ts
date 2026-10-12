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

  describe('captureInInputs', () => {
    let input: HTMLInputElement;
    let elementEnter: jest.Mock;

    beforeEach(() => {
      input = document.createElement('input');
      input.value = 'abc';
      elementEnter = jest.fn();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') elementEnter(); });
      document.body.appendChild(input);
      input.focus();
    });

    afterEach(() => {
      document.body.removeChild(input);
    });

    // Dispatched on the field itself (like a real scanner); printable keys are then
    // inserted the way the browser's default action would
    const typeIntoField = (text: string, gap: number, start = 1000) => {
      let t = start;
      act(() => {
        text.split('').forEach((char) => {
          jest.setSystemTime(t);
          const event = new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true });
          input.dispatchEvent(event);
          if (!event.defaultPrevented) input.value += char;
          t += gap;
        });
        jest.setSystemTime(t);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
    };

    test('takes a scan out of the focused field and restores its previous value', () => {
      const onInput = jest.fn();
      input.addEventListener('input', onInput);
      renderHook(() => useScanDetection(callback, { captureInInputs: true }));

      typeIntoField('4800000000011', 10);

      expect(callback).toHaveBeenCalledWith('4800000000011');
      expect(input.value).toBe('abc');
      expect(onInput).toHaveBeenCalled(); // React-controlled fields get the restored value
      expect(elementEnter).not.toHaveBeenCalled(); // the field's own Enter handler does not run
    });

    test('leaves human typing in the field alone', () => {
      renderHook(() => useScanDetection(callback, { captureInInputs: true }));

      typeIntoField('1000', 120);

      expect(callback).not.toHaveBeenCalled();
      expect(input.value).toBe('abc1000');
      expect(elementEnter).toHaveBeenCalled();
    });

    test('needs a longer burst inside a field than outside one', () => {
      renderHook(() => useScanDetection(callback, { captureInInputs: true }));

      typeIntoField('123', 10);

      expect(callback).not.toHaveBeenCalled();
      expect(input.value).toBe('abc123');
    });

    test('respects data-scan-passthrough and the default of ignoring fields', () => {
      input.setAttribute('data-scan-passthrough', '');
      renderHook(() => useScanDetection(callback, { captureInInputs: true }));
      typeIntoField('4800000000011', 10);
      expect(callback).not.toHaveBeenCalled();
      expect(input.value).toBe('abc4800000000011');
    });

    test('ignores keys pressed with Ctrl/Cmd/Alt', () => {
      renderHook(() => useScanDetection(callback));
      let t = 1000;
      act(() => {
        'vvvv'.split('').forEach((key) => {
          jest.setSystemTime((t += 5));
          window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
        });
        jest.setSystemTime((t += 5));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
