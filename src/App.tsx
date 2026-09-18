import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import {
  UserProfile,
  SymbolType,
  SYMBOL_KEYS,
  LANGUR_BURJA_SYMBOLS,
  RoundResultSummary,
  LeaderboardEntry,
  ShopItem,
  RoomState,
  GamePhase,
  PlayerInRoom,
} from './types.js';
import {
  recordTableInSupabase,
  updateTableInSupabase,
  closeTableInSupabase,
  deleteTableFromSupabase,
  deleteZeroPlayerTablesFromSupabase,
  findTableByCodeInSupabase,
  findTableByIdInSupabase,
  syncTableStateToSupabase,
  fetchRunningTablesFromSupabase,
} from './services/tableService.js';
import { MobileHeader } from './components/MobileHeader.js';
import { ThreeDiceArena } from './components/ThreeDiceArena.js';
import { MobileBettingMat } from './components/MobileBettingMat.js';
import { ProfileModal } from './components/ProfileModal.js';
import { RulesModal } from './components/RulesModal.js';
import { ActivePlayersDeck, TablePlayer } from './components/ActivePlayersDeck.js';
import {
  SmartBotProfile,
  INITIAL_SMART_BOTS,
  planSmartBotBets,
  resolveSmartBotPayouts,
  smartBotToTablePlayer,
} from './utils/smartBots.js';
import { MainMenu } from './components/MainMenu.js';
import { SettingsModal } from './components/SettingsModal.js';
import { LeaderboardModal } from './components/LeaderboardModal.js';
import { ShopModal } from './components/ShopModal.js';
import { AuthModal } from './components/AuthModal.js';
import { GameTableModal, PublicRoomSummary } from './components/GameTableModal.js';
import { TableStatsModal } from './components/TableStatsModal.js';
import { voiceService } from './services/voiceService.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { sound } from './utils/audio.js';
import {
  getStoredLocalProfile,
  saveLocalProfile,
  fetchRemoteProfile,
  syncProfileToSupabase,
  fetchRemoteLeaderboard,
  createDefaultProfile,
  signOut as authSignOut,
} from './services/authService.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import {
  Sparkles,
  RotateCcw,
  Dice5,
  AlertCircle,
  CheckCircle2,
  Trophy,
  HelpCircle,
  ChevronRight,
  Receipt,
  X,
  Clock,
  Zap,
  Home,
  Crown,
} from 'lucide-react';

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [ping, setPing] = useState<number | null>(null);

  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Fullscreen support for mobile - instantaneous, zero-lag, no blackscreen
  const toggleFullscreen = useCallback(() => {
    const doc = document as any;
    const docEl = document.documentElement as any;

    try {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {
            // Safari / mobile fallback
            setIsFullscreen(true);
            document.documentElement.classList.add('app-is-fullscreen');
          });
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else {
          // Pure CSS viewport fallback for iOS / mobile browsers without Fullscreen API
          setIsFullscreen(true);
          document.documentElement.classList.add('app-is-fullscreen');
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
        setIsFullscreen(false);
        document.documentElement.classList.remove('app-is-fullscreen');
      }
    } catch {
      // Safe toggle fallback
      setIsFullscreen((prev) => !prev);
      document.documentElement.classList.toggle('app-is-fullscreen');
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(isFs);
      if (isFs) {
        document.documentElement.classList.add('app-is-fullscreen');
      } else {
        document.documentElement.classList.remove('app-is-fullscreen');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // User Profile & Authentication State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState<boolean>(false);
  const [user, setUser] = useState<UserProfile>(() => {
    return getStoredLocalProfile() || createDefaultProfile();
  });

  // Multiplayer Game Table State
  const [isTableModalOpen, setIsTableModalOpen] = useState<boolean>(false);
  const [isTableStatsOpen, setIsTableStatsOpen] = useState<boolean>(false);
  const [tableModalTab, setTableModalTab] = useState<'create' | 'join'>('create');
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);

  // Detect ?table=CODE or ?code=CODE from invite links
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tableCode = params.get('table') || params.get('code');
      if (tableCode) {
        setTableModalTab('join');
        setIsTableModalOpen(true);
      }
    } catch {}
  }, []);

  // Active Game State
  const [phase, setPhase] = useState<'waiting' | 'betting' | 'rolling' | 'payout'>('betting');
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [dice, setDice] = useState<SymbolType[]>(['burja', 'jhanda', 'burja', 'itta', 'paan', 'chidi']);
  const [selectedChip, setSelectedChip] = useState<number>(500);

  // Automated Betting Round Timer (15 seconds per round)
  const BETTING_DURATION = 15;
  const [bettingTimer, setBettingTimer] = useState<number>(BETTING_DURATION);
  const [isUserReady, setIsUserReady] = useState<boolean>(false);
  const [nextRoundVotes, setNextRoundVotes] = useState<string[]>([]);

  // Smart Bots Engine for Public Tables & Roster History
  const smartBotsRef = useRef<SmartBotProfile[]>(INITIAL_SMART_BOTS);
  const historyDiceRef = useRef<SymbolType[][]>([]);

  // Active Table Patrons (Smart Players for Public Tables; absent in Private Tables)
  const [tablePlayers, setTablePlayers] = useState<TablePlayer[]>(() => {
    return INITIAL_SMART_BOTS.map(smartBotToTablePlayer);
  });

  // Current Round Bets
  const [myBets, setMyBets] = useState<Record<SymbolType, number>>({
    jhanda: 0,
    burja: 0,
    itta: 0,
    paan: 0,
    hukum: 0,
    chidi: 0,
  });

  // Previous Round Bets (for one-tap "Repeat Bet" feature)
  const [previousBets, setPreviousBets] = useState<Record<SymbolType, number> | null>(null);

  // Simulated live crowd bets on the table
  const [tableBets, setTableBets] = useState<Record<SymbolType, number>>({
    jhanda: 300,
    burja: 500,
    itta: 200,
    paan: 0,
    hukum: 150,
    chidi: 0,
  });

  // Round Result Summary
  const [lastResult, setLastResult] = useState<RoundResultSummary | undefined>(undefined);

  // App State: Main Menu vs Active Game Table
  const [isInGame, setIsInGame] = useState<boolean>(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);

  // Modals & Extras
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Table & Arena Options
  const [tableTheme, setTableTheme] = useState<'emerald' | 'crimson' | 'midnight'>('emerald');
  const [defaultCameraView, setDefaultCameraView] = useState<'3d' | 'top'>('3d');

  // Community Leaderboard Data
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([
    { rank: 1, id: 'u_1', username: 'Pasang Sherpa', avatar: '🏔️', coins: 145000, totalWinnings: 420000, gamesWon: 180, biggestWin: 36000, equippedTitle: 'Himalayan King' },
    { rank: 2, id: 'u_2', username: 'Kiran Gurung', avatar: '🦁', coins: 98500, totalWinnings: 310000, gamesWon: 142, biggestWin: 28000, equippedTitle: 'Royal High Roller' },
    { rank: 3, id: 'u_3', username: 'Anjali Shrestha', avatar: '🦚', coins: 74200, totalWinnings: 245000, gamesWon: 110, biggestWin: 22500, equippedTitle: 'Dice Empress' },
    { rank: 4, id: 'u_4', username: 'Dipendra KC', avatar: '👑', coins: 62000, totalWinnings: 198000, gamesWon: 95, biggestWin: 18000, equippedTitle: 'Gold Master' },
    { rank: 5, id: 'u_5', username: 'Sunita Thapa', avatar: '🌸', coins: 45000, totalWinnings: 154000, gamesWon: 76, biggestWin: 15000, equippedTitle: 'Lucky Peafowl' },
  ]);

  // Load real players from Supabase profiles table whenever game state or user updates
  useEffect(() => {
    let isMounted = true;
    fetchRemoteLeaderboard().then((remoteBoard) => {
      if (isMounted && remoteBoard && remoteBoard.length > 0) {
        setLeaderboardData(remoteBoard);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [user.gamesPlayed, user.coins]);

  // Bazaar Shop Items
  const [shopItems] = useState<ShopItem[]>([
    { id: 'dice_gold', type: 'dice_skin', name: 'Royal Gold Dice', description: 'Gilded Nepali brass dice with shimmering specular sheen', price: 5000 },
    { id: 'dice_ruby', type: 'dice_skin', name: 'Imperial Ruby Dice', description: 'Deep red lacquered dice with gold embossed sacred symbols', price: 7500 },
    { id: 'mat_velvet_crimson', type: 'table_mat', name: 'Crimson Palace Felt', description: 'Traditional Kathmandu festival scarlet wagering cloth', price: 4000 },
    { id: 'mat_velvet_midnight', type: 'table_mat', name: 'Midnight Celestial Felt', description: 'Deep navy velvet table cloth embroidered with gold trim', price: 6000 },
    { id: 'title_master', type: 'title', name: 'Master of Burja', description: 'Exclusive prestigious festival title displayed beside your avatar', price: 3000 },
  ]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const isRollingInitiatedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleGoogleAuthSession = useCallback(
    async (sessionUser: any, isInitialCheck = false) => {
      const remote = await fetchRemoteProfile(sessionUser.id);
      const current = getStoredLocalProfile() || createDefaultProfile(sessionUser.id);

      // Check whether this account already exists in Supabase or local device
      const isAlreadyRegistered =
        Boolean(remote && (remote.profileConfigured || remote.gamesPlayed > 0 || remote.createdAt < Date.now() - 5000)) ||
        localStorage.getItem(`langur_burja_account_created_${sessionUser.id}`) === 'true' ||
        localStorage.getItem('langur_burja_google_configured') === 'true';

      const googleName =
        remote?.username ||
        sessionUser.user_metadata?.full_name ||
        sessionUser.user_metadata?.name ||
        sessionUser.user_metadata?.username ||
        sessionUser.email?.split('@')[0] ||
        (sessionUser.email === 'magarjack0@gmail.com' ? 'Jack Magar' : null) ||
        current.username;

      const googleAvatar =
        remote?.avatar ||
        sessionUser.user_metadata?.avatar_url ||
        sessionUser.user_metadata?.picture ||
        'https://lh3.googleusercontent.com/a/ACg8ocKz-google-user-avatar-default=s96-c';

      if (googleName) localStorage.setItem('langur_burja_google_name', googleName);
      if (googleAvatar) localStorage.setItem('langur_burja_google_avatar', googleAvatar);

      const linkedUser: UserProfile = {
        ...(remote || current),
        id: sessionUser.id,
        email: sessionUser.email,
        username: remote?.username || googleName,
        avatar: remote?.avatar || googleAvatar,
        googleName,
        googleAvatar,
        isGuest: false,
        authProvider: (sessionUser.app_metadata?.provider as any) || 'google',
        profileConfigured: isAlreadyRegistered ? true : false,
      };

      setUser(linkedUser);
      saveLocalProfile(linkedUser);
      await syncProfileToSupabase(linkedUser);

      localStorage.setItem('langur_burja_welcomed', 'true');
      setIsAuthModalOpen(false);

      // Show profile setup ONLY for brand new first-time users, NEVER for returning registered users
      if (!isAlreadyRegistered) {
        setIsFirstTimeUser(true);
        setIsProfileOpen(true);
      } else {
        localStorage.setItem(`langur_burja_account_created_${sessionUser.id}`, 'true');
        localStorage.setItem('langur_burja_google_configured', 'true');
        if (!isInitialCheck) {
          showToast(`Welcome back, ${linkedUser.username}!`, 'success');
        }
      }

      if (socket && isConnected) {
        socket.emit('user:init', { id: linkedUser.id });
      }
    },
    [socket, isConnected, showToast]
  );

  // 1. Initialize User Session & Supabase Cloud Auth
  useEffect(() => {
    let isMounted = true;
    let cleanupFn = () => {};

    async function initAuth() {
      const hasSeenWelcome = localStorage.getItem('langur_burja_welcomed');

      // Multi-channel OAuth receiver (postMessage, BroadcastChannel, localStorage)
      const processOAuthPayload = async (payload: { hash?: string; search?: string }) => {
        if (!supabase || !isMounted) return;

        try {
          let authUser = null;

          // A. PKCE code exchange: when search has ?code=...
          if (payload.search && payload.search.includes('code=')) {
            const searchClean = payload.search.replace(/^\?/, '');
            const params = new URLSearchParams(searchClean);
            const code = params.get('code');
            if (code) {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) {
                console.warn('[Supabase OAuth] exchangeCodeForSession warning:', error.message);
              } else if (data?.session?.user) {
                authUser = data.session.user;
              }
            }
          }

          // B. Implicit token flow: when hash has #access_token=...
          if (!authUser && payload.hash && payload.hash.includes('access_token=')) {
            const hashClean = payload.hash.replace(/^[#?]/, '');
            const params = new URLSearchParams(hashClean);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken) {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
              });
              if (error) {
                console.warn('[Supabase OAuth] setSession warning:', error.message);
              } else if (data?.session?.user) {
                authUser = data.session.user;
              }
            }
          }

          // C. Fallback: check getSession
          if (!authUser) {
            const { data } = await supabase.auth.getSession();
            authUser = data?.session?.user || null;
          }

          if (authUser && isMounted) {
            await handleGoogleAuthSession(authUser);
          }
        } catch (err) {
          console.error('[Supabase OAuth] processOAuthPayload error:', err);
        }
      };

      // Check current window URL in case of direct redirect
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
        await processOAuthPayload({
          search: window.location.search,
          hash: window.location.hash,
        });
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}
      }

      // 1. Listen for popup messages from index.html
      const handlePopupMessage = (event: MessageEvent) => {
        if (event.data?.type === 'SUPABASE_OAUTH_SUCCESS') {
          processOAuthPayload(event.data);
        }
      };
      window.addEventListener('message', handlePopupMessage);

      // 2. Listen via BroadcastChannel across same-origin windows/iframes
      let bc: BroadcastChannel | null = null;
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          bc = new BroadcastChannel('supabase_oauth_channel');
          bc.onmessage = (event) => {
            if (event.data?.type === 'SUPABASE_OAUTH_SUCCESS') {
              processOAuthPayload(event.data);
            }
          };
        }
      } catch (e) {}

      // 3. Listen via localStorage storage events
      const handleStorage = (event: StorageEvent) => {
        if (event.key === 'supabase_oauth_relay' && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue);
            if (parsed?.payload) {
              processOAuthPayload(parsed.payload);
            }
          } catch (e) {}
        }
      };
      window.addEventListener('storage', handleStorage);

      if (supabase && isSupabaseConfigured()) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const authUser = sessionData?.session?.user;
          if (authUser && isMounted) {
            await handleGoogleAuthSession(authUser, true);
          }
        } catch (e) {
          console.warn('Supabase auth session check:', e);
        }

        // Subscribe to auth state changes (e.g. Google OAuth redirect callback)
        const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!isMounted) return;
          if (event === 'SIGNED_IN' && session?.user) {
            handleGoogleAuthSession(session.user);
          }
        });

        // Show welcome choice modal on first visit
        if (!hasSeenWelcome && isMounted) {
          setIsAuthModalOpen(true);
        }

        cleanupFn = () => {
          window.removeEventListener('message', handlePopupMessage);
          window.removeEventListener('storage', handleStorage);
          try { bc?.close(); } catch(e) {}
          sub?.subscription?.unsubscribe();
        };
      } else {
        // Supabase not yet configured, first-time welcome popup for guest play
        if (!hasSeenWelcome && isMounted) {
          setIsAuthModalOpen(true);
        }
        cleanupFn = () => {
          window.removeEventListener('message', handlePopupMessage);
          window.removeEventListener('storage', handleStorage);
          try { bc?.close(); } catch(e) {}
        };
      }
    }

    initAuth();

    return () => {
      isMounted = false;
      cleanupFn();
    };
  }, [handleGoogleAuthSession]);

  // 2. Continuous persistence & cloud sync on user profile changes
  useEffect(() => {
    if (!user.id) return;
    saveLocalProfile(user);

    if (!user.isGuest) {
      const syncDebounce = setTimeout(() => {
        syncProfileToSupabase(user);
      }, 1200);
      return () => clearTimeout(syncDebounce);
    }
  }, [user]);

  const userRef = useRef(user);
  userRef.current = user;

  const currentRoomRef = useRef(currentRoom);
  currentRoomRef.current = currentRoom;

  const isInGameRef = useRef(isInGame);
  isInGameRef.current = isInGame;

  const myBetsRef = useRef(myBets);
  myBetsRef.current = myBets;

  const tableBetsRef = useRef(tableBets);
  tableBetsRef.current = tableBets;

  const roundNumberRef = useRef(roundNumber);
  roundNumberRef.current = roundNumber;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // 3. Socket Initialization & Server Sync
  useEffect(() => {
    if (!user.id) return;

    // Support external backend URL if frontend is deployed separately (e.g., Cloudflare Pages + Render/Railway backend)
    const serverUrl = (import.meta.env.VITE_SERVER_URL as string) || '';

    // Fast measurement helper: tries socket ping first, falls back to rapid HTTP ping
    const measureLatency = async (sock?: Socket | null) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
        return;
      }
      setIsOnline(true);

      if (sock && sock.connected) {
        const pingStart = Date.now();
        sock.emit('ping_check', pingStart, () => {
          setPing(Date.now() - pingStart);
        });
      } else {
        const start = Date.now();
        try {
          const healthEndpoint = serverUrl ? `${serverUrl.replace(/\/$/, '')}/api/health` : '/api/health';
          const res = await fetch(healthEndpoint, { cache: 'no-store' });
          if (res.ok) {
            setPing(Date.now() - start);
          }
        } catch {
          // offline or transient
        }
      }
    };

    // Immediate ping check on mount
    measureLatency(null);

    const s = serverUrl
      ? io(serverUrl, {
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 4000,
          timeout: 10000,
        })
      : io({
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 4000,
          timeout: 10000,
        });

    s.on('connect', () => {
      setIsConnected(true);
      setIsOnline(true);
      voiceService.setSocket(s);
      measureLatency(s);

      s.emit('user:init', { id: user.id }, (res: { success: boolean; user: UserProfile }) => {
        if (res?.user && user.isGuest) {
          setUser((prev) => ({
            ...prev,
            ...res.user,
            inventory: res.user.inventory || prev.inventory,
            equipped: res.user.equipped || prev.equipped,
          }));
        }
      });

      // Auto re-join active room on reconnect to restore socket room subscription
      if (currentRoomRef.current?.id) {
        s.emit('room:join', {
          roomId: currentRoomRef.current.id,
          user: userRef.current,
        }, (res: any) => {
          if (res?.success && res.room) {
            setCurrentRoom(res.room);
            currentRoomRef.current = res.room;
            setPhase(res.room.phase || 'waiting');
            setBettingTimer(res.room.timer);
            setRoundNumber(res.room.roundNumber || 1);
            setTableBets(res.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
            if (res.reconnected) {
              showToast('⚡ Reconnected to table successfully!', 'success');
            }
          }
        });
      }

      // Sync public rooms on connect
      s.emit('room:get_public', (res: { rooms: PublicRoomSummary[] }) => {
        if (res?.rooms) setPublicRooms(res.rooms);
      });
    });

    s.on('connect_error', () => {
      // If socket handshake takes time on mobile networks, keep measuring latency via HTTP
      measureLatency(null);
    });

    s.on('reconnect', () => {
      setIsConnected(true);
      setIsOnline(true);
      measureLatency(s);
    });

    // Periodic Ping Latency Polling (Every 3.5s)
    const pingInterval = setInterval(() => {
      measureLatency(s);
    }, 3500);

    // Mobile device network and tab visibility listeners
    const handleOnline = () => {
      setIsOnline(true);
      if (!s.connected) s.connect();
      measureLatency(s);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsConnected(false);
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (!s.connected) s.connect();
        measureLatency(s);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Synchronized Countdown Timer: All players see the exact same countdown!
    s.on('game:timer_tick', (payload: { phase: GamePhase; timer: number; roundNumber: number }) => {
      if (currentRoomRef.current) {
        setBettingTimer(payload.timer);
        if (payload.phase && payload.phase !== 'rolling') {
          setPhase((prev) => (prev !== payload.phase ? payload.phase : prev));
        }

        // In public tables: Active smart bots place bets as the timer ticks down (no click sounds)
        if (payload.phase === 'betting' && !currentRoomRef.current.isPrivate) {
          const actingBots = smartBotsRef.current.filter(
            (b) => b.betPlacedAtSeconds === payload.timer && !b.isReady
          );
          if (actingBots.length > 0) {
            smartBotsRef.current = smartBotsRef.current.map((b) => {
              if (b.betPlacedAtSeconds === payload.timer) {
                return { ...b, isReady: true };
              }
              return b;
            });
            setTablePlayers((list) =>
              list.map((p) => {
                const matchedBot = smartBotsRef.current.find((b) => b.id === p.id);
                if (matchedBot && matchedBot.isReady) {
                  return {
                    ...p,
                    isReady: true,
                    currentBet: matchedBot.totalBetThisRound,
                  };
                }
                return p;
              })
            );
            setTableBets((prev) => {
              const next = { ...prev };
              actingBots.forEach((bot) => {
                for (const sym of SYMBOL_KEYS) {
                  next[sym] = (next[sym] || 0) + (bot.currentBets[sym] || 0);
                }
              });
              return next;
            });
          }
        }
      }
    });

    // Synchronized Rolling: All players receive the exact same 6 dice and rattle at the same millisecond!
    s.on('game:phase_rolling', (payload: { dice: SymbolType[]; duration: number; roundNumber: number }) => {
      if (currentRoomRef.current) {
        isRollingInitiatedRef.current = true;
        setPhase('rolling');
        setDice(payload.dice);
        if (isInGameRef.current) {
          sound.playDiceShakeSound();
        }
      }
    });

    // Synchronized Payout & Results: All players see identical winners, statistics, and updated balances
    s.on('game:phase_payout', (payload: { summary: RoundResultSummary; players: Record<string, PlayerInRoom>; roomState?: RoomState }) => {
      if (currentRoomRef.current) {
        setPhase('payout');
        setLastResult(payload.summary);
        setNextRoundVotes(payload.roomState?.nextRoundVotes || []);
        isRollingInitiatedRef.current = false;

        if (payload.players) {
          const hostId = payload.roomState?.hostId || currentRoomRef.current.hostId;
          const mapped: TablePlayer[] = Object.values(payload.players).map((p) => ({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            coins: p.coins,
            currentBet: p.totalBetThisRound,
            isReady: p.totalBetThisRound > 0,
            title: p.equipped?.title || 'Player',
            isUser: p.id === userRef.current.id,
            isHost: Boolean(p.isHost || hostId === p.id),
            isBot: false,
            sessionStats: p.sessionStats,
          }));

          const isPrivate = payload.roomState?.isPrivate ?? currentRoomRef.current.isPrivate;
          if (isPrivate) {
            // In private tables: BOTS MUST NOT EXIST
            setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
          } else {
            // In public tables: Include smart bots
            const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
            setTablePlayers([...mapped, ...botPlayers]);
          }
        }

        if (payload.roomState) {
          setCurrentRoom(payload.roomState);
          currentRoomRef.current = payload.roomState;
        }

        const myId = userRef.current.id;
        const myPayout = payload.summary?.playerPayouts?.[myId];
        if (myPayout) {
          const { totalWon, totalBet, netChange } = myPayout;
          if (isInGameRef.current) {
            if (totalWon > 0) {
              sound.playWinFanfare();
              try {
                confetti({
                  particleCount: 50,
                  spread: 60,
                  origin: { y: 0.62 },
                  colors: ['#ffd700', '#f59e0b', '#10b981', '#ef4444'],
                });
              } catch {}

              if (
                (payload.summary.symbolCounts?.burja || 0) >= 4 ||
                (payload.summary.symbolCounts?.jhanda || 0) >= 4
              ) {
                sound.playJackpotSound();
              }
            } else if (totalBet > 0) {
              sound.playDiceLandSound();
            }
          }

          if (totalBet > 0) {
            setUser((u) => {
              const serverCoins = payload.players?.[u.id]?.coins;
              const newCoins = typeof serverCoins === 'number' ? serverCoins : u.coins + netChange;
              const updated: UserProfile = {
                ...u,
                coins: Math.max(0, newCoins),
                gamesPlayed: u.gamesPlayed + 1,
                gamesWon: totalWon > 0 ? u.gamesWon + 1 : u.gamesWon,
                totalWinnings: totalWon > 0 ? u.totalWinnings + totalWon : u.totalWinnings,
                biggestWin: Math.max(u.biggestWin, netChange > 0 ? netChange : 0),
              };
              saveLocalProfile(updated);
              syncProfileToSupabase(updated);
              return updated;
            });
          }
        }
      }
    });

    // Synchronized Next Round Voting: Live updates as each player clicks Next Round
    s.on('game:next_round_votes', (payload: {
      votes: string[];
      totalPlayers: number;
      allReady: boolean;
      voterId?: string;
    }) => {
      if (currentRoomRef.current) {
        setNextRoundVotes(payload.votes || []);
        if (payload.voterId === userRef.current.id) {
          setIsUserReady(true);
        }
        setTablePlayers((list) =>
          list.map((p) => ({
            ...p,
            isReady: (payload.votes || []).includes(p.id),
          }))
        );
      }
    });

    // Synchronized New Round: Clear bets, reset countdown, reset ready toggles simultaneously
    s.on('game:new_round', (payload: {
      roundNumber: number;
      bettingDuration: number;
      tableBets: Record<SymbolType, number>;
      players: Record<string, PlayerInRoom>;
    }) => {
      if (currentRoomRef.current) {
        setPhase('betting');
        setRoundNumber(payload.roundNumber);
        setBettingTimer(payload.bettingDuration);
        setLastResult(undefined);
        setNextRoundVotes([]);
        setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
        setTableBets(payload.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
        setIsUserReady(false);
        isRollingInitiatedRef.current = false;
        if (isInGameRef.current) {
          sound.playDiceLandSound();
        }

        if (payload.players) {
          const hostId = currentRoomRef.current?.hostId;
          const mapped: TablePlayer[] = Object.values(payload.players).map((p) => ({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            coins: p.coins,
            currentBet: 0,
            isReady: false,
            title: p.equipped?.title || 'Player',
            isUser: p.id === userRef.current.id,
            isHost: Boolean(p.isHost || hostId === p.id),
            isBot: false,
            sessionStats: p.sessionStats,
          }));

          if (currentRoomRef.current?.isPrivate) {
            // Private table: STRICTLY NO BOTS
            setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
          } else {
            // Public table: Include smart bots
            const { plannedBots, combinedBotBets } = planSmartBotBets(
              smartBotsRef.current,
              historyDiceRef.current,
              payload.bettingDuration || 15
            );
            smartBotsRef.current = plannedBots;
            setTablePlayers([...mapped, ...plannedBots.map(smartBotToTablePlayer)]);
            if (!payload.tableBets || Object.values(payload.tableBets).every((v) => v === 0)) {
              setTableBets(combinedBotBets);
            }
          }
        }
      }
    });

    // Synchronized Game Start by Host: Host clicks "Enter Table as Host" / "Start Game"
    s.on('game:started_by_host', (payload: { phase: GamePhase; timer: number; roundNumber: number; roomState?: RoomState }) => {
      setIsInGame(true);
      setIsTableModalOpen(false);
      setPhase(payload.phase || 'betting');
      setBettingTimer(payload.timer);
      setRoundNumber(payload.roundNumber || 1);
      sound.playWinFanfare();
      showToast('Table Owner has opened betting! Game started.', 'success');

      if (payload.roomState) {
        setCurrentRoom(payload.roomState);
        currentRoomRef.current = payload.roomState;

        const hostId = payload.roomState.hostId;
        const mapped: TablePlayer[] = Object.values(payload.roomState.players).map((p) => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          coins: p.coins,
          currentBet: p.totalBetThisRound,
          isReady: p.totalBetThisRound > 0,
          title: p.equipped?.title || 'Player',
          isUser: p.id === userRef.current.id,
          isHost: Boolean(p.isHost || hostId === p.id),
          isBot: false,
          sessionStats: p.sessionStats,
        }));

        if (payload.roomState.isPrivate) {
          setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
        } else {
          const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
          setTablePlayers([...mapped, ...botPlayers]);
        }
      }
    });

    s.on('game:paused', (payload: { message?: string }) => {
      setPhase('waiting');
      if (payload?.message) showToast(payload.message, 'info');
    });

    // Synchronized Bet Broadcasts: See friends place bets on table in real-time
    s.on('game:bet_placed', (payload: {
      userId: string;
      symbol: SymbolType;
      amount: number;
      playerBets: Record<SymbolType, number>;
      playerCoins: number;
      tableBets: Record<SymbolType, number>;
    }) => {
      if (currentRoomRef.current) {
        if (payload.tableBets) {
          setTableBets(payload.tableBets);
        }
        if (payload.userId === userRef.current.id) {
          setUser((u) => ({ ...u, coins: payload.playerCoins }));
          setMyBets(payload.playerBets);
        } else {
          setTablePlayers((list) =>
            list.map((p) =>
              p.id === payload.userId
                ? {
                    ...p,
                    coins: payload.playerCoins,
                    currentBet: Object.values(payload.playerBets).reduce((a, b) => a + b, 0),
                    isReady: true,
                  }
                : p
            )
          );
        }
      }
    });

    s.on('game:bets_cleared', (payload: {
      userId: string;
      playerCoins: number;
      playerBets: Record<SymbolType, number>;
      tableBets: Record<SymbolType, number>;
    }) => {
      if (currentRoomRef.current) {
        if (payload.tableBets) {
          setTableBets(payload.tableBets);
        }
        if (payload.userId === userRef.current.id) {
          setUser((u) => ({ ...u, coins: payload.playerCoins }));
          setMyBets(payload.playerBets);
        } else {
          setTablePlayers((list) =>
            list.map((p) =>
              p.id === payload.userId
                ? { ...p, coins: payload.playerCoins, currentBet: 0, isReady: false }
                : p
            )
          );
        }
      }
    });

    s.on('room:player_joined', (payload: { player: any; roomState: RoomState }) => {
      if (payload?.roomState) {
        setCurrentRoom(payload.roomState);
        currentRoomRef.current = payload.roomState;
        const hostId = payload.roomState.hostId;
        const mapped: TablePlayer[] = Object.values(payload.roomState.players).map((p) => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          coins: p.coins,
          currentBet: p.totalBetThisRound,
          isReady: p.totalBetThisRound > 0,
          title: p.equipped?.title || 'Player',
          isUser: p.id === userRef.current.id,
          isHost: Boolean(p.isHost || hostId === p.id),
          isBot: false,
          sessionStats: p.sessionStats,
        }));

        if (payload.roomState.isPrivate) {
          setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
        } else {
          const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
          setTablePlayers([...mapped, ...botPlayers]);
        }
      }
      if (payload?.player && payload.player.id !== userRef.current.id) {
        showToast(`${payload.player.username} joined the table!`, 'info');
      }
      s.emit('room:get_public', (res: { rooms: PublicRoomSummary[] }) => {
        if (res?.rooms) setPublicRooms(res.rooms);
      });
    });

    s.on('room:player_left', (payload: { userId: string; roomState: RoomState }) => {
      if (payload.userId === userRef.current.id) {
        setCurrentRoom(null);
        currentRoomRef.current = null;
        setIsInGame(false);
        setPhase('betting');
        setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
        setIsUserReady(false);
        setNextRoundVotes([]);
      } else if (payload?.roomState) {
        setCurrentRoom(payload.roomState);
        currentRoomRef.current = payload.roomState;
        setNextRoundVotes(payload.roomState.nextRoundVotes || []);
        const hostId = payload.roomState.hostId;
        const mapped: TablePlayer[] = Object.values(payload.roomState.players).map((p) => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          coins: p.coins,
          currentBet: p.totalBetThisRound,
          isReady: (payload.roomState.nextRoundVotes || []).includes(p.id) || p.totalBetThisRound > 0,
          title: p.equipped?.title || 'Player',
          isUser: p.id === userRef.current.id,
          isHost: Boolean(p.isHost || hostId === p.id),
          isBot: false,
          isDisconnected: Boolean(p.isDisconnected),
          sessionStats: p.sessionStats,
        }));

        if (payload.roomState.isPrivate) {
          setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
        } else {
          const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
          setTablePlayers([...mapped, ...botPlayers]);
        }
      }
      s.emit('room:get_public', (res: { rooms: PublicRoomSummary[] }) => {
        if (res?.rooms) setPublicRooms(res.rooms);
      });
    });

    s.on('room:host_migrated', (payload: { newHostId: string; newHostName: string; roomState?: RoomState }) => {
      if (payload?.roomState) {
        setCurrentRoom(payload.roomState);
        currentRoomRef.current = payload.roomState;
        const hostId = payload.roomState.hostId;
        const mapped: TablePlayer[] = Object.values(payload.roomState.players).map((p) => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          coins: p.coins,
          currentBet: p.totalBetThisRound,
          isReady: p.totalBetThisRound > 0,
          title: p.equipped?.title || 'Player',
          isUser: p.id === userRef.current.id,
          isHost: Boolean(p.isHost || hostId === p.id),
          isBot: false,
          sessionStats: p.sessionStats,
        }));
        setTablePlayers(mapped);
      }

      if (payload.newHostId === userRef.current.id) {
        sound.playWinFanfare();
        showToast('👑 Table Owner left. You are now the Table Host!', 'success');
      } else {
        showToast(`👑 Table Owner left. ${payload.newHostName} is now the Table Host.`, 'info');
      }
    });

    s.on('room:player_kicked', (payload: { userId: string; roomState?: RoomState }) => {
      if (payload.userId === userRef.current.id) {
        showToast('⚠️ You were removed from the table by the host.', 'error');
        setCurrentRoom(null);
        currentRoomRef.current = null;
        setIsInGame(false);
        setPhase('betting');
        setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
      } else if (payload.roomState) {
        setCurrentRoom(payload.roomState);
        currentRoomRef.current = payload.roomState;
        const hostId = payload.roomState.hostId;
        const mapped: TablePlayer[] = Object.values(payload.roomState.players).map((p) => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          coins: p.coins,
          currentBet: p.totalBetThisRound,
          isReady: p.totalBetThisRound > 0,
          title: p.equipped?.title || 'Player',
          isUser: p.id === userRef.current.id,
          isHost: Boolean(p.isHost || hostId === p.id),
          isBot: false,
          sessionStats: p.sessionStats,
        }));
        setTablePlayers(mapped);
        showToast('A player was kicked from the table by the host.', 'info');
      }
    });

    s.on('room:player_status_changed', (payload: { userId: string; isDisconnected: boolean; roomState?: RoomState }) => {
      if (payload?.roomState) {
        setCurrentRoom(payload.roomState);
        currentRoomRef.current = payload.roomState;
        const hostId = payload.roomState.hostId;
        const mapped: TablePlayer[] = Object.values(payload.roomState.players).map((p) => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          coins: p.coins,
          currentBet: p.totalBetThisRound,
          isReady: p.totalBetThisRound > 0,
          title: p.equipped?.title || 'Player',
          isUser: p.id === userRef.current.id,
          isHost: Boolean(p.isHost || hostId === p.id),
          isBot: false,
          isDisconnected: Boolean(p.isDisconnected),
          sessionStats: p.sessionStats,
        }));
        if (payload.roomState.isPrivate) {
          setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
        } else {
          const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
          setTablePlayers([...mapped, ...botPlayers]);
        }
      } else {
        setTablePlayers((list) =>
          list.map((p) => (p.id === payload.userId ? { ...p, isDisconnected: payload.isDisconnected } : p))
        );
      }
    });

    s.on('game:next_round_votes', (payload: { votes: string[]; totalPlayers: number; allReady: boolean; voterId: string }) => {
      if (Array.isArray(payload.votes)) {
        setNextRoundVotes(payload.votes);
      }
    });

    s.on('disconnect', () => {
      setIsConnected(false);
      measureLatency(null);
    });

    setSocket(s);

    return () => {
      clearInterval(pingInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      voiceService.leaveVoice();
      voiceService.setSocket(null);
      s.disconnect();
    };
  }, [user.id]);

  const handleAuthSuccess = useCallback(
    async (authedUser: UserProfile) => {
      // Check remote cloud profile to determine if this is a returning or first-time user
      const remote = await fetchRemoteProfile(authedUser.id);
      const isAlreadyRegistered =
        Boolean(remote && (remote.profileConfigured || remote.gamesPlayed > 0 || remote.createdAt < Date.now() - 5000)) ||
        localStorage.getItem(`langur_burja_account_created_${authedUser.id}`) === 'true' ||
        localStorage.getItem('langur_burja_google_configured') === 'true';

      const finalUser: UserProfile = {
        ...(remote || authedUser),
        id: authedUser.id,
        email: authedUser.email || remote?.email,
        username: remote?.username || authedUser.username,
        avatar: remote?.avatar || authedUser.avatar,
        googleName: authedUser.googleName || remote?.googleName,
        googleAvatar: authedUser.googleAvatar || remote?.googleAvatar,
        isGuest: false,
        authProvider: authedUser.authProvider || remote?.authProvider || 'google',
        profileConfigured: isAlreadyRegistered ? true : false,
        hasPassword: authedUser.hasPassword ?? remote?.hasPassword ?? false,
      };

      setUser(finalUser);
      saveLocalProfile(finalUser);
      localStorage.setItem('langur_burja_welcomed', 'true');
      setIsAuthModalOpen(false);

      if (!isAlreadyRegistered) {
        setIsFirstTimeUser(true);
        setIsProfileOpen(true);
      } else {
        localStorage.setItem(`langur_burja_account_created_${finalUser.id}`, 'true');
        localStorage.setItem('langur_burja_google_configured', 'true');
        showToast(`Welcome back, ${finalUser.username}!`, 'success');
      }

      if (socket && isConnected) {
        socket.emit('user:init', { id: finalUser.id });
      }
    },
    [socket, isConnected, showToast]
  );

  const handleSignOut = useCallback(async () => {
    await authSignOut();
    const guestUser = createDefaultProfile();
    setUser(guestUser);
    saveLocalProfile(guestUser);
    showToast('Signed out. You are now playing as Guest.', 'info');

    if (socket && isConnected) {
      socket.emit('user:init', { id: guestUser.id });
    }
  }, [socket, isConnected, showToast]);

  // Execution of the Dice Roll (Automated by timer or ready trigger)
  const executeLocalRoll = useCallback(() => {
    if (phaseRef.current !== 'betting' || isRollingInitiatedRef.current) return;
    isRollingInitiatedRef.current = true;

    const currentBets = { ...myBetsRef.current };
    const currentTableBets = { ...tableBetsRef.current };
    const currentRound = roundNumberRef.current;
    const currentUser = userRef.current;

    // Save previous bets for "Repeat Bet" option
    setPreviousBets(currentBets);
    setPhase('rolling');

    // Randomize 6 authentic Langur Burja dice
    const newDice: SymbolType[] = [];
    for (let i = 0; i < 6; i++) {
      const randIdx = Math.floor(Math.random() * SYMBOL_KEYS.length);
      newDice.push(SYMBOL_KEYS[randIdx]);
    }
    setDice(newDice);

    // Wait for prolonged suspenseful bucket shake and bouncing physics
    setTimeout(() => {
      // Calculate symbol counts
      const counts: Record<SymbolType, number> = {
        jhanda: 0,
        burja: 0,
        itta: 0,
        paan: 0,
        hukum: 0,
        chidi: 0,
      };
      newDice.forEach((s) => counts[s]++);

      const winningSymbols = (Object.keys(counts) as SymbolType[]).filter(
        (k) => counts[k] >= 2
      );

      // Player Payout Calculation:
      let playerTotalWon = 0;
      let playerTotalBet = 0;
      const details: { symbol: SymbolType; bet: number; count: number; won: number }[] = [];

      (Object.keys(currentBets) as SymbolType[]).forEach((sym) => {
        const bet = currentBets[sym];
        if (bet > 0) {
          playerTotalBet += bet;
          const match = counts[sym];
          if (match >= 2) {
            const won = bet + match * bet;
            playerTotalWon += won;
            details.push({ symbol: sym, bet, count: match, won });
          } else {
            details.push({ symbol: sym, bet, count: match, won: 0 });
          }
        }
      });

      // Table total bets
      let tableBetsTotal = 0;
      let tablePayoutsTotal = 0;
      (Object.keys(currentTableBets) as SymbolType[]).forEach((sym) => {
        const tBet = currentTableBets[sym];
        tableBetsTotal += tBet;
        const match = counts[sym];
        if (match >= 2) {
          tablePayoutsTotal += tBet + match * tBet;
        }
      });

      // Update Player Balance & Stats after every round
      const playerProfit = playerTotalWon - playerTotalBet;
      if (playerTotalBet > 0) {
        setUser((u) => {
          const updatedUser: UserProfile = {
            ...u,
            coins: u.coins + playerProfit,
            gamesPlayed: u.gamesPlayed + 1,
            gamesWon: playerTotalWon > 0 ? u.gamesWon + 1 : u.gamesWon,
            totalWinnings: playerTotalWon > 0 ? u.totalWinnings + playerProfit : u.totalWinnings,
            biggestWin: Math.max(u.biggestWin, playerProfit > 0 ? playerProfit : 0),
          };
          saveLocalProfile(updatedUser);
          syncProfileToSupabase(updatedUser).catch(() => {});
          return updatedUser;
        });
      }

      const summary: RoundResultSummary = {
        roundNumber: currentRound,
        dice: newDice,
        symbolCounts: counts,
        winningSymbols,
        playerPayouts: {
          [currentUser.id]: {
            totalBet: playerTotalBet,
            totalWon: playerTotalWon,
            netChange: playerProfit,
            details,
          },
        },
        totalTableBets: tableBetsTotal,
        totalTablePayouts: tablePayoutsTotal,
        timestamp: Date.now(),
      };

      setLastResult(summary);
      setPhase('payout');

      // Record dice roll in recent history for smart bot analytics
      historyDiceRef.current = [...historyDiceRef.current, newDice].slice(-15);

      // Resolve smart bot payouts and update their bankrolls and session stats (public tables only)
      if (!currentRoomRef.current?.isPrivate) {
        smartBotsRef.current = resolveSmartBotPayouts(smartBotsRef.current, newDice, currentRound);
        const updatedBotPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
        setTablePlayers((prev) => {
          const humanPlayers = prev.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_'));
          if (humanPlayers.length === 0) {
            const defaultUser: TablePlayer = {
              id: currentUser.id,
              username: currentUser.username,
              avatar: currentUser.avatar,
              coins: currentUser.coins,
              currentBet: 0,
              isReady: false,
              title: currentUser.equipped?.title || 'Player',
              isUser: true,
              isHost: false,
              isBot: false,
            };
            return [defaultUser, ...updatedBotPlayers];
          }
          return [...humanPlayers, ...updatedBotPlayers];
        });
      }

      // Celebration Sounds & Confetti
      if (playerTotalWon > 0) {
        sound.playWinFanfare();
        try {
          confetti({
            particleCount: 45,
            spread: 60,
            origin: { y: 0.62 },
            colors: ['#ffd700', '#f59e0b', '#10b981', '#ef4444'],
          });
        } catch {}

        if (counts.burja >= 4 || counts.jhanda >= 4) {
          sound.playJackpotSound();
        }
      }
    }, 4600);
  }, []);

  // Automated Betting Countdown Timer Engine (Solo practice & public fallback)
  useEffect(() => {
    // In synchronized multiplayer rooms, countdown is driven strictly by server game:timer_tick!
    if (currentRoom) return;
    if (phase !== 'betting') return;

    const timer = setInterval(() => {
      setBettingTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          executeLocalRoll();
          return 0;
        }
        const next = prev - 1;

        // In private tables: BOTS MUST NOT EXIST - no bot betting simulation
        if (currentRoomRef.current?.isPrivate) {
          return next;
        }

        // In public tables: Intelligent Bots place strategic bets according to their schedule
        const actingBots = smartBotsRef.current.filter(
          (b) => b.betPlacedAtSeconds === next && !b.isReady
        );
        if (actingBots.length > 0) {
          smartBotsRef.current = smartBotsRef.current.map((b) => {
            if (b.betPlacedAtSeconds === next) {
              return { ...b, isReady: true };
            }
            return b;
          });
          setTablePlayers((list) =>
            list.map((p) => {
              const matchedBot = smartBotsRef.current.find((b) => b.id === p.id);
              if (matchedBot && matchedBot.isReady) {
                return {
                  ...p,
                  isReady: true,
                  currentBet: matchedBot.totalBetThisRound,
                };
              }
              return p;
            })
          );
          setTableBets((prevBets) => {
            const nextBets = { ...prevBets };
            actingBots.forEach((bot) => {
              for (const sym of SYMBOL_KEYS) {
                nextBets[sym] = (nextBets[sym] || 0) + (bot.currentBets[sym] || 0);
              }
            });
            return nextBets;
          });
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, currentRoom, executeLocalRoll]);

  // Auto-roll check: In solo mode, if all players are ready first, roll immediately!
  useEffect(() => {
    if (currentRoom) return;
    if (phase !== 'betting') return;
    const allOthersReady = tablePlayers.every((p) => p.isReady);
    if (isUserReady && allOthersReady) {
      const timeout = setTimeout(() => {
        executeLocalRoll();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [phase, isUserReady, tablePlayers, currentRoom, executeLocalRoll]);

  // Advance to Next Round in Local Mode (or when all consensus votes are in)
  const advanceToNextRoundLocally = useCallback(() => {
    isRollingInitiatedRef.current = false;
    setPhase('betting');
    setLastResult(undefined);
    setNextRoundVotes([]);
    setRoundNumber((r) => r + 1);
    setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
    setIsUserReady(false);
    setBettingTimer(BETTING_DURATION);

    const isPrivate = Boolean(currentRoomRef.current?.isPrivate);

    if (isPrivate) {
      // In private tables: BOTS MUST NOT EXIST! Only retain human players
      setTablePlayers((prev) =>
        prev
          .filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_'))
          .map((p) => ({ ...p, currentBet: 0, isReady: false }))
      );
      setTableBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
    } else {
      // In public tables: Bots can exist and play smartly!
      const { plannedBots, combinedBotBets } = planSmartBotBets(
        smartBotsRef.current,
        historyDiceRef.current,
        BETTING_DURATION
      );
      smartBotsRef.current = plannedBots;
      const botPlayers = plannedBots.map(smartBotToTablePlayer);

      setTablePlayers((prev) => {
        const realHumans = prev.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_'));
        if (realHumans.length === 0) {
          const userEntry: TablePlayer = {
            id: userRef.current.id,
            username: userRef.current.username,
            avatar: userRef.current.avatar,
            coins: userRef.current.coins,
            currentBet: 0,
            isReady: false,
            title: userRef.current.equipped?.title || 'Player',
            isUser: true,
            isHost: false,
            isBot: false,
          };
          return [userEntry, ...botPlayers];
        }
        return [...realHumans.map((p) => ({ ...p, currentBet: 0, isReady: false })), ...botPlayers];
      });

      setTableBets(combinedBotBets);
    }
  }, []);

  // User Clicks Next Round
  const startNextRound = useCallback(() => {
    sound.playChipSound();
    const myId = userRef.current.id;

    // Record user vote
    setNextRoundVotes((prev) => (prev.includes(myId) ? prev : [...prev, myId]));
    setIsUserReady(true);
    setTablePlayers((list) => list.map((p) => (p.id === myId ? { ...p, isReady: true } : p)));

    // If connected to multiplayer room, broadcast vote to server
    if (socket && isConnected && currentRoomRef.current) {
      socket.emit('game:vote_next_round', {
        roomId: currentRoomRef.current.id,
        userId: myId,
      });
      showToast('Ready for next round! Waiting for other players...', 'info');
    } else {
      showToast('Ready for next round!', 'info');
    }
  }, [socket, isConnected, showToast]);

  // Bot Next Round Consensus Voting Simulation (Human-like random delays)
  useEffect(() => {
    if (phase !== 'payout') return;
    const isPrivate = Boolean(currentRoomRef.current?.isPrivate);
    if (isPrivate) return;

    // Get active bots currently at table
    const currentBots = smartBotsRef.current.filter((b) =>
      tablePlayers.some((p) => p.id === b.id)
    );
    if (currentBots.length === 0) return;

    const timeouts: NodeJS.Timeout[] = [];

    currentBots.forEach((bot, index) => {
      // Natural human-like staggered delays based on personality
      let delayMs = 1200 + Math.random() * 2600 + index * 250;
      if (bot.strategy === 'high_roller') {
        delayMs = 1000 + Math.random() * 1500;
      } else if (bot.strategy === 'conservative') {
        delayMs = 2200 + Math.random() * 2200;
      } else if (bot.strategy === 'trend_follower') {
        delayMs = 1500 + Math.random() * 1800;
      }

      const t = setTimeout(() => {
        // Emit vote if connected to socket room
        if (socket && isConnected && currentRoomRef.current) {
          socket.emit('game:vote_next_round', {
            roomId: currentRoomRef.current.id,
            userId: bot.id,
          });
        }

        setNextRoundVotes((prevVotes) => {
          if (prevVotes.includes(bot.id)) return prevVotes;
          const updatedVotes = [...prevVotes, bot.id];

          // Mark bot as ready in roster
          setTablePlayers((list) =>
            list.map((p) => (p.id === bot.id ? { ...p, isReady: true } : p))
          );

          return updatedVotes;
        });
      }, delayMs);

      timeouts.push(t);
    });

    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [phase, tablePlayers.length, isConnected, socket]);

  // Advance to next round when ALL active connected players (user + bots) have voted
  useEffect(() => {
    if (phase !== 'payout') return;
    if (tablePlayers.length === 0) return;

    const activeConnectedPlayers = tablePlayers.filter((p) => !p.isDisconnected);
    if (activeConnectedPlayers.length === 0) return;

    const allVoted = activeConnectedPlayers.every((p) => nextRoundVotes.includes(p.id));
    if (allVoted) {
      const timer = setTimeout(() => {
        if (!socket || !isConnected || !currentRoomRef.current) {
          advanceToNextRoundLocally();
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [phase, nextRoundVotes, tablePlayers, socket, isConnected, advanceToNextRoundLocally]);

  // Table Action Handlers (Create Table, Join Table by Code, Join Random Table, Share Table)
  const handleRefreshPublicRooms = useCallback(async () => {
    try {
      // Clean up any 0-player tables from Supabase before fetching
      await deleteZeroPlayerTablesFromSupabase().catch(() => {});

      // 1. Fetch persistent active public tables from Supabase
      const sbResult = await fetchRunningTablesFromSupabase();
      const sbRooms: PublicRoomSummary[] = (sbResult?.tables || [])
        .filter(
          (t) =>
            !t.is_private &&
            t.host_id !== 'system' &&
            t.code !== 'ROYAL1' &&
            t.id !== 'public-royal-table'
        )
        .map((t) => ({
          id: t.id,
          name: t.name,
          code: t.code,
          playerCount: t.player_count || 1,
          phase: (t.status === 'active' ? 'betting' : 'waiting') as GamePhase,
          timer: t.betting_duration || 20,
        }));

      let liveRooms: PublicRoomSummary[] = [];
      if (socket && isConnected) {
        liveRooms = await new Promise<PublicRoomSummary[]>((resolve) => {
          const timer = setTimeout(() => resolve([]), 1500);
          socket.emit('room:get_public', (res: { rooms: PublicRoomSummary[] }) => {
            clearTimeout(timer);
            const filtered = (res?.rooms || []).filter(
              (r) =>
                r.id !== 'public-royal-table' &&
                r.code !== 'ROYAL1' &&
                r.name !== '👑 Royal Court Pavilion' &&
                r.playerCount > 0
            );
            resolve(filtered);
          });
        });
      }

      // If live rooms from server exist, use them exclusively as the source of truth for real active tables
      if (liveRooms.length > 0) {
        setPublicRooms(liveRooms);
        return liveRooms;
      }

      // If socket had no active tables, also filter Supabase rooms to ensure no 0-player tables
      const activeSbRooms = sbRooms.filter((r) => r.playerCount > 0);
      setPublicRooms(activeSbRooms);
      return activeSbRooms;
    } catch {
      if (socket && isConnected) {
        socket.emit('room:get_public', (res: { rooms: PublicRoomSummary[] }) => {
          const liveRooms = (res?.rooms || []).filter(
            (r) =>
              r.id !== 'public-royal-table' &&
              r.code !== 'ROYAL1' &&
              r.name !== '👑 Royal Court Pavilion' &&
              r.playerCount > 0
          );
          setPublicRooms(liveRooms);
        });
      }
      return [];
    }
  }, [socket, isConnected]);

  const handleHostStartGame = useCallback(
    async (roomId?: string) => {
      const targetRoomId = roomId || currentRoomRef.current?.id;
      if (!targetRoomId) {
        setPhase('betting');
        setIsInGame(true);
        setIsTableModalOpen(false);
        return;
      }

      if (socket && isConnected) {
        socket.emit(
          'host:start_game',
          { roomId: targetRoomId, hostUserId: user.id },
          (res: { success: boolean; message?: string; room?: RoomState }) => {
            if (res?.success) {
              if (res.room) {
                setCurrentRoom(res.room);
                currentRoomRef.current = res.room;
                syncTableStateToSupabase(res.room);
              }
              setPhase('betting');
              setIsInGame(true);
              setIsTableModalOpen(false);
              showToast('🎲 Game started! Bets are now officially open.', 'success');
            } else {
              showToast(res?.message || 'Unable to start table', 'error');
            }
          }
        );
      } else {
        setPhase('betting');
        setIsInGame(true);
        setIsTableModalOpen(false);
        showToast('Table started!', 'success');
      }
    },
    [socket, isConnected, user.id, showToast]
  );

  const handleHostEnterTable = useCallback(
    async (roomId?: string) => {
      setIsTableModalOpen(false);
      setIsInGame(true);
      setPhase('waiting');
      showToast('Entered table as Host! Click Start Game when ready.', 'info');
    },
    [showToast]
  );

  const handleCreateTable = useCallback(
    async (params: {
      name: string;
      isPrivate: boolean;
      bettingDuration: number;
    }): Promise<{ success: boolean; code?: string; roomId?: string; error?: string }> => {
      if (!socket || !isConnected) {
        // Fallback local table
        const fakeCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        setIsInGame(true);
        setPhase('waiting');
        showToast(`Table "${params.name}" created! (Code: ${fakeCode})`, 'success');
        return { success: true, code: fakeCode, roomId: `local_${fakeCode}` };
      }

      return new Promise((resolve) => {
        socket.emit(
          'room:create',
          {
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              coins: user.coins,
              equipped: user.equipped,
            },
            name: params.name,
            isPrivate: params.isPrivate,
            settings: {
              minBet: 10,
              maxBet: 50000,
              bettingDuration: params.bettingDuration,
            },
          },
          async (res: { success: boolean; room?: RoomState; message?: string }) => {
            if (res?.success && res.room) {
              setCurrentRoom(res.room);
              currentRoomRef.current = res.room;
              setIsInGame(true);
              setPhase(res.room.phase || 'waiting');
              setBettingTimer(res.room.timer || params.bettingDuration);
              setRoundNumber(res.room.roundNumber || 1);
              setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
              setTableBets(res.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
              setLastResult(undefined);

              if (res.room.players) {
                const hostId = res.room.hostId;
                const mapped: TablePlayer[] = Object.values(res.room.players).map((p) => ({
                  id: p.id,
                  username: p.username,
                  avatar: p.avatar,
                  coins: p.coins,
                  currentBet: p.totalBetThisRound,
                  isReady: p.totalBetThisRound > 0,
                  title: p.equipped?.title || 'Player',
                  isUser: p.id === user.id,
                  isHost: Boolean(p.isHost || hostId === p.id),
                  isBot: false,
                  sessionStats: p.sessionStats,
                }));
                if (res.room.isPrivate) {
                  setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
                } else {
                  const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
                  setTablePlayers([...mapped, ...botPlayers]);
                }
              }

              // Persist running table & private code in Supabase game_tables
              await syncTableStateToSupabase(res.room);

              showToast(`Table created! Share code: ${res.room.code}`, 'success');
              resolve({ success: true, code: res.room.code, roomId: res.room.id });
            } else {
              resolve({ success: false, error: res?.message || 'Failed to create table' });
            }
          }
        );
      });
    },
    [socket, isConnected, user, showToast, startNextRound]
  );

  const handleJoinByCode = useCallback(
    async (code: string): Promise<{ success: boolean; error?: string }> => {
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) {
        return { success: false, error: 'Please enter a 6-character table code.' };
      }

      // Check Supabase registry to fetch table data if needed
      let preTable: any = undefined;
      try {
        const check = await findTableByCodeInSupabase(cleanCode);
        if (check.success && check.table) {
          preTable = check.table;
        }
      } catch (err) {
        // safe ignore
      }

      if (!socket || !isConnected) {
        if (preTable) {
          const fallbackRoom: RoomState = {
            id: preTable.id,
            code: preTable.code,
            name: preTable.name,
            hostId: preTable.host_id,
            isPrivate: preTable.is_private,
            settings: {
              minBet: 10,
              maxBet: 50000,
              bettingDuration: preTable.betting_duration || 18,
              payoutDuration: 6,
              autoLoop: true,
              payoutMultiplierType: 'traditional',
            },
            phase: preTable.status === 'waiting' ? 'waiting' : 'betting',
            timer: preTable.betting_duration || 18,
            dice: ['burja', 'jhanda', 'itta', 'paan', 'hukum', 'chidi'],
            roundNumber: 1,
            players: {},
            tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
            recentHistory: [],
            history: preTable.history || [],
          };
          setCurrentRoom(fallbackRoom);
          currentRoomRef.current = fallbackRoom;
        }
        setIsInGame(true);
        setPhase(preTable?.status === 'waiting' ? 'waiting' : 'betting');
        showToast(`Joined table ${cleanCode}!`, 'success');
        return { success: true };
      }

      return new Promise((resolve) => {
        socket.emit(
          'room:join_by_code',
          {
            code: cleanCode,
            tableData: preTable,
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              coins: user.coins,
              equipped: user.equipped,
            },
          },
          async (res: { success: boolean; room?: RoomState; message?: string }) => {
            if (res?.success && res.room) {
              setCurrentRoom(res.room);
              currentRoomRef.current = res.room;
              setIsInGame(true);
              setPhase(res.room.phase || 'waiting');
              setBettingTimer(res.room.timer);
              setRoundNumber(res.room.roundNumber || 1);
              setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
              setTableBets(res.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
              if (res.room.dice) {
                setDice(res.room.dice);
              }
              if (res.room.phase === 'payout') {
                setLastResult(res.room.lastResult);
                setNextRoundVotes(res.room.nextRoundVotes || []);
              } else {
                setLastResult(undefined);
              }

              if (res.room.players) {
                const hostId = res.room.hostId;
                const mapped: TablePlayer[] = Object.values(res.room.players).map((p) => ({
                  id: p.id,
                  username: p.username,
                  avatar: p.avatar,
                  coins: p.coins,
                  currentBet: p.totalBetThisRound,
                  isReady: p.totalBetThisRound > 0,
                  title: p.equipped?.title || 'Player',
                  isUser: p.id === user.id,
                  isHost: Boolean(p.isHost || hostId === p.id),
                  isBot: false,
                  sessionStats: p.sessionStats,
                }));
                if (res.room.isPrivate) {
                  setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
                } else {
                  const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
                  setTablePlayers([...mapped, ...botPlayers]);
                }
              }

              // Update player count & sync in Supabase
              await syncTableStateToSupabase(res.room);

              showToast(`Joined table "${res.room.name}"!`, 'success');
              resolve({ success: true });
            } else {
              // Check Supabase table registry as fallback
              const dbCheck = preTable ? { success: true, table: preTable } : await findTableByCodeInSupabase(cleanCode);
              if (dbCheck.success && dbCheck.table) {
                // Restore via socket
                socket.emit(
                  'room:restore_and_join',
                  {
                    code: cleanCode,
                    tableData: dbCheck.table,
                    user: {
                      id: user.id,
                      username: user.username,
                      avatar: user.avatar,
                      coins: user.coins,
                      equipped: user.equipped,
                    },
                  },
                  async (restoreRes: { success: boolean; room?: RoomState; message?: string }) => {
                    if (restoreRes?.success && restoreRes.room) {
                      setCurrentRoom(restoreRes.room);
                      currentRoomRef.current = restoreRes.room;
                      setIsInGame(true);
                      setPhase(restoreRes.room.phase || 'waiting');
                      setBettingTimer(restoreRes.room.timer);
                      setRoundNumber(restoreRes.room.roundNumber || 1);
                      setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
                      setTableBets(restoreRes.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
                      setLastResult(undefined);

                      if (restoreRes.room.players) {
                        const hostId = restoreRes.room.hostId;
                        const mapped: TablePlayer[] = Object.values(restoreRes.room.players).map((p) => ({
                          id: p.id,
                          username: p.username,
                          avatar: p.avatar,
                          coins: p.coins,
                          currentBet: p.totalBetThisRound,
                          isReady: p.totalBetThisRound > 0,
                          title: p.equipped?.title || 'Player',
                          isUser: p.id === user.id,
                          isHost: Boolean(p.isHost || hostId === p.id),
                          isBot: false,
                          sessionStats: p.sessionStats,
                        }));
                        if (restoreRes.room.isPrivate) {
                          setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
                        } else {
                          const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
                          setTablePlayers([...mapped, ...botPlayers]);
                        }
                      }

                      await syncTableStateToSupabase(restoreRes.room);
                      showToast(`Joined table "${restoreRes.room.name}"!`, 'success');
                      resolve({ success: true });
                    } else {
                      // Seamless fallback into the table directly
                      const fallbackRoom: RoomState = {
                        id: dbCheck.table!.id,
                        code: dbCheck.table!.code,
                        name: dbCheck.table!.name,
                        hostId: dbCheck.table!.host_id,
                        isPrivate: dbCheck.table!.is_private,
                        settings: {
                          minBet: 10,
                          maxBet: 50000,
                          bettingDuration: dbCheck.table!.betting_duration || 18,
                          payoutDuration: 6,
                          autoLoop: true,
                          payoutMultiplierType: 'traditional',
                        },
                        phase: dbCheck.table!.status === 'waiting' ? 'waiting' : 'betting',
                        timer: dbCheck.table!.betting_duration || 18,
                        dice: ['burja', 'jhanda', 'itta', 'paan', 'hukum', 'chidi'],
                        roundNumber: 1,
                        players: {},
                        tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
                        recentHistory: [],
                        history: dbCheck.table!.history || [],
                      };
                      setCurrentRoom(fallbackRoom);
                      currentRoomRef.current = fallbackRoom;
                      setIsInGame(true);
                      showToast(`Joined table "${fallbackRoom.name}"!`, 'success');
                      resolve({ success: true });
                    }
                  }
                );
              } else {
                resolve({ success: false, error: res?.message || 'Table not found. Please verify the 6-character code.' });
              }
            }
          }
        );
      });
    },
    [socket, isConnected, user, showToast, startNextRound]
  );

  const handleJoinRandom = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!socket || !isConnected) {
      setIsInGame(true);
      setPhase('waiting');
      showToast('Created & entered public table with random players enabled!', 'success');
      return { success: true };
    }

    return new Promise((resolve) => {
      socket.emit(
        'room:join_random',
        {
          user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            coins: user.coins,
            equipped: user.equipped,
          },
        },
        async (res: { success: boolean; room?: RoomState; message?: string; created?: boolean }) => {
          if (res?.success && res.room) {
            setCurrentRoom(res.room);
            currentRoomRef.current = res.room;
            setIsInGame(true);
            setPhase(res.room.phase || 'waiting');
            setBettingTimer(res.room.timer);
            setRoundNumber(res.room.roundNumber || 1);
            setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
            setTableBets(res.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
            if (res.room.dice) {
              setDice(res.room.dice);
            }
            if (res.room.phase === 'payout') {
              setLastResult(res.room.lastResult);
              setNextRoundVotes(res.room.nextRoundVotes || []);
            } else {
              setLastResult(undefined);
            }

            if (res.room.players) {
              const hostId = res.room.hostId;
              const mapped: TablePlayer[] = Object.values(res.room.players).map((p) => ({
                id: p.id,
                username: p.username,
                avatar: p.avatar,
                coins: p.coins,
                currentBet: p.totalBetThisRound,
                isReady: p.totalBetThisRound > 0,
                title: p.equipped?.title || 'Player',
                isUser: p.id === user.id,
                isHost: Boolean(p.isHost || hostId === p.id),
                isBot: false,
                sessionStats: p.sessionStats,
              }));
              if (res.room.isPrivate) {
                setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
              } else {
                const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
                setTablePlayers([...mapped, ...botPlayers]);
              }
            }

            syncTableStateToSupabase(res.room);

            if (res.created) {
              showToast(`Created & joined public table "${res.room.name}"! Random players can join.`, 'success');
            } else {
              showToast(`Joined table: ${res.room.name}!`, 'success');
            }
            resolve({ success: true });
          } else {
            // Fallback: If no table could be joined, auto-create a public table with random matching enabled
            const createRes = await handleCreateTable({
              name: `${user.username}'s Table`,
              isPrivate: false,
              bettingDuration: 20,
            });
            if (createRes.success) {
              showToast('Created & entered public table with random players enabled!', 'success');
              resolve({ success: true });
            } else {
              resolve({ success: false, error: createRes.error || res?.message || 'Could not join or create table.' });
            }
          }
        }
      );
    });
  }, [socket, isConnected, user, showToast, startNextRound, handleCreateTable]);

  const handleJoinRoomById = useCallback(
    async (roomId: string): Promise<{ success: boolean; error?: string }> => {
      // Pre-check Supabase to get tableData if available
      let preTable: any = undefined;
      try {
        const check = await findTableByIdInSupabase(roomId);
        if (check.success && check.table) {
          preTable = check.table;
        }
      } catch (err) {
        // safe ignore
      }

      if (!socket || !isConnected) {
        if (preTable) {
          const fallbackRoom: RoomState = {
            id: preTable.id,
            code: preTable.code,
            name: preTable.name,
            hostId: preTable.host_id,
            isPrivate: preTable.is_private,
            settings: {
              minBet: 10,
              maxBet: 50000,
              bettingDuration: preTable.betting_duration || 18,
              payoutDuration: 6,
              autoLoop: true,
              payoutMultiplierType: 'traditional',
            },
            phase: preTable.status === 'waiting' ? 'waiting' : 'betting',
            timer: preTable.betting_duration || 18,
            dice: ['burja', 'jhanda', 'itta', 'paan', 'hukum', 'chidi'],
            roundNumber: 1,
            players: {},
            tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
            recentHistory: [],
            history: preTable.history || [],
          };
          setCurrentRoom(fallbackRoom);
          currentRoomRef.current = fallbackRoom;
        }
        setIsInGame(true);
        setPhase(preTable?.status === 'waiting' ? 'waiting' : 'betting');
        showToast('Joined table!', 'success');
        return { success: true };
      }

      return new Promise((resolve) => {
        socket.emit(
          'room:join',
          {
            roomId,
            tableData: preTable,
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              coins: user.coins,
              equipped: user.equipped,
            },
          },
          async (res: { success: boolean; room?: RoomState; message?: string }) => {
            if (res?.success && res.room) {
              setCurrentRoom(res.room);
              currentRoomRef.current = res.room;
              setIsInGame(true);
              setPhase(res.room.phase || 'waiting');
              setBettingTimer(res.room.timer);
              setRoundNumber(res.room.roundNumber || 1);
              setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
              setTableBets(res.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
              if (res.room.dice) {
                setDice(res.room.dice);
              }
              if (res.room.phase === 'payout') {
                setLastResult(res.room.lastResult);
                setNextRoundVotes(res.room.nextRoundVotes || []);
              } else {
                setLastResult(undefined);
              }

              if (res.room.players) {
                const hostId = res.room.hostId;
                const mapped: TablePlayer[] = Object.values(res.room.players).map((p) => ({
                  id: p.id,
                  username: p.username,
                  avatar: p.avatar,
                  coins: p.coins,
                  currentBet: p.totalBetThisRound,
                  isReady: p.totalBetThisRound > 0,
                  title: p.equipped?.title || 'Player',
                  isUser: p.id === user.id,
                  isHost: Boolean(p.isHost || hostId === p.id),
                  isBot: false,
                  sessionStats: p.sessionStats,
                }));
                if (res.room.isPrivate) {
                  setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
                } else {
                  const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
                  setTablePlayers([...mapped, ...botPlayers]);
                }
              }

              syncTableStateToSupabase(res.room);

              showToast(`Joined table ${res.room.name}!`, 'success');
              resolve({ success: true });
            } else {
              // Try restoring from Supabase if table is in DB
              const dbCheck = preTable ? { success: true, table: preTable } : await findTableByIdInSupabase(roomId);
              if (dbCheck.success && dbCheck.table) {
                socket.emit(
                  'room:restore_and_join',
                  {
                    roomId,
                    tableData: dbCheck.table,
                    user: {
                      id: user.id,
                      username: user.username,
                      avatar: user.avatar,
                      coins: user.coins,
                      equipped: user.equipped,
                    },
                  },
                  (restoreRes: { success: boolean; room?: RoomState; message?: string }) => {
                    if (restoreRes?.success && restoreRes.room) {
                      setCurrentRoom(restoreRes.room);
                      currentRoomRef.current = restoreRes.room;
                      setIsInGame(true);
                      setPhase(restoreRes.room.phase || 'waiting');
                      setBettingTimer(restoreRes.room.timer);
                      setRoundNumber(restoreRes.room.roundNumber || 1);
                      setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
                      setTableBets(restoreRes.room.tableBets || { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
                      setLastResult(undefined);

                      if (restoreRes.room.players) {
                        const hostId = restoreRes.room.hostId;
                        const mapped: TablePlayer[] = Object.values(restoreRes.room.players).map((p) => ({
                          id: p.id,
                          username: p.username,
                          avatar: p.avatar,
                          coins: p.coins,
                          currentBet: p.totalBetThisRound,
                          isReady: p.totalBetThisRound > 0,
                          title: p.equipped?.title || 'Player',
                          isUser: p.id === user.id,
                          isHost: Boolean(p.isHost || hostId === p.id),
                          isBot: false,
                          sessionStats: p.sessionStats,
                        }));
                        if (restoreRes.room.isPrivate) {
                          setTablePlayers(mapped.filter((p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')));
                        } else {
                          const botPlayers = smartBotsRef.current.map(smartBotToTablePlayer);
                          setTablePlayers([...mapped, ...botPlayers]);
                        }
                      }

                      syncTableStateToSupabase(restoreRes.room);
                      showToast(`Joined table ${restoreRes.room.name}!`, 'success');
                      resolve({ success: true });
                    } else {
                      resolve({ success: false, error: res?.message || 'Could not join this table.' });
                    }
                  }
                );
              } else {
                resolve({ success: false, error: res?.message || 'Could not join this table.' });
              }
            }
          }
        );
      });
    },
    [socket, isConnected, user, showToast, startNextRound]
  );

  const handleLeaveTable = useCallback(() => {
    voiceService.leaveVoice();
    if (socket && currentRoom) {
      socket.emit('room:leave', { roomId: currentRoom.id, userId: user.id });
      // Delete table from Supabase when players become 0 or if user was the only player
      const otherPlayers = Object.keys(currentRoom.players || {}).filter((id) => id !== user.id);
      if (otherPlayers.length === 0) {
        deleteTableFromSupabase(currentRoom.id);
      }
    }
    // Sweep any orphaned 0-player tables from Supabase
    deleteZeroPlayerTablesFromSupabase().catch(() => {});

    setCurrentRoom(null);
    currentRoomRef.current = null;
    setIsInGame(false);
    setPhase('betting');
    setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });
    const { plannedBots, combinedBotBets } = planSmartBotBets(
      smartBotsRef.current,
      historyDiceRef.current,
      BETTING_DURATION
    );
    smartBotsRef.current = plannedBots;
    setTablePlayers(plannedBots.map(smartBotToTablePlayer));
    setTableBets(combinedBotBets);
    setLastResult(undefined);
  }, [socket, currentRoom, user.id]);

  const handleKickPlayer = useCallback(
    (targetUserId: string) => {
      const isHost = currentRoom ? currentRoom.hostId === user.id : true;
      if (!isHost) {
        showToast('Only the table host can remove players.', 'error');
        return;
      }

      // Check if target is a bot
      const isBot = targetUserId.startsWith('patron_') || targetUserId.startsWith('bot_');

      if (isBot) {
        smartBotsRef.current = smartBotsRef.current.filter((b) => b.id !== targetUserId);
        setTablePlayers((prev) => prev.filter((p) => p.id !== targetUserId));
        setNextRoundVotes((prev) => prev.filter((id) => id !== targetUserId));
        showToast('Player removed from the table.', 'success');
        sound.playChipSound();
        return;
      }

      if (currentRoom && socket) {
        socket.emit(
          'room:kick',
          {
            roomId: currentRoom.id,
            hostId: user.id,
            targetUserId,
          },
          (res: { success: boolean; message?: string; room?: RoomState }) => {
            if (res?.success && res.room) {
              setCurrentRoom(res.room);
              currentRoomRef.current = res.room;
              syncTableStateToSupabase(res.room);
              showToast('Player removed from the table.', 'success');
            } else {
              showToast(res?.message || 'Failed to remove player.', 'error');
            }
          }
        );
      } else {
        setTablePlayers((prev) => prev.filter((p) => p.id !== targetUserId));
        setNextRoundVotes((prev) => prev.filter((id) => id !== targetUserId));
        showToast('Player removed from the table.', 'success');
      }
    },
    [currentRoom, socket, user.id, showToast]
  );

  const handleRequestTransferLeadership = useCallback(
    (targetUserId: string, targetUserName: string) => {
      const isLeader = currentRoom ? currentRoom.hostId === user.id : true;
      if (!isLeader) {
        showToast('Only the table leader can transfer leadership.', 'error');
        return;
      }

      if (targetUserId.startsWith('patron_') || targetUserId.startsWith('bot_')) {
        showToast('Leadership cannot be transferred to a bot.', 'error');
        return;
      }

      if (currentRoom && socket) {
        socket.emit(
          'table:request_transfer_leadership',
          {
            roomId: currentRoom.id,
            hostId: user.id,
            targetUserId,
          },
          (res: { success: boolean; message?: string }) => {
            if (res?.success) {
              showToast(res.message || `Leadership offer sent to ${targetUserName}!`, 'info');
            } else {
              showToast(res?.message || 'Failed to send leadership offer.', 'error');
            }
          }
        );
      } else {
        showToast(`Transferred leadership to ${targetUserName}!`, 'success');
      }
    },
    [currentRoom, socket, user.id, showToast]
  );

  const handleShareCurrentTable = useCallback(() => {
    if (!currentRoom) return;
    const origin = window.location.origin;
    const inviteUrl = `${origin}?table=${currentRoom.code}`;

    if (navigator.share) {
      navigator
        .share({
          title: 'Join my Langur Burja Table!',
          text: `🎲 Join table "${currentRoom.name}" (Code: ${currentRoom.code})! Tap to roll:`,
          url: inviteUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard
        .writeText(inviteUrl)
        .then(() => {
          showToast(`Invite link copied for table ${currentRoom.code}!`, 'success');
        })
        .catch(() => {
          showToast(`Table Code: ${currentRoom.code}`, 'info');
        });
    }
  }, [currentRoom, showToast]);

  // Handle Bet Placement on Symbol
  const handlePlaceBet = (symbol: SymbolType, amount: number) => {
    if (phase !== 'betting') {
      showToast('Betting is closed during rolling and payouts', 'error');
      return;
    }
    if (user.coins < amount) {
      sound.playDiceLandSound();
      showToast("You don't have enough coins.", 'error');
      return;
    }

    // Deduct coins locally
    setUser((u) => ({ ...u, coins: u.coins - amount }));
    setMyBets((prev) => ({ ...prev, [symbol]: prev[symbol] + amount }));
    setTableBets((prev) => ({ ...prev, [symbol]: prev[symbol] + amount }));

    if (socket) {
      socket.emit('bet:place', {
        roomId: currentRoom?.id || 'public-royal-table',
        userId: user.id,
        symbol,
        amount,
      });
    }
  };

  const handleInsufficientCoins = () => {
    sound.playDiceLandSound();
    showToast("You don't have enough coins.", 'error');
  };

  // Handle Removing Bet on a single symbol tile
  const handleClearTileBet = (symbol: SymbolType) => {
    if (phase !== 'betting') return;
    const tileBet = myBets[symbol] || 0;
    if (tileBet <= 0) return;

    setUser((u) => ({ ...u, coins: u.coins + tileBet }));
    setMyBets((prev) => ({ ...prev, [symbol]: 0 }));
    setTableBets((prev) => ({
      ...prev,
      [symbol]: Math.max(0, prev[symbol] - tileBet),
    }));

    showToast(`Removed ${tileBet.toLocaleString()} 🪙 bet from ${LANGUR_BURJA_SYMBOLS[symbol].name}`, 'info');
  };

  // Clear all bets
  const handleClearBets = () => {
    if (phase !== 'betting') return;
    const totalRefund = (Object.values(myBets) as number[]).reduce((a, b) => a + b, 0);
    if (totalRefund === 0) return;

    setUser((u) => ({ ...u, coins: u.coins + totalRefund }));
    setTableBets((prev) => {
      const updated = { ...prev };
      (Object.keys(myBets) as SymbolType[]).forEach((sym) => {
        updated[sym] = Math.max(0, updated[sym] - myBets[sym]);
      });
      return updated;
    });
    setMyBets({ jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 });

    if (socket) {
      socket.emit('bet:clear', { roomId: currentRoom?.id || 'public-royal-table', userId: user.id });
    }
    showToast(`Refunded ${totalRefund.toLocaleString()} coins`, 'info');
  };

  // Double all current bets
  const handleDoubleBets = () => {
    if (phase !== 'betting') return;
    const currentTotal = (Object.values(myBets) as number[]).reduce((a, b) => a + b, 0);
    if (currentTotal === 0) return;
    if (user.coins < currentTotal) {
      showToast('Insufficient coins to double current bets', 'error');
      return;
    }

    setUser((u) => ({ ...u, coins: u.coins - currentTotal }));
    const doubled: Record<SymbolType, number> = { ...myBets };
    (Object.keys(myBets) as SymbolType[]).forEach((sym) => {
      doubled[sym] = myBets[sym] * 2;
    });
    setMyBets(doubled);
    setTableBets((prev) => {
      const updated = { ...prev };
      (Object.keys(myBets) as SymbolType[]).forEach((sym) => {
        updated[sym] += myBets[sym];
      });
      return updated;
    });
    showToast(`Bets doubled! Total stake: ${(currentTotal * 2).toLocaleString()} 🪙`, 'success');
  };

  // Repeat Previous Round's Bets
  const handleRepeatBets = () => {
    if (phase !== 'betting' || !previousBets) return;
    const repeatTotal = (Object.values(previousBets) as number[]).reduce((a, b) => a + b, 0);
    if (repeatTotal === 0) return;
    if (user.coins < repeatTotal) {
      showToast('Insufficient coins to repeat previous bets', 'error');
      return;
    }

    const currentRefund = (Object.values(myBets) as number[]).reduce((a, b) => a + b, 0);
    setUser((u) => ({ ...u, coins: u.coins + currentRefund - repeatTotal }));
    setMyBets({ ...previousBets });

    setTableBets((prev) => {
      const updated = { ...prev };
      (Object.keys(previousBets) as SymbolType[]).forEach((sym) => {
        updated[sym] += previousBets[sym] - (myBets[sym] || 0);
      });
      return updated;
    });

    showToast(`Repeated previous round bets (${repeatTotal.toLocaleString()} 🪙)`, 'success');
  };

  // Handle User Profile Updates (Persistent across local storage & Supabase)
  const handleUpdateUserProfile = useCallback((updated: Partial<UserProfile>) => {
    setUser((u) => {
      const next = { ...u, ...updated };
      saveLocalProfile(next);
      syncProfileToSupabase(next);
      return next;
    });
  }, []);

  // Claim Free Faucet Coins (+1,000)
  const handleClaimFaucet = () => {
    setFaucetLoading(true);
    sound.playWinFanfare();

    setTimeout(() => {
      setUser((u) => {
        const next = { ...u, coins: u.coins + 1000 };
        saveLocalProfile(next);
        syncProfileToSupabase(next);
        return next;
      });
      setFaucetLoading(false);
      showToast('+1,000 Free Bonus Coins added!', 'success');
    }, 350);
  };

  // User Toggle Ready
  const handleToggleUserReady = () => {
    if (phase !== 'betting') return;
    sound.playChipSound();
    setIsUserReady((prev) => {
      const next = !prev;
      if (socket && currentRoom) {
        socket.emit('player:ready', { roomId: currentRoom.id, userId: user.id, isReady: next });
      }
      return next;
    });
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
  };

  const totalUserBet = (Object.values(myBets) as number[]).reduce((a, b) => a + b, 0);
  const totalTablePool = (Object.values(tableBets) as number[]).reduce((a, b) => a + b, 0);
  const previousBetsTotal = previousBets
    ? (Object.values(previousBets) as number[]).reduce((a, b) => a + b, 0)
    : 0;

  // Compile active players for the pavilion deck with useMemo to guarantee 0 duplicates
  const activeTablePlayers = useMemo<TablePlayer[]>(() => {
    const isMeHost = Boolean(currentRoom ? currentRoom.hostId === user.id : true);
    const currentUserPlayer: TablePlayer = {
      id: user.id || 'user_me',
      username: user.username || 'You',
      avatar: user.avatar || '🎲',
      coins: user.coins,
      currentBet: totalUserBet,
      isReady: isUserReady,
      isUser: true,
      isHost: isMeHost,
      title: user.equipped?.title || 'Festival Player',
    };

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const result: TablePlayer[] = [];

    // Always place current user as the first authoritative player entry
    seenIds.add(currentUserPlayer.id);
    if (currentUserPlayer.username) {
      seenNames.add(currentUserPlayer.username.trim().toLowerCase());
    }
    result.push(currentUserPlayer);

    const isPrivate = Boolean(currentRoom?.isPrivate);

    for (const p of tablePlayers) {
      if (!p || !p.id) continue;
      // Skip if this is the current user (already added)
      if (p.isUser || p.id === user.id) continue;
      const lowerName = (p.username || '').trim().toLowerCase();
      if (lowerName && lowerName === (user.username || '').trim().toLowerCase()) continue;

      // In private rooms, filter out bots
      if (isPrivate && (p.id.startsWith('patron_') || p.id.startsWith('bot_') || p.isBot)) {
        continue;
      }

      if (seenIds.has(p.id)) continue;
      if (lowerName && seenNames.has(lowerName)) continue;

      seenIds.add(p.id);
      if (lowerName) seenNames.add(lowerName);

      const isHost = Boolean(p.isHost || (currentRoom && currentRoom.hostId === p.id));
      result.push({
        ...p,
        isUser: false,
        isHost,
      });
    }

    return result;
  }, [
    currentRoom,
    user.id,
    user.username,
    user.avatar,
    user.coins,
    totalUserBet,
    isUserReady,
    user.equipped?.title,
    tablePlayers,
  ]);

  // Round results computation for payout display
  const playerPayoutInfo = lastResult?.playerPayouts?.[user.id];
  const playerWonAmount = playerPayoutInfo?.totalWon || 0;
  const playerProfit = playerPayoutInfo?.netChange || 0;
  const hasWinningDice = (lastResult?.winningSymbols || []).length > 0;

  // Global theme background & frame border accents
  const globalAppBg =
    tableTheme === 'crimson'
      ? 'bg-gradient-to-b from-[#190408] via-[#0f0305] to-[#060102]'
      : tableTheme === 'midnight'
      ? 'bg-gradient-to-b from-[#051329] via-[#030d1c] to-[#01050d]'
      : 'bg-gradient-to-b from-[#02180e] via-[#030f0a] to-[#010604]';

  const gameFrameBorder =
    tableTheme === 'crimson'
      ? 'border-rose-900/40'
      : tableTheme === 'midnight'
      ? 'border-blue-900/40'
      : 'border-emerald-900/40';

  return (
    <div
      id="app-root-container"
      className={`min-h-screen ${globalAppBg} text-slate-100 flex flex-col items-center select-none`}
    >
      {/* Toast Feedback Notification - Small & Elegant Single-Line Pill */}
      {toast && (
        <div
          id="global-toast"
          className={`fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1 rounded-full shadow-lg border text-[11px] font-semibold whitespace-nowrap backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-none max-w-[92vw] overflow-hidden ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
              : toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
              : 'bg-slate-900/95 border-amber-500/40 text-amber-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          )}
          <span className="truncate whitespace-nowrap">{toast.message}</span>
        </div>
      )}

      {/* Dynamic Screen: Main Menu vs Active Game Arena */}
      {!isInGame ? (
        <MainMenu
          user={user}
          onUpdateUser={handleUpdateUserProfile}
          onStartGame={() => {
            setIsInGame(true);
            startNextRound();
            setSelectedChip(100);
            sound.playChipSound();
            showToast('New round! Place your bets.', 'info');
          }}
          onOpenTableModal={(tab) => {
            setTableModalTab(tab);
            setIsTableModalOpen(true);
          }}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
          onOpenShop={() => setIsShopOpen(true)}
          onClaimFaucet={handleClaimFaucet}
          faucetLoading={faucetLoading}
          tableTheme={tableTheme}
          onChangeTableTheme={setTableTheme}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      ) : (
        /* Main Mobile Screen Wrapper: Responsive adaptive viewport */
        <div className={`w-full max-w-md sm:max-w-lg md:max-w-xl h-[100dvh] sm:h-[96vh] sm:max-h-[960px] flex flex-col justify-between shadow-2xl border-x ${gameFrameBorder} bg-slate-950 relative overflow-hidden sm:rounded-3xl transition-colors duration-300`}>
          {/* 1. Mobile Top Header with Profile Access, Fullscreen & Settings */}
          <MobileHeader
            user={user}
            currentRoom={currentRoom}
            onShareTable={handleShareCurrentTable}
            onOpenProfile={() => setIsProfileOpen(true)}
            onOpenTableStats={() => setIsTableStatsOpen(true)}
            onClaimFaucet={handleClaimFaucet}
            faucetLoading={faucetLoading}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onReturnToMainMenu={() => setShowExitConfirmModal(true)}
          />

          {/* 2. Main Arena, Players Deck & Mat Content Area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 px-2 sm:px-2.5 pt-1 pb-1 flex flex-col gap-1 sm:gap-1.5 overflow-hidden"
          >
            {/* Active Table Players Pavilion (Compact circular avatars, live countdown, ping latency & ready toggle) */}
            <div className="shrink-0 space-y-1">
              <ActivePlayersDeck
                players={activeTablePlayers}
                phase={phase}
                onToggleUserReady={handleToggleUserReady}
                isUserReady={isUserReady}
                nextRoundVotes={nextRoundVotes}
                onOpenTableStats={() => setIsTableStatsOpen(true)}
                bettingTimer={bettingTimer}
                maxTimer={BETTING_DURATION}
                roundNumber={roundNumber}
                tablePool={totalTablePool}
                isTableOwner={Boolean(currentRoom ? currentRoom.hostId === user.id : true)}
                onKickPlayer={handleKickPlayer}
                onTransferLeadership={handleRequestTransferLeadership}
                ping={ping}
                isConnected={isConnected}
                isOnline={isOnline}
                roomId={currentRoom?.id || 'public_table'}
                currentUser={{
                  id: user.id || 'user_me',
                  username: user.username || 'You',
                  avatar: user.avatar || '🎲',
                }}
              />
            </div>

            {/* 3D Three.js Arena Component: Fills remaining open pavilion height */}
            <div
              id="three-arena-pavilion-container"
              className="w-full flex-1 min-h-[160px] overflow-hidden relative"
            >
              <ThreeDiceArena
                className="w-full h-full"
                phase={phase}
                dice={dice}
                lastResult={lastResult}
                tableTheme={tableTheme}
                defaultCameraView={defaultCameraView}
                bettingTimer={bettingTimer}
              />

              {/* Waiting for next round consensus indicator floating on top of 3D view at middle bottom */}
              {phase === 'payout' && (
                <div
                  id="consensus-next-round-overlay"
                  className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-500/50 shadow-2xl text-amber-200 font-mono text-[11px] whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 select-none max-w-[95%]"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                  <span className="font-medium text-amber-100/95 truncate">Waiting for all members to click Next Round</span>
                  <span className="font-bold bg-amber-500/25 px-2 py-0.5 rounded-md border border-amber-400/50 text-amber-300 shrink-0">
                    {nextRoundVotes.length} / {Math.max(1, activeTablePlayers.length)} Ready
                  </span>
                </div>
              )}
            </div>

            {/* Traditional Mobile Betting Cloth Mat: Proportional & elegant across all screen sizes */}
            <div
              id="betting-panel-container"
              className="w-full flex-1 max-h-[310px] sm:max-h-[340px] min-h-0 overflow-hidden flex flex-col justify-between shrink-0"
            >
              <MobileBettingMat
                className="w-full h-full flex flex-col justify-between"
                phase={phase}
                userCoins={user.coins}
                userBets={myBets}
                tableBets={tableBets}
                lastResult={lastResult}
                selectedChip={selectedChip}
                onSelectChip={setSelectedChip}
                onPlaceBet={handlePlaceBet}
                onClearTileBet={handleClearTileBet}
                onClearBets={handleClearBets}
                onDoubleBets={handleDoubleBets}
                onRepeatBets={handleRepeatBets}
                onInsufficientCoins={handleInsufficientCoins}
                canRepeat={Boolean(previousBets && previousBetsTotal > 0)}
                tableMatColor={tableTheme === 'midnight' ? 'royal' : tableTheme === 'crimson' ? 'crimson' : 'green'}
              />
            </div>
          </div>

          {/* 3. Bottom Action Bar: Elevated higher in fullscreen mode for comfortable thumb reach */}
          <div
            className={`p-2 sm:p-2.5 border-t border-amber-900/30 bg-[#060913]/95 backdrop-blur-md shrink-0 ${
              isFullscreen ? 'pb-7 sm:pb-8 pt-2.5 mb-1 sm:mb-1.5' : 'pb-2.5 sm:pb-3'
            }`}
          >
            {phase === 'waiting' ? (
              /* WAITING PHASE: HOST SEES START GAME, MEMBERS SEE WAITING STATUS */
              <div className="w-full flex flex-col gap-2">
                {Boolean(currentRoom ? currentRoom.hostId === user.id : true) ? (
                  <button
                    id="host-start-table-game-btn"
                    onClick={() => handleHostStartGame()}
                    className="w-full py-3.5 sm:py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-serif font-black text-sm sm:text-base tracking-wider shadow-2xl shadow-amber-950/70 border border-amber-200 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Crown className="w-5 h-5 fill-slate-950 text-slate-950" />
                    <span>START GAME 🎲</span>
                    <span className="text-xs font-mono font-bold bg-black/20 px-2.5 py-0.5 rounded-lg">
                      {activeTablePlayers.length} Player{activeTablePlayers.length === 1 ? '' : 's'}
                    </span>
                  </button>
                ) : (
                  <div className="w-full py-3.5 sm:py-4 px-5 rounded-2xl bg-slate-900/95 border border-amber-500/40 flex items-center justify-center gap-3 text-amber-300 font-bold text-sm sm:text-base tracking-wider shadow-2xl animate-pulse">
                    <Clock className="w-5 h-5 text-amber-400 animate-spin" />
                    <span>Waiting for Host to start the game...</span>
                  </div>
                )}
              </div>
            ) : phase === 'payout' ? (
              /* PAYOUT ACTIONS: NEXT ROUND BUTTON */
              <div className="w-full">
                <button
                  id="payout-next-round-btn"
                  onClick={startNextRound}
                  className={`w-full py-3.5 sm:py-4 px-5 rounded-2xl font-serif font-black text-sm sm:text-base tracking-wider shadow-2xl transition-all flex items-center justify-center gap-2.5 border active:scale-[0.98] cursor-pointer ${
                    nextRoundVotes.includes(user.id)
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border-emerald-300 text-slate-950 shadow-emerald-500/25'
                      : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/30 border-amber-200'
                  }`}
                >
                  {nextRoundVotes.includes(user.id) ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 fill-slate-950 text-emerald-400" />
                      <span>READY FOR NEXT ROUND ({nextRoundVotes.length}/{Math.max(1, activeTablePlayers.length)})</span>
                    </>
                  ) : (
                    <>
                      <span>NEXT ROUND 🎲</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            ) : phase === 'rolling' ? (
              /* ROLLING PHASE: Shimmering Status Indicator */
              <div className="w-full py-3.5 sm:py-4 px-5 rounded-2xl bg-slate-900/90 border border-amber-500/30 flex items-center justify-center gap-2.5 text-amber-300 font-bold text-sm sm:text-base tracking-wider shadow-2xl animate-pulse">
                <Sparkles className="w-5 h-5 text-amber-400 animate-spin" />
                <span>Dealer is shaking the brass tumbler...</span>
              </div>
            ) : (
              /* BETTING PHASE: Auto-Roll Status & Toggle Ready */
              <div className="flex items-center gap-2">
                <button
                  id="user-ready-toggle-bar-btn"
                  onClick={handleToggleUserReady}
                  className={`flex-1 min-w-0 py-3.5 sm:py-4 px-4 sm:px-5 rounded-2xl font-serif font-black text-sm sm:text-base tracking-wider shadow-2xl border active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 ${
                    isUserReady
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-300 text-slate-950 shadow-emerald-500/25'
                      : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 border-amber-200 shadow-amber-500/30'
                  }`}
                >
                  <CheckCircle2 className={`w-5 h-5 shrink-0 ${isUserReady ? 'fill-slate-950 text-emerald-400' : 'text-slate-950'}`} />
                  <span className="truncate">
                    {isUserReady
                      ? 'READY FOR ROLL ✓'
                      : totalUserBet > 0
                      ? `READY TO ROLL • ${totalUserBet >= 10000 ? `${(totalUserBet / 1000).toFixed(totalUserBet % 1000 === 0 ? 0 : 1)}K` : totalUserBet.toLocaleString()} 🪙`
                      : 'READY TO ROLL'}
                  </span>
                  <span className="shrink-0 font-mono text-xs sm:text-sm font-black bg-black/20 px-2 py-0.5 rounded-lg">
                    {Math.max(1, bettingTimer)}s
                  </span>
                </button>

                {totalUserBet > 0 && (
                  <button
                    onClick={handleClearBets}
                    title="Clear All Bets"
                    className="py-3.5 sm:py-4 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-rose-400 text-xs sm:text-sm font-mono font-bold transition-all shadow-md shrink-0 flex items-center justify-center active:scale-95"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Return to Main Menu Confirmation Modal */}
      {showExitConfirmModal && (
        <div
          id="exit-game-confirm-backdrop"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowExitConfirmModal(false)}
        >
          <div
            id="exit-game-confirm-card"
            className="w-full max-w-xs sm:max-w-sm rounded-2xl bg-gradient-to-b from-[#0e1424] via-[#090d18] to-[#060810] border border-amber-500/35 p-4 sm:p-5 shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
                <Home className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-serif font-black text-sm sm:text-base text-amber-200">
                  Return to Main Menu?
                </h3>
                <p className="text-[11px] text-slate-400">
                  Are you sure you want to leave the table?
                </p>
              </div>
            </div>

            {totalUserBet > 0 && (
              <div className="mb-3.5 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <span>
                  You have <strong>{totalUserBet.toLocaleString()} 🪙</strong> placed on active bets. Leaving will forfeit this round.
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button
                id="cancel-exit-game-btn"
                onClick={() => setShowExitConfirmModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 font-bold text-xs transition-all active:scale-95"
              >
                Stay & Play
              </button>
              <button
                id="confirm-exit-game-btn"
                onClick={() => {
                  setShowExitConfirmModal(false);
                  handleLeaveTable();
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:brightness-110 text-white font-bold text-xs transition-all shadow-md active:scale-95 border border-rose-400/50"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal (Centralized Audio, Rules, Player Account & Table Settings) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenRules={() => setIsRulesOpen(true)}
        onReturnToMainMenu={() => {
          handleLeaveTable();
          setIsSettingsOpen(false);
        }}
        tableTheme={tableTheme}
        onChangeTableTheme={setTableTheme}
        isInGame={isInGame}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onUpdateUser={handleUpdateUserProfile}
      />

      {/* Player Profile Modal for editing avatar, name, title, email password settings and viewing stats */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => {
          if (user?.id) {
            localStorage.setItem(`langur_burja_account_created_${user.id}`, 'true');
          }
          localStorage.setItem('langur_burja_google_configured', 'true');
          setIsProfileOpen(false);
          setIsFirstTimeUser(false);
        }}
        user={user}
        onUpdateUser={handleUpdateUserProfile}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
        isFirstTime={isFirstTimeUser}
      />

      {/* Supabase Authentication & Entry Choice Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          localStorage.setItem('langur_burja_welcomed', 'true');
          setIsAuthModalOpen(false);
        }}
        onAuthSuccess={handleAuthSuccess}
        canDismiss={true}
      />

      {/* Leaderboard Modal */}
      <ErrorBoundary fallbackTitle="Leaderboard Unavailable">
        <LeaderboardModal
          isOpen={isLeaderboardOpen}
          onClose={() => setIsLeaderboardOpen(false)}
          leaderboard={leaderboardData}
          currentUserId={user.id}
        />
      </ErrorBoundary>

      {/* Bazaar Shop Modal */}
      <ShopModal
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        items={shopItems}
        user={user}
        onPurchase={(itemId) => {
          const item = shopItems.find((i) => i.id === itemId);
          if (item && user.coins >= item.price && !user.inventory.includes(itemId)) {
            setUser((u) => {
              const updated = {
                ...u,
                coins: u.coins - item.price,
                inventory: [...u.inventory, itemId],
              };
              saveLocalProfile(updated);
              syncProfileToSupabase(updated);
              return updated;
            });
            sound.playWinFanfare();
            showToast(`Purchased ${item.name}!`, 'success');
          } else {
            showToast('Not enough coins or already owned!', 'error');
          }
        }}
        onEquip={(itemId) => {
          const item = shopItems.find((i) => i.id === itemId);
          if (item) {
            setUser((u) => {
              const updated = { ...u, equipped: { ...u.equipped } };
              if (item.type === 'dice_skin') updated.equipped.diceSkin = item.id;
              if (item.type === 'table_mat') updated.equipped.tableMat = item.id;
              if (item.type === 'title') updated.equipped.title = item.name;
              saveLocalProfile(updated);
              syncProfileToSupabase(updated);
              return updated;
            });
            sound.playChipSound();
            showToast(`Equipped ${item.name}!`, 'success');
          }
        }}
      />

      {/* Rules Modal */}
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

      {/* Game Table Modal (Create Table, Join Table, Host Lobby) */}
      <GameTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        mode={tableModalTab}
        user={user}
        currentRoom={currentRoom}
        onHostEnterTable={handleHostEnterTable}
        publicRooms={publicRooms}
        onRefreshRooms={handleRefreshPublicRooms}
        onCreateTable={handleCreateTable}
        onJoinByCode={handleJoinByCode}
        onJoinRandom={handleJoinRandom}
        onJoinRoomById={handleJoinRoomById}
        onKickPlayer={handleKickPlayer}
      />

      {/* Table & Player Performance Analytics Modal */}
      <TableStatsModal
        isOpen={isTableStatsOpen}
        onClose={() => setIsTableStatsOpen(false)}
        roomState={currentRoom}
        tablePlayers={activeTablePlayers}
        currentUserId={user.id}
        onKickPlayer={handleKickPlayer}
        onTransferLeadership={handleRequestTransferLeadership}
      />
    </div>
  );
}
