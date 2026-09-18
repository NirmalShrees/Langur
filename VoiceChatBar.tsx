import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  Volume2,
  VolumeX,
  PhoneOff,
  Settings,
  Radio,
  Users,
  Sparkles,
  X,
  Volume1,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { voiceService, VoiceState } from '../services/voiceService.js';
import { VoiceSettingsModal } from './VoiceSettingsModal.js';
import { UserAvatar } from './UserAvatar.js';

interface VoiceChatBarProps {
  roomId?: string | null;
  currentUser?: { id: string; username: string; avatar: string } | null;
  className?: string;
}

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({
  roomId,
  currentUser,
  className = '',
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>(voiceService.getState());
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unsubscribe = voiceService.subscribe((state) => {
      setVoiceState(state);
    });
    return () => unsubscribe();
  }, []);

  // Close popover on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleJoinVoice = async () => {
    if (!roomId || !currentUser) return;
    await voiceService.joinVoice(roomId, currentUser);
  };

  const handleLeaveVoice = () => {
    voiceService.leaveVoice();
    setIsOpen(false);
  };

  const handleToggleMute = () => {
    voiceService.toggleMute();
  };

  const handleToggleDeafen = () => {
    voiceService.toggleDeafen();
  };

  if (!roomId || !currentUser) return null;

  const connectedPeers = Object.values(voiceState.peers);
  const speakingPeers = connectedPeers.filter((p) => p.isSpeaking);
  const totalVoiceMembers = connectedPeers.length + (voiceState.isConnected ? 1 : 0);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 1. Sleek Compact Voice Button (Sits right beside Network Ping) */}
      <button
        ref={buttonRef}
        type="button"
        id="voice-chat-toggle-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        title={
          !voiceState.isConnected
            ? 'Voice Chat (Click to Join & Options)'
            : voiceState.isSpeaking
            ? 'You are speaking • Click for Voice options'
            : voiceState.isMuted
            ? 'Microphone is Muted • Click for Voice options'
            : `Voice Connected (${totalVoiceMembers} in channel) • Click for options`
        }
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-mono transition-all duration-200 cursor-pointer select-none shadow-sm ${
          !voiceState.isConnected
            ? 'bg-slate-900/90 hover:bg-slate-800/90 border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
            : voiceState.isConnecting
            ? 'bg-amber-950/80 border-amber-500/50 text-amber-300 animate-pulse'
            : voiceState.isSpeaking
            ? 'bg-emerald-950/95 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/70 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
            : voiceState.isMuted
            ? 'bg-rose-950/80 border-rose-500/50 text-rose-300 hover:bg-rose-900/80'
            : voiceState.isDeafened
            ? 'bg-rose-950/80 border-rose-500/50 text-rose-300 hover:bg-rose-900/80'
            : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
        }`}
      >
        {/* Dynamic Icon State */}
        {!voiceState.isConnected ? (
          <>
            <Mic className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span className="font-bold tracking-tight">Voice</span>
          </>
        ) : voiceState.isConnecting ? (
          <>
            <span className="w-2 h-2 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin shrink-0" />
            <span className="font-bold">Joining...</span>
          </>
        ) : voiceState.isSpeaking ? (
          <>
            <Radio className="w-2.5 h-2.5 text-emerald-300 animate-pulse shrink-0" />
            <span className="font-black text-emerald-100">Talking</span>
          </>
        ) : voiceState.isMuted ? (
          <>
            <MicOff className="w-2.5 h-2.5 text-rose-400 shrink-0" />
            <span className="font-bold text-rose-300">Muted</span>
          </>
        ) : voiceState.isDeafened ? (
          <>
            <VolumeX className="w-2.5 h-2.5 text-rose-400 shrink-0" />
            <span className="font-bold text-rose-300">Deaf</span>
          </>
        ) : (
          <>
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <Mic className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span className="font-bold tracking-tight">Voice ({totalVoiceMembers})</span>
          </>
        )}
      </button>

      {/* 2. Rich Floating Tooltip / Popover Panel Anchored to the Button */}
      {isOpen && (
        <div
          ref={popoverRef}
          id="voice-chat-tooltip-popover"
          className="absolute right-0 top-full mt-1.5 z-50 w-[275px] sm:w-[295px] rounded-2xl bg-gradient-to-b from-[#0e1526] via-[#090f1d] to-[#050811] border border-amber-500/35 shadow-2xl p-3 text-slate-100 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 select-none overflow-hidden"
          style={{ willChange: 'transform, opacity' }}
        >
          {/* Subtle Top Caret Indicator */}
          <div className="absolute right-4 -top-1.5 w-3 h-3 bg-[#0e1526] border-t border-l border-amber-500/35 transform rotate-45" />

          {!voiceState.isConnected ? (
            /* === DISCONNECTED STATE: JOIN PROMPT & QUICK INFO === */
            <div className="space-y-2.5 relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Mic className="w-3 h-3" />
                  </div>
                  <span className="font-serif font-bold text-xs text-amber-200">Table Voice Chat</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">
                Connect your microphone to talk and interact with other players at this table in real-time.
              </p>

              {/* One-Tap Join Button */}
              <button
                type="button"
                onClick={handleJoinVoice}
                disabled={voiceState.isConnecting}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-serif font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 border border-emerald-400/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {voiceState.isConnecting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Connecting to Voice...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>Join Voice Channel</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono pt-1">
                <span>🔊 Stereo WebRTC Audio</span>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowSettings(true);
                  }}
                  className="text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Settings className="w-2.5 h-2.5" />
                  <span>Settings</span>
                </button>
              </div>
            </div>
          ) : (
            /* === CONNECTED STATE: LIVE CONTROLS, VU METER & PLAYER MIXER === */
            <div className="space-y-2.5 relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="font-serif font-bold text-xs text-emerald-300">Voice Connected</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    {totalVoiceMembers} In Room
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Disconnect Voice */}
                  <button
                    type="button"
                    onClick={handleLeaveVoice}
                    title="Leave Voice Channel"
                    className="p-1 rounded-md bg-rose-950/70 hover:bg-rose-900 border border-rose-600/40 text-rose-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <PhoneOff className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Active Speaker Banner */}
              {voiceState.isSpeaking ? (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-semibold animate-pulse">
                  <Radio className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">You are speaking...</span>
                </div>
              ) : speakingPeers.length > 0 ? (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-semibold animate-pulse">
                  <Volume2 className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="truncate">{speakingPeers.map((p) => p.username).join(', ')} speaking...</span>
                </div>
              ) : null}

              {/* Quick Action Controls */}
              <div className="grid grid-cols-3 gap-1.5">
                {/* Mute Mic */}
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer shadow-sm ${
                    voiceState.isMuted
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                  }`}
                >
                  {voiceState.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{voiceState.isMuted ? 'Unmute' : 'Mute'}</span>
                </button>

                {/* Deafen */}
                <button
                  type="button"
                  onClick={handleToggleDeafen}
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer shadow-sm ${
                    voiceState.isDeafened
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
                      : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {voiceState.isDeafened ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Headphones className="w-3.5 h-3.5 text-slate-300" />}
                  <span>{voiceState.isDeafened ? 'Undeafen' : 'Deafen'}</span>
                </button>

                {/* Settings */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setShowSettings(true);
                  }}
                  className="py-1.5 px-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-amber-300 text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer shadow-sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Mixer</span>
                </button>
              </div>

              {/* Live Mic Activity Visualizer */}
              <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 text-emerald-400" />
                    Mic Input Level
                  </span>
                  <span className={voiceState.isMuted ? 'text-rose-400 font-bold' : voiceState.isSpeaking ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {voiceState.isMuted ? 'MUTED' : voiceState.isSpeaking ? `${voiceState.localVolumeLevel}%` : 'IDLE'}
                  </span>
                </div>

                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      voiceState.isMuted
                        ? 'w-0'
                        : voiceState.localVolumeLevel > 50
                        ? 'bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{ width: `${voiceState.isMuted ? 0 : voiceState.localVolumeLevel}%` }}
                  />
                </div>
              </div>

              {/* Connected Voice Members List */}
              <div className="space-y-1 max-h-[140px] overflow-y-auto scrollbar-thin pr-0.5">
                <div className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-wider px-0.5">
                  Members ({totalVoiceMembers})
                </div>

                {/* Local User */}
                <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs overflow-hidden border ${
                      voiceState.isSpeaking ? 'border-emerald-400 ring-1.5 ring-emerald-400' : 'border-amber-400/50'
                    }`}>
                      <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size="xs" className="w-full h-full" />
                    </div>
                    <span className="text-[10.5px] font-bold text-slate-200 truncate">
                      {currentUser.username} <span className="text-[8.5px] text-amber-400 font-mono">(You)</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {voiceState.isSpeaking ? (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[8.5px] font-bold font-mono">
                        Speaking
                      </span>
                    ) : voiceState.isMuted ? (
                      <MicOff className="w-3 h-3 text-rose-400" />
                    ) : (
                      <Mic className="w-3 h-3 text-emerald-400/60" />
                    )}
                  </div>
                </div>

                {/* Remote Peers */}
                {connectedPeers.map((peer) => (
                  <div
                    key={peer.userId}
                    className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs overflow-hidden border ${
                        peer.isSpeaking ? 'border-emerald-400 ring-1.5 ring-emerald-400' : 'border-slate-700'
                      }`}>
                        <UserAvatar avatar={peer.avatar} name={peer.username} size="xs" className="w-full h-full" />
                      </div>
                      <span className="text-[10.5px] font-medium text-slate-300 truncate max-w-[90px]">
                        {peer.username}
                      </span>
                    </div>

                    {/* Inline volume slider */}
                    <div className="flex items-center gap-1 shrink-0">
                      {peer.isSpeaking ? (
                        <Radio className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
                      ) : (
                        <Volume2 className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={peer.volume}
                        onChange={(e) => voiceService.setPeerVolume(peer.userId, parseFloat(e.target.value))}
                        className="w-14 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        title={`Volume: ${Math.round(peer.volume * 100)}%`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice Settings Full Modal */}
      <VoiceSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        voiceState={voiceState}
      />
    </div>
  );
};
