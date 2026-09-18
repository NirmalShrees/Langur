import React from 'react';
import { X, Trophy, Crown, Award, TrendingUp } from 'lucide-react';
import { LeaderboardEntry } from '../types.js';
import { UserAvatar } from './UserAvatar.js';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderboard?: LeaderboardEntry[];
  currentUserId?: string;
}

const DEFAULT_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, id: 'u_1', username: 'Pasang Sherpa', avatar: '🏔️', coins: 145000, totalWinnings: 420000, gamesWon: 180, biggestWin: 36000, equippedTitle: 'Himalayan King' },
  { rank: 2, id: 'u_2', username: 'Kiran Gurung', avatar: '🦁', coins: 98500, totalWinnings: 310000, gamesWon: 142, biggestWin: 28000, equippedTitle: 'Royal High Roller' },
  { rank: 3, id: 'u_3', username: 'Anjali Shrestha', avatar: '🦚', coins: 74200, totalWinnings: 245000, gamesWon: 110, biggestWin: 22500, equippedTitle: 'Dice Empress' },
  { rank: 4, id: 'u_4', username: 'Dipendra KC', avatar: '👑', coins: 62000, totalWinnings: 198000, gamesWon: 95, biggestWin: 18000, equippedTitle: 'Gold Master' },
  { rank: 5, id: 'u_5', username: 'Sunita Thapa', avatar: '🌸', coins: 45000, totalWinnings: 154000, gamesWon: 76, biggestWin: 15000, equippedTitle: 'Lucky Peafowl' },
];

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  leaderboard,
  currentUserId = '',
}) => {
  if (!isOpen) return null;

  const list: LeaderboardEntry[] = Array.isArray(leaderboard) && leaderboard.length > 0
    ? leaderboard
    : DEFAULT_LEADERBOARD;

  const topThree = list.slice(0, 3);

  return (
    <div
      id="leaderboard-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 overscroll-contain animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        id="leaderboard-modal-card"
        className="relative w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl p-4 sm:p-5 flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base sm:text-lg font-black text-amber-100 font-serif tracking-wide">
                  Hall of Fame
                </h2>
                <span className="text-[10px] font-nepali text-amber-400/90 font-bold">
                  (दरबार कीर्ति)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Kathmandu Royal Casino Grand Champions
              </p>
            </div>
          </div>

          <button
            id="close-leaderboard-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top 3 Podium Cards */}
        {topThree.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3 shrink-0">
            {topThree.map((top, idx) => {
              const isFirst = idx === 0;
              const isSecond = idx === 1;

              const bgCard = isFirst
                ? 'bg-amber-950/40 border-amber-500/50'
                : isSecond
                ? 'bg-slate-800/60 border-slate-600/50'
                : 'bg-amber-950/20 border-amber-700/40';

              const badgeBg = isFirst
                ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950'
                : isSecond
                ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950'
                : 'bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100';

              return (
                <div
                  key={top.id || `podium-${idx}`}
                  className={`relative p-2 rounded-2xl ${bgCard} border flex flex-col items-center text-center shadow-md overflow-hidden`}
                >
                  {isFirst && (
                    <div className="absolute top-1 right-1 text-amber-400 opacity-80">
                      <Crown className="w-3 h-3" />
                    </div>
                  )}
                  <div
                    className={`w-5 h-5 rounded-full ${badgeBg} flex items-center justify-center font-black text-[10px] shadow-sm mb-1`}
                  >
                    #{top.rank || idx + 1}
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mb-0.5 overflow-hidden">
                    <UserAvatar avatar={top.avatar} name={top.username} size="sm" className="w-full h-full rounded-none" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-100 truncate w-full">
                    {top.username || 'Player'}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-300 mt-0.5">
                    +{(top.totalWinnings ?? 0).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Scrollable Leaderboard List */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-3 space-y-1.5 pr-1">
          {list.map((entry, index) => {
            const isMe = Boolean(currentUserId && entry.id === currentUserId);
            const rank = entry.rank || index + 1;

            let rankClass = 'bg-slate-800 text-slate-400 border-slate-700';
            let rankContent: React.ReactNode = `#${rank}`;

            if (rank === 1) {
              rankClass = 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 border-amber-300 font-black shadow-sm';
              rankContent = <Crown className="w-3.5 h-3.5" />;
            } else if (rank === 2) {
              rankClass = 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 border-slate-300 font-black shadow-sm';
              rankContent = '2';
            } else if (rank === 3) {
              rankClass = 'bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 border-amber-600 font-black shadow-sm';
              rankContent = '3';
            }

            return (
              <div
                key={entry.id || `rank-${index}`}
                className={`flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-2xl border transition-colors ${
                  isMe
                    ? 'bg-amber-500/15 border-amber-500/60 ring-1 ring-amber-500/30'
                    : 'bg-slate-850/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Left: Rank & Player Profile */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={`w-7 h-7 rounded-xl border flex items-center justify-center font-mono font-bold text-xs shrink-0 ${rankClass}`}
                  >
                    {rankContent}
                  </div>

                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-slate-800 border border-slate-750">
                    <UserAvatar avatar={entry.avatar} name={entry.username} size="sm" className="w-full h-full rounded-none" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-100 truncate">
                        {entry.username || 'Player'}
                      </span>
                      {isMe && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black uppercase tracking-wider shrink-0">
                          YOU
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      {entry.equippedTitle && (
                        <span className="text-amber-300/90 font-medium flex items-center gap-0.5 truncate">
                          <Award className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                          <span className="truncate">{entry.equippedTitle}</span>
                        </span>
                      )}
                      {(entry.gamesWon ?? 0) > 0 && (
                        <span className="text-slate-500 font-mono">
                          • {entry.gamesWon} wins
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Winnings & Fortune */}
                <div className="text-right shrink-0 pl-1">
                  <div className="flex items-center justify-end gap-1 text-xs font-mono font-black text-emerald-400">
                    <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>+{(entry.totalWinnings ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10.5px] font-mono text-amber-300/90 mt-0.5">
                    <span>{(entry.coins ?? 0).toLocaleString()}</span>
                    <span className="text-[11px]">🪙</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live Casino Records</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow active:scale-95 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
