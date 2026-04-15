'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [calendarStatus, setCalendarStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices().filter(x => x.lang.startsWith('en'));
      setVoices(v);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    setVoiceOutputEnabled(localStorage.getItem('voiceOutputEnabled') === 'true');
    const r = parseFloat(localStorage.getItem('voiceRate') || '1.0');
    setSpeechRate(isNaN(r) ? 1.0 : r);
    setSelectedVoice(localStorage.getItem('voiceName') || '');
  }, []);

  const testVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Good morning James. This is Jarvis, ready when you are.");
    u.rate = speechRate;
    u.lang = 'en-GB';
    const voice = voices.find(v => v.name === selectedVoice)
      || voices.find(v => v.lang === 'en-GB' && v.name.includes('Google'))
      || voices.find(v => v.lang === 'en-GB');
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };

  useEffect(() => {
    const checkCalendar = async () => {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 3600000);
        const res = await fetch(`/api/calendar?timeMin=${oneHourAgo.toISOString()}&timeMax=${now.toISOString()}&salesOnly=false`);
        const data = await res.json();
        setCalendarStatus(data.error ? 'error' : 'connected');
        if (data.error) setCalendarError(data.error);
      } catch (err: unknown) {
        setCalendarStatus('error');
        setCalendarError(err instanceof Error ? err.message : 'Connection failed');
      }
    };
    checkCalendar();
  }, []);

  return (
    <div className="px-5 py-6 max-w-[700px] mx-auto">
      <h1 className="text-lg font-semibold text-white mb-6">Settings</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Connections</h2>
          <div className="rounded-2xl border border-[#1A1A1A] bg-surface divide-y divide-[#1A1A1A]">
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${
                  calendarStatus === 'connected' ? 'bg-success' :
                  calendarStatus === 'error' ? 'bg-danger' : 'bg-warning animate-pulse'
                }`} />
                <div>
                  <h3 className="text-sm font-medium text-white">Google Calendar</h3>
                  <p className="text-xs text-dim mt-0.5">
                    {calendarStatus === 'connected' && 'Fetching events from primary calendar'}
                    {calendarStatus === 'checking' && 'Checking connection...'}
                    {calendarStatus === 'error' && (calendarError || 'Connection failed')}
                  </p>
                </div>
              </div>
              <span className={`text-xs ${calendarStatus === 'connected' ? 'text-success' : calendarStatus === 'error' ? 'text-danger' : 'text-warning'}`}>
                {calendarStatus === 'connected' ? 'Connected' : calendarStatus === 'error' ? 'Error' : 'Checking'}
              </span>
            </div>

            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-success" />
                <div>
                  <h3 className="text-sm font-medium text-white">Zoho CRM</h3>
                  <p className="text-xs text-dim mt-0.5">Pipeline, leads, deals, conversion tracking — Owner: James Rodger</p>
                </div>
              </div>
              <span className="text-xs text-success">Connected</span>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">AI Agents</h2>
          <div className="rounded-2xl border border-[#1A1A1A] bg-surface divide-y divide-[#1A1A1A]">
            {[
              { name: 'Head Agent', desc: 'Orchestrates morning briefing' },
              { name: 'Call Tracker', desc: 'Builds monthly call list from calendar' },
              { name: 'Follow-Up Chaser', desc: 'Identifies overdue follow-ups' },
              { name: 'Weekly Analyst', desc: 'Booking trends and patterns' },
              { name: 'Demo Prep', desc: 'Pre-call briefing with talking points' },
            ].map(agent => (
              <div key={agent.name} className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{agent.name}</p>
                  <p className="text-xs text-dim mt-0.5">{agent.desc}</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Voice</h2>
          <div className="rounded-2xl border border-[#1A1A1A] bg-surface divide-y divide-[#1A1A1A]">
            <div className="p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Voice responses</h3>
                <p className="text-xs text-dim mt-0.5">Speak chat replies aloud by default</p>
              </div>
              <button
                onClick={() => {
                  const next = !voiceOutputEnabled;
                  setVoiceOutputEnabled(next);
                  localStorage.setItem('voiceOutputEnabled', String(next));
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${voiceOutputEnabled ? 'bg-white' : 'bg-[#1A1A1A]'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${voiceOutputEnabled ? 'left-[22px] bg-black' : 'left-0.5 bg-[#555]'}`} />
              </button>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-medium text-white mb-1">Voice</h3>
              <p className="text-xs text-dim mb-3">Preferred TTS voice for Jarvis and the assistant</p>
              <select
                value={selectedVoice}
                onChange={e => {
                  setSelectedVoice(e.target.value);
                  localStorage.setItem('voiceName', e.target.value);
                }}
                className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#333]"
              >
                <option value="">System default (prefer Google UK English)</option>
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>
                ))}
              </select>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-white">Speech rate</h3>
                <span className="text-xs text-muted tabular-nums">{speechRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={speechRate}
                onChange={e => {
                  const r = parseFloat(e.target.value);
                  setSpeechRate(r);
                  localStorage.setItem('voiceRate', String(r));
                }}
                className="w-full accent-white"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-dim">Press Ctrl+J anywhere to open Jarvis mode</p>
                <button
                  onClick={testVoice}
                  className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#222] text-xs text-white hover:bg-[#222] transition-colors"
                >
                  Test voice
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Model</h2>
          <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
            <p className="text-sm text-white font-medium">Claude Sonnet 4</p>
            <p className="text-xs text-dim mt-1">claude-sonnet-4-20250514</p>
          </div>
        </div>
      </div>

      <footer className="border-t border-[#1A1A1A] mt-8 pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
