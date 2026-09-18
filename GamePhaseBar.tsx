import React from 'react';
import { Play, Flame, ShieldAlert, Clock } from 'lucide-react';
import { GamePhase } from '../types.js';

interface GamePhaseBarProps {
  phase: GamePhase;
  timer: number;
  maxTimer: number;
  roundNumber: number;
  isHost: boolean;
  onForceRoll: () => void;
}

export const GamePhaseBar: React.FC<GamePhaseBarProps> = ({
  phase,
  timer,
  maxTimer,
  roundNumber,
  isHost,
  onForceRoll,
}) => {
  const percentage = Math.max(0, Math.min(100, (timer / (maxTimer || 1)) * 100));

  return (
    <div
      id="game-phase-bar"
      className="w-full bg-slate-950/90 rounded-2xl border border-amber-900/30 p-3 sm:p-4 shadow-xl mb-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Phase Label */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center border border-amber-500/20">
            {phase === 'waiting' && <Clock className="w-5 h-5 text-amber-400 animate-pulse" />}
            {phase === 'betting' && <Flame className="w-5 h-5 text-amber-400 animate-pulse" />}
            {phase === 'rolling' && <span className="text-xl animate-spin">🎲</span>}
            {phase === 'payout' && <span className="text-xl">💰</span>}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-amber-100 tracking-tight">
                {phase === 'waiting' && 'Table Waiting'}
                {phase === 'betting' && 'Place Your Bets'}
                {phase === 'rolling' && 'Rolling Dice Tumbler...'}
                {phase === 'payout' && 'Outcome & Payout Phase'}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700">
                Round {roundNumber}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-0.5">
              {phase === 'waiting' && (isHost ? 'You are the table host. Click Start Game when ready!' : 'Waiting for table host to start the game...')}
              {phase === 'betting' && `Select chips and tap any of the 6 symbols (${timer}s remaining)`}
              {phase === 'rolling' && 'Suspending outcomes... calculating physics & symbol landings'}
              {phase === 'payout' && 'Results displayed • Click Next Round below to advance'}
            </p>
          </div>
        </div>

        {/* Right Timer & Host Action */}
        <div className="flex items-center gap-3">
          {phase !== 'waiting' ? (
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Time:</span>
              <span
                className={`font-mono font-black text-base sm:text-lg ${
                  timer <= 5 && phase === 'betting' ? 'text-rose-400 animate-ping' : 'text-amber-300'
                }`}
              >
                {timer}s
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{isHost ? 'Host Ready' : 'Waiting for Host'}</span>
            </div>
          )}

          {/* Host Force Roll Action */}
          {isHost && phase === 'betting' && (
            <button
              id="host-force-roll-btn"
              onClick={onForceRoll}
              title="Host Permission: Skip remaining countdown and roll now"
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Host Roll Now</span>
            </button>
          )}

          {isHost && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-amber-400/80 font-bold bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Host Controls Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {phase === 'betting' && (
        <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-1000 ${
              timer <= 5 ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-500 to-amber-300'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
};
