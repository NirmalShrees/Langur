import React from 'react';
import { Crown, Check, X, ShieldAlert } from 'lucide-react';

interface LeadershipOfferModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  requesterName: string;
  tableName: string;
}

export const LeadershipOfferModal: React.FC<LeadershipOfferModalProps> = ({
  isOpen,
  onAccept,
  onDecline,
  requesterName,
  tableName,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="leadership-offer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="leadership-offer-panel"
        className="w-full max-w-sm bg-gradient-to-b from-[#141b2d] via-[#0b1220] to-[#060a14] border-2 border-amber-400 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-amber-950/80 relative overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-200 flex flex-col gap-4 text-center"
      >
        {/* Decorative ambient crown glow */}
        <div className="absolute top-0 right-1/2 translate-x-1/2 -mt-16 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Crown Icon Emblem */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-500/30 border-2 border-amber-200 text-slate-950">
          <Crown className="w-8 h-8 fill-slate-950" />
        </div>

        {/* Header */}
        <div className="space-y-1">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-400/40 inline-block">
            Leadership Transfer
          </span>
          <h2 className="font-serif font-black text-xl text-amber-100">
            Become Table Leader?
          </h2>
        </div>

        {/* Description */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 text-left space-y-2 text-xs">
          <p className="text-slate-200 leading-relaxed">
            <span className="font-bold text-amber-300">{requesterName}</span> wants to transfer leadership of <span className="font-bold text-amber-200">"{tableName}"</span> to you.
          </p>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="flex items-center gap-1.5 text-amber-200/90">
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>You will be crowned with the golden Leader avatar border</span>
            </p>
            <p className="flex items-center gap-1.5 text-slate-300">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>You will control table rules, start game, & round pacing</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            id="decline-leadership-btn"
            type="button"
            onClick={onDecline}
            className="flex-1 py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all active:scale-95 border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>Decline</span>
          </button>

          <button
            id="accept-leadership-btn"
            type="button"
            onClick={onAccept}
            className="flex-1 py-3 px-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-serif font-black text-xs sm:text-sm tracking-wider shadow-lg shadow-amber-500/30 transition-all active:scale-95 border border-amber-200 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Accept 👑</span>
          </button>
        </div>
      </div>
    </div>
  );
};
