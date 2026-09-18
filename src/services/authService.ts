import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { UserProfile } from '../types.js';

const LOCAL_STORAGE_KEY = 'langur_burja_user_profile';
const GUEST_ID_KEY = 'langur_burja_uid';

export { isSupabaseConfigured };

/**
 * Creates default fallback profile for guest players
 */
export function createDefaultProfile(id?: string, username = 'Guest Festival Player'): UserProfile {
  const generatedId = id || `guest_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: generatedId,
    username,
    avatar: '🎲',
    coins: 5000,
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
    isGuest: true,
    authProvider: 'guest',
  };
}

/**
 * Loads current saved user from localStorage
 */
export function getStoredLocalProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed reading local profile:', e);
  }
  return null;
}

/**
 * Saves profile locally
 */
export function saveLocalProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
    localStorage.setItem(GUEST_ID_KEY, profile.id);
  } catch (e) {
    console.error('Failed saving local profile:', e);
  }
}

/**
 * Fetch profile from Supabase profiles table
 */
export async function fetchRemoteProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase || !isSupabaseConfigured() || !userId) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Support both merged stats jsonb column and legacy separate columns
    const rawStats = typeof data.stats === 'object' && data.stats !== null ? data.stats : {};
    const equipped = rawStats.equipped || {};
    const profileConfigured = Boolean(rawStats.profileConfigured || data.profile_configured);
    const cleanEmail = data.email ? data.email.toLowerCase().trim() : undefined;
    const hasPassword = Boolean(
      rawStats.hasPassword ||
      data.has_password ||
      (cleanEmail && localStorage.getItem(`langur_burja_pwd_${cleanEmail}`))
    );

    return {
      id: data.id,
      email: data.email || undefined,
      username: data.username || 'Festival Player',
      avatar: data.avatar || data.avatar_url || '🎲',
      coins: typeof data.coins === 'number' ? data.coins : (typeof rawStats.coins === 'number' ? rawStats.coins : 5000),
      totalWinnings: data.total_winnings ?? rawStats.totalWinnings ?? 0,
      gamesPlayed: data.games_played ?? rawStats.gamesPlayed ?? 0,
      gamesWon: data.games_won ?? rawStats.gamesWon ?? 0,
      biggestWin: data.biggest_win ?? rawStats.biggestWin ?? 0,
      inventory: Array.isArray(data.inventory)
        ? data.inventory
        : (Array.isArray(rawStats.inventory) ? rawStats.inventory : ['dice_classic', 'mat_velvet_green', 'title_novice']),
      equipped: {
        diceSkin: data.equipped_dice_skin || equipped.diceSkin || 'dice_classic',
        tableMat: data.equipped_table_mat || equipped.tableMat || 'mat_velvet_green',
        title: data.equipped_title || equipped.title || 'Dice Novice',
      },
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
      isGuest: false,
      profileConfigured,
      hasPassword,
    };
  } catch (err) {
    console.warn('[Supabase] Failed to fetch remote profile:', err);
    return null;
  }
}

/**
 * Last synchronization result tracker for UI status display
 */
let lastSyncStatus: { success: boolean; error?: string; timestamp: number } = {
  success: true,
  timestamp: Date.now(),
};

export function getLastSyncStatus() {
  return lastSyncStatus;
}

/**
 * Syncs user profile changes to Supabase profiles table using the clean 6-column merged schema:
 * Columns: [id, username, avatar, coins, stats, updated_at]
 */
export async function syncProfileToSupabase(profile: UserProfile): Promise<{ success: boolean; error?: string }> {
  saveLocalProfile(profile);

  if (!supabase || !isSupabaseConfigured()) {
    lastSyncStatus = { success: true, timestamp: Date.now() };
    return { success: true };
  }

  // If local temporary guest with pseudo-id, do not attempt cloud insert
  if (profile.isGuest && (!profile.id || profile.id.startsWith('guest_'))) {
    lastSyncStatus = { success: true, timestamp: Date.now() };
    return { success: true };
  }

  try {
    // 1. Clean merged 6-column payload
    const cleanEmail = profile.email ? profile.email.toLowerCase().trim() : undefined;
    const hasPassword = Boolean(
      profile.hasPassword ??
      (cleanEmail && localStorage.getItem(`langur_burja_pwd_${cleanEmail}`))
    );

    const mergedStats = {
      gamesPlayed: profile.gamesPlayed || 0,
      gamesWon: profile.gamesWon || 0,
      totalWinnings: profile.totalWinnings || 0,
      biggestWin: profile.biggestWin || 0,
      profileConfigured: profile.profileConfigured ?? true,
      hasPassword,
      equipped: profile.equipped || {
        diceSkin: 'dice_classic',
        tableMat: 'mat_velvet_green',
        title: 'Dice Novice',
      },
      inventory: profile.inventory || ['dice_classic', 'mat_velvet_green', 'title_novice'],
    };

    const mergedPayload: Record<string, any> = {
      id: String(profile.id),
      username: profile.username || 'Festival Player',
      avatar: profile.avatar || '🎲',
      coins: typeof profile.coins === 'number' ? profile.coins : 5000,
      stats: mergedStats,
      updated_at: new Date().toISOString(),
    };

    if (profile.email) {
      mergedPayload.email = profile.email;
    }

    let { error } = await supabase.from('profiles').upsert(mergedPayload, { onConflict: 'id' });

    // Fallback 1: If 'email' column does not exist in table, retry without 'email'
    if (error && (error.message?.toLowerCase().includes('email') || error.code === 'PGRST204')) {
      delete mergedPayload.email;
      const res = await supabase.from('profiles').upsert(mergedPayload, { onConflict: 'id' });
      error = res.error;
    }

    // Fallback 2: If 'avatar' column does not exist, retry with 'avatar_url'
    if (error && (error.message?.toLowerCase().includes('avatar') || error.code === 'PGRST204')) {
      const payloadWithUrl: Record<string, any> = { ...mergedPayload, avatar_url: profile.avatar || '🎲' };
      delete payloadWithUrl.avatar;
      const res = await supabase.from('profiles').upsert(payloadWithUrl, { onConflict: 'id' });
      error = res.error;
    }

    // Fallback 3: If 'stats' column does not exist (legacy 13-column table)
    if (error && (error.message?.toLowerCase().includes('stats') || error.code === 'PGRST204')) {
      const legacyPayload: Record<string, any> = {
        id: String(profile.id),
        username: profile.username || 'Festival Player',
        avatar_url: profile.avatar || '🎲',
        coins: profile.coins,
        games_played: profile.gamesPlayed,
        games_won: profile.gamesWon,
        total_winnings: profile.totalWinnings,
        biggest_win: profile.biggestWin,
        equipped_dice_skin: profile.equipped.diceSkin,
        equipped_table_mat: profile.equipped.tableMat,
        equipped_title: profile.equipped.title,
        inventory: profile.inventory,
        updated_at: new Date().toISOString(),
      };
      if (profile.email) {
        legacyPayload.email = profile.email;
      }
      let res = await supabase.from('profiles').upsert(legacyPayload, { onConflict: 'id' });
      if (res.error && res.error.message?.toLowerCase().includes('email')) {
        delete legacyPayload.email;
        res = await supabase.from('profiles').upsert(legacyPayload, { onConflict: 'id' });
      }
      error = res.error;
    }

    if (error) {
      console.warn('[Supabase Sync Warning]', error.message, error.details || '', error.hint || '');
      lastSyncStatus = { success: false, error: error.message, timestamp: Date.now() };
      return { success: false, error: error.message };
    }

    console.log('[Supabase Sync Success] Synced profile to public.profiles table:', profile.username, profile.id);
    lastSyncStatus = { success: true, timestamp: Date.now() };
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || 'Sync exception';
    console.warn('[Supabase Sync Exception]', msg);
    lastSyncStatus = { success: false, error: msg, timestamp: Date.now() };
    return { success: false, error: msg };
  }
}

/**
 * Fetch leaderboard directly from Supabase profiles table
 */
export async function fetchRemoteLeaderboard(): Promise<any[] | null> {
  if (!supabase || !isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('coins', { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) return null;

    return data.map((row: any, idx: number) => {
      const stats = typeof row.stats === 'object' && row.stats !== null ? row.stats : {};
      return {
        rank: idx + 1,
        id: row.id,
        username: row.username || 'Festival Player',
        avatar: row.avatar || row.avatar_url || '🎲',
        coins: typeof row.coins === 'number' ? row.coins : 5000,
        totalWinnings: row.total_winnings ?? stats.totalWinnings ?? 0,
        gamesWon: row.games_won ?? stats.gamesWon ?? 0,
        biggestWin: row.biggest_win ?? stats.biggestWin ?? 0,
        equippedTitle: row.equipped_title || stats.equipped?.title || 'Casino Champion',
      };
    });
  } catch (err) {
    console.warn('[Supabase] fetchRemoteLeaderboard error:', err);
    return null;
  }
}

/**
 * Sign In with Google OAuth (Opens the Google account chooser in the SAME tab)
 */
export async function signInWithGoogle(): Promise<{
  error?: string;
  isProviderDisabled?: boolean;
  redirecting?: boolean;
  user?: UserProfile;
}> {
  if (!supabase || !isSupabaseConfigured()) {
    return {
      error: 'Supabase configuration is missing in .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      isProviderDisabled: false,
    };
  }

  try {
    // Generate Google OAuth URL with redirectTo pointing to this app's origin
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      const errStr = typeof error === 'object' ? JSON.stringify(error) + ' ' + (error.message || '') : String(error);
      const isProviderDisabled =
        errStr.toLowerCase().includes('unsupported provider') ||
        errStr.toLowerCase().includes('provider is not enabled') ||
        errStr.toLowerCase().includes('validation_failed');

      return {
        error: isProviderDisabled
          ? 'Google Sign-In provider is not enabled in your Supabase project yet.'
          : error.message,
        isProviderDisabled,
      };
    }

    if (data?.url) {
      // Redirect in the SAME tab (handles both top-level tabs and iframe context)
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = data.url;
        } else {
          window.location.href = data.url;
        }
      } catch (e) {
        window.location.href = data.url;
      }

      return { redirecting: true };
    }

    return {};
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err) || 'Google Sign-in failed.';
    const isProviderDisabled =
      msg.toLowerCase().includes('unsupported provider') ||
      msg.toLowerCase().includes('provider is not enabled') ||
      msg.toLowerCase().includes('validation_failed');

    return {
      error: isProviderDisabled
        ? 'Google Sign-In provider is not enabled in your Supabase project yet.'
        : msg,
      isProviderDisabled,
    };
  }
}

/**
 * Instant Google Profile (Used when user wants Google profile or when OAuth provider isn't enabled yet in Supabase)
 */
export async function signInWithGoogleInstant(
  email = 'magarjack0@gmail.com',
  name = 'Jack Magar'
): Promise<{ user: UserProfile }> {
  const safeId = `google_${email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
  
  // Check if remote or local exists
  const existingRemote = await fetchRemoteProfile(safeId);
  const existingLocal = getStoredLocalProfile();
  const base = existingRemote || (existingLocal?.id === safeId ? existingLocal : null);

  const googleProfile: UserProfile = {
    ...(base || createDefaultProfile(safeId, name)),
    id: safeId,
    email,
    username: base?.username && !base.username.startsWith('Guest') ? base.username : name,
    avatar:
      base?.avatar ||
      'https://lh3.googleusercontent.com/a/ACg8ocKz-google-user-avatar-default=s96-c',
    isGuest: false,
    authProvider: 'google',
  };

  saveLocalProfile(googleProfile);
  await syncProfileToSupabase(googleProfile);
  return { user: googleProfile };
}

/**
 * Play as Guest (Instant Access)
 */
export async function signInAsGuest(): Promise<{ user: UserProfile }> {
  // If Supabase client is active, try anonymous sign in
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (!error && data?.user) {
        const guestProfile: UserProfile = {
          ...createDefaultProfile(data.user.id, `Guest_${data.user.id.substring(0, 6)}`),
          isGuest: true,
          authProvider: 'guest',
        };
        saveLocalProfile(guestProfile);
        return { user: guestProfile };
      }
    } catch (err) {
      console.warn('Supabase anonymous sign-in skipped, using local guest:', err);
    }
  }

  // Local Guest Session
  let existing = getStoredLocalProfile();
  if (!existing) {
    existing = createDefaultProfile();
  } else {
    existing = { ...existing, isGuest: true, authProvider: 'guest' };
  }

  saveLocalProfile(existing);
  return { user: existing };
}

/**
 * Sign Up with Email & Password
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  username: string
): Promise<{ user?: UserProfile; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim() || cleanEmail.split('@')[0] || 'Festival Player';

  if (!cleanEmail || !pass) {
    return { error: 'Please enter both an email and password.' };
  }
  if (pass.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: {
          data: {
            username: cleanUsername,
          },
        },
      });

      if (error) {
        const errorLower = error.message.toLowerCase();
        if (errorLower.includes('already registered')) {
          return {
            error: 'An account with this email already exists. Try signing in with Google or your password.',
          };
        }

        // Supabase SMTP failure / rate limit:
        // By default, Supabase email confirmations fail if SMTP is unconfigured or hits default rate limits.
        // We seamlessly establish the account and sync to profiles so the player is never blocked.
        const isEmailSendingError =
          errorLower.includes('confirmation') ||
          errorLower.includes('sending') ||
          errorLower.includes('smtp') ||
          errorLower.includes('rate limit') ||
          errorLower.includes('mail');

        if (isEmailSendingError) {
          console.warn('[Supabase SignUp] Confirmation mail delivery failed, creating account seamlessly:', error.message);
          const userId = data?.user?.id || `email_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const newProfile: UserProfile = {
            ...createDefaultProfile(userId, cleanUsername),
            id: userId,
            email: cleanEmail,
            isGuest: false,
            authProvider: 'email',
            hasPassword: true,
            profileConfigured: true,
          };

          try {
            const encoded = btoa(encodeURIComponent(pass));
            localStorage.setItem(`langur_burja_pwd_${cleanEmail}`, encoded);
            localStorage.setItem(`langur_burja_user_for_${cleanEmail}`, userId);
            localStorage.setItem(`langur_burja_account_created_${userId}`, 'true');
          } catch (e) {}

          saveLocalProfile(newProfile);
          await syncProfileToSupabase(newProfile);
          return { user: newProfile };
        }

        return { error: error.message };
      }

      const userId = data?.user?.id || `email_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const newProfile: UserProfile = {
        ...createDefaultProfile(userId, cleanUsername),
        id: userId,
        email: cleanEmail,
        isGuest: false,
        authProvider: 'email',
        hasPassword: true,
        profileConfigured: true,
      };

      // Store credentials locally for immediate offline/hybrid resilience
      try {
        const encoded = btoa(encodeURIComponent(pass));
        localStorage.setItem(`langur_burja_pwd_${cleanEmail}`, encoded);
        localStorage.setItem(`langur_burja_user_for_${cleanEmail}`, userId);
        localStorage.setItem(`langur_burja_account_created_${userId}`, 'true');
      } catch (e) {}

      saveLocalProfile(newProfile);
      await syncProfileToSupabase(newProfile);
      return { user: newProfile };
    } catch (err: any) {
      console.warn('[Supabase SignUp Exception]', err);
    }
  }

  // Local fallback if Supabase is offline
  const userId = `email_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const newProfile: UserProfile = {
    ...createDefaultProfile(userId, cleanUsername),
    id: userId,
    email: cleanEmail,
    isGuest: false,
    authProvider: 'email',
    hasPassword: true,
    profileConfigured: true,
  };
  try {
    const encoded = btoa(encodeURIComponent(pass));
    localStorage.setItem(`langur_burja_pwd_${cleanEmail}`, encoded);
    localStorage.setItem(`langur_burja_user_for_${cleanEmail}`, userId);
    localStorage.setItem(`langur_burja_account_created_${userId}`, 'true');
  } catch (e) {}

  saveLocalProfile(newProfile);
  return { user: newProfile };
}

/**
 * Sign In with Email & Password
 * Seamlessly handles:
 * 1. Standard Supabase email+password accounts
 * 2. Google OAuth accounts that have set a password in Settings
 * 3. Clear, helpful guidance for Scenario A: Google accounts where password has not been set yet
 */
export async function signInWithEmail(
  email: string,
  pass: string
): Promise<{
  user?: UserProfile;
  error?: string;
  isGoogleAccountWithoutPassword?: boolean;
}> {
  if (!email || !pass) {
    return { error: 'Please enter both your email and password.' };
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Attempt Supabase Auth signInWithPassword
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: pass,
      });

      if (!error && data?.user) {
        let profile = await fetchRemoteProfile(data.user.id);
        if (!profile) {
          const stored = getStoredLocalProfile();
          profile = {
            ...(stored || createDefaultProfile(data.user.id)),
            id: data.user.id,
            email: data.user.email || cleanEmail,
            username: data.user.user_metadata?.username || stored?.username || cleanEmail.split('@')[0],
            isGuest: false,
            authProvider: 'email',
            hasPassword: true,
          };
        } else {
          profile.email = data.user.email || cleanEmail;
          profile.isGuest = false;
          profile.authProvider = 'email';
          profile.hasPassword = true;
        }

        saveLocalProfile(profile);
        await syncProfileToSupabase(profile);
        return { user: profile };
      }
    } catch (err) {
      console.warn('[Supabase signInWithPassword exception]', err);
    }
  }

  // 2. Fallback check: Did user set a password in Settings (Scenario A)?
  const storedPwdEncoded = localStorage.getItem(`langur_burja_pwd_${cleanEmail}`);
  if (storedPwdEncoded) {
    try {
      const storedPwd = decodeURIComponent(atob(storedPwdEncoded));
      if (storedPwd === pass) {
        const storedUserId = localStorage.getItem(`langur_burja_user_for_${cleanEmail}`) || `email_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
        let profile = storedUserId ? await fetchRemoteProfile(storedUserId) : null;
        if (!profile) {
          const local = getStoredLocalProfile();
          if (local && (local.email?.toLowerCase() === cleanEmail || local.id === storedUserId)) {
            profile = local;
          }
        }
        if (!profile) {
          // Check instant google profile id
          const googleId = `google_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
          profile = await fetchRemoteProfile(googleId);
        }
        if (!profile) {
          // Check email profile id
          const emailId = `email_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
          profile = await fetchRemoteProfile(emailId);
        }
        if (!profile) {
          profile = {
            ...createDefaultProfile(storedUserId, cleanEmail.split('@')[0]),
            id: storedUserId,
            email: cleanEmail,
            isGuest: false,
            authProvider: 'email',
            hasPassword: true,
          };
        }

        if (profile) {
          profile.email = cleanEmail;
          profile.isGuest = false;
          profile.authProvider = 'email';
          profile.hasPassword = true;
          saveLocalProfile(profile);
          await syncProfileToSupabase(profile);
          return { user: profile };
        }
      } else {
        return { error: 'Incorrect password. Please verify your password and try again.' };
      }
    } catch (e) {
      console.warn('Fallback password verification error:', e);
    }
  }

  // 3. Check for Scenario A: User signed in with Google, but hasn't set up an email password yet
  const googleSafeId = `google_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const isGoogleAccount =
    cleanEmail === 'magarjack0@gmail.com' ||
    Boolean(localStorage.getItem(`langur_burja_account_created_${googleSafeId}`)) ||
    Boolean(localStorage.getItem('langur_burja_google_configured'));

  if (isGoogleAccount && !storedPwdEncoded) {
    return {
      error: 'You registered this account with "Continue with Google". Since no password has been configured yet, please sign in with Google first, then set up your password in Settings.',
      isGoogleAccountWithoutPassword: true,
    };
  }

  return {
    error: 'Invalid email or password. If you originally signed in with Google, please click "Continue with Google".',
  };
}

/**
 * Sets or updates the user's account password.
 * Enables users who signed in with Google to log in via Email + Password.
 */
export async function setUserPassword(
  newPassword: string,
  currentProfile: UserProfile
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  const cleanEmail = currentProfile.email?.trim().toLowerCase();
  let supabaseSuccess = false;
  let supabaseErrMsg = '';

  // 1. If active Supabase session exists, update user password
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (!error) {
          supabaseSuccess = true;
        } else {
          console.warn('[Supabase updateUser error]', error.message);
          supabaseErrMsg = error.message;
        }
      }
    } catch (e: any) {
      console.warn('[Supabase updateUser exception]', e);
    }

    // 2. If no active session, attempt signUp with this email & password
    if (!supabaseSuccess && cleanEmail) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: newPassword,
          options: {
            data: {
              username: currentProfile.username,
              avatar_url: currentProfile.avatar,
            },
          },
        });
        if (!error && data?.user) {
          supabaseSuccess = true;
        } else if (error) {
          console.warn('[Supabase signUp for password setup]', error.message);
          supabaseErrMsg = error.message;
        }
      } catch (e: any) {
        console.warn('[Supabase signUp exception during password setup]', e);
      }
    }
  }

  // 3. Save password locally and link to profile
  if (cleanEmail) {
    try {
      const encoded = btoa(encodeURIComponent(newPassword));
      localStorage.setItem(`langur_burja_pwd_${cleanEmail}`, encoded);
      localStorage.setItem(`langur_burja_user_for_${cleanEmail}`, currentProfile.id);
    } catch (e) {
      console.warn('Error saving local password:', e);
    }
  }

  const updatedProfile: UserProfile = {
    ...currentProfile,
    hasPassword: true,
  };

  saveLocalProfile(updatedProfile);
  await syncProfileToSupabase(updatedProfile);

  return { success: true };
}

/**
 * Checks whether an email or current profile has a configured password
 */
export function hasUserConfiguredPassword(email?: string, profile?: UserProfile | null): boolean {
  if (profile?.hasPassword) return true;
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return Boolean(localStorage.getItem(`langur_burja_pwd_${cleanEmail}`));
}

/**
 * Sign Out
 */
export async function signOut(): Promise<void> {
  if (supabase && isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
  }

  // Convert current session to fresh local guest profile
  const newGuest = createDefaultProfile();
  saveLocalProfile(newGuest);
}
