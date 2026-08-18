import type { ClipboardEvent } from 'react';

/**
 * Attach to onPaste on a controlled text input/textarea. Computes what the
 * field's value would become if the pasted text were trimmed of leading and
 * trailing whitespace, and prevents the default paste so the caller can apply
 * that trimmed value instead. Returns null (and does nothing) when the pasted
 * text needs no trimming, so an ordinary paste proceeds untouched.
 */
export function computeTrimmedPasteValue(event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>): string | null {
  const pasted = event.clipboardData.getData('text');
  const trimmed = pasted.trim();
  if (trimmed === pasted) return null;
  event.preventDefault();
  const input = event.currentTarget;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  return `${input.value.slice(0, start)}${trimmed}${input.value.slice(end)}`;
}
