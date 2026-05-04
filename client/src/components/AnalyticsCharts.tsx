import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ActivityEvent } from '../hooks/useActivity';

interface AnalyticsChartsProps {
  events: ActivityEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  PushEvent: '#3B82F6', // Blue
  PullRequestEvent: '#8B5CF6', // Purple
  IssuesEvent: '#10B981', // Green
  CreateEvent: '#F59E0B', // Yellow
  ReleaseEvent: '#EF4444', // Red
};

function getEventColor(type: string) {
  return EVENT_COLORS[type] || '#6B7280'; // Default gray
}

export function EventTypeBreakdown({ events }: AnalyticsChartsProps) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.event_type] = (counts[event.event_type] || 0) + 1;
    }
    
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.replace('Event', ''), value, originalName: name }))
      .sort((a, b) => b.value - a.value);
  }, [events]);

  if (events.length === 0) return <p style={{ color: 'var(--text-muted)' }}>No data available.</p>;

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getEventColor(entry.originalName)} stroke="rgba(255,255,255,0.05)" strokeWidth={2}/>
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px',
              color: 'var(--text-primary)'
            }} 
            itemStyle={{ color: 'var(--text-primary)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TimeOfDayActivity({ events }: AnalyticsChartsProps) {
  const data = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    
    for (const event of events) {
      const date = new Date(event.occurred_at);
      const hour = date.getHours();
      hours[hour].count += 1;
    }

    return hours.map(d => ({
      ...d,
      label: `${d.hour}:00`,
    }));
  }, [events]);

  if (events.length === 0) return <p style={{ color: 'var(--text-muted)' }}>No data available.</p>;

  // Find max for highlighting
  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
          <XAxis 
            dataKey="label" 
            stroke="var(--text-muted)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis 
            stroke="var(--text-muted)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip 
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px',
              color: 'var(--text-primary)'
            }} 
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.count === maxCount && maxCount > 0 ? 'var(--accent-purple)' : 'var(--accent-blue-transparent)'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
