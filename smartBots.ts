import { SymbolType, SYMBOL_KEYS, PlayerSessionStats } from '../types.js';
import { TablePlayer } from '../components/ActivePlayersDeck.js';

export type BotStrategy =
  | 'trend_follower'   // Follows hot symbols from recent rounds
  | 'contrarian'       // Bets on cold symbols expecting mean reversion
  | 'smart_hedger'     // Splits bets between 2 balanced symbols
  | 'high_roller'      // Large bets, aggressive pressing on win streaks
  | 'conservative';    // Low-risk, steady bankroll management

export interface SmartBotProfile {
  id: string;
  username: string;
  avatar: string;
  title: string;
  coins: number;
  strategy: BotStrategy;
  favoriteSymbols: SymbolType[];
  aggression: number;
  winStreak: number;
  lossStreak: number;
  currentBets: Record<SymbolType, number>;
  totalBetThisRound: number;
  isReady: boolean;
  betPlacedAtSeconds: number;
  sessionStats: PlayerSessionStats;
}

/**
 * Authentic player roster for public tables.
 * Natural names, cultural avatars, realistic titles, and no bot badges.
 */
export const INITIAL_SMART_BOTS: SmartBotProfile[] = [
  {
    id: 'patron_aarav',
    username: 'Aarav_K',
    avatar: '🧑‍💼',
    title: 'Pattern Seeker',
    coins: 14500,
    strategy: 'trend_follower',
    favoriteSymbols: ['burja', 'jhanda'],
    aggression: 0.6,
    winStreak: 1,
    lossStreak: 0,
    currentBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
    totalBetThisRound: 0,
    isReady: false,
    betPlacedAtSeconds: 12,
    sessionStats: {
      joinedAt: Date.now() - 360000,
      initialCoins: 12000,
      roundsPlayed: 8,
      roundsWon: 5,
      winRate: 63,
      netProfit: 2500,
      totalBet: 4200,
      totalWon: 6700,
      biggestWin: 1800,
      history: [],
    },
  },
  {
    id: 'patron_sita',
    username: 'Sita_Sharma',
    avatar: '👩‍💼',
    title: 'Himalayan Ace',
    coins: 28400,
    strategy: 'smart_hedger',
    favoriteSymbols: ['itta', 'paan'],
    aggression: 0.5,
    winStreak: 2,
    lossStreak: 0,
    currentBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
    totalBetThisRound: 0,
    isReady: false,
    betPlacedAtSeconds: 9,
    sessionStats: {
      joinedAt: Date.now() - 480000,
      initialCoins: 25000,
      roundsPlayed: 10,
      roundsWon: 6,
      winRate: 60,
      netProfit: 3400,
      totalBet: 5800,
      totalWon: 9200,
      biggestWin: 2400,
      history: [],
    },
  },
  {
    id: 'patron_dipen',
    username: 'Dipen_Thapa',
    avatar: '🦁',
    title: 'High Roller',
    coins: 46500,
    strategy: 'high_roller',
    favoriteSymbols: ['burja', 'hukum'],
    aggression: 0.85,
    winStreak: 0,
    lossStreak: 1,
    currentBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
    totalBetThisRound: 0,
    isReady: false,
    betPlacedAtSeconds: 7,
    sessionStats: {
      joinedAt: Date.now() - 600000,
      initialCoins: 42000,
      roundsPlayed: 12,
      roundsWon: 5,
      winRate: 42,
      netProfit: 4500,
      totalBet: 14000,
      totalWon: 18500,
      biggestWin: 6500,
      history: [],
    },
  },
  {
    id: 'patron_maya',
    username: 'Maya_Gurung',
    avatar: '👑',
    title: 'Royal Tactician',
    coins: 19800,
    strategy: 'contrarian',
    favoriteSymbols: ['chidi', 'jhanda'],
    aggression: 0.45,
    winStreak: 1,
    lossStreak: 0,
    currentBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
    totalBetThisRound: 0,
    isReady: false,
    betPlacedAtSeconds: 10,
    sessionStats: {
      joinedAt: Date.now() - 300000,
      initialCoins: 18000,
      roundsPlayed: 7,
      roundsWon: 4,
      winRate: 57,
      netProfit: 1800,
      totalBet: 3500,
      totalWon: 5300,
      biggestWin: 1600,
      history: [],
    },
  },
  {
    id: 'patron_rohan',
    username: 'Rohan_M',
    avatar: '🏔️',
    title: 'Disciplined Staker',
    coins: 12400,
    strategy: 'conservative',
    favoriteSymbols: ['itta', 'chidi'],
    aggression: 0.35,
    winStreak: 0,
    lossStreak: 1,
    currentBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
    totalBetThisRound: 0,
    isReady: false,
    betPlacedAtSeconds: 4,
    sessionStats: {
      joinedAt: Date.now() - 400000,
      initialCoins: 11000,
      roundsPlayed: 9,
      roundsWon: 5,
      winRate: 56,
      netProfit: 1400,
      totalBet: 3200,
      totalWon: 4600,
      biggestWin: 1200,
      history: [],
    },
  },
];

/**
 * Calculates frequency of symbols in recent rolls to detect hot and cold trends.
 */
export function analyzeRollHistory(recentRolls: SymbolType[][]): {
  hotSymbols: SymbolType[];
  coldSymbols: SymbolType[];
  counts: Record<SymbolType, number>;
} {
  const counts: Record<SymbolType, number> = {
    jhanda: 0,
    burja: 0,
    itta: 0,
    paan: 0,
    hukum: 0,
    chidi: 0,
  };

  if (!recentRolls || recentRolls.length === 0) {
    return {
      hotSymbols: ['burja', 'jhanda'],
      coldSymbols: ['hukum', 'chidi'],
      counts,
    };
  }

  // Weight more recent rolls higher
  recentRolls.slice(-10).forEach((diceList, idx) => {
    const weight = idx + 1;
    diceList.forEach((sym) => {
      if (counts[sym] !== undefined) {
        counts[sym] += weight;
      }
    });
  });

  const sorted = (Object.keys(counts) as SymbolType[]).sort((a, b) => counts[b] - counts[a]);
  const hotSymbols = sorted.slice(0, 2);
  const coldSymbols = sorted.slice(-2).reverse();

  return { hotSymbols, coldSymbols, counts };
}

/**
 * Plans intelligent bets for all bots at the start of a round based on strategy and history.
 */
export function planSmartBotBets(
  bots: SmartBotProfile[],
  recentRolls: SymbolType[][],
  bettingDuration = 15
): {
  plannedBots: SmartBotProfile[];
  combinedBotBets: Record<SymbolType, number>;
} {
  const { hotSymbols, coldSymbols } = analyzeRollHistory(recentRolls);
  const combinedBotBets: Record<SymbolType, number> = {
    jhanda: 0,
    burja: 0,
    itta: 0,
    paan: 0,
    hukum: 0,
    chidi: 0,
  };

  const plannedBots = bots.map((bot, index) => {
    const bets: Record<SymbolType, number> = {
      jhanda: 0,
      burja: 0,
      itta: 0,
      paan: 0,
      hukum: 0,
      chidi: 0,
    };

    // Stagger bet timing naturally across the countdown
    const staggerInterval = Math.max(2, Math.floor((bettingDuration - 3) / bots.length));
    const betPlacedAtSeconds = Math.max(2, bettingDuration - 2 - index * staggerInterval);

    switch (bot.strategy) {
      case 'trend_follower': {
        // Bets on hot symbols with confidence scaling with win streak
        const primarySym = hotSymbols[0] || 'burja';
        const secondarySym = hotSymbols[1] || 'jhanda';
        const baseStake = bot.winStreak > 0 ? 300 : 200;
        bets[primarySym] = baseStake;
        if (Math.random() > 0.4) {
          bets[secondarySym] = 100;
        }
        break;
      }

      case 'contrarian': {
        // Bets on cold symbols expecting mean reversion
        const coldSym = coldSymbols[0] || 'chidi';
        const stake = Math.min(bot.coins, 250 + bot.lossStreak * 50);
        bets[coldSym] = stake;
        if (Math.random() > 0.5) {
          const secondCold = coldSymbols[1] || 'itta';
          bets[secondCold] = 100;
        }
        break;
      }

      case 'smart_hedger': {
        // Splits bet 60/40 across 2 balanced symbols
        const symA = bot.favoriteSymbols[0] || 'itta';
        const symB = bot.favoriteSymbols[1] || 'paan';
        bets[symA] = 200;
        bets[symB] = 200;
        break;
      }

      case 'high_roller': {
        // High stakes, presses bets aggressively on streaks
        const targetSym = Math.random() > 0.5 ? hotSymbols[0] : bot.favoriteSymbols[0];
        const multiplier = bot.winStreak >= 2 ? 2.5 : bot.winStreak === 1 ? 1.5 : 1.0;
        const stake = Math.min(bot.coins, Math.round(500 * multiplier));
        bets[targetSym] = stake;
        if (Math.random() > 0.3) {
          bets[bot.favoriteSymbols[1]] = 200;
        }
        break;
      }

      case 'conservative':
      default: {
        // Steady small bets, safe bankroll
        const sym = bot.favoriteSymbols[Math.floor(Math.random() * bot.favoriteSymbols.length)] || 'itta';
        bets[sym] = 100;
        if (Math.random() > 0.6) {
          bets[hotSymbols[0]] = 100;
        }
        break;
      }
    }

    const totalBetThisRound = Object.values(bets).reduce((a, b) => a + b, 0);

    // Sum into combined table bets
    (Object.keys(bets) as SymbolType[]).forEach((sym) => {
      combinedBotBets[sym] += bets[sym];
    });

    return {
      ...bot,
      currentBets: bets,
      totalBetThisRound,
      isReady: false,
      betPlacedAtSeconds,
    };
  });

  return { plannedBots, combinedBotBets };
}

/**
 * Resolves outcomes for all bots based on rolled dice and updates their bankroll & statistics.
 */
export function resolveSmartBotPayouts(
  bots: SmartBotProfile[],
  rolledDice: SymbolType[],
  roundNumber: number
): SmartBotProfile[] {
  const counts: Record<SymbolType, number> = {
    jhanda: 0,
    burja: 0,
    itta: 0,
    paan: 0,
    hukum: 0,
    chidi: 0,
  };
  rolledDice.forEach((d) => counts[d]++);

  return bots.map((bot) => {
    let wonAmount = 0;
    let betAmount = 0;

    (Object.keys(bot.currentBets) as SymbolType[]).forEach((sym) => {
      const b = bot.currentBets[sym];
      if (b > 0) {
        betAmount += b;
        const match = counts[sym];
        if (match >= 2) {
          // Traditional Langur Burja: return bet + match * bet
          wonAmount += b + match * b;
        }
      }
    });

    const netChange = wonAmount - betAmount;
    const isWin = wonAmount > 0;
    const newCoins = Math.max(500, bot.coins + netChange); // Automatic reload if depleted

    const roundsPlayed = (bot.sessionStats?.roundsPlayed || 0) + 1;
    const roundsWon = (bot.sessionStats?.roundsWon || 0) + (isWin ? 1 : 0);
    const winRate = Math.round((roundsWon / roundsPlayed) * 100);
    const netProfit = (bot.sessionStats?.netProfit || 0) + netChange;
    const totalBet = (bot.sessionStats?.totalBet || 0) + betAmount;
    const totalWon = (bot.sessionStats?.totalWon || 0) + wonAmount;
    const biggestWin = Math.max(bot.sessionStats?.biggestWin || 0, isWin ? wonAmount : 0);

    const historyEntry = {
      roundNumber,
      betAmount,
      wonAmount,
      netChange,
      dice: rolledDice,
      bets: { ...bot.currentBets },
      timestamp: Date.now(),
    };

    const newHistory = [historyEntry, ...(bot.sessionStats?.history || [])].slice(0, 15);

    return {
      ...bot,
      coins: newCoins,
      winStreak: isWin ? bot.winStreak + 1 : 0,
      lossStreak: !isWin ? bot.lossStreak + 1 : 0,
      currentBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
      totalBetThisRound: 0,
      isReady: false,
      sessionStats: {
        ...bot.sessionStats,
        roundsPlayed,
        roundsWon,
        winRate,
        netProfit,
        totalBet,
        totalWon,
        biggestWin,
        history: newHistory,
      },
    };
  });
}

/**
 * Converts a smart bot profile into TablePlayer representation.
 * Explicitly sets isBot: false and renders natural player details.
 */
export function smartBotToTablePlayer(bot: SmartBotProfile): TablePlayer {
  return {
    id: bot.id,
    username: bot.username,
    avatar: bot.avatar,
    coins: bot.coins,
    currentBet: bot.totalBetThisRound,
    isReady: bot.isReady,
    title: bot.title,
    isUser: false,
    isHost: false,
    isBot: false,
    sessionStats: bot.sessionStats,
  };
}
