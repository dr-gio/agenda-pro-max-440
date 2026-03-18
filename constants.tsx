
import React from 'react';
import { CalendarType } from './types';

export const TIMEZONE = 'America/Bogota';
export const KV_KEY = 'calendars:v1';

export const DEFAULT_CALENDARS = [
  {
    id: 'consultorio',
    label: 'Consultorio',
    type: 'resource' as CalendarType,
    timezone: TIMEZONE,
    active: true,
    showDetails: true,
    sort: 1,
    googleCalendarId: 'primary'
  },
  {
    id: 'procedimientos',
    label: 'Sala de Procedimientos',
    type: 'resource' as CalendarType,
    timezone: TIMEZONE,
    active: true,
    showDetails: true,
    sort: 2,
    googleCalendarId: 'primary'
  },
  {
    id: 'hiperbarica',
    label: 'Cámara Hiperbárica',
    type: 'resource' as CalendarType,
    timezone: TIMEZONE,
    active: true,
    showDetails: true,
    sort: 3,
    googleCalendarId: 'primary'
  },
  {
    id: 'postoperatorio',
    label: 'Postoperatorio',
    type: 'resource' as CalendarType,
    timezone: TIMEZONE,
    active: true,
    showDetails: true,
    sort: 4,
    googleCalendarId: 'primary'
  }
];

export const ICONS = {
  Resource: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
      <path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4" />
      <path d="M13 13h4" />
      <path d="M13 17h4" />
    </svg>
  ),
  Professional: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  General: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
};
