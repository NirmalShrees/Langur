import React, { useState, useEffect } from 'react';
import {
  Coins,
  Sparkles,
  X,
  Clock,
  Loader2,
  Zap,
  ArrowDownLeft,
} from 'lucide-react';
import { UserProfile } from '../types.js';
import { CoinReceipt, getCoinReceipts, formatReceiptTime } from '../utils/coinHistory.js';
import { fetchRemoteCoinHistory } from '../services/authService.js';
import { sound } from '../utils/audio.js';

interface CoinTreasuryModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onClaimFaucet: () => void;
  faucetLoading: boolean;
}

export const CoinTreasuryModal: React.FC<CoinTreasuryModalProps> = ({
  isOpen,
  onClose,
  user,
  onClaimFaucet,
  faucetLoading,
}) => {
  const [receipts, setReceipts] = useState<CoinReceipt[]>([]);
  const [justClaimed, setJustClaimed] = useState(false);
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);

  // Refresh receipts immediately from local storage and smoothly sync from Supabase when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // 1. Instant local render (zero waiting)
    const localItems = getCoinReceipts(user.id);
    setReceipts(localItems);

    // 2. Smooth background fetch from Supabase if not a guest
    let isCancelled = false;
    if (user.id && !user.id.startsWith('guest_')) {
      setIsFetchingRemote(true);
      fetchRemoteCoinHistory(user.id)
        .then((remoteItems) => {
          if (!isCancelled && remoteItems && Array.isArray(remoteItems)) {
            setReceipts(remoteItems);
          }
        })
        .catch((err) => {
          console.warn('[Treasury] Remote history fetch notice:', err);
        })
        .finally(() => {
          if (!isCancelled) {
            setIsFetchingRemote(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, user.coins, user.id]);

  if (!isOpen) return null;

  const handleClaim = () => {
    sound.playWinFanfare();
    onClaimFaucet();
    setJustClaimed(true);
    setTimeout(() => {
      setReceipts(getCoinReceipts(user.id));
      setJustClaimed(false);
    }, 450);
  };

  return (
    <div
      id="coin-treasury-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          sound.playChipSound();
          onClose();
        }
      }}
    >
      <div
        id="coin-treasury-panel"
        className="w-full max-w-[390px] h-[460px] max-h-[90dvh] bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-3.5 py-2.5 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 border-b border-amber-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center shadow-sm border border-amber-300/60 text-slate-950">
              <Coins className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-sm text-amber-200 leading-tight">
                Treasury
              </h3>
              <p className="text-[9.5px] text-amber-400/80 font-mono">
                सम्पत्ति कोष • Wallet &amp; History
              </p>
            </div>
          </div>

          <button
            id="treasury-close-btn"
            type="button"
            onClick={() => {
              sound.playChipSound();
              onClose();
            }}
            className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-200 border border-slate-700 hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Fixed structure with scrollable history */}
        <div className="p-3 sm:p-3.5 flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
          {/* 1 & 2. Compact Overview Grid: Balance + Instant Faucet (Fixed height, no layout shift) */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            {/* Current Balance Card (Fixed height) */}
            <div className="h-[68px] p-2.5 rounded-xl bg-gradient-to-br from-amber-950/40 via-slate-900/95 to-slate-950 border border-amber-500/35 flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9.5px] font-mono font-bold text-amber-400/90 uppercase tracking-wider flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-400" />
                  <span>Balance</span>
                </span>
                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30">
                  ACTIVE
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-mono font-black text-amber-200 tracking-tight">
                  {user.coins.toLocaleString()}
                </span>
                <span className="text-[11px] text-amber-400 font-serif font-bold">🪙</span>
              </div>
            </div>

            {/* Free Bonus Faucet Card (Fixed height) */}
            <div className="h-[68px] p-2.5 rounded-xl bg-gradient-to-br from-slate-900/95 via-slate-950 to-amber-950/20 border border-amber-500/35 flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9.5px] font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Free Faucet</span>
                </span>
                <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/30 font-bold">
                  FREE
                </span>
              </div>
              <button
                id="treasury-claim-faucet-btn"
                type="button"
                onClick={handleClaim}
                disabled={faucetLoading}
                className="w-full h-7 px-2 rounded-lg bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-[11px] sm:text-xs shadow-md shadow-amber-950/50 border border-amber-300/60 flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {faucetLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-slate-950" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 fill-slate-950 text-slate-950" />
                    <span>+1,000 🪙</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. History Section (Flex child with independent scroll) */}
          <div className="flex-1 min-h-0 flex flex-col space-y-2">
            <div className="flex items-center justify-between px-0.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <h4 className="text-xs font-bold text-amber-200 font-serif">
                  History
                </h4>
                {isFetchingRemote && (
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400/70" />
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                  {receipts.length} {receipts.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 scrollbar-none">
              {receipts.length === 0 ? (
                <div className="h-full min-h-[140px] flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center space-y-1">
                  <Coins className="w-5 h-5 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">History is clean</p>
                  <p className="text-[10px] text-slate-500">
                    Claim +1,000 free coins above or win rounds to log history!
                  </p>
                </div>
              ) : (
                receipts.map((rec, index) => (
                  <div
                    key={rec.id || index}
                    className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                      index === 0 && justClaimed
                        ? 'bg-emerald-950/50 border-emerald-500/70 shadow-sm shadow-emerald-950/50'
                        : 'bg-slate-900/90 border-slate-800/90 hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                        <ArrowDownLeft className="w-3 h-3 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] sm:text-xs font-bold text-slate-200 truncate">
                            {rec.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[9.5px] text-slate-400">
                          <span className="font-mono text-amber-400/80 shrink-0">
                            {formatReceiptTime(rec.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Amount Received Badge */}
                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-mono font-black text-[11px]">
                        +{rec.amount.toLocaleString()} 🪙
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-2.5 bg-slate-950/90 border-t border-amber-500/20 flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.playChipSound();
              onClose();
            }}
            className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer text-center"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
