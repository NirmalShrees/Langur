import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Edit2, Check } from 'lucide-react';
import { getAvarPreset } from '../../utils/avar.js';
import { sound } from '../../utils/audio.js';

interface TableAvarControlProps {
  tableId: string;
  tableName: string;
  avarValue?: number;
  onUpdateAvar: (tableId: string, newValue: number) => Promise<void> | void;
  disabled?: boolean;
}

const SNAP_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// Robust sanitizer that preserves 0 without falling back to 50
const parseAvarValue = (v: any): number => {
  if (v === null || v === undefined) return 50;
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export const TableAvarControl: React.FC<TableAvarControlProps> = ({
  tableId,
  tableName,
  avarValue = 50,
  onUpdateAvar,
  disabled = false,
}) => {
  // Authoritative value (can be 0, 37, 50, 100, etc.)
  const [val, setVal] = useState<number>(() => parseAvarValue(avarValue));
  
  // Real-time slider drag percentage (0-100 following pointer)
  const [dragPercent, setDragPercent] = useState<number>(() => parseAvarValue(avarValue));
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Manual input state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editInput, setEditInput] = useState<string>(() => String(val));
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Sync when prop changes externally
  useEffect(() => {
    const clean = parseAvarValue(avarValue);
    setVal(clean);
    if (!isDragging) {
      setDragPercent(clean);
    }
    if (!isEditing) {
      setEditInput(String(clean));
    }
  }, [avarValue, isDragging, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Current real-time value to display:
  // When dragging, snaps real-time to nearest 10 (0, 10, 20... 100); when not dragging, shows exact val (e.g. 0 or 37)
  const currentLiveVal = isDragging
    ? Math.max(0, Math.min(100, Math.round(dragPercent / 10) * 10))
    : val;

  const preset = getAvarPreset(currentLiveVal);

  // Commit value to server and update state
  const commitValue = async (targetValue: number) => {
    const sanitized = parseAvarValue(targetValue);
    setVal(sanitized);
    setDragPercent(sanitized);
    setEditInput(String(sanitized));
    setIsEditing(false);
    setIsDragging(false);
    sound.playChipSound();
    setIsUpdating(true);

    try {
      await onUpdateAvar(tableId, sanitized);
    } finally {
      setIsUpdating(false);
    }
  };

  // Pointer & Drag calculation
  const calculatePointerVal = (clientX: number): { rawPercent: number; snapped10: number } => {
    if (!trackRef.current) return { rawPercent: dragPercent, snapped10: currentLiveVal };
    const rect = trackRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const rawPercent = Math.round((offsetX / rect.width) * 100);
    const snapped10 = Math.max(0, Math.min(100, Math.round(rawPercent / 10) * 10));
    return { rawPercent, snapped10 };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || isUpdating) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    const { rawPercent, snapped10 } = calculatePointerVal(e.clientX);
    setDragPercent(rawPercent);
    if (snapped10 !== currentLiveVal) {
      sound.playChipSound();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled || isUpdating) return;
    const { rawPercent, snapped10 } = calculatePointerVal(e.clientX);
    setDragPercent(rawPercent);
    if (snapped10 !== currentLiveVal) {
      sound.playChipSound();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const { snapped10 } = calculatePointerVal(e.clientX);
    commitValue(snapped10);
  };

  // Manual commit: keeps exact typed number (e.g. 0% or 37%) WITHOUT ANY SNAPPING!
  const handleManualCommit = () => {
    const parsed = parseInt(editInput.trim(), 10);
    if (isNaN(parsed)) {
      setEditInput(String(val));
      setIsEditing(false);
      return;
    }
    const exactClamped = Math.max(0, Math.min(100, parsed));
    commitValue(exactClamped);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleManualCommit();
    } else if (e.key === 'Escape') {
      setEditInput(String(val));
      setIsEditing(false);
    }
  };

  // Track fill and thumb position
  const visualThumbPercent = isDragging ? dragPercent : val;

  return (
    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
      {/* Header: Title & Real-Time Dynamic Badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
          <span className="font-bold font-mono text-xs text-amber-200 tracking-wider">
            A-VAR
          </span>
          <span className="text-[10px] text-slate-500 font-sans truncate hidden sm:inline">
            (Adaptive Volatility)
          </span>
        </div>

        {/* Dynamic Preset Badge */}
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium tracking-tight border shrink-0 bg-slate-900/90 ${preset.borderColor} ${preset.color}`}
        >
          {preset.badge}
        </span>
      </div>

      {/* Slider & Clickable/Editable Percentage Box */}
      <div className="flex items-center gap-2.5">
        {/* Interactive Track: Smooth pointer gliding that snaps to 10s */}
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative flex-1 h-6 flex items-center cursor-pointer select-none touch-none group ${
            disabled || isUpdating ? 'opacity-50 pointer-events-none' : ''
          }`}
          title="Drag slider to adjust in intervals of 10% (0%, 10%, 20% ... 100%)"
        >
          {/* Track Bar Background */}
          <div className="w-full h-1.5 rounded-full bg-slate-900 border border-slate-700/60 relative overflow-hidden shadow-inner">
            {/* Filled Progress Bar */}
            <div
              className={`h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 rounded-full transition-all ${
                isDragging ? 'duration-0' : 'duration-150'
              }`}
              style={{ width: `${visualThumbPercent}%` }}
            />
          </div>

          {/* Snap Marker Ticks at every 10% interval */}
          {SNAP_POINTS.map((snap) => {
            const isMajor = snap === 0 || snap === 50 || snap === 100;
            const isCurrentSnap = currentLiveVal === snap;
            const isPassed = visualThumbPercent >= snap;
            return (
              <div
                key={snap}
                style={{ left: `${snap}%` }}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center"
              >
                <div
                  className={`rounded-full transition-all ${
                    isMajor ? 'w-1.5 h-1.5' : 'w-1 h-1'
                  } ${
                    isCurrentSnap
                      ? 'bg-amber-300 ring-1 ring-amber-400 scale-125'
                      : isPassed
                      ? 'bg-amber-500/70'
                      : 'bg-slate-700'
                  }`}
                />
              </div>
            );
          })}

          {/* Draggable Thumb (Follows mouse smoothly without sticking or outline) */}
          <div
            style={{ left: `${visualThumbPercent}%` }}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-400 border border-amber-200 shadow-md shadow-black/80 pointer-events-none flex items-center justify-center transition-transform ${
              isDragging ? 'scale-110' : 'group-hover:scale-105'
            }`}
          >
            <div className="w-1 h-1 rounded-full bg-slate-950" />
          </div>
        </div>

        {/* Percentage Number (Updates in real-time during slider drag; editable on click with only Check button) */}
        {isEditing ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              ref={inputRef}
              type="number"
              min="0"
              max="100"
              value={editInput}
              onChange={(e) => setEditInput(e.target.value)}
              onBlur={handleManualCommit}
              onKeyDown={handleKeyDown}
              className="w-14 px-1.5 py-0.5 bg-slate-950 border border-amber-400 rounded-md text-amber-300 font-mono text-xs font-bold text-center outline-none focus:outline-none focus:ring-0 shadow-md"
            />
            <button
              type="button"
              onMouseDown={handleManualCommit}
              className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer shadow active:scale-95"
              title="Save exact percentage"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditInput(String(val));
              setIsEditing(true);
            }}
            disabled={disabled || isUpdating}
            title="Click to manually enter exact custom percentage (0% to 100%)"
            className={`px-2 py-0.5 rounded-lg bg-slate-900/90 hover:bg-slate-850 border border-slate-700/80 hover:border-amber-500/50 ${preset.color} font-mono font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 group disabled:opacity-50 outline-none`}
          >
            <span>{currentLiveVal}%</span>
            <Edit2 className="w-2.5 h-2.5 text-slate-500 group-hover:text-amber-400 transition-colors opacity-60 group-hover:opacity-100" />
          </button>
        )}
      </div>

      {/* Ticks Range Reference */}
      <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-500 px-0.5 select-none pointer-events-none">
        <span>0% RNG</span>
        <span>50% Balanced</span>
        <span>100% Max</span>
      </div>
    </div>
  );
};
