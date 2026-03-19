
export type CalendarType = 'resource' | 'professional' | 'general' | 'aesthetic';

export interface CalendarConfig {
  id: string;
  label: string;
  type: CalendarType;
  timezone: string;
  active: boolean;
  showDetails: boolean;
  sort: number;
  googleCalendarId?: string;
  personalEmail?: string;
  avatarUrl?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarLabel: string;
  calendarType: CalendarType;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  location?: string;
  description?: string;
  booker?: string;
  source: 'events' | 'freebusy';
  isCurrent?: boolean;
}

export interface AuthSession {
  user: string;       // nombre del staff
  staffId: string;    // UUID de staff_users
  role: 'admin' | 'viewer';
  expiresAt: number;
}

export enum AppRoute {
  HOME = 'home',
  TV = 'tv',
  ADMIN = 'admin',
  LOGIN = 'login'
}
