/**
 * Universal clipboard utility with multi-tier fallbacks.
 * Works seamlessly across desktop, mobile browsers, iOS Safari, Android Chrome, and iframes.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fall through to execCommand fallback
    }
  }

  // 2. Synchronous execCommand fallback (for iframes or mobile browsers without permissions)
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) return true;
    } catch (err) {
      console.warn('execCommand copy fallback failed:', err);
    }
  }

  return false;
}

/**
 * Builds a direct join URL for a given table code.
 */
export function getTableDirectJoinUrl(code: string): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const pathname = window.location.pathname.replace(/\/$/, '');
  const cleanCode = (code || '').trim().toUpperCase();
  return `${origin}${pathname}?table=${cleanCode}`;
}
