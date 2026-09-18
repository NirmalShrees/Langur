import React, { useState } from 'react';
import { X, Settings, ShieldCheck, Play } from 'lucide-react';
import { RoomSettings } from '../types.js';

interface HostSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: RoomSettings;
  onUpdateSettings: (newSettings: Partial<RoomSettings>) => void;
  onForceRoll: () => void;
  isBettingPhase: boolean;
}

export const HostSettingsModal: React.FC<HostSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onUpdateSettings,
  onForceRoll,
  isBettingPhase,
}) => {
  const [bettingDuration, setBettingDuration] = useState<number>(currentSettings.bettingDuration);
  const [minBet, setMinBet] = useState<number>(currentSettings.minBet);
  const [maxBet, setMaxBet] = useState<number>(currentSettings.maxBet);
  const [autoLoop, setAutoLoop] = useState<boolean>(currentSettings.autoLoop);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateSettings({
      bettingDuration,
      minBet,
      maxBet,
      autoLoop,
    });
    onClose();
  };

  return (
    <div
      id="host-settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
    >
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl border border-amber-500/40 shadow-2xl p-5 sm:p-6 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg text-slate-950">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-black text-amber-100 font-serif">Host Table Controls</h2>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-400">
                You have Host authority over round loops, timers & limits
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Form */}
        <div className="space-y-4 my-4 text-xs sm:text-sm">
          {/* Force Roll Shortcut */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-amber-200">Force Roll Now</div>
              <p className="text-[11px] text-slate-400">
                Skip remaining betting countdown and initiate dice roll immediately
              </p>
            </div>
            <button
              onClick={() => {
                onForceRoll();
                onClose();
              }}
              disabled={!isBettingPhase}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>Roll Now</span>
            </button>
          </div>

          {/* Betting Phase Countdown Duration */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              Betting Countdown Timer: <span className="text-amber-300">{bettingDuration}s</span>
            </label>
            <div className="flex items-center gap-2">
              {[10, 15, 20, 25, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setBettingDuration(sec)}
                  className={`flex-1 py-2 rounded-xl font-mono text-xs font-bold border transition-all ${
                    bettingDuration === sec
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Table Limits (Min Bet and Max Bet) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1">Min Bet (Coins)</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={minBet}
                onChange={(e) => setMinBet(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-950 text-slate-100 px-3 py-2 rounded-xl border border-slate-800 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-bold mb-1">Max Bet Per Tile</label>
              <input
                type="number"
                min={100}
                max={100000}
                value={maxBet}
                onChange={(e) => setMaxBet(Math.max(minBet, parseInt(e.target.value) || minBet))}
                className="w-full bg-slate-950 text-slate-100 px-3 py-2 rounded-xl border border-slate-800 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Automated Game Loop Toggle */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-200">Continuous Automated Loop</div>
              <p className="text-[11px] text-slate-400">
                Automatically start next betting round after payout display
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoLoop(!autoLoop)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                autoLoop ? 'bg-amber-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                  autoLoop ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black transition-all shadow"
          >
            Save Table Settings
          </button>
        </div>
      </div>
    </div>
  );
};
