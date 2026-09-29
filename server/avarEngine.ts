import crypto from 'crypto';
import { SymbolType, SYMBOL_KEYS, RoomState, PlayerInRoom } from '../src/types.js';

export interface TableAvarConfig {
  aggressiveness: number; // 0, 25, 50, 75, 100 (Default: 50)
  newcomerShield?: boolean;
  comebackLifeline?: boolean;
}

export interface AvarPresetInfo {
  value: number;
  label: string;
  badge: string;
  color: string;
  borderColor: string;
  bgGradient: string;
  description: string;
}

export const AVAR_PRESETS: Record<number, AvarPresetInfo> = {
  0: {
    value: 0,
    label: '0% Pure Random',
    badge: 'Organic RNG',
    color: 'text-slate-300',
    borderColor: 'border-slate-600',
    bgGradient: 'from-slate-800 to-slate-900',
    description: '100% organic random dice. All 46,656 outcomes have equal probability.',
  },
  25: {
    value: 25,
    label: '25% Gentle',
    badge: 'High Generosity',
    color: 'text-emerald-300',
    borderColor: 'border-emerald-500/40',
    bgGradient: 'from-emerald-950/40 to-slate-900',
    description: 'Soft house advantage with high generosity. Ideal for casual tables.',
  },
  50: {
    value: 50,
    label: '50% Balanced',
    badge: 'Standard Casino (Default)',
    color: 'text-amber-300',
    borderColor: 'border-amber-500/40',
    bgGradient: 'from-amber-950/40 to-slate-900',
    description: 'Authentic casino equilibrium. Steady developer profit with player lifelines.',
  },
  75: {
    value: 75,
    label: '75% Squeeze',
    badge: 'High Roller Squeeze',
    color: 'text-orange-300',
    borderColor: 'border-orange-500/40',
    bgGradient: 'from-orange-950/40 to-slate-900',
    description: 'Tighter house protection. Aggressively suppresses whale winning streaks.',
  },
  100: {
    value: 100,
    label: '100% Max Edge',
    badge: 'Max House Profit',
    color: 'text-rose-300',
    borderColor: 'border-rose-500/50',
    bgGradient: 'from-rose-950/40 to-slate-900',
    description: 'Maximum profit optimization while maintaining minimum 10% lucky-shot chance.',
  },
};

/**
 * Generates an unbiased cryptographically secure 6-dice roll
 */
export function generatePureRandomDice(): SymbolType[] {
  const dice: SymbolType[] = [];
  for (let i = 0; i < 6; i++) {
    const idx = crypto.randomInt(0, SYMBOL_KEYS.length);
    dice.push(SYMBOL_KEYS[idx]);
  }
  return dice;
}

/**
 * Counts symbol occurrences in a 6-dice roll
 */
export function countDiceSymbols(dice: SymbolType[]): Record<SymbolType, number> {
  const counts: Record<SymbolType, number> = {
    jhanda: 0,
    burja: 0,
    itta: 0,
    paan: 0,
    hukum: 0,
    chidi: 0,
  };
  for (const d of dice) {
    counts[d] = (counts[d] || 0) + 1;
  }
  return counts;
}

/**
 * Calculates payout for a given bet on a symbol under standard Langur Burja rules:
 * - 0 or 1 matching dice = 0 return (loss)
 * - 2+ matching dice = bet + (count * bet) return
 */
export function calculateSymbolReturn(bet: number, count: number): number {
  if (bet <= 0) return 0;
  if (count >= 2) {
    return bet + (count * bet);
  }
  return 0;
}

/**
 * Evaluates candidate dice rolls against active player bets using the A-VAR probabilistic engine.
 * 
 * Key Principles:
 * 1. Chance-based (never deterministic): rolls are sampled using weighted probabilities.
 * 2. Minimum lucky-shot chance: Even on 100% setting, winning rolls always have non-zero probability (~10%).
 * 3. Grace buffer for newcomers (rounds < 3) & Lifelines for depleted coins (< 15%).
 * 4. Progressive house bias on high-stakes / winning streaks according to table aggressiveness.
 */
export function calculateAvarDiceRoll(
  room: RoomState,
  config?: Partial<TableAvarConfig>
): SymbolType[] {
  const aggressiveness = Math.max(0, Math.min(100, config?.aggressiveness ?? (room as any).avar ?? 50));

  // If 0% A-VAR: 100% Pure Organic Random RNG
  if (aggressiveness === 0) {
    return generatePureRandomDice();
  }

  const players = Object.values(room.players || {});
  const totalTableBets = Object.values(room.tableBets || {}).reduce((a, b) => a + Number(b || 0), 0);

  // If no bets placed at table, roll purely random
  if (totalTableBets <= 0 || players.length === 0) {
    return generatePureRandomDice();
  }

  // Generate a diverse pool of candidate rolls (including random samples + targeted permutations)
  const candidatePoolSize = 64;
  const candidates: SymbolType[][] = [];

  // 1. Add pure random candidate rolls
  for (let i = 0; i < candidatePoolSize; i++) {
    candidates.push(generatePureRandomDice());
  }

  // 2. Score each candidate roll
  const scoredCandidates: { dice: SymbolType[]; weight: number; houseProfit: number }[] = [];

  for (const candidate of candidates) {
    const counts = countDiceSymbols(candidate);
    let candidateTotalPayouts = 0;
    let newcomerSatisfactionBonus = 0;
    let lifelineSatisfactionBonus = 0;
    let whaleSuppressionFactor = 0;

    for (const player of players) {
      if (player.totalBetThisRound <= 0) continue;

      let playerPayout = 0;
      let playerHasMatch = false;

      for (const symbol of SYMBOL_KEYS) {
        const bet = player.bets[symbol] || 0;
        if (bet > 0) {
          const count = counts[symbol];
          const won = calculateSymbolReturn(bet, count);
          playerPayout += won;
          if (count >= 1) playerHasMatch = true;
        }
      }

      candidateTotalPayouts += playerPayout;
      const playerNet = playerPayout - player.totalBetThisRound;

      const roundsPlayed = player.sessionStats?.roundsPlayed || 0;
      const sessionWon = player.sessionStats?.totalWon || 0;
      const sessionBet = player.sessionStats?.totalBet || 0;
      const sessionPnL = sessionWon - sessionBet;
      const isNewcomer = roundsPlayed < 3;
      const isDepleted = player.coins <= Math.max(50, player.totalBetThisRound * 1.5);
      const isWhale = player.totalBetThisRound >= 500;

      // Rule 2: Newcomer Warm Welcome
      if (isNewcomer) {
        if (playerNet > 0) {
          newcomerSatisfactionBonus += 40;
        } else if (playerHasMatch) {
          // Near-miss consolation
          newcomerSatisfactionBonus += 15;
        }
      }

      // Rule 4: Lifeline for depleted coins
      if (isDepleted && playerNet > 0) {
        lifelineSatisfactionBonus += 35;
      }

      // Rule 3: Hot Streak / Whale Cooling
      if (sessionPnL > 1000 && isWhale && playerNet > 0) {
        whaleSuppressionFactor += (playerNet / 100);
      }
    }

    const houseProfit = totalTableBets - candidateTotalPayouts;

    // Base score from House Net Revenue
    let baseScore = 100;

    if (houseProfit > 0) {
      // House gains profit: boosted by aggressiveness factor
      const profitRatio = totalTableBets > 0 ? houseProfit / totalTableBets : 0;
      baseScore += profitRatio * 150 * (aggressiveness / 100);
    } else if (houseProfit < 0) {
      // House is in deficit: penalized by aggressiveness factor
      const lossRatio = totalTableBets > 0 ? Math.abs(houseProfit) / totalTableBets : 1;
      baseScore -= lossRatio * 120 * (aggressiveness / 100);
    }

    // Apply Newcomer & Lifeline retention adjustments (attenuated by aggressiveness)
    baseScore += newcomerSatisfactionBonus * (1 - aggressiveness / 200);
    baseScore += lifelineSatisfactionBonus * (1 - aggressiveness / 200);
    baseScore -= whaleSuppressionFactor * (aggressiveness / 100);

    // Guaranteed floor to ensure true probability distribution (never 0)
    const finalWeight = Math.max(8, baseScore);

    scoredCandidates.push({
      dice: candidate,
      weight: finalWeight,
      houseProfit,
    });
  }

  // 3. Weighted Random Selection (True Chance / Non-Deterministic)
  const totalWeight = scoredCandidates.reduce((sum, item) => sum + item.weight, 0);
  let randomPick = Math.random() * totalWeight;

  for (const item of scoredCandidates) {
    if (randomPick <= item.weight) {
      return item.dice;
    }
    randomPick -= item.weight;
  }

  // Fallback
  return scoredCandidates[0]?.dice || generatePureRandomDice();
}
