/**
 * Core Types for Langur Burja (Jhandi Munda) Multiplayer Game
 */

export type SymbolType = 'jhanda' | 'burja' | 'itta' | 'paan' | 'hukum' | 'chidi';

export interface SymbolConfig {
  id: SymbolType;
  name: string;
  nepaliName: string;
  symbolChar: string;
  badgeColor: string;
  glowColor: string;
  borderColor: string;
  textColor: string;
  bgGradient: string;
  description: string;
}

export const LANGUR_BURJA_SYMBOLS: Record<SymbolType, SymbolConfig> = {
  jhanda: {
    id: 'jhanda',
    name: 'Flag',
    nepaliName: 'झण्डा (Jhanda)',
    symbolChar: '🚩',
    badgeColor: 'bg-rose-600',
    glowColor: 'rgba(244, 63, 94, 0.4)',
    borderColor: 'border-rose-500',
    textColor: 'text-rose-400',
    bgGradient: 'from-rose-950/40 to-rose-900/10',
    description: 'The Red Royal Banner of Victory',
  },
  burja: {
    id: 'burja',
    name: 'Crown',
    nepaliName: 'बुर्जा (Burja / Langur)',
    symbolChar: '👑',
    badgeColor: 'bg-amber-500',
    glowColor: 'rgba(245, 158, 11, 0.45)',
    borderColor: 'border-amber-400',
    textColor: 'text-amber-300',
    bgGradient: 'from-amber-950/40 to-amber-900/10',
    description: 'The Royal Golden Crown of the King',
  },
  itta: {
    id: 'itta',
    name: 'Diamond',
    nepaliName: 'ईंटा (Itta)',
    symbolChar: '♦',
    badgeColor: 'bg-red-600',
    glowColor: 'rgba(239, 68, 68, 0.4)',
    borderColor: 'border-red-500',
    textColor: 'text-red-400',
    bgGradient: 'from-red-950/40 to-red-900/10',
    description: 'The Gem of Wealth & Fortune',
  },
  paan: {
    id: 'paan',
    name: 'Heart',
    nepaliName: 'पान (Paan)',
    symbolChar: '♥',
    badgeColor: 'bg-pink-600',
    glowColor: 'rgba(236, 72, 153, 0.4)',
    borderColor: 'border-pink-500',
    textColor: 'text-pink-400',
    bgGradient: 'from-pink-950/40 to-pink-900/10',
    description: 'The Sacred Betel Leaf of Passion',
  },
  hukum: {
    id: 'hukum',
    name: 'Spade',
    nepaliName: 'हुकुम (Hukum)',
    symbolChar: '♠',
    badgeColor: 'bg-sky-600',
    glowColor: 'rgba(14, 165, 233, 0.4)',
    borderColor: 'border-sky-500',
    textColor: 'text-sky-400',
    bgGradient: 'from-sky-950/40 to-sky-900/10',
    description: 'The Supreme Decree of Authority',
  },
  chidi: {
    id: 'chidi',
    name: 'Club',
    nepaliName: 'चिडी (Chidi)',
    symbolChar: '♣',
    badgeColor: 'bg-emerald-600',
    glowColor: 'rgba(16, 185, 129, 0.4)',
    borderColor: 'border-emerald-500',
    textColor: 'text-emerald-400',
    bgGradient: 'from-emerald-950/40 to-emerald-900/10',
    description: 'The Lucky Clover of Abundance',
  },
};

export const SYMBOL_KEYS: SymbolType[] = ['jhanda', 'burja', 'itta', 'paan', 'hukum', 'chidi'];

export const MAX_PLAYERS_PER_TABLE = 16;

export type GamePhase = 'waiting' | 'betting' | 'rolling' | 'payout';

export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  coins: number;
  totalWinnings: number;
  gamesPlayed: number;
  gamesWon: number;
  biggestWin: number;
  inventory: string[];
  equipped: {
    diceSkin: string;
    tableMat: string;
    title: string;
  };
  lastFaucetAt?: number;
  createdAt: number;
  email?: string;
  isGuest?: boolean;
  authProvider?: 'google' | 'email' | 'guest';
  profileConfigured?: boolean;
  hasPassword?: boolean;
  googleName?: string;
  googleAvatar?: string;
}

export interface PlayerSessionStats {
  joinedAt: number;
  initialCoins?: number;
  roundsPlayed: number;
  roundsWon: number;
  totalBet: number;
  totalWon: number;
  netProfit: number;
  biggestWin: number;
  winRate: number; // percentage 0 - 100
  history: {
    roundNumber: number;
    betAmount: number;
    wonAmount: number;
    netChange: number;
    dice: SymbolType[];
    bets?: Record<SymbolType, number>;
    timestamp: number;
  }[];
}

export interface PlayerInRoom {
  id: string;
  username: string;
  avatar: string;
  coins: number;
  isHost: boolean;
  bets: Record<SymbolType, number>;
  totalBetThisRound: number;
  sessionStats?: PlayerSessionStats;
  equipped: {
    diceSkin: string;
    tableMat: string;
    title: string;
  };
  lastActive: number;
  isDisconnected?: boolean;
  disconnectedAt?: number;
}

export interface RoomSettings {
  minBet: number;
  maxBet: number;
  bettingDuration: number; // seconds (default 20)
  payoutDuration: number;  // seconds (default 6)
  autoLoop: boolean;
  payoutMultiplierType: 'traditional' | 'generous'; // traditional: 0 or 1 dice = loss, 2+ = bet returned + count*bet
}

export interface RoundResultSummary {
  roundNumber: number;
  dice: SymbolType[];
  symbolCounts: Record<SymbolType, number>;
  winningSymbols: SymbolType[]; // symbols with count >= 2
  playerPayouts: Record<string, {
    totalBet: number;
    totalWon: number;
    netChange: number;
    details: { symbol: SymbolType; bet: number; count: number; won: number }[];
  }>;
  totalTableBets: number;
  totalTablePayouts: number;
  timestamp: number;
}

export interface RoomState {
  id: string;
  code: string;
  name: string;
  hostId: string;
  isPrivate: boolean;
  settings: RoomSettings;
  phase: GamePhase;
  timer: number;
  phaseEndsAt?: number;
  dice: SymbolType[];
  roundNumber: number;
  players: Record<string, PlayerInRoom>;
  tableBets: Record<SymbolType, number>;
  lastResult?: RoundResultSummary;
  nextRoundVotes?: string[]; // Array of player user IDs who clicked "Next Round"
  activeBotIds?: string[]; // Array of active bot IDs at this table
  recentHistory: {
    roundNumber: number;
    dice: SymbolType[];
    topSymbol: SymbolType;
  }[];
  history?: {
    roundNumber: number;
    dice: SymbolType[];
    symbolCounts: Record<SymbolType, number>;
    winningSymbols: SymbolType[];
    totalTableBets: number;
    totalTablePayouts: number;
    playerPayouts?: Record<string, any>;
    timestamp: number;
  }[];
  tableStats?: {
    totalRounds: number;
    totalBets: number;
    totalPayouts: number;
    highestRoundPool?: number;
    biggestWinner?: { username: string; amount: number; roundNumber: number };
  };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface FloatingReaction {
  id: string;
  senderId: string;
  senderName: string;
  emoji: string;
  timestamp: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  avatar: string;
  coins: number;
  totalWinnings: number;
  gamesWon: number;
  biggestWin: number;
  equippedTitle?: string;
}

export interface ShopItem {
  id: string;
  type: 'dice_skin' | 'table_mat' | 'title';
  name: string;
  description: string;
  price: number;
  previewUrl?: string;
  styleClass?: string;
  accentColor?: string;
}
