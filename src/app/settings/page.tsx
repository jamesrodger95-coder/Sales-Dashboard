'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [calendarStatus, setCalendarStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    const checkCalendar = async () => {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const res = await fetch(`/api/calendar?timeMin=${oneHourAgo.toISOString()}&timeMax=${now.toISOString()}&salesOnly=false`);
        const data = await res.json();
        if (data.error) {
          setCalendarStatus('error');
          setCalendarError(data.error);
        } else {
          setCalendarStatus('connected');
        }
      } catch (err: unknown) {
        setCalendarStatus('error');
        setCalendarError(err instanceof Error ? err.message : 'Connection failed');
      }
    };
    checkCalendar();
  }, []);

  const statusDot = {
    checking: 'bg-warning animate-pulse',
    connected: 'bg-success',
    error: 'bg-danger',
  }[calendarStatus];

  const statusLabel = {
    checking: 'Checking',
    connected: 'Connected',
    error: 'Error',
  }[calendarStatus];

  return (
    <div className="px-5 py-8 max-w-[700px] mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-muted mt-1.5">Connections and agent configuration</p>
      </div>

      <div className="space-y-5">
        {/* Connections */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Connections</h2>

          <div className="rounded-card border border-subtle bg-surface divide-y divide-subtle">
            {/* Google Calendar */}
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                <div>
                  <h3 className="text-sm font-medium text-white">Google Calendar</h3>
                  <p className="text-xs text-dim mt-0.5">
                    {calendarStatus === 'connected' && 'Fetching events from primary calendar'}
                    {calendarStatus === 'checking' && 'Checking connection...'}
                    {calendarStatus === 'error' && (calendarError || 'Connection failed')}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted">{statusLabel}</span>
            </div>

            {/* Zoho CRM */}
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-dim" />
                <div>
                  <h3 className="text-sm font-medium text-white">Zoho CRM</h3>
                  <p className="text-xs text-dim mt-0.5">Will sync leads, deals, and contacts</p>
                </div>
              </div>
              <span className="text-xs text-dim">Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Agents */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">AI Agents</h2>

          <div className="rounded-card border border-subtle bg-surface divide-y divide-subtle">
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
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Model</h2>
          <div className="rounded-card border border-subtle bg-surface p-5">
            <p className="text-sm text-white font-medium">Claude Sonnet 4</p>
            <p className="text-xs text-dim mt-1">claude-sonnet-4-20250514 — used for all agent analysis</p>
          </div>
        </div>
      </div>
    </div>
  );
}
