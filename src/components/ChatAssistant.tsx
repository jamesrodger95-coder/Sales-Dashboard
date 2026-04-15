'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoice } from '@/hooks/useVoice';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_ACTIONS = [
  { label: "Today's calls", msg: "What calls do I have today?" },
  { label: 'Pipeline', msg: "Give me a pipeline summary" },
  { label: 'Follow-ups', msg: "Who needs follow-up?" },
  { label: 'Lead sources', msg: "Where do my leads come from?" },
  { label: 'Overdue orders', msg: "Which manufacturing orders are overdue?" },
  { label: 'Direct bookings', msg: "Show direct bookings not in CRM" },
  { label: 'This vs last month', msg: "Compare this month to last month" },
  { label: 'No-show patterns', msg: "What patterns in my no-shows?" },
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { listening, transcript, finalTranscript, supported, speaking, startListening, stopListening, speak, stopSpeaking } = useVoice();

  // Keyboard shortcut: Ctrl/Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Load voice preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('voiceOutputEnabled');
    if (stored === 'true') setVoiceOutputEnabled(true);
  }, []);

  const toggleVoiceOutput = () => {
    const next = !voiceOutputEnabled;
    setVoiceOutputEnabled(next);
    localStorage.setItem('voiceOutputEnabled', String(next));
    if (!next) stopSpeaking();
  };

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update input with live transcript
  useEffect(() => {
    if (listening && transcript) setInput(transcript);
  }, [listening, transcript]);

  const sendMessage = useCallback(async (text: string, isVoice = false) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-8),
          voice: isVoice || voiceOutputEnabled,
        }),
      });
      const data = await res.json();
      const reply = data.reply || 'No response.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      if (voiceOutputEnabled || isVoice) speak(reply);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
    } finally {
      setLoading(false);
    }
  }, [messages, voiceOutputEnabled, speak]);

  // Auto-send when voice input finalizes
  useEffect(() => {
    if (finalTranscript && !listening) {
      sendMessage(finalTranscript, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTranscript, listening]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const toggleMic = () => {
    if (listening) stopListening();
    else startListening();
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-white text-black shadow-lg hover:shadow-xl hover:scale-105 transition-all z-40 flex items-center justify-center"
          title="AI Assistant (Ctrl+K)"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-[420px] h-full sm:h-[540px] bg-[#111] border border-[#1A1A1A] sm:rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A] flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-white">Sales Assistant</h3>
              <p className="text-[10px] text-dim">AI-powered · Ctrl+K · Ctrl+J for Jarvis</p>
            </div>
            <div className="flex items-center gap-1">
              {/* Voice output toggle */}
              <button
                onClick={toggleVoiceOutput}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${voiceOutputEnabled ? 'text-white bg-[#1A1A1A]' : 'text-dim hover:text-white hover:bg-[#1A1A1A]'}`}
                title={voiceOutputEnabled ? 'Voice responses on' : 'Voice responses off'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  {voiceOutputEnabled ? (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  ) : (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 9l-6 6M16 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </>
                  )}
                </svg>
              </button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-white hover:bg-[#1A1A1A] transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted mb-1">Ask me anything about your sales data</p>
                <p className="text-[11px] text-dim">Type or tap the mic to speak</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-white text-black rounded-br-md'
                    : 'bg-[#1A1A1A] text-white/90 rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#1A1A1A] px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-dim rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-dim rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-dim rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {speaking && (
              <div className="flex justify-start">
                <button onClick={stopSpeaking} className="text-[10px] text-dim hover:text-muted transition-colors">
                  Speaking... tap to stop
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions (shown when no messages) */}
          {messages.length === 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map(a => (
                <button key={a.label} onClick={() => sendMessage(a.msg)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-[#222] text-muted hover:text-white hover:border-[#333] transition-colors">
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-[#1A1A1A] flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={listening ? 'Listening...' : 'Ask about leads, orders, schedule...'}
              disabled={loading}
              className="flex-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333] transition-colors disabled:opacity-50"
            />
            {/* Mic button */}
            {supported && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={loading}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all flex-shrink-0 ${
                  listening
                    ? 'bg-danger text-white animate-pulse'
                    : 'bg-[#1A1A1A] text-muted hover:text-white hover:bg-[#222]'
                }`}
                title={listening ? 'Stop listening' : 'Start voice input'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {/* Send button */}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-30 transition-all flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
