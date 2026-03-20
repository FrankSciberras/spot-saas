'use client';

import type { DamageZone, DamageSeverity } from '@/lib/types/database';
import styles from './damages.module.css';

export const ZONE_LABELS: Record<DamageZone, string> = {
  front_bumper: 'Front Bumper',
  rear_bumper: 'Rear Bumper',
  hood: 'Hood',
  trunk: 'Trunk',
  roof: 'Roof',
  front_left_door: 'Front Left Door',
  front_right_door: 'Front Right Door',
  rear_left_door: 'Rear Left Door',
  rear_right_door: 'Rear Right Door',
  front_left_fender: 'Front Left Fender',
  front_right_fender: 'Front Right Fender',
  rear_left_fender: 'Rear Left Fender',
  rear_right_fender: 'Rear Right Fender',
  windshield: 'Windshield',
  rear_window: 'Rear Window',
  left_side: 'Left Side',
  right_side: 'Right Side',
  front_left_rim: 'Front Left Rim',
  front_right_rim: 'Front Right Rim',
  rear_left_rim: 'Rear Left Rim',
  rear_right_rim: 'Rear Right Rim',
};

interface ZoneDamageInfo {
  count: number;
  maxSeverity: DamageSeverity;
}

interface CarDiagramProps {
  zoneDamages: Record<string, ZoneDamageInfo>;
  selectedZone: DamageZone | null;
  onZoneClick: (zone: DamageZone) => void;
  hoveredZone: DamageZone | null;
  onZoneHover: (zone: DamageZone | null) => void;
}

function getSeverityColor(severity: DamageSeverity): string {
  switch (severity) {
    case 'severe': return 'rgba(239, 68, 68, 0.45)';
    case 'moderate': return 'rgba(245, 158, 11, 0.45)';
    case 'minor': return 'rgba(234, 179, 8, 0.35)';
  }
}

function getSeverityStroke(severity: DamageSeverity): string {
  switch (severity) {
    case 'severe': return '#ef4444';
    case 'moderate': return '#f59e0b';
    case 'minor': return '#eab308';
  }
}

interface ZonePathProps {
  zone: DamageZone;
  d: string;
  damageInfo?: ZoneDamageInfo;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ZonePath({ zone, d, damageInfo, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }: ZonePathProps) {
  const hasDamage = damageInfo && damageInfo.count > 0;
  const fill = hasDamage
    ? getSeverityColor(damageInfo.maxSeverity)
    : isHovered
      ? 'rgba(99, 102, 241, 0.12)'
      : 'rgba(0, 0, 0, 0)';
  const stroke = hasDamage
    ? getSeverityStroke(damageInfo.maxSeverity)
    : isSelected
      ? 'var(--color-primary, #6366f1)'
      : isHovered
        ? 'var(--color-primary, #6366f1)'
        : 'var(--border-color, #d1d5db)';
  const strokeWidth = isSelected || isHovered ? 2.5 : 1.5;

  return (
    <path
      data-zone={zone}
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

interface ZoneRectProps {
  zone: DamageZone;
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  damageInfo?: ZoneDamageInfo;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ZoneRect({ zone, x, y, width, height, rx = 0, damageInfo, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }: ZoneRectProps) {
  const hasDamage = damageInfo && damageInfo.count > 0;
  const fill = hasDamage
    ? getSeverityColor(damageInfo.maxSeverity)
    : isHovered
      ? 'rgba(99, 102, 241, 0.12)'
      : 'rgba(0, 0, 0, 0)';
  const stroke = hasDamage
    ? getSeverityStroke(damageInfo.maxSeverity)
    : isSelected
      ? 'var(--color-primary, #6366f1)'
      : isHovered
        ? 'var(--color-primary, #6366f1)'
        : 'var(--border-color, #d1d5db)';
  const strokeWidth = isSelected || isHovered ? 2.5 : 1.5;

  return (
    <rect
      data-zone={zone}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={rx}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

function DamageIndicator({ x, y, count, severity }: { x: number; y: number; count: number; severity: DamageSeverity }) {
  const color = severity === 'severe' ? '#ef4444' : severity === 'moderate' ? '#f59e0b' : '#eab308';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={10} fill={color} stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="10" fontWeight="700">
        {count}
      </text>
    </g>
  );
}

export default function CarDiagram({ zoneDamages, selectedZone, onZoneClick, hoveredZone, onZoneHover }: CarDiagramProps) {
  const zoneProps = (zone: DamageZone) => ({
    zone,
    damageInfo: zoneDamages[zone],
    isSelected: selectedZone === zone,
    isHovered: hoveredZone === zone,
    onClick: () => onZoneClick(zone),
    onMouseEnter: () => onZoneHover(zone),
    onMouseLeave: () => onZoneHover(null),
  });

  return (
    <div className={styles.diagramContainer}>
      {/* Top-down view */}
      <div className={styles.diagramView}>
        <div className={styles.diagramLabel}>Top View</div>
        <svg viewBox="0 0 200 440" className={styles.diagramSvg} aria-label="Toyota Yaris Cross top-down view">
          {/* === YARIS CROSS TOP-DOWN === */}

          {/* Main body shell - angular crossover shape with flared arches */}
          <path
            d="M 66,48 C 66,30 80,22 100,20 C 120,22 134,30 134,48
               L 137,60 L 142,78 C 147,88 150,98 150,108 L 150,122 C 150,130 147,135 142,138
               L 140,150 L 140,282 L 142,295
               C 147,298 150,305 150,312 L 150,326 C 150,335 147,342 142,348
               L 137,362 L 134,378 C 134,396 120,404 100,406
               C 80,404 66,396 66,378 L 63,362 L 58,348
               C 53,342 50,335 50,326 L 50,312 C 50,305 53,298 58,295
               L 60,282 L 60,150 L 58,138 C 53,135 50,130 50,122
               L 50,108 C 50,98 53,88 58,78 L 63,60 Z"
            fill="var(--bg-card, #f8fafc)"
            stroke="var(--text-secondary, #64748b)"
            strokeWidth="2"
          />

          {/* Black plastic wheel arch cladding (decorative) */}
          <path d="M 48,95 C 46,100 44,108 44,115 L 44,128 C 44,132 46,136 50,138 L 50,122 C 50,112 52,102 56,94 Z" fill="var(--text-secondary, #64748b)" opacity={0.15} />
          <path d="M 152,95 C 154,100 156,108 156,115 L 156,128 C 156,132 154,136 150,138 L 150,122 C 150,112 148,102 144,94 Z" fill="var(--text-secondary, #64748b)" opacity={0.15} />
          <path d="M 48,332 C 46,326 44,318 44,312 L 44,298 C 44,294 46,290 50,288 L 50,304 C 50,314 52,324 56,332 Z" fill="var(--text-secondary, #64748b)" opacity={0.15} />
          <path d="M 152,332 C 154,326 156,318 156,312 L 156,298 C 156,294 154,290 150,288 L 150,304 C 150,314 148,324 144,332 Z" fill="var(--text-secondary, #64748b)" opacity={0.15} />

          {/* Windshield zone */}
          <ZonePath
            {...zoneProps('windshield')}
            d="M 72,95 C 72,78 84,70 100,68 C 116,70 128,78 128,95 L 132,125 L 68,125 Z"
          />

          {/* Rear window zone */}
          <ZonePath
            {...zoneProps('rear_window')}
            d="M 72,335 C 72,350 84,358 100,360 C 116,358 128,350 128,335 L 132,305 L 68,305 Z"
          />

          {/* Hood zone - short crossover hood */}
          <ZonePath
            {...zoneProps('hood')}
            d="M 68,52 C 68,36 82,28 100,26 C 118,28 132,36 132,52
               L 136,65 L 140,80 L 130,80 C 128,72 116,66 100,64
               C 84,66 72,72 70,80 L 60,80 L 64,65 Z"
          />

          {/* Trunk zone */}
          <ZonePath
            {...zoneProps('trunk')}
            d="M 68,374 C 68,390 82,398 100,400 C 118,398 132,390 132,374
               L 136,362 L 140,348 L 130,348 C 128,356 116,362 100,364
               C 84,362 72,356 70,348 L 60,348 L 64,362 Z"
          />

          {/* Roof zone */}
          <ZoneRect
            {...zoneProps('roof')}
            x={70} y={130} width={60} height={170} rx={6}
          />

          {/* Front bumper zone - wide angular Yaris Cross front */}
          <ZonePath
            {...zoneProps('front_bumper')}
            d="M 60,22 C 60,10 78,4 100,4 C 122,4 140,10 140,22
               L 140,40 C 136,34 120,28 100,26 C 80,28 64,34 60,40 Z"
          />

          {/* Rear bumper zone */}
          <ZonePath
            {...zoneProps('rear_bumper')}
            d="M 60,404 C 60,416 78,422 100,422 C 122,422 140,416 140,404
               L 140,388 C 136,394 120,400 100,402 C 80,400 64,394 60,388 Z"
          />

          {/* Front left fender */}
          <ZonePath
            {...zoneProps('front_left_fender')}
            d="M 50,80 L 58,60 L 63,60 L 56,80 L 50,108 L 50,80 Z"
          />

          {/* Front right fender */}
          <ZonePath
            {...zoneProps('front_right_fender')}
            d="M 150,80 L 142,60 L 137,60 L 144,80 L 150,108 L 150,80 Z"
          />

          {/* Rear left fender */}
          <ZonePath
            {...zoneProps('rear_left_fender')}
            d="M 50,326 L 50,348 L 58,368 L 63,368 L 56,348 L 50,326 Z"
          />

          {/* Rear right fender */}
          <ZonePath
            {...zoneProps('rear_right_fender')}
            d="M 150,326 L 150,348 L 142,368 L 137,368 L 144,348 L 150,326 Z"
          />

          {/* Front left door */}
          <ZoneRect
            {...zoneProps('front_left_door')}
            x={48} y={125} width={20} height={85} rx={3}
          />

          {/* Front right door */}
          <ZoneRect
            {...zoneProps('front_right_door')}
            x={132} y={125} width={20} height={85} rx={3}
          />

          {/* Rear left door */}
          <ZoneRect
            {...zoneProps('rear_left_door')}
            x={48} y={215} width={20} height={85} rx={3}
          />

          {/* Rear right door */}
          <ZoneRect
            {...zoneProps('rear_right_door')}
            x={132} y={215} width={20} height={85} rx={3}
          />

          {/* Wheels / Rims - clickable zones */}
          <rect data-zone="front_left_rim" x={38} y={100} width={14} height={34} rx={5}
            fill={zoneDamages.front_left_rim ? getSeverityColor(zoneDamages.front_left_rim.maxSeverity) : (hoveredZone === 'front_left_rim' ? 'rgba(99,102,241,0.25)' : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.front_left_rim || hoveredZone === 'front_left_rim' || selectedZone === 'front_left_rim' ? 1 : 0.35}
            stroke={selectedZone === 'front_left_rim' ? 'var(--color-primary, #6366f1)' : (zoneDamages.front_left_rim ? getSeverityStroke(zoneDamages.front_left_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'front_left_rim' || hoveredZone === 'front_left_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('front_left_rim')}
            onMouseEnter={() => onZoneHover('front_left_rim')}
            onMouseLeave={() => onZoneHover(null)}
          />
          <rect data-zone="front_right_rim" x={148} y={100} width={14} height={34} rx={5}
            fill={zoneDamages.front_right_rim ? getSeverityColor(zoneDamages.front_right_rim.maxSeverity) : (hoveredZone === 'front_right_rim' ? 'rgba(99,102,241,0.25)' : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.front_right_rim || hoveredZone === 'front_right_rim' || selectedZone === 'front_right_rim' ? 1 : 0.35}
            stroke={selectedZone === 'front_right_rim' ? 'var(--color-primary, #6366f1)' : (zoneDamages.front_right_rim ? getSeverityStroke(zoneDamages.front_right_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'front_right_rim' || hoveredZone === 'front_right_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('front_right_rim')}
            onMouseEnter={() => onZoneHover('front_right_rim')}
            onMouseLeave={() => onZoneHover(null)}
          />
          <rect data-zone="rear_left_rim" x={38} y={295} width={14} height={34} rx={5}
            fill={zoneDamages.rear_left_rim ? getSeverityColor(zoneDamages.rear_left_rim.maxSeverity) : (hoveredZone === 'rear_left_rim' ? 'rgba(99,102,241,0.25)' : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.rear_left_rim || hoveredZone === 'rear_left_rim' || selectedZone === 'rear_left_rim' ? 1 : 0.35}
            stroke={selectedZone === 'rear_left_rim' ? 'var(--color-primary, #6366f1)' : (zoneDamages.rear_left_rim ? getSeverityStroke(zoneDamages.rear_left_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'rear_left_rim' || hoveredZone === 'rear_left_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('rear_left_rim')}
            onMouseEnter={() => onZoneHover('rear_left_rim')}
            onMouseLeave={() => onZoneHover(null)}
          />
          <rect data-zone="rear_right_rim" x={148} y={295} width={14} height={34} rx={5}
            fill={zoneDamages.rear_right_rim ? getSeverityColor(zoneDamages.rear_right_rim.maxSeverity) : (hoveredZone === 'rear_right_rim' ? 'rgba(99,102,241,0.25)' : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.rear_right_rim || hoveredZone === 'rear_right_rim' || selectedZone === 'rear_right_rim' ? 1 : 0.35}
            stroke={selectedZone === 'rear_right_rim' ? 'var(--color-primary, #6366f1)' : (zoneDamages.rear_right_rim ? getSeverityStroke(zoneDamages.rear_right_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'rear_right_rim' || hoveredZone === 'rear_right_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('rear_right_rim')}
            onMouseEnter={() => onZoneHover('rear_right_rim')}
            onMouseLeave={() => onZoneHover(null)}
          />

          {/* Side mirrors - high-mounted */}
          <ellipse cx={40} cy={120} rx={6} ry={8} fill="var(--text-secondary, #64748b)" opacity={0.2} />
          <ellipse cx={160} cy={120} rx={6} ry={8} fill="var(--text-secondary, #64748b)" opacity={0.2} />

          {/* Angular LED headlights */}
          <path d="M 70,36 L 82,30 L 82,42 Z" fill="rgba(253, 224, 71, 0.35)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.7} />
          <path d="M 130,36 L 118,30 L 118,42 Z" fill="rgba(253, 224, 71, 0.35)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.7} />

          {/* Connected taillight bar (Yaris Cross signature) */}
          <rect x={68} y={388} width={64} height={4} rx={2} fill="rgba(239, 68, 68, 0.3)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.7} />

          {/* Roof rails */}
          <line x1={72} y1={135} x2={72} y2={295} stroke="var(--text-secondary, #64748b)" strokeWidth={1} opacity={0.2} />
          <line x1={128} y1={135} x2={128} y2={295} stroke="var(--text-secondary, #64748b)" strokeWidth={1} opacity={0.2} />

          {/* Grille hint */}
          <rect x={85} y={30} width={30} height={10} rx={3} fill="var(--text-secondary, #64748b)" opacity={0.12} />

          {/* Damage indicators */}
          {zoneDamages.front_bumper && <DamageIndicator x={100} y={14} count={zoneDamages.front_bumper.count} severity={zoneDamages.front_bumper.maxSeverity} />}
          {zoneDamages.rear_bumper && <DamageIndicator x={100} y={412} count={zoneDamages.rear_bumper.count} severity={zoneDamages.rear_bumper.maxSeverity} />}
          {zoneDamages.hood && <DamageIndicator x={100} y={58} count={zoneDamages.hood.count} severity={zoneDamages.hood.maxSeverity} />}
          {zoneDamages.trunk && <DamageIndicator x={100} y={370} count={zoneDamages.trunk.count} severity={zoneDamages.trunk.maxSeverity} />}
          {zoneDamages.windshield && <DamageIndicator x={100} y={98} count={zoneDamages.windshield.count} severity={zoneDamages.windshield.maxSeverity} />}
          {zoneDamages.rear_window && <DamageIndicator x={100} y={330} count={zoneDamages.rear_window.count} severity={zoneDamages.rear_window.maxSeverity} />}
          {zoneDamages.roof && <DamageIndicator x={100} y={215} count={zoneDamages.roof.count} severity={zoneDamages.roof.maxSeverity} />}
          {zoneDamages.front_left_door && <DamageIndicator x={54} y={168} count={zoneDamages.front_left_door.count} severity={zoneDamages.front_left_door.maxSeverity} />}
          {zoneDamages.front_right_door && <DamageIndicator x={146} y={168} count={zoneDamages.front_right_door.count} severity={zoneDamages.front_right_door.maxSeverity} />}
          {zoneDamages.rear_left_door && <DamageIndicator x={54} y={258} count={zoneDamages.rear_left_door.count} severity={zoneDamages.rear_left_door.maxSeverity} />}
          {zoneDamages.rear_right_door && <DamageIndicator x={146} y={258} count={zoneDamages.rear_right_door.count} severity={zoneDamages.rear_right_door.maxSeverity} />}
          {zoneDamages.front_left_fender && <DamageIndicator x={48} y={78} count={zoneDamages.front_left_fender.count} severity={zoneDamages.front_left_fender.maxSeverity} />}
          {zoneDamages.front_right_fender && <DamageIndicator x={152} y={78} count={zoneDamages.front_right_fender.count} severity={zoneDamages.front_right_fender.maxSeverity} />}
          {zoneDamages.rear_left_fender && <DamageIndicator x={48} y={348} count={zoneDamages.rear_left_fender.count} severity={zoneDamages.rear_left_fender.maxSeverity} />}
          {zoneDamages.rear_right_fender && <DamageIndicator x={152} y={348} count={zoneDamages.rear_right_fender.count} severity={zoneDamages.rear_right_fender.maxSeverity} />}
          {zoneDamages.front_left_rim && <DamageIndicator x={45} y={117} count={zoneDamages.front_left_rim.count} severity={zoneDamages.front_left_rim.maxSeverity} />}
          {zoneDamages.front_right_rim && <DamageIndicator x={155} y={117} count={zoneDamages.front_right_rim.count} severity={zoneDamages.front_right_rim.maxSeverity} />}
          {zoneDamages.rear_left_rim && <DamageIndicator x={45} y={312} count={zoneDamages.rear_left_rim.count} severity={zoneDamages.rear_left_rim.maxSeverity} />}
          {zoneDamages.rear_right_rim && <DamageIndicator x={155} y={312} count={zoneDamages.rear_right_rim.count} severity={zoneDamages.rear_right_rim.maxSeverity} />}
        </svg>
      </div>

      {/* Side view */}
      <div className={styles.diagramView}>
        <div className={styles.diagramLabel}>Side View</div>
        <svg viewBox="0 0 450 210" className={styles.diagramSvg} aria-label="Toyota Yaris Cross side view">
          {/* === YARIS CROSS SIDE PROFILE === */}

          {/* Main body shell - crossover profile with high ride, sloped roof */}
          <path
            d="M 32,140 L 32,118 C 32,112 36,106 42,102
               L 55,96 L 85,88 L 125,82
               C 130,68 145,52 160,44 L 175,38 L 185,36
               C 195,34 210,33 230,32 L 270,32
               C 290,32 310,34 325,40 L 340,48
               C 350,54 358,62 365,72 L 375,85
               L 390,92 C 398,96 404,102 406,108
               L 408,118 L 408,140"
            fill="var(--bg-card, #f8fafc)"
            stroke="var(--text-secondary, #64748b)"
            strokeWidth="2"
          />

          {/* Bottom body line with wheel arch cutouts */}
          <path
            d="M 32,140 L 80,140
               C 82,140 84,138 86,136 C 92,128 102,122 115,122 C 128,122 138,128 144,136 C 146,138 148,140 150,140
               L 290,140
               C 292,140 294,138 296,136 C 302,128 312,122 325,122 C 338,122 348,128 354,136 C 356,138 358,140 360,140
               L 408,140"
            fill="none"
            stroke="var(--text-secondary, #64748b)"
            strokeWidth="2"
          />

          {/* Black plastic wheel arch cladding - front */}
          <path
            d="M 75,140 C 75,140 78,138 82,134 C 90,124 102,116 115,116
               C 128,116 140,124 148,134 C 152,138 155,140 155,140
               L 155,144 C 155,144 148,142 144,138 C 138,130 128,124 115,124
               C 102,124 92,130 86,138 C 82,142 75,144 75,144 Z"
            fill="var(--text-secondary, #64748b)"
            opacity={0.18}
          />

          {/* Black plastic wheel arch cladding - rear */}
          <path
            d="M 285,140 C 285,140 288,138 292,134 C 300,124 312,116 325,116
               C 338,116 350,124 358,134 C 362,138 365,140 365,140
               L 365,144 C 365,144 358,142 354,138 C 348,130 338,124 325,124
               C 312,124 302,130 296,138 C 292,142 285,144 285,144 Z"
            fill="var(--text-secondary, #64748b)"
            opacity={0.18}
          />

          {/* Black rocker panel / side skirt */}
          <rect x={150} y={134} width={140} height={8} rx={2} fill="var(--text-secondary, #64748b)" opacity={0.12} />

          {/* Front bumper zone */}
          <ZonePath
            {...zoneProps('front_bumper')}
            d="M 22,108 C 22,102 26,98 32,96 L 32,140 L 22,140 C 18,140 16,136 16,130 L 16,118 C 16,112 18,108 22,108 Z"
          />

          {/* Rear bumper zone */}
          <ZonePath
            {...zoneProps('rear_bumper')}
            d="M 408,108 L 414,108 C 420,108 424,112 424,118 L 424,130 C 424,136 420,140 414,140 L 408,140 Z"
          />

          {/* Hood zone - short crossover hood, slight upward slope */}
          <ZonePath
            {...zoneProps('hood')}
            d="M 42,102 L 55,96 L 85,88 L 125,82 L 128,82
               L 128,92 L 85,96 L 55,102 L 42,106 Z"
          />

          {/* Windshield zone - steeply raked A-pillar */}
          <ZonePath
            {...zoneProps('windshield')}
            d="M 128,82 C 132,68 148,50 162,42 L 178,36 L 188,34
               L 188,42 L 178,44 L 162,52 L 140,72 L 134,82 L 128,92 Z"
          />

          {/* Roof zone - flat then sloping at rear */}
          <ZonePath
            {...zoneProps('roof')}
            d="M 188,34 C 198,32 215,31 235,31 L 275,31
               C 295,31 310,33 320,38
               L 330,44 L 320,46 L 310,42
               C 300,38 285,36 270,35 L 230,35
               C 210,35 198,36 188,38 Z"
          />

          {/* Rear window zone - thick C-pillar slope */}
          <ZonePath
            {...zoneProps('rear_window')}
            d="M 330,44 L 340,50 C 348,56 356,64 362,74
               L 368,85 L 358,85 L 354,78 C 348,68 342,60 336,54
               L 326,48 Z"
          />

          {/* Trunk / rear hatch zone */}
          <ZonePath
            {...zoneProps('trunk')}
            d="M 368,85 L 378,88 L 390,92 C 396,95 402,100 405,106
               L 408,112 L 408,108 L 405,100 L 396,94 L 385,90
               L 372,86 L 368,82 Z"
          />

          {/* Left side panel (sill area between wheel arches) */}
          <ZonePath
            {...zoneProps('left_side')}
            d="M 42,106 L 125,92 L 128,92 L 128,140 L 80,140
               C 78,140 76,138 75,136 L 72,132 L 48,132 L 42,134 Z"
          />

          {/* Front left door zone */}
          <ZonePath
            {...zoneProps('front_left_door')}
            d="M 150,55 L 165,44 L 188,36 L 188,38 L 230,35 L 230,140 L 150,140 Z"
          />

          {/* Rear left door zone */}
          <ZonePath
            {...zoneProps('rear_left_door')}
            d="M 230,35 L 270,35 C 285,36 295,38 305,42 L 320,50 L 330,58
               L 330,140 L 290,140 L 230,140 Z"
          />

          {/* Front left fender zone */}
          <ZonePath
            {...zoneProps('front_left_fender')}
            d="M 128,82 L 150,55 L 150,140 L 128,140 L 128,92 Z"
          />

          {/* Rear left fender zone */}
          <ZonePath
            {...zoneProps('rear_left_fender')}
            d="M 330,58 L 340,65 L 355,78 L 368,92 L 390,100
               L 406,108 L 408,118 L 408,140 L 360,140 L 330,140 Z"
          />

          {/* Wheels / Rims - clickable zones (side view) */}
          {/* Front left rim */}
          <circle cx={115} cy={140} r={26}
            fill={zoneDamages.front_left_rim ? getSeverityColor(zoneDamages.front_left_rim.maxSeverity) : (hoveredZone === 'front_left_rim' ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary, #f1f5f9)')}
            stroke={selectedZone === 'front_left_rim' ? 'var(--color-primary, #6366f1)' : (zoneDamages.front_left_rim ? getSeverityStroke(zoneDamages.front_left_rim.maxSeverity) : 'var(--text-secondary, #64748b)')}
            strokeWidth={selectedZone === 'front_left_rim' || hoveredZone === 'front_left_rim' ? 2.5 : 2}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('front_left_rim')}
            onMouseEnter={() => onZoneHover('front_left_rim')}
            onMouseLeave={() => onZoneHover(null)}
          />
          <circle cx={115} cy={140} r={18} fill="var(--bg-card, #fff)" stroke="var(--text-secondary, #64748b)" strokeWidth="1.2" style={{ pointerEvents: 'none' }} />
          {/* Alloy spokes */}
          <line x1={115} y1={124} x2={115} y2={156} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <line x1={99} y1={140} x2={131} y2={140} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <line x1={104} y1={129} x2={126} y2={151} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <line x1={126} y1={129} x2={104} y2={151} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <circle cx={115} cy={140} r={4} fill="var(--text-secondary, #64748b)" style={{ pointerEvents: 'none' }} />

          {/* Rear left rim */}
          <circle cx={325} cy={140} r={26}
            fill={zoneDamages.rear_left_rim ? getSeverityColor(zoneDamages.rear_left_rim.maxSeverity) : (hoveredZone === 'rear_left_rim' ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary, #f1f5f9)')}
            stroke={selectedZone === 'rear_left_rim' ? 'var(--color-primary, #6366f1)' : (zoneDamages.rear_left_rim ? getSeverityStroke(zoneDamages.rear_left_rim.maxSeverity) : 'var(--text-secondary, #64748b)')}
            strokeWidth={selectedZone === 'rear_left_rim' || hoveredZone === 'rear_left_rim' ? 2.5 : 2}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('rear_left_rim')}
            onMouseEnter={() => onZoneHover('rear_left_rim')}
            onMouseLeave={() => onZoneHover(null)}
          />
          <circle cx={325} cy={140} r={18} fill="var(--bg-card, #fff)" stroke="var(--text-secondary, #64748b)" strokeWidth="1.2" style={{ pointerEvents: 'none' }} />
          <line x1={325} y1={124} x2={325} y2={156} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <line x1={309} y1={140} x2={341} y2={140} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <line x1={314} y1={129} x2={336} y2={151} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <line x1={336} y1={129} x2={314} y2={151} stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} opacity={0.25} style={{ pointerEvents: 'none' }} />
          <circle cx={325} cy={140} r={4} fill="var(--text-secondary, #64748b)" style={{ pointerEvents: 'none' }} />

          {/* Angular LED headlight */}
          <path d="M 30,104 L 42,98 L 42,112 L 30,116 Z" fill="rgba(253, 224, 71, 0.4)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} />

          {/* Connected LED taillight bar */}
          <path d="M 402,100 L 412,104 L 412,114 L 406,116 L 402,112 Z" fill="rgba(239, 68, 68, 0.35)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.8} />

          {/* Side mirror - high mount on A-pillar */}
          <ellipse cx={148} cy={58} rx={6} ry={4} fill="var(--text-secondary, #64748b)" opacity={0.3} />

          {/* Door divider line (B-pillar) */}
          <line x1={230} y1={36} x2={230} y2={140} stroke="var(--text-secondary, #64748b)" strokeWidth={1} opacity={0.3} />

          {/* Door handles */}
          <rect x={196} y={82} width={14} height={3} rx={1.5} fill="var(--text-secondary, #64748b)" opacity={0.35} />
          <rect x={275} y={78} width={14} height={3} rx={1.5} fill="var(--text-secondary, #64748b)" opacity={0.35} />

          {/* Character line / crease along body side */}
          <path d="M 55,100 L 130,88 L 230,82 L 330,85 L 390,95" fill="none" stroke="var(--text-secondary, #64748b)" strokeWidth={0.6} opacity={0.2} />

          {/* Roof rail */}
          <line x1={192} y1={33} x2={315} y2={35} stroke="var(--text-secondary, #64748b)" strokeWidth={1.5} opacity={0.2} strokeLinecap="round" />

          {/* Rear spoiler hint */}
          <path d="M 320,38 L 335,45 L 330,46 L 316,40 Z" fill="var(--text-secondary, #64748b)" opacity={0.15} />

          {/* Side damage indicators */}
          {zoneDamages.front_bumper && <DamageIndicator x={24} y={124} count={zoneDamages.front_bumper.count} severity={zoneDamages.front_bumper.maxSeverity} />}
          {zoneDamages.rear_bumper && <DamageIndicator x={418} y={124} count={zoneDamages.rear_bumper.count} severity={zoneDamages.rear_bumper.maxSeverity} />}
          {zoneDamages.hood && <DamageIndicator x={85} y={92} count={zoneDamages.hood.count} severity={zoneDamages.hood.maxSeverity} />}
          {zoneDamages.windshield && <DamageIndicator x={158} y={58} count={zoneDamages.windshield.count} severity={zoneDamages.windshield.maxSeverity} />}
          {zoneDamages.roof && <DamageIndicator x={255} y={32} count={zoneDamages.roof.count} severity={zoneDamages.roof.maxSeverity} />}
          {zoneDamages.rear_window && <DamageIndicator x={348} y={62} count={zoneDamages.rear_window.count} severity={zoneDamages.rear_window.maxSeverity} />}
          {zoneDamages.trunk && <DamageIndicator x={392} y={92} count={zoneDamages.trunk.count} severity={zoneDamages.trunk.maxSeverity} />}
          {zoneDamages.front_left_door && <DamageIndicator x={190} y={85} count={zoneDamages.front_left_door.count} severity={zoneDamages.front_left_door.maxSeverity} />}
          {zoneDamages.rear_left_door && <DamageIndicator x={280} y={82} count={zoneDamages.rear_left_door.count} severity={zoneDamages.rear_left_door.maxSeverity} />}
          {zoneDamages.front_left_fender && <DamageIndicator x={140} y={110} count={zoneDamages.front_left_fender.count} severity={zoneDamages.front_left_fender.maxSeverity} />}
          {zoneDamages.rear_left_fender && <DamageIndicator x={375} y={110} count={zoneDamages.rear_left_fender.count} severity={zoneDamages.rear_left_fender.maxSeverity} />}
          {zoneDamages.left_side && <DamageIndicator x={95} y={118} count={zoneDamages.left_side.count} severity={zoneDamages.left_side.maxSeverity} />}
          {zoneDamages.front_left_rim && <DamageIndicator x={115} y={140} count={zoneDamages.front_left_rim.count} severity={zoneDamages.front_left_rim.maxSeverity} />}
          {zoneDamages.rear_left_rim && <DamageIndicator x={325} y={140} count={zoneDamages.rear_left_rim.count} severity={zoneDamages.rear_left_rim.maxSeverity} />}
        </svg>
      </div>

      {/* Hovered zone tooltip */}
      {hoveredZone && (
        <div className={styles.zoneTooltip}>
          {ZONE_LABELS[hoveredZone]}
          {zoneDamages[hoveredZone] && (
            <span className={styles.zoneTooltipCount}>
              {zoneDamages[hoveredZone].count} damage{zoneDamages[hoveredZone].count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
