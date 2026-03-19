export interface CallRecord {
  name: string;
  phone: string | null;
  date: string;
  country: string | null;
  eventTitle: string;
  description?: string;
  attendeeStatus?: string;
}

export interface CallTrackerResult {
  month: string;
  totalCalls: number;
  calls: CallRecord[];
}

export interface FollowUpFlag {
  name: string;
  reason: string;
  daysSinceContact?: number;
  phone?: string;
}

export interface FollowUpResult {
  redFlags: FollowUpFlag[];
  yellowFlags: FollowUpFlag[];
  greenItems: { name: string; status: string }[];
  summary: string;
}

export interface WeeklyVolume {
  week: string;
  calls: number;
  isCurrent?: boolean;
}

export interface WeeklyResult {
  weeklyVolume: WeeklyVolume[];
  dayBreakdown: Record<string, number>;
  timeSlots: { morning: number; afternoon: number; late: number };
  cancellations: number;
  noShows: number;
  insight: string;
  trend: string;
}

export interface DemoPrepResult {
  leadName: string;
  phone: string;
  country: string;
  demoTime: string;
  eventNotes: string;
  previousInteractions: string[];
  talkingPoints: string[];
  suggestedProducts: string[];
  riskFactors: string[];
}

export interface BriefingResult {
  date: string;
  greeting: string;
  red: { action: string; phone?: string }[];
  yellow: { item: string }[];
  green: { item: string }[];
  kpis: {
    callsThisMonth: number;
    demosThisWeek: number;
    cancellations: number;
    upcomingDemos: number;
  };
  todaySchedule: { time: string; event: string; type: string }[];
  tomorrowSchedule: { time: string; event: string; type: string }[];
}

export interface AnalyticsData {
  weeklyVolume: WeeklyVolume[];
  dayBreakdown: Record<string, number>;
  timeSlots: { morning: number; afternoon: number; late: number };
  monthlyComparison: { month: string; calls: number }[];
  busiestDay: string;
  busiestTime: string;
  totalCancellations: number;
}

export interface CancelledEvent {
  name: string;
  date: string;
  originalTitle: string;
  reason: string;
}
