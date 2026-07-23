import { useEffect, useRef } from 'react';

/**
 * Detects input coming from a USB "keyboard-wedge" barcode scanner.
 *
 * Such scanners emulate a keyboard: they "type" the barcode digits extremely
 * fast (a few milliseconds between characters) and finish with Enter. This
 * hook buffers keystrokes and, when a run of fast keystrokes ends with Enter,
 * reports it as a scan via `onScan`. Human typing (slower, and usually into a
 * focused text field) is ignored.
 *
 * Notes:
 * - Works globally while enabled; no focus required.
 * - Ignores keystrokes when the user is typing into a normal text input /
 *   textarea / contentEditable, UNLESS they arrive at scanner speed (a real
 *   scan should still work even if a field happens to be focused).
 * - Only accepts codes of a reasonable barcode length.
 */
export interface UseBarcodeScannerOptions {
  /** Called with the scanned code (digits/letters, no Enter). */
  onScan: (code: string) => void;
  /** Enable/disable the listener. Default true. */
  enabled?: boolean;
  /** Max ms between keystrokes to still count as "scanner speed". Default 35. */
  maxInterKeyMs?: number;
  /** Minimum length to accept as a barcode. Default 4. */
  minLength?: number;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxInterKeyMs = 35,
  minLength = 4,
}: UseBarcodeScannerOptions) {
  // Keep the latest onScan without re-subscribing the listener each render.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let lastTime = 0;

    const isEditable = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        node.isContentEditable === true
      );
    };

    const handler = (e: KeyboardEvent) => {
      // Ignore modifier combos (Ctrl/Alt/Meta) — never part of a scan.
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = performance.now();
      const gap = now - lastTime;
      lastTime = now;

      // A gap larger than the threshold means the previous run was human
      // typing (or unrelated) — start a fresh buffer.
      if (gap > maxInterKeyMs) {
        buffer = '';
      }

      if (e.key === 'Enter') {
        // A scan terminates with Enter and must be fast + long enough.
        if (buffer.length >= minLength) {
          const code = buffer;
          buffer = '';
          // If the burst was fast enough it's a scan even inside an input;
          // prevent the Enter from submitting a form in that case.
          const focusedEditable = isEditable(document.activeElement);
          if (!focusedEditable || gap <= maxInterKeyMs) {
            e.preventDefault();
            e.stopPropagation();
            onScanRef.current(code);
          }
        } else {
          buffer = '';
        }
        return;
      }

      // Only accumulate single printable characters (barcode chars).
      if (e.key.length === 1) {
        // If a normal input is focused and the user is typing slowly, let it be.
        if (isEditable(document.activeElement) && gap > maxInterKeyMs) {
          buffer = '';
          return;
        }
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled, maxInterKeyMs, minLength]);
}
