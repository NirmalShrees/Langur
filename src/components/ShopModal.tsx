import React, { useState } from 'react';
import { X, ShoppingBag, Check, Sparkles, Coins, Crown, Layers, Award } from 'lucide-react';
import { ShopItem, UserProfile } from '../types.js';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ShopItem[];
  user: UserProfile;
  onPurchase: (itemId: string) => void;
  onEquip: (itemId: string) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  items,
  user,
  onPurchase,
  onEquip,
}) => {
  const [activeTab, setActiveTab] = useState<'dice_skin' | 'table_mat' | 'title'>('dice_skin');

  if (!isOpen) return null;

  const filteredItems = items.filter((i) => i.type === activeTab);

  const isOwned = (itemId: string) => user.inventory.includes(itemId);
  const isEquipped = (item: ShopItem) => {
    if (item.type === 'dice_skin') return user.equipped.diceSkin === item.id;
    if (item.type === 'table_mat') return user.equipped.tableMat === item.id;
    if (item.type === 'title') return user.equipped.title === item.name;
    return false;
  };

  const getItemVisual = (item: ShopItem) => {
    if (item.id === 'dice_gold') {
      return {
        icon: '🎲',
        accentColor: 'from-amber-400 to-yellow-600',
        ringColor: 'border-amber-400/60',
        badge: '24K Gilded',
      };
    }
    if (item.id === 'dice_ruby') {
      return {
        icon: '🎲',
        accentColor: 'from-rose-500 to-red-700',
        ringColor: 'border-rose-500/60',
        badge: 'Imperial Lacquer',
      };
    }
    if (item.id === 'mat_velvet_crimson') {
      return {
        icon: '🎴',
        accentColor: 'from-red-600 to-rose-900',
        ringColor: 'border-red-500/60',
        badge: 'Scarlet Felt',
      };
    }
    if (item.id === 'mat_velvet_midnight') {
      return {
        icon: '🌌',
        accentColor: 'from-indigo-600 to-slate-900',
        ringColor: 'border-indigo-400/60',
        badge: 'Celestial Velvet',
      };
    }
    return {
      icon: '👑',
      accentColor: 'from-amber-500 to-purple-700',
      ringColor: 'border-purple-400/60',
      badge: 'Royal Decree',
    };
  };

  return (
    <div
      id="shop-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 overflow-x-hidden"
    >
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 via-[#0d121f] to-slate-950 rounded-3xl border border-amber-500/30 shadow-2xl p-4 sm:p-6 overflow-x-hidden flex flex-col max-h-[88vh]">
        {/* Ambient lighting accents */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between pb-3.5 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 shrink-0">
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg sm:text-xl font-black text-amber-100 font-serif tracking-wide">
                  Royal Bazaar
                </h2>
                <span className="text-[10px] font-nepali text-amber-400/90 font-bold hidden xs:inline">
                  (शाही बजार)
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Exclusive handcrafted dice skins, velvet table mats & honor titles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* User Coin Balance Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-amber-500/40 shadow-inner">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="font-mono font-black text-amber-200 text-xs sm:text-sm">
                {user.coins.toLocaleString()}
              </span>
            </div>

            <button
              id="close-shop-btn"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 active:scale-95 transition-all shadow-sm"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Elegant Category Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-3.5 pb-2.5 border-b border-slate-800/80 shrink-0">
          {[
            { id: 'dice_skin', label: 'Dice Skins', icon: '🎲' },
            { id: 'table_mat', label: 'Table Mats', icon: '🎴' },
            { id: 'title', label: 'Royal Titles', icon: '👑' },
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Items Grid with Custom Luxury Scrollbar */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar mt-3.5 space-y-2.5 sm:space-y-3 pr-1.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {filteredItems.map((item) => {
              const owned = isOwned(item.id);
              const equipped = isEquipped(item);
              const canAfford = user.coins >= item.price;
              const visual = getItemVisual(item);

              return (
                <div
                  key={item.id}
                  className={`relative p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                    equipped
                      ? 'bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border-amber-500/60 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900/70 hover:bg-slate-850/80 border-slate-800/90 hover:border-slate-700/80'
                  }`}
                >
                  <div>
                    {/* Top row: Visual token & equipped indicator */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${visual.accentColor} border ${visual.ringColor} flex items-center justify-center text-xl shadow-md`}
                        >
                          {visual.icon}
                        </div>
                        <div>
                          <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-amber-400/90">
                            {visual.badge}
                          </span>
                          <h4 className="font-extrabold text-sm sm:text-base text-slate-100 font-serif leading-tight">
                            {item.name}
                          </h4>
                        </div>
                      </div>

                      {equipped && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-slate-950 flex items-center gap-1 shadow-sm shrink-0">
                          <Check className="w-2.5 h-2.5" /> Equipped
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] sm:text-xs text-slate-400 mb-3.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Bottom Action / Price */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-amber-300">
                      {item.price === 0 ? (
                        <span className="text-emerald-400 text-xs">Standard Starter</span>
                      ) : (
                        <>
                          <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{item.price.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400 font-normal">Coins</span>
                        </>
                      )}
                    </div>

                    <div>
                      {equipped ? (
                        <button
                          disabled
                          className="px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-slate-400 text-xs font-bold cursor-default flex items-center gap-1"
                        >
                          <Check className="w-3 h-3 text-amber-400" />
                          <span>Active</span>
                        </button>
                      ) : owned ? (
                        <button
                          onClick={() => onEquip(item.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md hover:shadow-emerald-600/30 active:scale-95"
                        >
                          Equip
                        </button>
                      ) : (
                        <button
                          onClick={() => onPurchase(item.id)}
                          disabled={!canAfford}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black transition-all shadow-md hover:shadow-amber-500/20 active:scale-95 disabled:opacity-40 disabled:hover:from-amber-500 disabled:pointer-events-none"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Unlock</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="text-[11px] text-slate-400 truncate max-w-[280px]">
            Equipped items display live on the 3D table & in multiplayer
          </span>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
