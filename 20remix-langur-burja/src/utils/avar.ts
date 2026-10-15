export interface AvarPresetInfo {
  value: number;
  label: string;
  badge: string;
  badgeShort: string;
  color: string;
  borderColor: string;
  bgGradient: string;
  description: string;
}

export const AVAR_PRESETS: Record<number, AvarPresetInfo> = {
  0: {
    value: 0,
    label: '0% Pure Random',
    badge: 'Organic RNG (0%)',
    badgeShort: '0% RNG',
    color: 'text-slate-300',
    borderColor: 'border-slate-600/60',
    bgGradient: 'from-slate-900 via-slate-900 to-slate-950',
    description: '100% organic random dice. All outcomes have equal probability.',
  },
  25: {
    value: 25,
    label: '25% Gentle',
    badge: 'High Generosity (25%)',
    badgeShort: '25% Gentle',
    color: 'text-emerald-300',
    borderColor: 'border-emerald-500/40',
    bgGradient: 'from-emerald-950/30 via-slate-900 to-slate-950',
    description: 'Soft house advantage with high player generosity.',
  },
  50: {
    value: 50,
    label: '50% Balanced',
    badge: 'Standard Casino (Default 50%)',
    badgeShort: '50% Default',
    color: 'text-amber-300',
    borderColor: 'border-amber-500/40',
    bgGradient: 'from-amber-950/30 via-slate-900 to-slate-950',
    description: 'Balanced casino equilibrium with player comeback lifelines.',
  },
  75: {
    value: 75,
    label: '75% Squeeze',
    badge: 'High Roller Squeeze (75%)',
    badgeShort: '75% Squeeze',
    color: 'text-orange-300',
    borderColor: 'border-orange-500/40',
    bgGradient: 'from-orange-950/30 via-slate-900 to-slate-950',
    description: 'Tighter house profit margin. Cools down hot winning streaks.',
  },
  100: {
    value: 100,
    label: '100% Max Edge',
    badge: 'Max House Profit (100%)',
    badgeShort: '100% Max',
    color: 'text-rose-300',
    borderColor: 'border-rose-500/50',
    bgGradient: 'from-rose-950/30 via-slate-900 to-slate-950',
    description: 'Maximum house margin while maintaining 10% lucky-shot floor.',
  },
};

export function getAvarPreset(val: number = 50): AvarPresetInfo {
  const cleanVal = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
  
  // Exact standard presets
  if (AVAR_PRESETS[cleanVal]) {
    return AVAR_PRESETS[cleanVal];
  }

  // Custom intermediate value
  if (cleanVal === 0) {
    return AVAR_PRESETS[0];
  } else if (cleanVal < 38) {
    return {
      value: cleanVal,
      label: `${cleanVal}% Gentle`,
      badge: `Generous (${cleanVal}%)`,
      badgeShort: `${cleanVal}%`,
      color: 'text-emerald-300',
      borderColor: 'border-emerald-500/40',
      bgGradient: 'from-emerald-950/30 via-slate-900 to-slate-950',
      description: `Custom soft house advantage (${cleanVal}%) with enhanced player win frequency.`,
    };
  } else if (cleanVal <= 62) {
    return {
      value: cleanVal,
      label: `${cleanVal}% Balanced`,
      badge: `Custom Balanced (${cleanVal}%)`,
      badgeShort: `${cleanVal}%`,
      color: 'text-amber-300',
      borderColor: 'border-amber-500/40',
      bgGradient: 'from-amber-950/30 via-slate-900 to-slate-950',
      description: `Custom balanced equilibrium (${cleanVal}%) with steady house return.`,
    };
  } else if (cleanVal < 88) {
    return {
      value: cleanVal,
      label: `${cleanVal}% Squeeze`,
      badge: `Custom Squeeze (${cleanVal}%)`,
      badgeShort: `${cleanVal}%`,
      color: 'text-orange-300',
      borderColor: 'border-orange-500/40',
      bgGradient: 'from-orange-950/30 via-slate-900 to-slate-950',
      description: `Custom tighter house margin (${cleanVal}%) suppressing high-stake payouts.`,
    };
  } else {
    return {
      value: cleanVal,
      label: `${cleanVal}% Max Edge`,
      badge: `Custom High Profit (${cleanVal}%)`,
      badgeShort: `${cleanVal}%`,
      color: 'text-rose-300',
      borderColor: 'border-rose-500/50',
      bgGradient: 'from-rose-950/30 via-slate-900 to-slate-950',
      description: `Custom maximum profit optimization (${cleanVal}%) with 10% lucky-shot floor.`,
    };
  }
}

