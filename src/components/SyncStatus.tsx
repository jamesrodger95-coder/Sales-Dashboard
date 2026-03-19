'use client';

interface SyncStatusProps {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  onRefresh: () => void;
}

export default function SyncStatus({ status, onRefresh }: SyncStatusProps) {
  return (
    <div className="flex items-center justify-end gap-2.5 mb-8">
      {status === 'syncing' && (
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-muted animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-muted">Syncing</span>
        </div>
      )}

      {status === 'synced' && (
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-success" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs text-success">Synced</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-danger" />
          <span className="text-xs text-danger">Sync failed</span>
          <button
            onClick={onRefresh}
            className="text-xs text-danger hover:text-white transition-colors ml-1"
          >
            Retry
          </button>
        </div>
      )}

      {status === 'idle' && (
        <span className="text-xs text-dim">Ready</span>
      )}

      {status !== 'error' && (
        <button
          onClick={onRefresh}
          disabled={status === 'syncing'}
          className="text-muted hover:text-white transition-colors disabled:opacity-30"
          title="Refresh"
        >
          <svg
            className={`w-3.5 h-3.5 ${status === 'syncing' ? 'animate-spin' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M2.5 8a5.5 5.5 0 019.3-3.97M13.5 8a5.5 5.5 0 01-9.3 3.97"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M12 2.5L11.8 5.3l-2.8-.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 13.5l.2-2.8 2.8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
