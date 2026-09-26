import React, { useState } from 'react';
import { X, Copy, Check, Share2, Link as LinkIcon, Users, Crown } from 'lucide-react';

interface ShareTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode?: string;
  roomName?: string;
  isPrivate?: boolean;
  minBet?: number;
  leaderName?: string;
}

export const ShareTableModal: React.FC<ShareTableModalProps> = ({
  isOpen,
  onClose,
  roomCode = 'PUBLIC',
  roomName = 'Langur Burja Table',
  isPrivate = false,
  minBet = 10,
  leaderName,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const inviteUrl = `${window.location.origin}?table=${roomCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${roomName} on Langur Burja!`,
          text: `🎲 Join table "${roomName}" (Table Code: ${roomCode})! Tap to roll:`,
          url: inviteUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      id="share-table-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="share-table-modal-panel"
        className="w-full max-w-sm bg-gradient-to-b from-[#0e1628] via-[#090f1d] to-[#050811] border border-amber-500/40 rounded-3xl p-5 shadow-2xl shadow-black/90 relative overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-200 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative backdrop glow */}
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-36 h-36 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          id="share-table-close-btn"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-amber-200 border border-slate-700/80 active:scale-95 transition-all z-10 cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center pt-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-2">
            <Share2 className="w-3 h-3 text-amber-400" />
            <span>Invite Friends</span>
          </div>
          <h2 className="font-serif font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500">
            SHARE TABLE
          </h2>
          <p className="text-[11px] text-slate-400 truncate max-w-[260px] mx-auto mt-0.5">
            {roomName}
          </p>
        </div>

        {/* Table Code Card */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 shadow-inner flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-[10px] text-amber-200/80 font-mono uppercase tracking-wider">
            {isPrivate ? 'Private Table Code' : 'Public Table Code'}
          </span>

          <div className="flex items-center justify-center gap-2 w-full">
            <span
              id="share-modal-table-code"
              className="font-mono font-black text-2xl sm:text-3xl text-amber-300 tracking-widest px-3 py-1 rounded-xl bg-slate-950 border border-amber-500/30 shadow-md min-w-[140px]"
            >
              {roomCode}
            </span>

            <button
              id="share-modal-copy-code-btn"
              type="button"
              onClick={handleCopyCode}
              className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                copiedCode
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 hover:from-amber-300 hover:to-amber-400 border-amber-300 shadow-md'
              }`}
              title="Copy Table Code"
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="font-sans font-black">{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-400 mt-1">
            Friends can enter this code in <span className="text-amber-300 font-semibold">Join Table → With Code</span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Copy Direct Link */}
          <button
            id="share-modal-copy-link-btn"
            type="button"
            onClick={handleCopyLink}
            className="w-full py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-500/40 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">Invite Link Copied!</span>
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4 text-amber-400" />
                <span>Copy Direct Invite Link</span>
              </>
            )}
          </button>

          {/* Native Device Share (WhatsApp, Telegram, SMS, etc.) */}
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              id="share-modal-device-share-btn"
              type="button"
              onClick={handleNativeShare}
              className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 hover:from-emerald-400 text-slate-950 text-xs font-black tracking-wide shadow-lg shadow-emerald-950/60 transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
            >
              <Share2 className="w-4 h-4 fill-slate-950" />
              <span>Share via WhatsApp / Apps</span>
            </button>
          )}
        </div>

        {/* Table Details Footer */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span className="flex items-center gap-1">
            <Crown className="w-3 h-3 text-amber-400" />
            <span>Leader: {leaderName || 'Host'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-500" />
            <span>Min Bet: {minBet} 🪙</span>
          </span>
        </div>
      </div>
    </div>
  );
};
