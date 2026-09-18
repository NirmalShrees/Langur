export interface CoinReceipt {
  id: string;
  amount: number;
  description: string;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = 'langur_burja_coin_history_';

/**
 * Retrieve coin received history for a user
 */
export function getCoinReceipts(userId?: string): CoinReceipt[] {
  if (typeof window === 'undefined') return [];
  const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          id: String(item.id || `rec_${Date.now()}`),
          amount: Number(item.amount) || 0,
          description: String(item.description || item.title || 'Coin Grant'),
          timestamp: Number(item.timestamp) || Date.now(),
        }));
      }
    }
  } catch (e) {
    console.warn('Failed to load coin receipts:', e);
  }

  // Initial starter grant record if empty
  const defaultReceipt: CoinReceipt = {
    id: `rec_init_${Date.now()}`,
    amount: 5000,
    description: 'Festival Welcome Treasury',
    timestamp: Date.now() - 60000,
  };
  saveCoinReceipts(userId, [defaultReceipt]);
  return [defaultReceipt];
}

/**
 * Persist coin receipts list
 */
export function setCoinReceipts(userId: string | undefined, receipts: CoinReceipt[]): void {
  const cleanReceipts = (receipts || []).map((item: any) => ({
    id: String(item.id || `rec_${Date.now()}`),
    amount: Number(item.amount) || 0,
    description: String(item.description || item.title || 'Coin Grant'),
    timestamp: Number(item.timestamp) || Date.now(),
  }));
  saveCoinReceipts(userId, cleanReceipts);
}

function saveCoinReceipts(userId: string | undefined, receipts: CoinReceipt[]): void {
  if (typeof window === 'undefined') return;
  const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
  try {
    // Keep max 50 recent records
    const trimmed = receipts.slice(0, 50);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to save coin receipts:', e);
  }
}

/**
 * Record a new coin receipt entry with de-duplication protection
 */
export function addCoinReceipt(
  userId: string | undefined,
  entry: { amount: number; description: string }
): CoinReceipt {
  const receipts = getCoinReceipts(userId);
  const now = Date.now();

  // De-duplication check: if identical record added within 1.5s, prevent double entry
  const recentDuplicate = receipts.find(
    (r) => r.description === entry.description && r.amount === entry.amount && Math.abs(now - r.timestamp) < 1500
  );
  if (recentDuplicate) {
    return recentDuplicate;
  }

  const newReceipt: CoinReceipt = {
    id: `rec_${now}_${Math.random().toString(36).substring(2, 6)}`,
    amount: entry.amount,
    description: entry.description,
    timestamp: now,
  };

  const updated = [newReceipt, ...receipts];
  saveCoinReceipts(userId, updated);
  return newReceipt;
}

/**
 * Clear all coin receipts for a user
 */
export function clearCoinReceipts(userId?: string): void {
  if (typeof window === 'undefined') return;
  const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
  try {
    localStorage.setItem(key, JSON.stringify([]));
  } catch (e) {
    console.warn('Failed to clear coin receipts:', e);
  }
}

/**
 * Format relative time (e.g. Just now, 2m ago, 1h ago)
 */
export function formatReceiptTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
