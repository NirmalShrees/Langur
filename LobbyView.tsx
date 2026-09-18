import React, { useState } from 'react';
import { Crown, Users, PlusCircle, LogIn, Sparkles, Coins, Trophy, ShoppingBag, BookOpen } from 'lucide-react';
import { UserProfile } from '../types.js';
import { UserAvatar } from './UserAvatar.js';

interface LobbyViewProps {
  user: UserProfile;
  publicRooms: { id: string; name: string; code: string; playerCount: number; phase: string; timer: number }[];
  onJoinRoom: (roomId: string) => void;
  onJoinByCode: (code: string) => void;
  onCreateRoom: (name: string, isPrivate: boolean, settings: any) => void;
  onUpdateProfile: (username: string, avatar: string) => void;
  onOpenLeaderboard: () => void;
  onOpenShop: () => void;
  onOpenRules: () => void;
  onClaimFaucet: () => void;
}

const AVATAR_OPTIONS = ['🎲', '👑', '🦁', '⚡', '🌸', '🦅', '💎', '🐉', '🐯', '🌟'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  user,
  publicRooms,
  onJoinRoom,
  onJoinByCode,
  onCreateRoom,
  onUpdateProfile,
  onOpenLeaderboard,
  onOpenShop,
  onOpenRules,
  onClaimFaucet,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [bettingTimer, setBettingTimer] = useState(18);

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState(user.username);
  const [editAvatar, setEditAvatar] = useState(user.avatar);

  const handleJoinByCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCodeInput.trim()) return;
    onJoinByCode(roomCodeInput.trim().toUpperCase());
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom(newRoomName, isPrivate, { bettingDuration: bettingTimer });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile(editUsername, editAvatar);
    setIsEditingProfile(false);
  };

  return (
    <div id="lobby-view-root" className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950/80 border border-amber-500/30 p-6 sm:p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="font-game-title font-bold">LANGUR BURJA</span>
              <span className="font-nepali-title text-amber-200">लङ्गुर बुर्जा</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-amber-100 font-serif tracking-tight">
              Crown, Flag & Fortune
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              Step into real-time Himalayan pavilions. Roll the 6 royal dice, wager your coins across Jhanda, Burja, Itta, Paan, Hukum & Chidi, and take the throne as Table Host!
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-1">
              <button
                onClick={onOpenRules}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-200 border border-slate-700 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span>How to Play & Multipliers</span>
              </button>
              <button
                onClick={onOpenLeaderboard}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-200 border border-slate-700 transition-colors"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Leaderboard</span>
              </button>
              <button
                onClick={onOpenShop}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-200 border border-slate-700 transition-colors"
              >
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span>Coin Shop</span>
              </button>
            </div>
          </div>

          {/* Quick Player Profile Card */}
          <div className="w-full md:w-80 bg-slate-950/90 rounded-2xl border border-amber-500/30 p-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-2xl border border-slate-700 overflow-hidden shrink-0">
                  <UserAvatar avatar={user.avatar} name={user.username} size="md" className="w-full h-full rounded-none" />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-slate-100">{user.username}</div>
                  <div className="text-[11px] text-purple-300">{user.equipped.title}</div>
                </div>
              </div>

              <button
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                className="text-xs text-amber-400 hover:underline font-bold"
              >
                {isEditingProfile ? 'Close' : 'Edit'}
              </button>
            </div>

            {/* In-Card Profile Edit Form */}
            {isEditingProfile ? (
              <form onSubmit={handleSaveProfile} className="mt-3 space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Player Name</label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    maxLength={16}
                    className="w-full bg-slate-900 text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Select Avatar</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {AVATAR_OPTIONS.map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setEditAvatar(av)}
                        className={`p-1 text-lg rounded-lg border transition-all ${
                          editAvatar === av ? 'border-amber-400 bg-amber-500/20' : 'border-slate-800 bg-slate-900'
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
                >
                  Save Profile
                </button>
              </form>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400">Coins Balance:</span>
                  <span className="font-mono font-black text-amber-300 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    {user.coins.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>Games Won: {user.gamesWon}</span>
                  <span>Biggest Win: +{user.biggestWin.toLocaleString()}</span>
                </div>
                <button
                  onClick={onClaimFaucet}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black flex items-center justify-center gap-1.5 shadow"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Claim +1,000 Free Coins</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Tables List & Join/Create Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Public Active Tables */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-amber-100 font-serif flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              <span>Active Pavilions & Tables</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              {publicRooms.length} Public Room{publicRooms.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {publicRooms.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="font-extrabold text-slate-100 text-sm sm:text-base">{r.name}</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700">
                      {r.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{r.playerCount} Players</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="capitalize">{r.phase} ({r.timer}s)</span>
                    </div>
                  </div>
                </div>

                <button
                  id={`join-room-${r.id}`}
                  onClick={() => onJoinRoom(r.id)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow"
                >
                  Join Table Now
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: Join by Code & Create Table Card */}
        <div className="space-y-4">
          {/* Join with Room Code */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <h3 className="font-extrabold text-sm text-amber-100 uppercase tracking-wider flex items-center gap-2">
              <LogIn className="w-4 h-4 text-amber-400" />
              <span>Join with Room Code</span>
            </h3>
            <p className="text-xs text-slate-400">
              Have an invitation code from a friend? Enter it below:
            </p>

            <form onSubmit={handleJoinByCodeSubmit} className="flex gap-2">
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="e.g. ROYAL1"
                maxLength={8}
                className="flex-1 bg-slate-950 text-slate-100 text-xs px-3 py-2.5 rounded-xl border border-slate-700 uppercase font-mono font-bold focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={!roomCodeInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all disabled:opacity-40"
              >
                Join
              </button>
            </form>
          </div>

          {/* Create Custom Room */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-amber-900/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-amber-100 uppercase tracking-wider flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-amber-400" />
                <span>Host Your Own Table</span>
              </h3>
              <Crown className="w-4 h-4 text-amber-400" />
            </div>

            <p className="text-xs text-slate-400">
              Create a custom pavilion where you control the betting timer, rolls, and settings!
            </p>

            {isCreating ? (
              <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs pt-1">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Table Name</label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Maharajah's VIP Club"
                    maxLength={24}
                    className="w-full bg-slate-950 text-slate-100 px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Betting Timer: {bettingTimer}s
                  </label>
                  <div className="flex gap-2">
                    {[10, 15, 20, 30].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setBettingTimer(t)}
                        className={`flex-1 py-1.5 rounded-lg border font-mono font-bold ${
                          bettingTimer === t
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800'
                        }`}
                      >
                        {t}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="private-check"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500"
                  />
                  <label htmlFor="private-check" className="text-slate-300">
                    Private Table (joinable via Room Code only)
                  </label>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow"
                  >
                    Create & Host
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs transition-all shadow"
              >
                Configure & Open Table
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
