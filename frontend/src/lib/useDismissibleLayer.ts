import { useEffect, useRef } from 'react';

type DismissibleLayerOptions = {
  open: boolean;
  onDismiss: () => void;
  closeOnEscape?: boolean;
  closeOnPointerOutside?: boolean;
  lockBodyScroll?: boolean;
  manageFocus?: boolean;
};

const focusableSelector = [
  '[data-autofocus]',
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDismissibleLayer<T extends HTMLElement>({
  open,
  onDismiss,
  closeOnEscape = true,
  closeOnPointerOutside = true,
  lockBodyScroll = false,
  manageFocus = false,
}: DismissibleLayerOptions) {
  const layerRef = useRef<T>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    let focusFrame: number | undefined;

    function handlePointerDown(event: PointerEvent) {
      const layer = layerRef.current;
      if (!closeOnPointerOutside || !layer) return;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const targetInside = path.length ? path.includes(layer) : layer.contains(event.target as Node);
      if (!targetInside) dismissRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!closeOnEscape || event.key !== 'Escape') return;
      event.preventDefault();
      dismissRef.current();
    }

    if (lockBodyScroll) document.body.style.overflow = 'hidden';
    if (manageFocus) {
      focusFrame = window.requestAnimationFrame(() => {
        layerRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus({ preventScroll: true });
      });
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
      if (lockBodyScroll) document.body.style.overflow = previousOverflow;
      if (manageFocus && previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [closeOnEscape, closeOnPointerOutside, lockBodyScroll, manageFocus, open]);

  return layerRef;
}
