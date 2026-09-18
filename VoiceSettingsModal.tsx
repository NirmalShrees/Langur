import React, { useEffect, useState } from 'react';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  Sliders,
  Radio,
  Check,
  Headphones,
  Sparkles,
  Users,
} from 'lucide-react';
import { voiceService, VoiceState } from '../services/voiceService';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceState: VoiceState;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  voiceState,
}) => {
  const [selectedDevice, setSelectedDevice] = useState(voiceState.selectedDeviceId);
  const [echoCancel, setEchoCancel] = useState(voiceState.echoCancellation);
  const [noiseSupp, setNoiseSupp] = useState(voiceState.noiseSuppression);
  const [pushToTalk, setPushToTalk] = useState(voiceState.pushToTalk);

  useEffect(() => {
    setSelectedDevice(voiceState.selectedDeviceId);
    setEchoCancel(voiceState.echoCancellation);
    setNoiseSupp(voiceState.noiseSuppression);
    setPushToTalk(voiceState.pushToTalk);
  }, [voiceState]);

  if (!isOpen) return null;

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    setSelectedDevice(deviceId);
    await voiceService.setInputDevice(deviceId);
  };

  const handleToggleEcho = () => {
    const next = !echoCancel;
    setEchoCancel(next);
    voiceService.setEchoCancellation(next);
  };

  const handleToggleNoise = () => {
    const next = !noiseSupp;
    setNoiseSupp(next);
    voiceService.setNoiseSuppression(next);
  };

  const handleTogglePushToTalk = () => {
    const next = !pushToTalk;
    setPushToTalk(next);
    voiceService.setPushToTalk(next);
  };

  const peersList = Object.values(voiceState.peers);

  return (
    <div
      id="voice-settings-backdrop"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-4 overscroll-contain animate-in fade-in duration-100"
      style={{ willChange: 'opacity' }}
      onClick={onClose}
    >
      <div
        id="voice-settings-modal"
        className="w-full max-w-md bg-gradient-to-b from-[#0f172a] via-[#090e17] to-[#04070e] border border-amber-500/35 rounded-2xl shadow-2xl p-4 sm:p-5 text-slate-100 animate-in zoom-in-95 duration-100 overflow-hidden flex flex-col max-h-[85vh]"
        style={{ transform: 'translateZ(0)', willChange: 'transform' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-amber-500/20 mb-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-sm text-slate-100 tracking-wide flex items-center gap-2">
                <span>Voice Chat Settings</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  REAL-TIME
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">Microphone, input levels, and player volume mixer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-4 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin min-h-0 flex-1">
          {/* Live Mic Activity Visualizer */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-mono uppercase text-slate-300 font-semibold flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Mic Input Level
              </span>
              <span className={`text-[10px] font-mono font-bold ${voiceState.isMuted ? 'text-rose-400' : voiceState.isSpeaking ? 'text-emerald-400' : 'text-slate-400'}`}>
                {voiceState.isMuted ? 'MUTED' : voiceState.isSpeaking ? 'TRANSMITTING' : 'IDLE'}
              </span>
            </div>

            {/* Level Bar */}
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/60 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  voiceState.isMuted
                    ? 'w-0 bg-rose-500'
                    : voiceState.localVolumeLevel > 60
                    ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${voiceState.isMuted ? 0 : voiceState.localVolumeLevel}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-400">
              Speak into your microphone. The bar moves when audio is detected.
            </p>
          </div>

          {/* Audio Input Device */}
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5">
              <Headphones className="w-3 h-3 text-amber-400" />
              Microphone Device
            </label>
            <select
              value={selectedDevice}
              onChange={handleDeviceChange}
              className="w-full bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 transition-colors"
            >
              {voiceState.inputDevices.length === 0 ? (
                <option value="">Default System Microphone</option>
              ) : (
                voiceState.inputDevices.map((device, idx) => (
                  <option key={device.deviceId || idx} value={device.deviceId}>
                    {device.label || `Microphone ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Voice Processing Features */}
          <div className="space-y-2">
            <label className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Audio Enhancement
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleToggleNoise}
                className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                  noiseSupp
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold">Noise Suppression</div>
                  <div className="text-[9px] opacity-75">Blocks background noise</div>
                </div>
                <div className={`w-4 h-4 rounded-md flex items-center justify-center border text-[9px] shrink-0 ${noiseSupp ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold' : 'border-slate-700'}`}>
                  {noiseSupp && <Check className="w-3 h-3" />}
                </div>
              </button>

              <button
                type="button"
                onClick={handleToggleEcho}
                className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                  echoCancel
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold">Echo Cancellation</div>
                  <div className="text-[9px] opacity-75">Prevents feedback loops</div>
                </div>
                <div className={`w-4 h-4 rounded-md flex items-center justify-center border text-[9px] shrink-0 ${echoCancel ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold' : 'border-slate-700'}`}>
                  {echoCancel && <Check className="w-3 h-3" />}
                </div>
              </button>
            </div>
          </div>

          {/* Player Volume Mixer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5">
                <Users className="w-3 h-3 text-amber-400" />
                Player Audio Mixer ({peersList.length})
              </label>
              <span className="text-[9px] text-slate-400 font-mono">Adjust player volumes</span>
            </div>

            {peersList.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center text-xs text-slate-500 py-4">
                No other players in voice channel yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {peersList.map((peer) => (
                  <div
                    key={peer.userId}
                    className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${peer.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/50 bg-emerald-500/20' : 'border-slate-700 bg-slate-900'}`}>
                        {peer.avatar || '🎲'}
                      </div>
                      <span className="text-xs font-bold text-slate-200 truncate max-w-[100px] sm:max-w-[130px]">
                        {peer.username}
                      </span>
                    </div>

                    {/* Volume Slider */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={peer.volume}
                        onChange={(e) => voiceService.setPeerVolume(peer.userId, parseFloat(e.target.value))}
                        className="w-20 sm:w-28 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                      />
                      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                        {Math.round(peer.volume * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 mt-3 flex items-center justify-between shrink-0">
          <button
            onClick={() => voiceService.toggleMute()}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              voiceState.isMuted
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
            }`}
          >
            {voiceState.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{voiceState.isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
