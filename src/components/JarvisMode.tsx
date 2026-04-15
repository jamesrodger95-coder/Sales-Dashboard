'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoice } from '@/hooks/useVoice';

type Mode = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function JarvisMode() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [displayedResponse, setDisplayedResponse] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const streamTimersRef = useRef<NodeJS.Timeout[]>([]);
  const { listening, transcript, finalTranscript, startListening, stopListening, speak, stopSpeaking } = useVoice();

  // Keyboard shortcut: Ctrl/Cmd+J toggles Jarvis, Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('jarvis:open', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('jarvis:open', openHandler);
    };
  }, [open]);

  // Clean up on close
  useEffect(() => {
    if (!open) {
      stopListening();
      stopSpeaking();
      setMode('idle');
      setDisplayedResponse('');
      setUserQuery('');
      streamTimersRef.current.forEach(t => clearTimeout(t));
      streamTimersRef.current = [];
    } else {
      // Auto-start listening when opened
      setTimeout(() => {
        startListening();
        setMode('listening');
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update user query display while listening
  useEffect(() => {
    if (listening && transcript) setUserQuery(transcript);
  }, [listening, transcript]);

  // Sync listening state with mode
  useEffect(() => {
    if (open && listening) setMode('listening');
  }, [open, listening]);

  const sendQuery = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setUserQuery(text);
    setMode('thinking');
    setDisplayedResponse('');
    historyRef.current.push({ role: 'user', content: text });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: historyRef.current.slice(-8),
          voice: true,
        }),
      });
      const data = await res.json();
      const reply = data.reply || 'Sorry, I have no response for that.';
      historyRef.current.push({ role: 'assistant', content: reply });

      // Speak and stream text word by word
      setMode('speaking');
      speak(reply);

      const words = reply.split(/\s+/);
      let displayed = '';
      streamTimersRef.current.forEach(t => clearTimeout(t));
      streamTimersRef.current = words.map((word: string, i: number) =>
        setTimeout(() => {
          displayed += (i > 0 ? ' ' : '') + word;
          setDisplayedResponse(displayed);
          if (i === words.length - 1) {
            // After speaking, return to idle so James can speak again
            setTimeout(() => {
              if (open) setMode('idle');
            }, 500);
          }
        }, i * 80)
      );
    } catch {
      setDisplayedResponse('Sorry, I had trouble with that.');
      setMode('idle');
    }
  }, [speak, open]);

  // When finalTranscript arrives, send it
  useEffect(() => {
    if (finalTranscript && !listening && open) {
      sendQuery(finalTranscript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTranscript, listening, open]);

  // Spacebar push-to-talk
  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && mode !== 'listening') {
        e.preventDefault();
        setDisplayedResponse('');
        startListening();
        setMode('listening');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && listening) {
        e.preventDefault();
        stopListening();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [open, mode, listening, startListening, stopListening]);

  const toggleMic = () => {
    if (mode === 'speaking') {
      stopSpeaking();
      setMode('idle');
      return;
    }
    if (listening) { stopListening(); return; }
    setDisplayedResponse('');
    startListening();
    setMode('listening');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center select-none"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      {/* Top label */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <p className="text-[10px] tracking-[0.4em] text-[#444] uppercase">Jarvis</p>
      </div>

      {/* Close button */}
      <button
        onClick={() => setOpen(false)}
        className="absolute top-6 right-6 w-9 h-9 flex items-center justify-center rounded-full text-dim hover:text-white hover:bg-white/5 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Orb */}
      <div className="relative flex items-center justify-center mb-12">
        {/* Expanding rings (listening/speaking) */}
        {(mode === 'listening' || mode === 'speaking') && (
          <>
            <div className={`absolute inset-0 rounded-full border border-data-blue/30 ${mode === 'listening' ? 'animate-ring-1' : 'animate-ripple-1'}`} style={{ width: 260, height: 260 }} />
            <div className={`absolute inset-0 rounded-full border border-data-blue/20 ${mode === 'listening' ? 'animate-ring-2' : 'animate-ripple-2'}`} style={{ width: 260, height: 260 }} />
          </>
        )}

        {/* Main orb */}
        <div
          onClick={toggleMic}
          className={`relative rounded-full cursor-pointer transition-all duration-500 ${
            mode === 'listening' ? 'animate-pulse-fast' :
            mode === 'thinking' ? 'animate-spin-slow' :
            mode === 'speaking' ? 'animate-pulse-speak' :
            'animate-breathe'
          }`}
          style={{
            width: 220, height: 220,
            background: mode === 'listening'
              ? 'radial-gradient(circle at 30% 30%, rgba(96, 165, 250, 0.8), rgba(168, 85, 247, 0.4) 40%, transparent 70%)'
              : mode === 'thinking'
              ? 'radial-gradient(circle at 30% 30%, rgba(168, 85, 247, 0.6), rgba(96, 165, 250, 0.3) 40%, transparent 70%)'
              : mode === 'speaking'
              ? 'radial-gradient(circle at 30% 30%, rgba(52, 211, 153, 0.7), rgba(96, 165, 250, 0.4) 40%, transparent 70%)'
              : 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.6), rgba(96, 165, 250, 0.2) 40%, transparent 70%)',
            boxShadow: mode === 'listening'
              ? '0 0 100px rgba(96, 165, 250, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.1)'
              : mode === 'speaking'
              ? '0 0 100px rgba(52, 211, 153, 0.5), inset 0 0 60px rgba(255, 255, 255, 0.1)'
              : '0 0 80px rgba(255, 255, 255, 0.15), inset 0 0 40px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Inner glow */}
          <div className="absolute inset-4 rounded-full" style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.15), transparent 60%)',
          }} />

          {/* Thinking dots orbit */}
          {mode === 'thinking' && (
            <div className="absolute inset-0 rounded-full animate-spin" style={{ animationDuration: '2s' }}>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
              <div className="absolute top-1/2 right-2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/60" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/40" />
            </div>
          )}
        </div>
      </div>

      {/* Status / transcript / response */}
      <div className="w-full max-w-2xl px-6 text-center min-h-[140px]">
        {mode === 'listening' && (
          <>
            <p className="text-[11px] tracking-[0.2em] uppercase text-dim mb-3 animate-pulse">Listening</p>
            {userQuery && <p className="text-white text-xl leading-relaxed">{userQuery}</p>}
          </>
        )}
        {mode === 'thinking' && (
          <>
            <p className="text-[11px] tracking-[0.2em] uppercase text-dim mb-3">Analysing</p>
            {userQuery && <p className="text-muted text-base leading-relaxed italic">&ldquo;{userQuery}&rdquo;</p>}
          </>
        )}
        {mode === 'speaking' && displayedResponse && (
          <>
            <p className="text-[11px] tracking-[0.2em] uppercase text-dim mb-3">Jarvis</p>
            <p className="text-gray-300 text-lg leading-relaxed">{displayedResponse}</p>
          </>
        )}
        {mode === 'idle' && !displayedResponse && (
          <>
            <p className="text-[11px] tracking-[0.2em] uppercase text-dim mb-3">Ready</p>
            <p className="text-muted text-sm">Tap the orb or hold spacebar to speak</p>
          </>
        )}
        {mode === 'idle' && displayedResponse && (
          <p className="text-gray-400 text-base leading-relaxed">{displayedResponse}</p>
        )}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
        <p className="text-[10px] text-[#333] tracking-wide">
          <span className="text-[#555]">Space</span> to talk · <span className="text-[#555]">Esc</span> to close · <span className="text-[#555]">Ctrl+J</span> to toggle
        </p>
      </div>

      <style jsx global>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes pulse-fast {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.9; }
        }
        @keyframes pulse-speak {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.04); }
          50% { transform: scale(1.02); }
          75% { transform: scale(1.06); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ring-1 {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes ring-2 {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes ripple-1 {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes ripple-2 {
          0% { transform: scale(1); opacity: 0.3; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .animate-breathe { animation: breathe 3s ease-in-out infinite; }
        .animate-pulse-fast { animation: pulse-fast 1.2s ease-in-out infinite; }
        .animate-pulse-speak { animation: pulse-speak 1s ease-in-out infinite; }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
        .animate-ring-1 { animation: ring-1 2s ease-out infinite; }
        .animate-ring-2 { animation: ring-2 2s ease-out infinite 0.5s; }
        .animate-ripple-1 { animation: ripple-1 1.5s ease-out infinite; }
        .animate-ripple-2 { animation: ripple-2 1.5s ease-out infinite 0.3s; }
      `}</style>
    </div>
  );
}
