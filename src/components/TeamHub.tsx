import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, TeamMember, VpnLocation } from '../types';
import { useStoredList } from '../lib/store';
import { useChatSocket, type ChatSocketMessage } from '../lib/ws';
import { formatClockTime, formatRelativeTime } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/mobile-api';
import { Avatar } from './Avatar';
import { Users, Send, Database, MessageSquare } from 'lucide-react';

interface TeamHubProps {
  activeVpnLocation: VpnLocation | null;
}

export const TeamHub: React.FC<TeamHubProps> = ({ activeVpnLocation }) => {
  const { user } = useAuth();
  const { items: chatMessages, update: saveChat, error } = useStoredList<ChatMessage>('chat', []);
  const [inputText, setInputText] = useState<string>('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    apiJson<Array<{ id: string; name: string; role: string; avatar: string | null }>>('/api/team/members')
      .then(rows => {
        if (cancelled) return;
        setMembers(rows.map(row => ({
          id: row.id,
          name: row.name,
          role: row.role,
          avatar: row.avatar ?? undefined,
          status: 'offline',
          currentActivity: 'Waypoint workspace',
          vpnLocation: 'Unknown',
        })));
        setMemberError(null);
      })
      .catch(err => {
        if (!cancelled) setMemberError(err instanceof Error ? err.message : 'Failed to load team directory');
      });
    return () => { cancelled = true; };
  }, []);

  // Keep a ref to the latest messages so the socket handler can read them without
  // closing over a stale snapshot.
  const latestMessages = useRef<ChatMessage[]>(chatMessages);
  latestMessages.current = chatMessages;

  const handleSocketMessage = useCallback((msg: ChatSocketMessage) => {
    if (msg.type === 'chat:new') {
      const current = latestMessages.current;
      if (current.some(m => m.id === msg.message.id)) return;
      saveChat([...current, {
        id: msg.message.id,
        senderName: msg.message.senderName,
        text: msg.message.text,
        timestamp: msg.message.timestamp,
        vpnNode: msg.message.vpnNode,
      }]);
    } else if (msg.type === 'presence') {
      setOnlineIds(new Set(msg.online));
    }
  }, [saveChat]);

  useChatSocket(user?.id ?? null, handleSocketMessage);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const currentNodeLabel = activeVpnLocation
      ? `${activeVpnLocation.city} (proxy)`
      : 'No proxy connected';

    try {
      const sent = await apiJson<ChatMessage>('/api/chat', 'POST', {
        text: inputText.trim(),
        vpnNode: currentNodeLabel,
      });
      if (!chatMessages.some(message => message.id === sent.id)) {
        saveChat([...chatMessages, sent]);
      }
      setInputText('');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-65px)] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Team Directory Sidebar */}
      <div className="w-full md:w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Team Directory</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Workspace directory · live presence.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {memberError && <p className="text-xs text-red-500">{memberError}</p>}
          {members.map(member => {
            const online = onlineIds.has(member.id);
            return (
              <div key={member.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <Avatar name={member.name} src={member.avatar} className="w-8 h-8 text-[10px]" />
                  <span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{member.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{member.role} · {online ? 'online' : 'offline'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team Chat Channel */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">#global-engineering</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <Database className="w-3 h-3" />
            <span>
              {error ? `Not syncing: ${error}` : 'Shared workspace messages · stored on this server'}
            </span>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {chatMessages.map(msg => (
            <div key={msg.id} className="flex items-start gap-3">
              <Avatar name={msg.senderName} src={msg.senderAvatar} className="w-8 h-8 text-[10px] mt-1" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{msg.senderName}</span>
                  <span className="text-[10px] text-slate-400 font-mono" title={formatRelativeTime(msg.timestamp)}>{formatClockTime(msg.timestamp)}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-mono text-slate-500">
                    {msg.vpnNode}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 text-xs text-slate-800 dark:text-slate-200 max-w-2xl">
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Message Input Form */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Message #global-engineering..."
            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-500 transition-colors shadow-sm flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
