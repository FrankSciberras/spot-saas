'use client';

import { useState } from 'react';

export const fmtEUR = (n: number, opts: { decimals?: number; compact?: boolean } = {}) => {
  const { decimals = 2, compact = false } = opts;
  if (compact && Math.abs(n) >= 1000) {
    return '€' + (n / 1000).toFixed(n >= 10000 ? 1 : 2) + 'k';
  }
  return '€' + n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

interface Pt { x: number; y: number; }

/** Smooth cardinal-ish path with no overshoots. */
function smoothPath(points: Pt[], tension = 0.35) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export interface EarningsDatum { label: string; income: number; expenses: number; profit: number; }

export const EarningsLineChart = ({ data, w = 760, h = 240 }: { data: EarningsDatum[]; w?: number; h?: number }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Not enough data to plot.</div>;
  }
  const padL = 38, padR = 8, padT = 14, padB = 26;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxV = Math.max(...data.map((d) => Math.max(d.income, d.expenses, d.profit))) * 1.08 || 1;
  const minV = 0;

  const xFor = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const yFor = (v: number) => padT + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const series = {
    income: data.map((d, i) => ({ x: xFor(i), y: yFor(d.income) })),
    expenses: data.map((d, i) => ({ x: xFor(i), y: yFor(d.expenses) })),
    profit: data.map((d, i) => ({ x: xFor(i), y: yFor(d.profit) })),
  };

  const incomePath = smoothPath(series.income);
  const expensesPath = smoothPath(series.expenses);
  const profitPath = smoothPath(series.profit);
  const areaPath = incomePath + ` L ${xFor(data.length - 1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + innerH - t * innerH,
    label: Math.round((minV + t * (maxV - minV)) / 100) * 100,
  }));

  const xLabels = data
    .map((d, i) => ({ i, x: xFor(i), label: d.label }))
    .filter((_, i) => i % 5 === 0 || i === data.length - 1);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - padL) / innerW) * (data.length - 1));
    if (i >= 0 && i < data.length) setHover(i);
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="incomeArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3ecf8e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3ecf8e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke="var(--chart-grid)" strokeDasharray={i === 0 ? '0' : '2 4'} />
          <text x={padL - 8} y={t.y + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">€{t.label >= 1000 ? t.label / 1000 + 'k' : t.label}</text>
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={h - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">{l.label}</text>
      ))}
      <path d={areaPath} fill="url(#incomeArea)" />
      <path d={expensesPath} fill="none" stroke="#f06464" strokeWidth="1.5" opacity="0.8" />
      <path d={profitPath} fill="none" stroke="#5b8dff" strokeWidth="1.5" opacity="0.85" strokeDasharray="3 3" />
      <path d={incomePath} fill="none" stroke="#3ecf8e" strokeWidth="2" />
      {hover !== null && (
        <g>
          <line x1={xFor(hover)} x2={xFor(hover)} y1={padT} y2={padT + innerH} stroke="var(--chart-cursor)" strokeDasharray="2 3" />
          <circle cx={xFor(hover)} cy={yFor(data[hover].income)} r="3.5" fill="#3ecf8e" stroke="var(--bg-0)" strokeWidth="2" />
          <circle cx={xFor(hover)} cy={yFor(data[hover].expenses)} r="3" fill="#f06464" stroke="var(--bg-0)" strokeWidth="2" />
          <circle cx={xFor(hover)} cy={yFor(data[hover].profit)} r="3" fill="#5b8dff" stroke="var(--bg-0)" strokeWidth="2" />
          <g transform={`translate(${Math.min(xFor(hover) + 12, w - 140)}, ${padT + 6})`}>
            <rect width="130" height="68" rx="6" fill="var(--bg-1)" stroke="var(--line-2)" />
            <text x="10" y="16" fontSize="10.5" fill="var(--text-2)" fontFamily="Geist Mono, monospace">{data[hover].label}</text>
            <circle cx="14" cy="30" r="3" fill="#3ecf8e" />
            <text x="22" y="33" fontSize="11" fill="var(--text-1)" fontFamily="Geist Mono, monospace">€{data[hover].income.toLocaleString()}</text>
            <circle cx="14" cy="44" r="3" fill="#f06464" />
            <text x="22" y="47" fontSize="11" fill="var(--text-1)" fontFamily="Geist Mono, monospace">€{data[hover].expenses.toLocaleString()}</text>
            <circle cx="14" cy="58" r="3" fill="#5b8dff" />
            <text x="22" y="61" fontSize="11" fill="var(--text-1)" fontFamily="Geist Mono, monospace">€{data[hover].profit.toLocaleString()}</text>
          </g>
        </g>
      )}
    </svg>
  );
};

export const ProfitDonut = ({ income, expenses, size = 168 }: { income: number; expenses: number; size?: number }) => {
  const profit = income - expenses;
  const margin = income > 0 ? ((profit / income) * 100).toFixed(1) : '0.0';
  const cx = size / 2, cy = size / 2, r = size / 2 - 14, sw = 14;
  const C = 2 * Math.PI * r;
  const expPct = income > 0 ? expenses / income : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3ecf8e" strokeWidth={sw} strokeLinecap="butt" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f06464" strokeWidth={sw} strokeDasharray={`${C * expPct} ${C}`} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="var(--text-3)" fontFamily="Geist Mono, monospace">MARGIN</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="22" fill="var(--text-1)" fontWeight="600" fontFamily="Geist Mono, monospace">{margin}%</text>
    </svg>
  );
};

export interface ExpenseDatum { label: string; amount: number; color: string; }

export const ExpenseBars = ({ data }: { data: ExpenseDatum[] }) => {
  const max = Math.max(...data.map((d) => d.amount)) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: d.color }} />
              {d.label}
            </div>
            <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text-3)' }}>€{d.amount.toLocaleString()}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(d.amount / max) * 100}%`, height: '100%', background: d.color, opacity: 0.85, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const Sparkline = ({ data, w = 120, h = 32, color = '#5b8dff', fill = true }: { data: { v: number }[]; w?: number; h?: number; color?: string; fill?: boolean }) => {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.v));
  const min = Math.min(...data.map((d) => d.v));
  const range = max - min || 1;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * (w - 2) + 1,
    y: h - 2 - ((d.v - min) / range) * (h - 4),
  }));
  const path = smoothPath(pts, 0.4);
  const area = path + ` L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {fill && <path d={area} fill={color} opacity="0.14" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
};

export const UtilRing = ({ value, size = 64, stroke = 6, color = '#5b8dff' }: { value: number; size?: number; stroke?: number; color?: string }) => {
  const cx = size / 2, cy = size / 2, r = size / 2 - stroke / 2 - 1;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${C * value} ${C}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size > 60 ? 14 : 11} fontWeight="600" fill="var(--text-1)" fontFamily="Geist Mono, monospace">{Math.round(value * 100)}%</text>
    </svg>
  );
};
