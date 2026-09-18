import React from 'react';
import { Crown, Coins, LogOut, Award } from 'lucide-react';
import { PlayerInRoom } from '../types.js';
import { UserAvatar } from './UserAvatar.js';

interface PlayerRosterProps {
  players: Record<string, PlayerInRoom>;
  currentUserId: string;
  isHost: boolean;
  onKickPlayer: (targetUserId: string) => void;
  onOpenTableStats?: () => void;
}

export const PlayerRoster: React.FC<PlayerRosterProps> = ({
  players,
  currentUserId,
  isHost,
  onKickPlayer,
  onOpenTableStats,
}) => {
  const playerList: PlayerInRoom[] = Object.values(players || {});

  return (
    <div
      id="player-roster-container"
      className="bg-slate-950/90 rounded-2xl border border-amber-900/30 p-4 shadow-xl flex flex-col h-full"
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <h3 className="font-extrabold text-sm text-amber-100 uppercase tracking-wider flex items-center gap-2">
          <span>Pavilion Players</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono">
            {playerList.length}
          </span>
        </h3>
        {onOpenTableStats ? (
          <button
            onClick={onOpenTableStats}
            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono font-bold"
          >
            <span>Stats & History</span>
            <Crown className="w-3 h-3 text-amber-400" />
          </button>
        ) : (
          <span className="text-[11px] text-slate-400 font-mono">Live Table</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[340px]">
        {playerList.map((p) => {
          const isMe = p.id === currentUserId;
          const isTableOwner = Boolean(p.isHost);
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                isTableOwner
                  ? 'bg-amber-500/10 border-amber-400/50 shadow-sm'
                  : isMe
                  ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Player Avatar & Info */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-inner overflow-hidden border ${
                      isTableOwner
                        ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/80 shadow-amber-950/70'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <UserAvatar avatar={p.avatar} name={p.username} size="sm" className="w-full h-full rounded-none" />
                  </div>
                  {isTableOwner && (
                    <span
                      title="Table Owner 👑"
                      className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-md border border-slate-950 z-10"
                    >
                      <Crown className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs sm:text-sm text-slate-200 truncate">
                      {p.username}
                    </span>
                    {isTableOwner && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/25 border border-amber-400/60 text-[8.5px] font-black text-amber-300 tracking-wider font-mono shadow-sm">
                        <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        TABLE OWNER
                      </span>
                    )}
                    {isMe && (
                      <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-slate-950">
                        YOU
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1 font-mono text-amber-300/90 font-medium">
                      <Coins className="w-3 h-3 text-amber-400" />
                      {p.coins.toLocaleString()}
                    </span>

                    {p.sessionStats && p.sessionStats.roundsPlayed > 0 && (
                      <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/40">
                        WR: {p.sessionStats.winRate}% ({p.sessionStats.roundsWon}/{p.sessionStats.roundsPlayed})
                      </span>
                    )}

                    {p.equipped?.title && (
                      <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-purple-300 bg-purple-950/50 px-1 rounded border border-purple-800/30">
                        <Award className="w-2.5 h-2.5" />
                        {p.equipped.title}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bet Status & Host Kick */}
              <div className="flex items-center gap-2 ml-2">
                {p.totalBetThisRound > 0 ? (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                    Bet: {p.totalBetThisRound.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 italic">No bet</span>
                )}

                {isHost && !isMe && (
                  <button
                    onClick={() => onKickPlayer(p.id)}
                    title="Leader Action: Kick Player from Room"
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
