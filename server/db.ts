import fs from 'fs';
import path from 'path';
import { UserProfile, LeaderboardEntry, ShopItem, SymbolType } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'langur_burja_db.json');

export const SHOP_ITEMS: ShopItem[] = [
  // Dice Skins
  {
    id: 'dice_classic',
    type: 'dice_skin',
    name: 'Classic Ivory Dice',
    description: 'Traditional carved bone dice with polished ivory sheen.',
    price: 0,
    styleClass: 'dice-ivory',
    accentColor: '#f1f5f9',
  },
  {
    id: 'dice_gold',
    type: 'dice_skin',
    name: 'Royal Golden Dice',
    description: 'Cast from 24K pure gold, favoured by ancient kings.',
    price: 2500,
    styleClass: 'dice-gold',
    accentColor: '#f59e0b',
  },
  {
    id: 'dice_neon',
    type: 'dice_skin',
    name: 'Cyber Neon Dice',
    description: 'Futuristic acrylic cubes with pulsed neon luminescence.',
    price: 5000,
    styleClass: 'dice-neon',
    accentColor: '#06b6d4',
  },
  {
    id: 'dice_crimson',
    type: 'dice_skin',
    name: 'Ruby Crimson Dice',
    description: 'Deep blood-red crystal dice with gold inlay symbols.',
    price: 8000,
    styleClass: 'dice-crimson',
    accentColor: '#ef4444',
  },
  {
    id: 'dice_obsidian',
    type: 'dice_skin',
    name: 'Shadow Obsidian',
    description: 'Mystic dark volcanic glass dice with prismatic aura.',
    price: 15000,
    styleClass: 'dice-obsidian',
    accentColor: '#8b5cf6',
  },

  // Table Mats
  {
    id: 'mat_velvet_green',
    type: 'table_mat',
    name: 'Royal Velvet Green',
    description: 'Classic casino-grade felt green baize with golden embroidery.',
    price: 0,
    styleClass: 'mat-green',
    accentColor: '#047857',
  },
  {
    id: 'mat_crimson_luxury',
    type: 'table_mat',
    name: 'Maharajah Crimson',
    description: 'Regal maroon silk mat inspired by Nepalese royal courts.',
    price: 3000,
    styleClass: 'mat-crimson',
    accentColor: '#991b1b',
  },
  {
    id: 'mat_midnight_gold',
    type: 'table_mat',
    name: 'Midnight & Stardust',
    description: 'Deep navy velvet laced with shimmering constellation dust.',
    price: 7500,
    styleClass: 'mat-midnight',
    accentColor: '#1e1b4b',
  },
  {
    id: 'mat_himalayan_aurora',
    type: 'table_mat',
    name: 'Himalayan Aurora',
    description: 'Luminescent mountain dawn gradients with sacred geometry.',
    price: 12000,
    styleClass: 'mat-aurora',
    accentColor: '#0f766e',
  },

  // Titles
  {
    id: 'title_novice',
    type: 'title',
    name: 'Dice Novice',
    description: 'Starting your legendary journey across Langur Burja tables.',
    price: 0,
    accentColor: '#94a3b8',
  },
  {
    id: 'title_lucky_charm',
    type: 'title',
    name: 'Lucky Charm 🍀',
    description: 'Fortune favors those who carry this blessed emblem.',
    price: 1500,
    accentColor: '#10b981',
  },
  {
    id: 'title_high_roller',
    type: 'title',
    name: 'High Roller 💰',
    description: 'Frequents high-stake tables with fearless conviction.',
    price: 5000,
    accentColor: '#eab308',
  },
  {
    id: 'title_burja_king',
    type: 'title',
    name: 'Burja King 👑',
    description: 'Master of the Crown roll, respected across all pavilions.',
    price: 10000,
    accentColor: '#f59e0b',
  },
  {
    id: 'title_grandmaster',
    type: 'title',
    name: 'Grandmaster of Chance ⚡',
    description: 'The rarest title, bestowed upon legendary high-stakes titans.',
    price: 25000,
    accentColor: '#a855f7',
  },
];

interface DatabaseSchema {
  users: Record<string, UserProfile>;
  auditLog: {
    id: string;
    userId: string;
    type: 'bet' | 'win' | 'loss' | 'faucet' | 'purchase';
    amount: number;
    balanceAfter: number;
    timestamp: number;
    details?: any;
  }[];
}

class FastDatabase {
  private users: Map<string, UserProfile> = new Map();
  private auditLog: any[] = [];
  private saveTimeout: NodeJS.Timeout | null = null;
  private isSaving = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data: DatabaseSchema = JSON.parse(raw);
        if (data.users) {
          for (const [id, u] of Object.entries(data.users)) {
            this.users.set(id, u);
          }
        }
        if (data.auditLog) {
          this.auditLog = data.auditLog.slice(-1000); // keep recent audit records
        }
      } else {
        // Seed standard top players for leaderboard richness if completely empty
        this.seedInitialUsers();
        this.scheduleSave();
      }
    } catch (err) {
      console.error('Error initializing database:', err);
      this.seedInitialUsers();
    }
  }

  private seedInitialUsers() {
    const seeds: Partial<UserProfile>[] = [
      {
        id: 'seed-1',
        username: 'Rajesh_Maharajah',
        avatar: '🦁',
        coins: 84200,
        totalWinnings: 142000,
        gamesPlayed: 148,
        gamesWon: 89,
        biggestWin: 24000,
        inventory: ['dice_classic', 'dice_gold', 'mat_velvet_green', 'mat_crimson_luxury', 'title_burja_king'],
        equipped: { diceSkin: 'dice_gold', tableMat: 'mat_crimson_luxury', title: 'Burja King 👑' },
        createdAt: Date.now() - 86400000 * 5,
      },
      {
        id: 'seed-2',
        username: 'Aayush_Roller',
        avatar: '⚡',
        coins: 56400,
        totalWinnings: 98500,
        gamesPlayed: 112,
        gamesWon: 67,
        biggestWin: 16000,
        inventory: ['dice_classic', 'dice_neon', 'mat_midnight_gold', 'title_high_roller'],
        equipped: { diceSkin: 'dice_neon', tableMat: 'mat_midnight_gold', title: 'High Roller 💰' },
        createdAt: Date.now() - 86400000 * 4,
      },
      {
        id: 'seed-3',
        username: 'Pooja_Sharma',
        avatar: '🌸',
        coins: 43200,
        totalWinnings: 75200,
        gamesPlayed: 94,
        gamesWon: 53,
        biggestWin: 12500,
        inventory: ['dice_classic', 'mat_velvet_green', 'title_lucky_charm'],
        equipped: { diceSkin: 'dice_classic', tableMat: 'mat_velvet_green', title: 'Lucky Charm 🍀' },
        createdAt: Date.now() - 86400000 * 3,
      },
      {
        id: 'seed-4',
        username: 'Bikram_Kathmandu',
        avatar: '🦅',
        coins: 31900,
        totalWinnings: 58000,
        gamesPlayed: 78,
        gamesWon: 41,
        biggestWin: 9000,
        inventory: ['dice_classic', 'dice_crimson', 'mat_velvet_green', 'title_novice'],
        equipped: { diceSkin: 'dice_crimson', tableMat: 'mat_velvet_green', title: 'Dice Novice' },
        createdAt: Date.now() - 86400000 * 2,
      },
    ];

    for (const s of seeds) {
      this.users.set(s.id!, {
        id: s.id!,
        username: s.username!,
        avatar: s.avatar || '🎲',
        coins: s.coins || 10000,
        totalWinnings: s.totalWinnings || 0,
        gamesPlayed: s.gamesPlayed || 0,
        gamesWon: s.gamesWon || 0,
        biggestWin: s.biggestWin || 0,
        inventory: s.inventory || ['dice_classic', 'mat_velvet_green', 'title_novice'],
        equipped: s.equipped || { diceSkin: 'dice_classic', tableMat: 'mat_velvet_green', title: 'Dice Novice' },
        createdAt: s.createdAt || Date.now(),
      });
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.flushToDisk();
    }, 1500);
  }

  private flushToDisk() {
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      const obj: DatabaseSchema = {
        users: Object.fromEntries(this.users.entries()),
        auditLog: this.auditLog.slice(-500),
      };
      const tmp = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('Failed to flush database to disk:', err);
    } finally {
      this.isSaving = false;
    }
  }

  // --- User Operations ---

  public getOrCreateUser(id: string, username?: string, avatar?: string, initialCoins?: number): UserProfile {
    let user = this.users.get(id);
    if (!user) {
      user = {
        id,
        username: username || `Player_${Math.floor(1000 + Math.random() * 9000)}`,
        avatar: avatar || '🎲',
        coins: typeof initialCoins === 'number' && initialCoins >= 0 ? initialCoins : 5000,
        totalWinnings: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        biggestWin: 0,
        inventory: ['dice_classic', 'mat_velvet_green', 'title_novice'],
        equipped: {
          diceSkin: 'dice_classic',
          tableMat: 'mat_velvet_green',
          title: 'Dice Novice',
        },
        createdAt: Date.now(),
      };
      this.users.set(id, user);
      this.scheduleSave();
    } else {
      let changed = false;
      if (username && user.username !== username) {
        user.username = username;
        changed = true;
      }
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        changed = true;
      }
      if (typeof initialCoins === 'number' && initialCoins > user.coins) {
        user.coins = initialCoins;
        changed = true;
      }
      if (changed) this.scheduleSave();
    }
    return { ...user };
  }

  public getUser(id: string): UserProfile | null {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  public updateProfile(id: string, updates: Partial<Pick<UserProfile, 'username' | 'avatar'>>): UserProfile | null {
    const u = this.users.get(id);
    if (!u) return null;
    if (updates.username && updates.username.trim().length > 1) {
      u.username = updates.username.trim().slice(0, 20);
    }
    if (updates.avatar) {
      u.avatar = updates.avatar;
    }
    this.scheduleSave();
    return { ...u };
  }

  // --- Atomic Balance Operations ---

  public atomicDeductBet(userId: string, amount: number, symbol: SymbolType): boolean {
    if (amount <= 0) return false;
    const u = this.users.get(userId);
    if (!u || u.coins < amount) return false;

    u.coins -= amount;
    this.auditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      type: 'bet',
      amount,
      balanceAfter: u.coins,
      timestamp: Date.now(),
      details: { symbol },
    });

    this.scheduleSave();
    return true;
  }

  public atomicRefundBet(userId: string, amount: number): boolean {
    if (amount <= 0) return false;
    const u = this.users.get(userId);
    if (!u) return false;
    u.coins += amount;
    this.scheduleSave();
    return true;
  }

  public atomicAddWinnings(userId: string, wonAmount: number, betAmount: number): UserProfile | null {
    const u = this.users.get(userId);
    if (!u) return null;

    u.gamesPlayed += 1;
    if (wonAmount > 0) {
      u.coins += wonAmount;
      u.totalWinnings += (wonAmount - betAmount);
      u.gamesWon += 1;
      const profit = wonAmount - betAmount;
      if (profit > u.biggestWin) {
        u.biggestWin = profit;
      }
      this.auditLog.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        type: 'win',
        amount: wonAmount,
        balanceAfter: u.coins,
        timestamp: Date.now(),
      });
    } else {
      this.auditLog.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        type: 'loss',
        amount: betAmount,
        balanceAfter: u.coins,
        timestamp: Date.now(),
      });
    }

    this.scheduleSave();
    return { ...u };
  }

  public claimFaucet(userId: string): { success: boolean; coinsGranted: number; newBalance: number; message: string } {
    const u = this.users.get(userId);
    if (!u) {
      return { success: false, coinsGranted: 0, newBalance: 0, message: 'User not found' };
    }

    const now = Date.now();
    const COOLDOWN_MS = 60 * 1000 * 3; // 3 minutes faucet cooldown
    if (u.lastFaucetAt && (now - u.lastFaucetAt < COOLDOWN_MS) && u.coins >= 500) {
      const waitSec = Math.ceil((COOLDOWN_MS - (now - u.lastFaucetAt)) / 1000);
      return {
        success: false,
        coinsGranted: 0,
        newBalance: u.coins,
        message: `Faucet cooldown active. Please wait ${waitSec}s or refill when low on coins.`,
      };
    }

    // Grant 1,000 coins
    const grant = 1000;
    u.coins += grant;
    u.lastFaucetAt = now;

    this.auditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      type: 'faucet',
      amount: grant,
      balanceAfter: u.coins,
      timestamp: now,
    });

    this.scheduleSave();
    return {
      success: true,
      coinsGranted: grant,
      newBalance: u.coins,
      message: `Successfully claimed +${grant} Free Coins!`,
    };
  }

  // --- Shop Operations ---

  public purchaseItem(userId: string, itemId: string): { success: boolean; message: string; user?: UserProfile } {
    const u = this.users.get(userId);
    if (!u) return { success: false, message: 'User not found' };

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, message: 'Item not found in shop' };

    if (u.inventory.includes(itemId)) {
      return { success: false, message: 'You already own this item!' };
    }

    if (u.coins < item.price) {
      return { success: false, message: `Insufficient coins. Requires ${item.price} coins.` };
    }

    u.coins -= item.price;
    u.inventory.push(itemId);

    // Auto-equip item
    if (item.type === 'dice_skin') u.equipped.diceSkin = item.id;
    if (item.type === 'table_mat') u.equipped.tableMat = item.id;
    if (item.type === 'title') u.equipped.title = item.name;

    this.auditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      type: 'purchase',
      amount: item.price,
      balanceAfter: u.coins,
      timestamp: Date.now(),
      details: { itemId: item.id, itemName: item.name },
    });

    this.scheduleSave();
    return { success: true, message: `Unlocked ${item.name}!`, user: { ...u } };
  }

  public equipItem(userId: string, itemId: string): { success: boolean; message: string; user?: UserProfile } {
    const u = this.users.get(userId);
    if (!u) return { success: false, message: 'User not found' };

    if (!u.inventory.includes(itemId)) {
      return { success: false, message: 'You do not own this item' };
    }

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, message: 'Item not found' };

    if (item.type === 'dice_skin') u.equipped.diceSkin = item.id;
    if (item.type === 'table_mat') u.equipped.tableMat = item.id;
    if (item.type === 'title') u.equipped.title = item.name;

    this.scheduleSave();
    return { success: true, message: `Equipped ${item.name}`, user: { ...u } };
  }

  // --- Leaderboard Queries (O(1) from sorted cache) ---

  public getLeaderboard(limit = 25): LeaderboardEntry[] {
    const all = Array.from(this.users.values());
    all.sort((a, b) => b.totalWinnings - a.totalWinnings || b.coins - a.coins);

    return all.slice(0, limit).map((u, index) => ({
      rank: index + 1,
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      coins: u.coins,
      totalWinnings: u.totalWinnings,
      gamesWon: u.gamesWon,
      biggestWin: u.biggestWin,
      equippedTitle: u.equipped.title,
    }));
  }
}

export const db = new FastDatabase();
