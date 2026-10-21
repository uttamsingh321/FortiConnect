import React, { useState, useEffect, useMemo } from 'react';
import type { CalendarEvent, CalendarEventType, CalendarAttendee, EmployeeListItem } from '../types';
import { getEmployees } from '../api';
import { useAuthStore } from '../store';

const STORAGE_KEY = 'forticonnect_calendar_events_v2';

const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  meeting: {
    label: 'Team Meeting',
    bg: 'rgba(2, 132, 199, 0.18)',
    text: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.35)',
    icon: '👥',
  },
  call: {
    label: '1-on-1 Call',
    bg: 'rgba(16, 185, 129, 0.18)',
    text: '#34d399',
    border: 'rgba(52, 211, 153, 0.35)',
    icon: '📞',
  },
  review: {
    label: 'Architecture Review',
    bg: 'rgba(168, 85, 247, 0.18)',
    text: '#c084fc',
    border: 'rgba(192, 132, 252, 0.35)',
    icon: '🔍',
  },
  security: {
    label: 'Security & Audit',
    bg: 'rgba(245, 158, 11, 0.18)',
    text: '#fbbf24',
    border: 'rgba(251, 191, 36, 0.35)',
    icon: '🔒',
  },
  deadline: {
    label: 'Sprint Deadline',
    bg: 'rgba(244, 63, 94, 0.18)',
    text: '#fb7185',
    border: 'rgba(251, 113, 133, 0.35)',
    icon: '🎯',
  },
  social: {
    label: 'All-Hands / Sync',
    bg: 'rgba(217, 70, 239, 0.18)',
    text: '#e879f9',
    border: 'rgba(232, 121, 249, 0.35)',
    icon: '☕',
  },
};

const formatDateToISO = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getRelativeDateStr = (dayOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return formatDateToISO(d);
};

const generateInitialEvents = (): CalendarEvent[] => [
  {
    id: 'evt-seed-1',
    title: 'FortiConnect Daily Standup & Sprint Sync',
    description: 'Daily team sync covering Phase 2 features, chat enhancements, and active blockers.',
    date: getRelativeDateStr(0),
    startTime: '10:00',
    endTime: '10:45',
    type: 'meeting',
    location: 'FortiConnect Video Call (Main Channel)',
    meetingLink: 'https://forticonnect.internal/call/standup',
    attendees: [
      { id: 1, name: 'Alex Rivera', department: 'Engineering', employee_id: 'EMP-001' },
      { id: 2, name: 'Sarah Chen', department: 'Engineering', employee_id: 'EMP-002' },
      { id: 3, name: 'Marcus Johnson', department: 'Product', employee_id: 'EMP-003' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'evt-seed-2',
    title: 'Security Architecture & Encryption Review',
    description: 'Quarterly review of end-to-end WebRTC DTLS/SRTP encryption and token expiration rules.',
    date: getRelativeDateStr(0),
    startTime: '14:30',
    endTime: '15:30',
    type: 'security',
    location: 'Conference Room 402 / Virtual',
    meetingLink: 'https://forticonnect.internal/call/security-review',
    attendees: [
      { id: 2, name: 'Sarah Chen', department: 'Engineering', employee_id: 'EMP-002' },
      { id: 4, name: 'Elena Rostova', department: 'Security', employee_id: 'EMP-004' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'evt-seed-3',
    title: 'Product Roadmap & Phase 3 Planning',
    description: 'Reviewing Phase 3 enterprise deliverables: Calendar integration, multi-file sharing, and audit logging.',
    date: getRelativeDateStr(1),
    startTime: '11:00',
    endTime: '12:00',
    type: 'review',
    location: 'Executive Boardroom & Online',
    meetingLink: 'https://forticonnect.internal/call/roadmap',
    attendees: [
      { id: 3, name: 'Marcus Johnson', department: 'Product', employee_id: 'EMP-003' },
      { id: 1, name: 'Alex Rivera', department: 'Engineering', employee_id: 'EMP-001' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'evt-seed-4',
    title: '1-on-1 Engineering Check-in',
    description: 'Bi-weekly performance review, mentorship, and career growth milestone check.',
    date: getRelativeDateStr(2),
    startTime: '15:00',
    endTime: '15:45',
    type: 'call',
    location: 'FortiConnect Private Video Call',
    attendees: [
      { id: 1, name: 'Alex Rivera', department: 'Engineering', employee_id: 'EMP-001' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'evt-seed-5',
    title: 'Production Release & Health Verification',
    description: 'Scheduled deployment window for service updates and system health checks.',
    date: getRelativeDateStr(4),
    startTime: '18:00',
    endTime: '19:00',
    type: 'deadline',
    location: 'Deployment Operations Room',
    attendees: [
      { id: 1, name: 'Alex Rivera', department: 'Engineering', employee_id: 'EMP-001' },
      { id: 2, name: 'Sarah Chen', department: 'Engineering', employee_id: 'EMP-002' },
    ],
    createdAt: new Date().toISOString(),
  },
];

export const CalendarPage: React.FC<{ onSelectChat: () => void }> = ({ onSelectChat }) => {
  const currentUser = useAuthStore((s) => s.user);

  // Calendar view states
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateToISO(new Date()));
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
  const [filterType, setFilterType] = useState<CalendarEventType | 'all'>('all');

  // Events state with LocalStorage persistence
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load events from storage', e);
    }
    const initial = generateInitialEvents();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    } catch {}
    return initial;
  });

  const saveEvents = (newEvents: CalendarEvent[]) => {
    setEvents(newEvents);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newEvents));
    } catch (e) {
      console.error('Failed to persist events', e);
    }
  };

  // Directory employees for attendee selection
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  useEffect(() => {
    getEmployees()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any)?.results || [];
        setEmployees(list);
      })
      .catch((err) => console.warn('Could not load employees for calendar', err));
  }, []);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // New Event Form State
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<CalendarEventType>('meeting');
  const [formDate, setFormDate] = useState<string>(selectedDateStr);
  const [formStartTime, setFormStartTime] = useState('10:00');
  const [formEndTime, setFormEndTime] = useState('11:00');
  const [formLocation, setFormLocation] = useState('FortiConnect Video Call');
  const [formDescription, setFormDescription] = useState('');
  const [formAttendees, setFormAttendees] = useState<CalendarAttendee[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');

  // Open Create Modal pre-filled
  const handleOpenCreateModal = (dateStr?: string) => {
    const targetDate = dateStr || selectedDateStr || formatDateToISO(new Date());
    setFormTitle('');
    setFormType('meeting');
    setFormDate(targetDate);
    setFormStartTime('10:00');
    setFormEndTime('11:00');
    setFormLocation('FortiConnect Video Call');
    setFormDescription('');
    setFormAttendees(
      currentUser
        ? [
            {
              id: currentUser.id,
              name: currentUser.display_name,
              department: currentUser.department,
              employee_id: currentUser.employee_id,
            },
          ]
        : []
    );
    setAttendeeSearch('');
    setShowCreateModal(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Please enter an event title.');
      return;
    }

    const newEvent: CalendarEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: formTitle.trim(),
      description: formDescription.trim(),
      date: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      type: formType,
      location: formLocation.trim() || 'FortiConnect Video Call',
      meetingLink: 'https://forticonnect.internal/call/' + Math.random().toString(36).substring(2, 9),
      attendees: formAttendees,
      createdBy: currentUser
        ? { id: currentUser.id, name: currentUser.display_name }
        : undefined,
      createdAt: new Date().toISOString(),
    };

    saveEvents([...events, newEvent]);
    setSelectedDateStr(formDate);
    setShowCreateModal(false);
  };

  const handleDeleteEvent = (id: string) => {
    if (confirm('Are you sure you want to delete this event?')) {
      const updated = events.filter((e) => e.id !== id);
      saveEvents(updated);
      setSelectedEvent(null);
    }
  };

  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleTodayJump = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(formatDateToISO(today));
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return events;
    return events.filter((e) => e.type === filterType);
  }, [events, filterType]);

  // Calendar Grid Matrix Generation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: CalendarEvent[];
    }> = [];

    const todayStr = formatDateToISO(new Date());

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = formatDateToISO(prevDate);
      days.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        events: filteredEvents.filter((e) => e.date === dateStr),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const curDate = new Date(year, month, d);
      const dateStr = formatDateToISO(curDate);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        events: filteredEvents.filter((e) => e.date === dateStr),
      });
    }

    // Next month leading days to complete grid (up to 35 or 42 cells)
    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = formatDateToISO(nextDate);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        events: filteredEvents.filter((e) => e.date === dateStr),
      });
    }

    return days;
  }, [year, month, filteredEvents]);

  // Selected date's events
  const selectedDateEvents = useMemo(() => {
    return filteredEvents
      .filter((e) => e.date === selectedDateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [filteredEvents, selectedDateStr]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={styles.container}>
      {/* Top Calendar Toolbar */}
      <div style={styles.headerBar}>
        <div style={styles.titleSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={styles.calendarIconBadge}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <div>
              <h1 style={styles.pageTitle}>Enterprise Calendar & Meetings</h1>
              <p style={styles.pageSubtitle}>
                Schedule video conferences, sprint reviews, and collaborate across departments
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={styles.topActions}>
          {/* View Mode Toggle */}
          <div style={styles.viewToggleGroup}>
            <button
              onClick={() => setViewMode('month')}
              style={{
                ...styles.viewBtn,
                ...(viewMode === 'month' ? styles.viewBtnActive : {}),
              }}
            >
              📅 Month Grid
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              style={{
                ...styles.viewBtn,
                ...(viewMode === 'agenda' ? styles.viewBtnActive : {}),
              }}
            >
              📋 Agenda View
            </button>
          </div>

          <button
            onClick={() => handleOpenCreateModal()}
            style={styles.scheduleBtn}
            title="Schedule a new meeting"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Schedule Event</span>
          </button>
        </div>
      </div>

      {/* Navigation & Filters Bar */}
      <div style={styles.controlsBar}>
        {/* Month Navigation */}
        <div style={styles.navControls}>
          <button onClick={handlePrevMonth} style={styles.iconNavBtn} title="Previous Month">
            ‹
          </button>
          <span style={styles.currentMonthLabel}>
            {monthNames[month]} {year}
          </span>
          <button onClick={handleNextMonth} style={styles.iconNavBtn} title="Next Month">
            ›
          </button>
          <button onClick={handleTodayJump} style={styles.todayBtn}>
            Today
          </button>
        </div>

        {/* Category Filters */}
        <div style={styles.filterPillsContainer}>
          <button
            onClick={() => setFilterType('all')}
            style={{
              ...styles.filterPill,
              ...(filterType === 'all' ? styles.filterPillActive : {}),
            }}
          >
            All Events ({events.length})
          </button>
          {(Object.keys(EVENT_TYPE_CONFIG) as CalendarEventType[]).map((type) => {
            const conf = EVENT_TYPE_CONFIG[type];
            const count = events.filter((e) => e.type === type).length;
            const isSelected = filterType === type;
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  ...styles.filterPill,
                  borderColor: isSelected ? conf.border : 'transparent',
                  backgroundColor: isSelected ? conf.bg : 'rgba(255, 255, 255, 0.04)',
                  color: isSelected ? conf.text : '#94a3b8',
                }}
              >
                <span>{conf.icon}</span>
                <span>{conf.label}</span>
                <span style={styles.pillCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={styles.mainLayout}>
        {viewMode === 'month' ? (
          <div className="fc-calendar-month-view" style={styles.monthViewContainer}>
            {/* Calendar Grid */}
            <div style={styles.calendarGridWrapper}>
              {/* Day of Week Headers */}
              <div style={styles.weekHeadersRow}>
                {weekDayNames.map((dayName, idx) => (
                  <div key={dayName} style={{
                    ...styles.weekHeaderCell,
                    color: idx === 0 || idx === 6 ? '#64748b' : '#cbd5e1',
                  }}>
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Day Cells Matrix */}
              <div style={styles.daysGrid}>
                {calendarDays.map((day) => {
                  const isSelected = day.dateStr === selectedDateStr;
                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => setSelectedDateStr(day.dateStr)}
                      style={{
                        ...styles.dayCell,
                        opacity: day.isCurrentMonth ? 1 : 0.45,
                        backgroundColor: isSelected
                          ? 'rgba(2, 132, 199, 0.14)'
                          : day.isToday
                          ? 'rgba(56, 189, 248, 0.05)'
                          : '#111827',
                        borderColor: isSelected
                          ? '#0284c7'
                          : day.isToday
                          ? 'rgba(56, 189, 248, 0.4)'
                          : '#1f2937',
                      }}
                    >
                      {/* Day Header with Number */}
                      <div style={styles.dayNumberRow}>
                        <span
                          style={{
                            ...styles.dayNumber,
                            ...(day.isToday ? styles.todayBadge : {}),
                            ...(isSelected && !day.isToday ? styles.selectedDayBadge : {}),
                          }}
                        >
                          {day.dayNumber}
                        </span>
                        {day.events.length > 0 && (
                          <span style={styles.dayEventCountDot}>
                            {day.events.length}
                          </span>
                        )}
                      </div>

                      {/* Events Chips in Day */}
                      <div style={styles.dayEventsList}>
                        {day.events.slice(0, 3).map((evt) => {
                          const conf = EVENT_TYPE_CONFIG[evt.type];
                          return (
                            <div
                              key={evt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(evt);
                              }}
                              style={{
                                ...styles.eventChip,
                                backgroundColor: conf.bg,
                                color: conf.text,
                                border: `1px solid ${conf.border}`,
                              }}
                              title={`${evt.startTime} - ${evt.title}`}
                            >
                              <span style={styles.chipTime}>{evt.startTime}</span>
                              <span style={styles.chipTitle}>{evt.title}</span>
                            </div>
                          );
                        })}
                        {day.events.length > 3 && (
                          <div style={styles.moreEventsText}>
                            +{day.events.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Date Side Drawer / Agenda Panel */}
            <div className="fc-calendar-side-panel" style={styles.sideAgendaPanel}>
              <div style={styles.sidePanelHeader}>
                <div>
                  <h3 style={styles.sidePanelDate}>
                    {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h3>
                  <span style={styles.sidePanelSub}>
                    {selectedDateEvents.length} {selectedDateEvents.length === 1 ? 'Event' : 'Events'} Scheduled
                  </span>
                </div>
                <button
                  onClick={() => handleOpenCreateModal(selectedDateStr)}
                  style={styles.sideAddBtn}
                  title="Add event for this day"
                >
                  + Add
                </button>
              </div>

              <div style={styles.sideEventsScroll}>
                {selectedDateEvents.length === 0 ? (
                  <div style={styles.noEventsBox}>
                    <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>☕</span>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }}>
                      No meetings or deadlines scheduled for this date.
                    </p>
                    <button
                      onClick={() => handleOpenCreateModal(selectedDateStr)}
                      style={styles.quickScheduleBtn}
                    >
                      Schedule Meeting
                    </button>
                  </div>
                ) : (
                  selectedDateEvents.map((evt) => {
                    const conf = EVENT_TYPE_CONFIG[evt.type];
                    return (
                      <div
                        key={evt.id}
                        onClick={() => setSelectedEvent(evt)}
                        style={{
                          ...styles.agendaCard,
                          borderLeft: `4px solid ${conf.text}`,
                        }}
                      >
                        <div style={styles.agendaCardTop}>
                          <span
                            style={{
                              ...styles.cardTypeBadge,
                              backgroundColor: conf.bg,
                              color: conf.text,
                              border: `1px solid ${conf.border}`,
                            }}
                          >
                            {conf.icon} {conf.label}
                          </span>
                          <span style={styles.cardTimeText}>
                            {evt.startTime} – {evt.endTime}
                          </span>
                        </div>
                        <h4 style={styles.agendaCardTitle}>{evt.title}</h4>
                        {evt.description && (
                          <p style={styles.agendaCardDesc}>{evt.description}</p>
                        )}
                        <div style={styles.agendaCardLocation}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 10l5-5-5-5v3H9a4 4 0 0 0-4 4v5h2v-5a2 2 0 0 1 2-2h6v3z"></path>
                          </svg>
                          <span>{evt.location || 'Virtual Conference'}</span>
                        </div>

                        {/* Attendees Avatars */}
                        {evt.attendees && evt.attendees.length > 0 && (
                          <div style={styles.agendaAttendees}>
                            <div style={styles.avatarStack}>
                              {evt.attendees.slice(0, 4).map((att, i) => (
                                <div
                                  key={att.id || i}
                                  style={styles.miniAvatar}
                                  title={`${att.name} (${att.department || 'Staff'})`}
                                >
                                  {att.name.charAt(0).toUpperCase()}
                                </div>
                              ))}
                            </div>
                            <span style={styles.attendeesCountText}>
                              {evt.attendees.length} {evt.attendees.length === 1 ? 'Attendee' : 'Attendees'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Full Agenda / List View */
          <div style={styles.fullAgendaContainer}>
            <div style={styles.agendaHeaderBanner}>
              <h3>All Scheduled Company Events & Milestones</h3>
              <p>Chronological overview of upcoming department meetings, calls, and reviews</p>
            </div>

            {filteredEvents.length === 0 ? (
              <div style={styles.noEventsBox}>
                <p>No events found for the selected filter.</p>
              </div>
            ) : (
              <div style={styles.agendaListFull}>
                {filteredEvents
                  .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
                  .map((evt) => {
                    const conf = EVENT_TYPE_CONFIG[evt.type];
                    const isPast = evt.date < formatDateToISO(new Date());
                    return (
                      <div
                        key={evt.id}
                        onClick={() => setSelectedEvent(evt)}
                        style={{
                          ...styles.agendaRowItem,
                          opacity: isPast ? 0.6 : 1,
                        }}
                      >
                        <div style={styles.agendaDateColumn}>
                          <span style={styles.agendaDateDay}>
                            {new Date(evt.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
                          </span>
                          <span style={styles.agendaDateNum}>
                            {new Date(evt.date + 'T00:00:00').getDate()}
                          </span>
                          <span style={styles.agendaDateMonth}>
                            {new Date(evt.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                        </div>

                        <div style={styles.agendaContentColumn}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span
                              style={{
                                ...styles.cardTypeBadge,
                                backgroundColor: conf.bg,
                                color: conf.text,
                                border: `1px solid ${conf.border}`,
                              }}
                            >
                              {conf.icon} {conf.label}
                            </span>
                            <span style={styles.cardTimeText}>
                              {evt.startTime} – {evt.endTime}
                            </span>
                          </div>
                          <h4 style={styles.agendaFullTitle}>{evt.title}</h4>
                          {evt.description && <p style={styles.agendaFullDesc}>{evt.description}</p>}
                          <div style={styles.agendaFullMeta}>
                            <span>📍 {evt.location}</span>
                            <span>•</span>
                            <span>👥 {evt.attendees?.length || 0} participants</span>
                          </div>
                        </div>

                        <div style={styles.agendaActionColumn}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(evt);
                            }}
                            style={styles.viewEventBtn}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CREATE / SCHEDULE EVENT MODAL ────────────────────────────────────── */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📅</span>
                <h3 style={styles.modalTitle}>Schedule New Event / Meeting</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEvent} style={styles.modalBody}>
              {/* Event Title */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sprint Planning Sync, Client Review..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  style={styles.formInput}
                />
              </div>

              {/* Event Category & Date */}
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Category</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as CalendarEventType)}
                    style={styles.formSelect}
                  >
                    <option value="meeting">👥 Team Meeting</option>
                    <option value="call">📞 1-on-1 Call</option>
                    <option value="review">🔍 Architecture Review</option>
                    <option value="security">🔒 Security & Audit</option>
                    <option value="deadline">🎯 Sprint Deadline</option>
                    <option value="social">☕ All-Hands / Sync</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
              </div>

              {/* Time Interval */}
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Start Time</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>End Time</label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
              </div>

              {/* Meeting Location */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Location / Room</label>
                <input
                  type="text"
                  placeholder="FortiConnect Video Call, Boardroom 4, etc."
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  style={styles.formInput}
                />
              </div>

              {/* Attendees Picker from Real Directory */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>
                  Add Participants ({formAttendees.length} selected)
                </label>
                <input
                  type="text"
                  placeholder="Filter colleagues by name or department..."
                  value={attendeeSearch}
                  onChange={(e) => setAttendeeSearch(e.target.value)}
                  style={{ ...styles.formInput, marginBottom: '0.5rem' }}
                />

                {/* Directory Attendees Chips */}
                <div style={styles.attendeesPickerBox}>
                  {employees
                    .filter(
                      (emp) =>
                        emp.display_name.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
                        emp.department.toLowerCase().includes(attendeeSearch.toLowerCase())
                    )
                    .slice(0, 10)
                    .map((emp) => {
                      const isSelected = formAttendees.some((a) => a.id === emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setFormAttendees(formAttendees.filter((a) => a.id !== emp.id));
                            } else {
                              setFormAttendees([
                                ...formAttendees,
                                {
                                  id: emp.id,
                                  name: emp.display_name,
                                  department: emp.department,
                                  employee_id: emp.employee_id,
                                },
                              ]);
                            }
                          }}
                          style={{
                            ...styles.attendeePillSelectable,
                            backgroundColor: isSelected ? '#0284c7' : 'rgba(255, 255, 255, 0.05)',
                            borderColor: isSelected ? '#38bdf8' : '#334155',
                            color: isSelected ? '#ffffff' : '#cbd5e1',
                          }}
                        >
                          <span>{isSelected ? '✓' : '+'}</span>
                          <span>{emp.display_name}</span>
                          <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>({emp.department})</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Description */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Agenda & Notes</label>
                <textarea
                  rows={3}
                  placeholder="Meeting agenda, briefing notes, or goals..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  style={styles.formTextarea}
                />
              </div>

              {/* Footer buttons */}
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.modalSubmitBtn}>
                  Save & Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EVENT DETAILS MODAL ─────────────────────────────────────────────── */}
      {selectedEvent && (
        <div style={styles.modalOverlay} onClick={() => setSelectedEvent(null)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    ...styles.cardTypeBadge,
                    backgroundColor: EVENT_TYPE_CONFIG[selectedEvent.type].bg,
                    color: EVENT_TYPE_CONFIG[selectedEvent.type].text,
                    border: `1px solid ${EVENT_TYPE_CONFIG[selectedEvent.type].border}`,
                  }}
                >
                  {EVENT_TYPE_CONFIG[selectedEvent.type].icon} {EVENT_TYPE_CONFIG[selectedEvent.type].label}
                </span>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={styles.closeBtn}>
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                {selectedEvent.title}
              </h2>

              {/* Time & Date */}
              <div style={styles.detailRow}>
                <span style={styles.detailIcon}>🕒</span>
                <div>
                  <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.9rem' }}>
                    {new Date(selectedEvent.date + 'T00:00:00').toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    {selectedEvent.startTime} – {selectedEvent.endTime}
                  </div>
                </div>
              </div>

              {/* Location */}
              <div style={styles.detailRow}>
                <span style={styles.detailIcon}>📍</span>
                <div>
                  <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.9rem' }}>
                    {selectedEvent.location || 'FortiConnect Video Call'}
                  </div>
                  <div style={{ color: '#38bdf8', fontSize: '0.8rem' }}>
                    Secure Enterprise Channel
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedEvent.description && (
                <div style={{ margin: '1rem 0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Agenda & Details
                  </div>
                  <div style={styles.descriptionBox}>{selectedEvent.description}</div>
                </div>
              )}

              {/* Attendees */}
              <div style={{ margin: '1rem 0' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Confirmed Attendees ({selectedEvent.attendees?.length || 0})
                </div>
                <div style={styles.attendeesList}>
                  {selectedEvent.attendees && selectedEvent.attendees.length > 0 ? (
                    selectedEvent.attendees.map((att) => (
                      <div key={att.id} style={styles.attendeeBadge}>
                        <div style={styles.miniAvatar}>{att.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: '0.8125rem', color: '#f8fafc', fontWeight: 500 }}>
                            {att.name}
                          </div>
                          {att.department && (
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{att.department}</div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No attendees assigned.</span>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div style={styles.detailActionsBar}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEvent(null);
                    onSelectChat();
                  }}
                  style={styles.messageAttendeesBtn}
                  title="Switch to chat to coordinate"
                >
                  💬 Open in Chat
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  style={styles.deleteEventBtn}
                  title="Remove this event from calendar"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── INLINE STYLES ──────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0b0f19',
    color: '#f8fafc',
    overflow: 'hidden',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  headerBar: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '1rem',
    backgroundColor: '#111827',
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
  },
  calendarIconBadge: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    border: '1px solid rgba(56, 189, 248, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    margin: '0.15rem 0 0 0',
  },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  viewToggleGroup: {
    display: 'flex',
    backgroundColor: '#1e293b',
    padding: '3px',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
  viewBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  viewBtnActive: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontWeight: 600,
    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)',
  },
  scheduleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
    transition: 'background-color 0.15s ease',
  },
  controlsBar: {
    padding: '0.75rem 1.5rem',
    borderBottom: '1px solid #1f2937',
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  navControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  iconNavBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
    cursor: 'pointer',
  },
  currentMonthLabel: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#f8fafc',
    minWidth: '150px',
    textAlign: 'center',
  },
  todayBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    borderRadius: '6px',
    padding: '0.3rem 0.65rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterPillsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    overflowX: 'auto',
    maxWidth: '100%',
  },
  filterPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.3rem 0.65rem',
    borderRadius: '9999px',
    border: '1px solid transparent',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterPillActive: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    borderColor: '#38bdf8',
  },
  pillCount: {
    fontSize: '0.6875rem',
    opacity: 0.8,
    marginLeft: '2px',
  },
  mainLayout: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
  },
  monthViewContainer: {
    flex: 1,
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
  },
  calendarGridWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    borderRight: '1px solid #1f2937',
  },
  weekHeadersRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    backgroundColor: '#111827',
    borderBottom: '1px solid #1f2937',
  },
  weekHeaderCell: {
    padding: '0.6rem 0.25rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridAutoRows: 'minmax(105px, 1fr)',
    flex: 1,
  },
  dayCell: {
    borderRight: '1px solid #1f2937',
    borderBottom: '1px solid #1f2937',
    padding: '0.35rem 0.45rem',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    overflow: 'hidden',
  },
  dayNumberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
  },
  dayNumber: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#cbd5e1',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
  todayBadge: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontWeight: 700,
    boxShadow: '0 0 8px rgba(2, 132, 199, 0.5)',
  },
  selectedDayBadge: {
    border: '2px solid #38bdf8',
    color: '#38bdf8',
  },
  dayEventCountDot: {
    fontSize: '0.625rem',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    color: '#38bdf8',
    padding: '1px 5px',
    borderRadius: '9999px',
    fontWeight: 700,
  },
  dayEventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    overflow: 'hidden',
  },
  eventChip: {
    fontSize: '0.6875rem',
    padding: '2px 5px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
    lineHeight: '1.2',
  },
  chipTime: {
    fontWeight: 700,
    fontSize: '0.625rem',
    opacity: 0.9,
  },
  chipTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  moreEventsText: {
    fontSize: '0.625rem',
    color: '#94a3b8',
    marginTop: '1px',
    fontWeight: 500,
  },
  sideAgendaPanel: {
    width: '340px',
    backgroundColor: '#111827',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidePanelHeader: {
    padding: '1rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidePanelDate: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
  },
  sidePanelSub: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  sideAddBtn: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    borderRadius: '6px',
    padding: '0.3rem 0.65rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  sideEventsScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  noEventsBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2.5rem 1rem',
    textAlign: 'center',
  },
  quickScheduleBtn: {
    marginTop: '0.75rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '0.45rem 0.85rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  agendaCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    padding: '0.75rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  agendaCardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.35rem',
  },
  cardTypeBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  cardTimeText: {
    fontSize: '0.72rem',
    color: '#94a3b8',
    fontWeight: 500,
  },
  agendaCardTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#f8fafc',
    margin: '0 0 0.25rem 0',
  },
  agendaCardDesc: {
    fontSize: '0.75rem',
    color: '#cbd5e1',
    margin: '0 0 0.5rem 0',
    lineHeight: '1.4',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  agendaCardLocation: {
    fontSize: '0.72rem',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  agendaAttendees: {
    marginTop: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '0.5rem',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  avatarStack: {
    display: 'flex',
    alignItems: 'center',
  },
  miniAvatar: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '0.65rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #111827',
    marginLeft: '-5px',
  },
  attendeesCountText: {
    fontSize: '0.7rem',
    color: '#94a3b8',
  },
  fullAgendaContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
  },
  agendaHeaderBanner: {
    marginBottom: '1.5rem',
    borderBottom: '1px solid #1f2937',
    paddingBottom: '1rem',
  },
  agendaListFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  agendaRowItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '10px',
    padding: '1rem 1.25rem',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  agendaDateColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '54px',
    flexShrink: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    padding: '0.4rem 0',
    border: '1px solid #1f2937',
  },
  agendaDateDay: {
    fontSize: '0.65rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  agendaDateNum: {
    fontSize: '1.25rem',
    fontWeight: 800,
    color: '#f8fafc',
  },
  agendaDateMonth: {
    fontSize: '0.65rem',
    color: '#38bdf8',
    fontWeight: 600,
  },
  agendaContentColumn: {
    flex: 1,
  },
  agendaFullTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#f8fafc',
    margin: '0 0 0.25rem 0',
  },
  agendaFullDesc: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    margin: '0 0 0.4rem 0',
  },
  agendaFullMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: '#64748b',
  },
  agendaActionColumn: {
    flexShrink: 0,
  },
  viewEventBtn: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#38bdf8',
    borderRadius: '6px',
    padding: '0.4rem 0.8rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modalBox: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '540px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
  },
  modalHeader: {
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '0.25rem',
  },
  modalBody: {
    padding: '1.25rem',
  },
  formGroup: {
    marginBottom: '1rem',
    flex: 1,
  },
  formRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  formLabel: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#cbd5e1',
    marginBottom: '0.35rem',
  },
  formInput: {
    width: '100%',
    backgroundColor: '#0b0f19',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '0.55rem 0.75rem',
    color: '#f8fafc',
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    outline: 'none',
  },
  formSelect: {
    width: '100%',
    backgroundColor: '#0b0f19',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '0.55rem 0.75rem',
    color: '#f8fafc',
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    outline: 'none',
  },
  formTextarea: {
    width: '100%',
    backgroundColor: '#0b0f19',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '0.55rem 0.75rem',
    color: '#f8fafc',
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  attendeesPickerBox: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35rem',
    maxHeight: '120px',
    overflowY: 'auto',
    padding: '0.5rem',
    backgroundColor: '#0b0f19',
    border: '1px solid #1f2937',
    borderRadius: '6px',
  },
  attendeePillSelectable: {
    border: '1px solid #334155',
    borderRadius: '9999px',
    padding: '0.25rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    transition: 'all 0.15s ease',
  },
  modalFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px solid #1f2937',
  },
  modalCancelBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  modalSubmitBtn: {
    backgroundColor: '#0284c7',
    border: 'none',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '0.5rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)',
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    margin: '0.75rem 0',
  },
  detailIcon: {
    fontSize: '1.15rem',
  },
  descriptionBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    border: '1px solid #1f2937',
    borderRadius: '6px',
    padding: '0.75rem',
    fontSize: '0.85rem',
    color: '#cbd5e1',
    lineHeight: '1.5',
  },
  attendeesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  attendeeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '0.4rem 0.6rem',
  },
  detailActionsBar: {
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  messageAttendeesBtn: {
    backgroundColor: '#0284c7',
    border: 'none',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '0.55rem 1.1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteEventBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    borderRadius: '6px',
    padding: '0.55rem 0.9rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
