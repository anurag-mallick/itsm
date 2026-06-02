import { useEffect, useRef, useState } from 'react'
import { Typography, Segmented, Checkbox, Space, Spin, message } from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import timelinePlugin from '@fullcalendar/timeline'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import client from '../api/client'

const { Title, Text } = Typography

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType =
  | 'ticket_sla'
  | 'change_due'
  | 'sprint_start'
  | 'sprint_end'
  | 'license_expiry'
  | 'warranty_expiry'

interface CalendarApiEvent {
  id: string
  type: EventType
  title: string
  date: string
  url: string
  priority?: string
  status?: string
  color: string
}

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'listMonth'

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  ticket_sla: 'SLA Deadline',
  change_due: 'Change Due Date',
  sprint_start: 'Sprint Start',
  sprint_end: 'Sprint End',
  license_expiry: 'License Expiry',
  warranty_expiry: 'Warranty Expiry',
}

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  ticket_sla: '#ff4d4f',
  change_due: '#1677ff',
  sprint_start: '#52c41a',
  sprint_end: '#d4380d',
  license_expiry: '#fa8c16',
  warranty_expiry: '#d3adf7',
}

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[]

const VIEW_OPTIONS = [
  { label: 'Month', value: 'dayGridMonth' },
  { label: 'Week', value: 'timeGridWeek' },
  { label: 'Timeline', value: 'listMonth' },
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function CalendarView() {
  const navigate = useNavigate()
  const calendarRef = useRef<FullCalendar>(null)

  const [currentView, setCurrentView] = useState<CalendarView>('dayGridMonth')
  const [enabledTypes, setEnabledTypes] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES))
  const [allEvents, setAllEvents] = useState<CalendarApiEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [currentMonthLabel, setCurrentMonthLabel] = useState(dayjs().format('MMMM YYYY'))

  // Fetch events from API when visible date range changes
  async function fetchEvents(startStr: string, endStr: string) {
    setLoading(true)
    try {
      const { data } = await client.get<CalendarApiEvent[]>('/calendar/events/', {
        params: { from: startStr.slice(0, 10), to: endStr.slice(0, 10) },
      })
      setAllEvents(data)
    } catch {
      message.error('Failed to load calendar events.')
    } finally {
      setLoading(false)
    }
  }

  function handleDatesSet(dateInfo: DatesSetArg) {
    setCurrentMonthLabel(dayjs(dateInfo.view.currentStart).format('MMMM YYYY'))
    fetchEvents(dateInfo.startStr, dateInfo.endStr)
  }

  function handleViewChange(val: string | number) {
    const view = val as CalendarView
    setCurrentView(view)
    const api = calendarRef.current?.getApi()
    if (api) {
      api.changeView(view)
    }
  }

  function handleTypeToggle(type: EventType) {
    return (e: CheckboxChangeEvent) => {
      setEnabledTypes(prev => {
        const next = new Set(prev)
        if (e.target.checked) {
          next.add(type)
        } else {
          next.delete(type)
        }
        return next
      })
    }
  }

  function handleEventClick(info: EventClickArg) {
    const url: string | undefined = info.event.extendedProps.url
    if (url) {
      navigate(url)
    }
  }

  // Map and filter API events to FullCalendar EventInput format
  const calendarEvents: EventInput[] = allEvents
    .filter(ev => enabledTypes.has(ev.type))
    .map(ev => ({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      allDay: true,
      backgroundColor: ev.color,
      borderColor: ev.color,
      extendedProps: {
        type: ev.type,
        url: ev.url,
        priority: ev.priority,
        status: ev.status,
      },
    }))

  // Initial fetch on mount
  useEffect(() => {
    const start = dayjs().startOf('month').subtract(7, 'day').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').add(7, 'day').format('YYYY-MM-DD')
    fetchEvents(start, end)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Calendar</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{currentMonthLabel}</Text>
        </div>
        <Segmented
          options={VIEW_OPTIONS}
          value={currentView}
          onChange={handleViewChange}
        />
      </div>

      {/* Filter bar */}
      <div
        style={{
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          padding: '10px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <Text strong style={{ fontSize: 13, marginRight: 4 }}>Show:</Text>
        <Space wrap size={16}>
          {ALL_EVENT_TYPES.map(type => (
            <Checkbox
              key={type}
              checked={enabledTypes.has(type)}
              onChange={handleTypeToggle(type)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: EVENT_TYPE_COLORS[type],
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                {EVENT_TYPE_LABELS[type]}
              </span>
            </Checkbox>
          ))}
        </Space>
      </div>

      {/* Calendar */}
      <div style={{ position: 'relative' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.6)',
              zIndex: 10,
              borderRadius: 6,
            }}
          >
            <Spin />
          </div>
        )}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, timelinePlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          eventDisplay="block"
          events={calendarEvents}
          eventClick={handleEventClick}
          datesSet={handleDatesSet}
        />
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: 20,
          padding: '12px 16px',
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 24px',
          alignItems: 'center',
        }}
      >
        <Text strong style={{ fontSize: 12 }}>Legend:</Text>
        {ALL_EVENT_TYPES.map(type => (
          <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: EVENT_TYPE_COLORS[type],
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {EVENT_TYPE_LABELS[type]}
          </span>
        ))}
      </div>
    </div>
  )
}
