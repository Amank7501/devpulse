import { useMemo } from 'react';
import type { ActivitySummary } from '../hooks/useActivity';
import styles from './ActivityHeatmap.module.css';

interface HeatmapProps {
  data: ActivitySummary[];
}

export function ActivityHeatmap({ data }: HeatmapProps) {
  const { cells, months } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    const startDayOfWeek = startDate.getDay(); // 0 = Sunday

    // Create a map for quick lookup
    const countsByDate = new Map<string, number>();
    for (const item of data) {
      const dateStr = item.period.split('T')[0];
      countsByDate.set(dateStr, item.eventCount);
    }

    const cells = [];
    const months: Array<{ label: string; offset: number }> = [];

    // Pad the beginning so the first day aligns with the correct day of the week
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ id: `pad-${i}`, isEmpty: true, count: 0, date: '', level: 0 });
    }

    let currentMonth = startDate.getMonth();
    
    // Generate 365 days
    for (let i = 0; i < 365; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      // Check if month changed to place a label
      if (date.getMonth() !== currentMonth && date.getDate() <= 7) {
        currentMonth = date.getMonth();
        // Calculate offset in columns. 
        // Total cells so far = cells.length
        const colIndex = Math.floor(cells.length / 7);
        months.push({
          label: date.toLocaleString('default', { month: 'short' }),
          offset: colIndex * 18 // 14px width + 4px gap = 18px per column
        });
      }

      const dateStr = date.toISOString().split('T')[0];
      const count = countsByDate.get(dateStr) || 0;
      
      let level = 0;
      if (count > 0 && count < 4) level = 1;
      else if (count >= 4 && count < 8) level = 2;
      else if (count >= 8 && count < 15) level = 3;
      else if (count >= 15) level = 4;

      cells.push({
        id: dateStr,
        isEmpty: false,
        count,
        date: dateStr,
        level,
        displayDate: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      });
    }

    return { cells, months };
  }, [data]);

  return (
    <div className={styles.heatmapContainer}>
      <div className={styles.heatmapScroll}>
        <div className={styles.yAxis}>
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>
        <div className={styles.gridArea}>
          <div className={styles.xAxis}>
            {months.map((month, i) => (
              <span 
                key={i} 
                className={styles.monthLabel} 
                style={{ left: `${month.offset}px` }}
              >
                {month.label}
              </span>
            ))}
          </div>
          <div className={styles.grid}>
            {cells.map((cell) => (
              <div
                key={cell.id}
                className={`${styles.cell} ${cell.isEmpty ? '' : styles[`level-${cell.level}`]}`}
                style={{ visibility: cell.isEmpty ? 'hidden' : 'visible' }}
              >
                {!cell.isEmpty && (
                  <div className={styles.tooltip}>
                    {cell.count} events on {cell.displayDate}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
