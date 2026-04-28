import { ChartData, ChartOptions } from 'chart.js';

export type MiniGraphConfig = 'idle' | 'rev' | 'warmup';

export function makeMiniLineData(label: string, color: string): ChartData<'line'> {
  return {
    labels: [],
    datasets: [{
      label,
      data: [],
      borderColor: color,
      backgroundColor: color + '22',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2
    }]
  };
}

const BASE_MINI_OPTIONS: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { display: false },
    y: {
      grid: { color: '#333333' },
      ticks: { color: '#cccccc', maxTicksLimit: 4 }
    }
  }
};

export const MINI_CHART_OPTIONS: Record<MiniGraphConfig, ChartOptions<'line'>> = {
  idle: {
    ...BASE_MINI_OPTIONS,
    scales: {
      x: { display: false },
      y: { min: 0, max: 1500, grid: { color: '#333333' }, ticks: { color: '#cccccc', maxTicksLimit: 4 } }
    }
  },
  rev: {
    ...BASE_MINI_OPTIONS,
    scales: {
      x: { display: false },
      y: { min: 0, max: 4000, grid: { color: '#333333' }, ticks: { color: '#cccccc', maxTicksLimit: 4 } }
    }
  },
  warmup: {
    ...BASE_MINI_OPTIONS,
    scales: {
      x: { display: false },
      y: { min: 0, max: 120, grid: { color: '#333333' }, ticks: { color: '#cccccc', maxTicksLimit: 4 } }
    }
  }
};

export const MINI_CHART_COLORS: Record<MiniGraphConfig, string> = {
  idle: '#4CAF50',
  rev: '#2196F3',
  warmup: '#ff9800'
};

export const MINI_CHART_LABELS: Record<MiniGraphConfig, string> = {
  idle: 'RPM',
  rev: 'RPM',
  warmup: 'Coolant °C'
};
