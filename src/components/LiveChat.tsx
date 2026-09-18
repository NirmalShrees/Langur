import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { ChatMessage, FloatingReaction } from '../types.js';

interface LiveChatProps {
  messages: ChatMessage[];
  floatingReactions: FloatingReaction[];
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  currentUserId: string;
}

const QUICK_REACTIONS = ['👑', '🚩', '🎲', '💰', '🔥', '😂', '👏', '🍀'];

export const LiveChat: React.FC<LiveChatProps> = ({
  messages,
  floatingReactions,
  onSendMessage,
  onSendReaction,
  currentUserId,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div
      id="live-chat-root"
      className="relative bg-slate-950/90 rounded-2xl border border-amber-900/30 p-4 shadow-xl flex flex-col h-full overflow-hidden"
    >
      {/* Floating Reactions Overlay (rendered over chat or screen) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {floatingReactions.map((rx) => (
          <div
            key={rx.id}
            className="absolute bottom-16 text-3xl animate-[floatUp_3s_ease-out_forwards]"
            style={{
              left: `${20 + Math.random() * 60}%`,
            }}
          >
            {rx.emoji}
          </div>
        ))}
      </div>

      {/* Chat Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <h3 className="font-extrabold text-sm text-amber-100 uppercase tracking-wider flex items-center gap-2">
          <span>Table Chat</span>
        </h3>
        <span className="text-[11px] text-slate-400">Live Reactions</span>
      </div>

      {/* Quick Reaction Bar */}
      <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-slate-800/60 overflow-x-auto">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSendReaction(emoji)}
            title={`Send ${emoji} reaction`}
            className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-base hover:scale-110 active:scale-95 transition-all border border-slate-800 shrink-0"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[220px] text-xs">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 italic py-6">
            Say hello to your fellow Langur Burja players!
          </div>
        )}
        {messages.map((m) => {
          if (m.isSystem) {
            return (
              <div
                key={m.id}
                className="text-center text-[11px] text-amber-400/80 bg-amber-500/10 py-1 px-2 rounded-lg border border-amber-500/20 italic"
              >
                {m.text}
              </div>
            );
          }

          const isMe = m.senderId === currentUserId;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <span>{m.senderAvatar}</span>
                <span className="font-semibold">{m.senderName}</span>
              </div>
              <div
                className={`px-3 py-1.5 rounded-xl max-w-[85%] break-words ${
                  isMe
                    ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none'
                    : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSubmit} className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-1.5">
        <input
          id="chat-input-field"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a chat message..."
          maxLength={120}
          className="flex-1 bg-slate-900 text-slate-100 text-xs px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
        />
        <button
          id="chat-send-btn"
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
