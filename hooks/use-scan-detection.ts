import { useEffect, useRef } from 'react';

type ScanCallback = (barcode: string) => void;

interface UseScanDetectionOptions {
  timeThreshold?: number; // Time between keystrokes to be considered a scan (ms)
  minLength?: number;     // Minimum length of barcode
  /**
   * Also capture scans made while a text field has focus. The scanned characters are
   * removed from the field (restored to its value before the scan) and the barcode goes
   * to the callback instead. A field can opt out with a `data-scan-passthrough` attribute.
   */
  captureInInputs?: boolean;
  inputMinLength?: number; // Stricter minimum inside fields, where fast typing is likelier
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

const isTextField = (el: unknown): el is TextField =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

// Sets a React-controlled field's value and notifies React (plain el.value = ... is ignored)
function restoreFieldValue(el: TextField, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function useScanDetection(callback: ScanCallback, options: UseScanDetectionOptions = {}) {
  const { timeThreshold = 50, minLength = 3, captureInInputs = false, inputMinLength = 4 } = options;
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const timeoutId = useRef<NodeJS.Timeout | null>(null);
  // Field the current burst is being typed into, and its value before the burst began
  const burst = useRef<{ field: TextField | null; valueBefore: string }>({ field: null, valueBefore: '' });

  useEffect(() => {
    const reset = () => {
      buffer.current = '';
      burst.current = { field: null, valueBefore: '' };
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcuts (Ctrl/Cmd/Alt + key) are never part of a scan
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // 1. Safety Check: form fields are ignored unless capturing in inputs is enabled
      const target = e.target as HTMLElement | null;
      const field = isTextField(target) ? target : null;
      if (target?.isContentEditable || (field && (!captureInInputs || field.closest('[data-scan-passthrough]')))) {
        reset();
        return;
      }

      const currentTime = Date.now();
      const timeGap = currentTime - lastKeyTime.current;

      // 2. Logic: If gap is large, reset buffer (it's manual typing or new scan)
      if (buffer.current.length > 0 && timeGap > timeThreshold) {
        reset();
      }

      // 3. Handle 'Enter' - The end of a barcode scan
      if (e.key === 'Enter') {
        const isScan =
          buffer.current.length >= (field ? inputMinLength : minLength) && burst.current.field === field;
        if (isScan) {
          e.preventDefault(); // Prevent form submission
          e.stopPropagation(); // The focused element's own Enter handler must not also run
          if (field) restoreFieldValue(field, burst.current.valueBefore);
          callback(buffer.current);
        }
        reset();
      } else if (e.key.length === 1) { // Only capture printable characters
        // A burst starts fresh on its first key, or if focus moved to another field mid-burst
        if (buffer.current.length === 0 || burst.current.field !== field) {
          buffer.current = '';
          burst.current = { field, valueBefore: field ? field.value : '' };
        }
        buffer.current += e.key;
        lastKeyTime.current = currentTime;
      }

      // Clear buffer if inactive for too long
      if (timeoutId.current) clearTimeout(timeoutId.current);
      timeoutId.current = setTimeout(reset, timeThreshold * 5); // A bit wider window to clear stale buffers
    };

    // Capture phase: runs before the focused element's handlers, so a scan can be taken over
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [callback, timeThreshold, minLength, captureInInputs, inputMinLength]);
}
