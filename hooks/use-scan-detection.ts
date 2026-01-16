import { useEffect, useRef } from 'react';

type ScanCallback = (barcode: string) => void;

interface UseScanDetectionOptions {
  timeThreshold?: number; // Time between keystrokes to be considered a scan (ms)
  minLength?: number;     // Minimum length of barcode
}

export function useScanDetection(callback: ScanCallback, options: UseScanDetectionOptions = {}) {
  const { timeThreshold = 50, minLength = 3 } = options;
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Safety Check: Ignore inputs in form fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      const currentTime = Date.now();
      const timeGap = currentTime - lastKeyTime.current;

      // 2. Logic: If gap is large, reset buffer (it's manual typing or new scan)
      if (buffer.current.length > 0 && timeGap > timeThreshold) {
        buffer.current = '';
      }

      // 3. Handle 'Enter' - The end of a barcode scan
      if (e.key === 'Enter') {
        if (buffer.current.length >= minLength) {
          e.preventDefault(); // Prevent form submission
          callback(buffer.current);
          buffer.current = '';
        }
      } else if (e.key.length === 1) { // Only capture printable characters
        buffer.current += e.key;
        lastKeyTime.current = currentTime;
      }
      
      // Clear buffer if inactive for too long
      if (timeoutId.current) clearTimeout(timeoutId.current);
      timeoutId.current = setTimeout(() => {
          buffer.current = '';
      }, timeThreshold * 5); // A bit wider window to clear stale buffers
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [callback, timeThreshold, minLength]);
}
