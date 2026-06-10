'use client';

import type { DamageZone, DamageSeverity } from '@/lib/types/database';
import styles from './damages.module.css';
import { svgZonePaths } from './yarisZonePaths';

// Zone hit-area polygons for side view — invisible fills that capture hover/click
const SIDE_ZONE_PATHS: Record<string, string> = {
  front_bumper: 'M 40,370 L 180,340 L 180,650 L 40,650 Z',
  hood: 'M 180,350 L 425,275 L 440,405 L 180,450 Z',
  windshield: 'M 425,275 L 555,190 L 575,195 L 445,400 Z',
  roof: 'M 555,182 L 1085,182 L 1090,260 L 555,255 Z',
  rear_window: 'M 1085,182 L 1125,182 L 1315,385 L 1270,405 Z',
  trunk: 'M 1265,385 L 1400,405 L 1400,560 L 1265,535 Z',
  rear_bumper: 'M 1400,395 L 1475,415 L 1475,650 L 1400,650 Z',
  front_left_fender: 'M 180,450 L 530,350 L 530,600 L 180,630 Z',
  front_left_door: 'M 530,215 L 830,215 L 830,600 L 530,600 Z',
  rear_left_door: 'M 830,215 L 1100,225 L 1100,600 L 830,600 Z',
  rear_left_fender: 'M 1100,290 L 1400,405 L 1400,600 L 1100,600 Z',
  left_side: 'M 460,600 L 1100,600 L 1100,650 L 460,650 Z',
};

// Flatten all SVG paths into one array for visual rendering (no events)
const allSideViewPaths = Object.values(svgZonePaths).flat();

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
  sideZoneConfig?: Record<string, { path: string; hoverColor?: string }>;
  topZoneConfig?: Record<string, { path: string; hoverColor?: string }>;
  // Uploaded preset images. When present, the view renders the image + DB-traced
  // zones overlaid (image-based preset); when absent it falls back to the
  // built-in Yaris vector art.
  sideImageUrl?: string;
  topImageUrl?: string;
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
  hoverColor?: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ZonePath({ zone, d, damageInfo, isSelected, isHovered, hoverColor, onClick, onMouseEnter, onMouseLeave }: ZonePathProps) {
  const hasDamage = damageInfo && damageInfo.count > 0;
  const activeHoverColor = hoverColor || 'rgba(26, 143, 90, 0.12)';
  const fill = hasDamage
    ? getSeverityColor(damageInfo.maxSeverity)
    : isHovered
      ? activeHoverColor
      : 'rgba(0, 0, 0, 0)';
  const stroke = hasDamage
    ? getSeverityStroke(damageInfo.maxSeverity)
    : isSelected
      ? 'var(--color-primary, #1a8f5a)'
      : isHovered
        ? activeHoverColor
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
  hoverColor?: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ZoneRect({ zone, x, y, width, height, rx = 0, damageInfo, isSelected, isHovered, hoverColor, onClick, onMouseEnter, onMouseLeave }: ZoneRectProps) {
  const hasDamage = damageInfo && damageInfo.count > 0;
  const activeHoverColor = hoverColor || 'rgba(26, 143, 90, 0.12)';
  const fill = hasDamage
    ? getSeverityColor(damageInfo.maxSeverity)
    : isHovered
      ? activeHoverColor
      : 'rgba(0, 0, 0, 0)';
  const stroke = hasDamage
    ? getSeverityStroke(damageInfo.maxSeverity)
    : isSelected
      ? 'var(--color-primary, #1a8f5a)'
      : isHovered
        ? activeHoverColor
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

function DamageIndicator({ x, y, count, severity, r = 10, fontSize = 10 }: { x: number; y: number; count: number; severity: DamageSeverity; r?: number; fontSize?: number }) {
  const color = severity === 'severe' ? '#ef4444' : severity === 'moderate' ? '#f59e0b' : '#eab308';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={r} fill={color} stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={fontSize} fontWeight="700">
        {count}
      </text>
    </g>
  );
}

/** Rough centroid of an SVG polygon path — averages its coordinate pairs.
 *  Used to place damage indicators on traced zones of any shape/model. */
function centroidOfPath(d: string): { x: number; y: number } {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) { sx += nums[i]; sy += nums[i + 1]; n++; }
  return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

interface ImageZoneViewProps {
  imageUrl: string;
  zoneConfig: Record<string, { path: string; hoverColor?: string }>;
  zoneDamages: Record<string, ZoneDamageInfo>;
  selectedZone: DamageZone | null;
  hoveredZone: DamageZone | null;
  onZoneClick: (zone: DamageZone) => void;
  onZoneHover: (zone: DamageZone | null) => void;
  ariaLabel: string;
}

/**
 * Image-based diagram view: the preset's uploaded car image with the
 * admin-traced damage zones overlaid as clickable hit areas. Both the zone
 * polygons and this view share the 1536×1024 coordinate space used by the zone
 * editor, so traced coordinates line up exactly with the image.
 */
function ImageZoneView({ imageUrl, zoneConfig, zoneDamages, selectedZone, hoveredZone, onZoneClick, onZoneHover, ariaLabel }: ImageZoneViewProps) {
  const W = 1536, H = 1024;
  const zones = Object.keys(zoneConfig) as DamageZone[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.diagramSvg} aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
      <image href={imageUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
      {zones.map(zone => {
        const info = zoneDamages[zone];
        const hasDamage = info && info.count > 0;
        const isHov = hoveredZone === zone;
        const isSel = selectedZone === zone;
        const hoverColor = zoneConfig[zone]?.hoverColor || 'rgba(26, 143, 90, 0.13)';
        const hoverStroke = zoneConfig[zone]?.hoverColor || 'rgba(26, 143, 90, 0.5)';
        return (
          <path
            key={`hit-${zone}`}
            data-zone={zone}
            d={zoneConfig[zone].path}
            fill={hasDamage ? getSeverityColor(info.maxSeverity) : isHov ? hoverColor : 'transparent'}
            stroke={isSel ? 'var(--color-primary, #1a8f5a)' : hasDamage ? getSeverityStroke(info.maxSeverity) : isHov ? hoverStroke : 'transparent'}
            strokeWidth={isSel || isHov ? 2.5 : 1.5}
            strokeLinejoin="round"
            style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
            onClick={() => onZoneClick(zone)}
            onMouseEnter={() => onZoneHover(zone)}
            onMouseLeave={() => onZoneHover(null)}
          />
        );
      })}
      {zones.map(zone => {
        const info = zoneDamages[zone];
        if (!info || info.count === 0) return null;
        const c = centroidOfPath(zoneConfig[zone].path);
        return <DamageIndicator key={`ind-${zone}`} x={c.x} y={c.y} count={info.count} severity={info.maxSeverity} r={26} fontSize={26} />;
      })}
    </svg>
  );
}

export default function CarDiagram({ zoneDamages, selectedZone, onZoneClick, hoveredZone, onZoneHover, sideZoneConfig, topZoneConfig, sideImageUrl, topImageUrl }: CarDiagramProps) {
  // Use DB-provided zone config if available, fall back to hardcoded defaults
  const activeSideZones: Record<string, { path: string; hoverColor?: string }> = sideZoneConfig && Object.keys(sideZoneConfig).length > 0
    ? sideZoneConfig
    : Object.fromEntries(Object.entries(SIDE_ZONE_PATHS).map(([zone, path]) => [zone, { path }])) as Record<string, { path: string; hoverColor?: string }>;
  const activeTopZones: Record<string, { path: string; hoverColor?: string }> = topZoneConfig && Object.keys(topZoneConfig).length > 0
    ? topZoneConfig
    : {};

  const getZoneHoverColor = (zone: DamageZone) => activeSideZones[zone]?.hoverColor;

  const zoneProps = (zone: DamageZone) => ({
    zone,
    damageInfo: zoneDamages[zone],
    isSelected: selectedZone === zone,
    isHovered: hoveredZone === zone,
    hoverColor: getZoneHoverColor(zone),
    onClick: () => onZoneClick(zone),
    onMouseEnter: () => onZoneHover(zone),
    onMouseLeave: () => onZoneHover(null),
  });

  return (
    <div className={styles.diagramContainer}>
      {/* Top-down view */}
      <div className={styles.diagramView}>
        <div className={styles.diagramLabel}>Top View</div>
        {topImageUrl ? (
          <ImageZoneView
            imageUrl={topImageUrl}
            zoneConfig={activeTopZones}
            zoneDamages={zoneDamages}
            selectedZone={selectedZone}
            hoveredZone={hoveredZone}
            onZoneClick={onZoneClick}
            onZoneHover={onZoneHover}
            ariaLabel="Vehicle top view"
          />
        ) : (
        <svg viewBox="0 0 200 440" className={styles.diagramSvg} aria-label="Toyota Yaris Cross top-down view">
          {/* === YARIS CROSS TOP-DOWN — refined from photo references === */}

          {/* Main body shell — wider rear haunches, angular front */}
          <path
            d="M 68,50 C 68,32 82,24 100,22 C 118,24 132,32 132,50
               L 136,62 L 142,80 C 148,90 152,100 152,110 L 152,126 C 152,134 148,138 144,140
               L 142,152 L 144,160 L 144,272 L 142,280
               C 148,284 152,290 152,300 L 152,320 C 152,330 148,338 144,342
               L 140,356 L 136,372 C 136,392 120,402 100,404
               C 80,402 64,392 64,372 L 60,356 L 56,342
               C 52,338 48,330 48,320 L 48,300 C 48,290 52,284 58,280
               L 56,272 L 56,160 L 58,152 L 56,140 C 52,138 48,134 48,126
               L 48,110 C 48,100 52,90 58,80 L 64,62 Z"
            fill="var(--bg-card, #f8fafc)"
            stroke="var(--text-secondary, #64748b)"
            strokeWidth="2"
          />

          {/* Black plastic wheel arch cladding — front left */}
          <path d="M 46,96 C 44,102 42,110 42,118 L 42,132 C 42,136 44,140 48,142 L 48,126 C 48,114 50,104 54,96 Z" fill="var(--text-secondary, #64748b)" opacity={0.18} />
          {/* Front right */}
          <path d="M 154,96 C 156,102 158,110 158,118 L 158,132 C 158,136 156,140 152,142 L 152,126 C 152,114 150,104 146,96 Z" fill="var(--text-secondary, #64748b)" opacity={0.18} />
          {/* Rear left */}
          <path d="M 46,330 C 44,324 42,316 42,308 L 42,294 C 42,290 44,286 48,284 L 48,300 C 48,312 50,322 54,330 Z" fill="var(--text-secondary, #64748b)" opacity={0.18} />
          {/* Rear right */}
          <path d="M 154,330 C 156,324 158,316 158,308 L 158,294 C 158,290 156,286 152,284 L 152,300 C 152,312 150,322 146,330 Z" fill="var(--text-secondary, #64748b)" opacity={0.18} />

          {/* === INTERACTIVE ZONES === */}

          {/* Windshield — steeply raked, narrowing at top */}
          <ZonePath {...zoneProps('windshield')}
            d="M 74,98 C 74,80 86,72 100,70 C 114,72 126,80 126,98 L 130,128 L 70,128 Z"
          />
          {/* Rear window — tapered */}
          <ZonePath {...zoneProps('rear_window')}
            d="M 74,332 C 74,348 86,356 100,358 C 114,356 126,348 126,332 L 130,302 L 70,302 Z"
          />
          {/* Hood — short, angular */}
          <ZonePath {...zoneProps('hood')}
            d="M 70,54 C 70,38 84,30 100,28 C 116,30 130,38 130,54
               L 134,66 L 140,82 L 128,82 C 126,74 114,68 100,66
               C 86,68 74,74 72,82 L 60,82 L 66,66 Z"
          />
          {/* Trunk — wide rear */}
          <ZonePath {...zoneProps('trunk')}
            d="M 70,372 C 70,388 84,396 100,398 C 116,396 130,388 130,372
               L 134,360 L 140,344 L 128,344 C 126,352 114,358 100,360
               C 86,358 74,352 72,344 L 60,344 L 66,360 Z"
          />
          {/* Roof — large central panel */}
          <ZoneRect {...zoneProps('roof')}
            x={72} y={132} width={56} height={166} rx={6}
          />
          {/* Front bumper — wide, angular Yaris Cross front */}
          <ZonePath {...zoneProps('front_bumper')}
            d="M 58,24 C 58,12 78,4 100,4 C 122,4 142,12 142,24
               L 142,42 C 138,36 120,28 100,28 C 80,28 62,36 58,42 Z"
          />
          {/* Rear bumper */}
          <ZonePath {...zoneProps('rear_bumper')}
            d="M 58,402 C 58,414 78,422 100,422 C 122,422 142,414 142,402
               L 142,386 C 138,392 120,400 100,398 C 80,400 62,392 58,386 Z"
          />
          {/* Front left fender */}
          <ZonePath {...zoneProps('front_left_fender')}
            d="M 48,82 L 56,62 L 64,62 L 58,82 L 48,110 L 48,82 Z"
          />
          {/* Front right fender */}
          <ZonePath {...zoneProps('front_right_fender')}
            d="M 152,82 L 144,62 L 136,62 L 142,82 L 152,110 L 152,82 Z"
          />
          {/* Rear left fender */}
          <ZonePath {...zoneProps('rear_left_fender')}
            d="M 48,320 L 48,342 L 56,364 L 64,364 L 58,342 L 48,320 Z"
          />
          {/* Rear right fender */}
          <ZonePath {...zoneProps('rear_right_fender')}
            d="M 152,320 L 152,342 L 144,364 L 136,364 L 142,342 L 152,320 Z"
          />
          {/* Front left door */}
          <ZoneRect {...zoneProps('front_left_door')}
            x={46} y={128} width={24} height={88} rx={3}
          />
          {/* Front right door */}
          <ZoneRect {...zoneProps('front_right_door')}
            x={130} y={128} width={24} height={88} rx={3}
          />
          {/* Rear left door */}
          <ZoneRect {...zoneProps('rear_left_door')}
            x={46} y={220} width={24} height={78} rx={3}
          />
          {/* Rear right door */}
          <ZoneRect {...zoneProps('rear_right_door')}
            x={130} y={220} width={24} height={78} rx={3}
          />

          {/* Wheels / Rims */}
          <rect data-zone="front_left_rim" x={36} y={102} width={14} height={36} rx={5}
            fill={zoneDamages.front_left_rim ? getSeverityColor(zoneDamages.front_left_rim.maxSeverity) : (hoveredZone === 'front_left_rim' ? (getZoneHoverColor('front_left_rim') || 'rgba(26, 143, 90,0.25)') : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.front_left_rim || hoveredZone === 'front_left_rim' || selectedZone === 'front_left_rim' ? 1 : 0.35}
            stroke={selectedZone === 'front_left_rim' ? 'var(--color-primary, #1a8f5a)' : (zoneDamages.front_left_rim ? getSeverityStroke(zoneDamages.front_left_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'front_left_rim' || hoveredZone === 'front_left_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('front_left_rim')} onMouseEnter={() => onZoneHover('front_left_rim')} onMouseLeave={() => onZoneHover(null)}
          />
          <rect data-zone="front_right_rim" x={150} y={102} width={14} height={36} rx={5}
            fill={zoneDamages.front_right_rim ? getSeverityColor(zoneDamages.front_right_rim.maxSeverity) : (hoveredZone === 'front_right_rim' ? (getZoneHoverColor('front_right_rim') || 'rgba(26, 143, 90,0.25)') : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.front_right_rim || hoveredZone === 'front_right_rim' || selectedZone === 'front_right_rim' ? 1 : 0.35}
            stroke={selectedZone === 'front_right_rim' ? 'var(--color-primary, #1a8f5a)' : (zoneDamages.front_right_rim ? getSeverityStroke(zoneDamages.front_right_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'front_right_rim' || hoveredZone === 'front_right_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('front_right_rim')} onMouseEnter={() => onZoneHover('front_right_rim')} onMouseLeave={() => onZoneHover(null)}
          />
          <rect data-zone="rear_left_rim" x={36} y={292} width={14} height={36} rx={5}
            fill={zoneDamages.rear_left_rim ? getSeverityColor(zoneDamages.rear_left_rim.maxSeverity) : (hoveredZone === 'rear_left_rim' ? (getZoneHoverColor('rear_left_rim') || 'rgba(26, 143, 90,0.25)') : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.rear_left_rim || hoveredZone === 'rear_left_rim' || selectedZone === 'rear_left_rim' ? 1 : 0.35}
            stroke={selectedZone === 'rear_left_rim' ? 'var(--color-primary, #1a8f5a)' : (zoneDamages.rear_left_rim ? getSeverityStroke(zoneDamages.rear_left_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'rear_left_rim' || hoveredZone === 'rear_left_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('rear_left_rim')} onMouseEnter={() => onZoneHover('rear_left_rim')} onMouseLeave={() => onZoneHover(null)}
          />
          <rect data-zone="rear_right_rim" x={150} y={292} width={14} height={36} rx={5}
            fill={zoneDamages.rear_right_rim ? getSeverityColor(zoneDamages.rear_right_rim.maxSeverity) : (hoveredZone === 'rear_right_rim' ? (getZoneHoverColor('rear_right_rim') || 'rgba(26, 143, 90,0.25)') : 'var(--text-secondary, #64748b)')}
            opacity={zoneDamages.rear_right_rim || hoveredZone === 'rear_right_rim' || selectedZone === 'rear_right_rim' ? 1 : 0.35}
            stroke={selectedZone === 'rear_right_rim' ? 'var(--color-primary, #1a8f5a)' : (zoneDamages.rear_right_rim ? getSeverityStroke(zoneDamages.rear_right_rim.maxSeverity) : 'none')}
            strokeWidth={selectedZone === 'rear_right_rim' || hoveredZone === 'rear_right_rim' ? 2.5 : 1.5}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onClick={() => onZoneClick('rear_right_rim')} onMouseEnter={() => onZoneHover('rear_right_rim')} onMouseLeave={() => onZoneHover(null)}
          />

          {/* === DECORATIVE DETAILS === */}
          {/* Side mirrors — angular, high-mounted */}
          <path d="M 40,118 L 34,114 L 34,126 L 40,122 Z" fill="var(--text-secondary, #64748b)" opacity={0.25} />
          <path d="M 160,118 L 166,114 L 166,126 L 160,122 Z" fill="var(--text-secondary, #64748b)" opacity={0.25} />
          {/* Angular LED headlights — sharp, narrow (Yaris Cross signature) */}
          <path d="M 72,38 L 84,30 L 84,44 Z" fill="rgba(253, 224, 71, 0.35)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.7} />
          <path d="M 128,38 L 116,30 L 116,44 Z" fill="rgba(253, 224, 71, 0.35)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.7} />
          {/* Connected taillight bar — full width (signature element) */}
          <rect x={68} y={386} width={64} height={5} rx={2.5} fill="rgba(239, 68, 68, 0.3)" stroke="var(--text-secondary, #64748b)" strokeWidth={0.7} />
          {/* Roof rails */}
          <line x1={74} y1={138} x2={74} y2={292} stroke="var(--text-secondary, #64748b)" strokeWidth={1.2} opacity={0.18} strokeLinecap="round" />
          <line x1={126} y1={138} x2={126} y2={292} stroke="var(--text-secondary, #64748b)" strokeWidth={1.2} opacity={0.18} strokeLinecap="round" />
          {/* Grille — wide trapezoid */}
          <path d="M 84,30 L 116,30 L 112,20 L 88,20 Z" fill="var(--text-secondary, #64748b)" opacity={0.1} />
          {/* Toyota logo hint */}
          <circle cx={100} cy={24} r={4} fill="none" stroke="var(--text-secondary, #64748b)" strokeWidth={0.6} opacity={0.2} />
          {/* Rear Toyota logo */}
          <circle cx={100} cy={396} r={4} fill="none" stroke="var(--text-secondary, #64748b)" strokeWidth={0.6} opacity={0.2} />
          {/* Lower bumper intake */}
          <rect x={82} y={10} width={36} height={6} rx={3} fill="var(--text-secondary, #64748b)" opacity={0.08} />
          {/* Rear diffuser */}
          <rect x={80} y={414} width={40} height={4} rx={2} fill="var(--text-secondary, #64748b)" opacity={0.08} />
          {/* Door divider lines */}
          <line x1={46} y1={218} x2={70} y2={218} stroke="var(--text-secondary, #64748b)" strokeWidth={0.6} opacity={0.15} />
          <line x1={130} y1={218} x2={154} y2={218} stroke="var(--text-secondary, #64748b)" strokeWidth={0.6} opacity={0.15} />

          {/* Damage indicators */}
          {zoneDamages.front_bumper && <DamageIndicator x={100} y={14} count={zoneDamages.front_bumper.count} severity={zoneDamages.front_bumper.maxSeverity} />}
          {zoneDamages.rear_bumper && <DamageIndicator x={100} y={412} count={zoneDamages.rear_bumper.count} severity={zoneDamages.rear_bumper.maxSeverity} />}
          {zoneDamages.hood && <DamageIndicator x={100} y={58} count={zoneDamages.hood.count} severity={zoneDamages.hood.maxSeverity} />}
          {zoneDamages.trunk && <DamageIndicator x={100} y={370} count={zoneDamages.trunk.count} severity={zoneDamages.trunk.maxSeverity} />}
          {zoneDamages.windshield && <DamageIndicator x={100} y={100} count={zoneDamages.windshield.count} severity={zoneDamages.windshield.maxSeverity} />}
          {zoneDamages.rear_window && <DamageIndicator x={100} y={328} count={zoneDamages.rear_window.count} severity={zoneDamages.rear_window.maxSeverity} />}
          {zoneDamages.roof && <DamageIndicator x={100} y={215} count={zoneDamages.roof.count} severity={zoneDamages.roof.maxSeverity} />}
          {zoneDamages.front_left_door && <DamageIndicator x={56} y={172} count={zoneDamages.front_left_door.count} severity={zoneDamages.front_left_door.maxSeverity} />}
          {zoneDamages.front_right_door && <DamageIndicator x={144} y={172} count={zoneDamages.front_right_door.count} severity={zoneDamages.front_right_door.maxSeverity} />}
          {zoneDamages.rear_left_door && <DamageIndicator x={56} y={258} count={zoneDamages.rear_left_door.count} severity={zoneDamages.rear_left_door.maxSeverity} />}
          {zoneDamages.rear_right_door && <DamageIndicator x={144} y={258} count={zoneDamages.rear_right_door.count} severity={zoneDamages.rear_right_door.maxSeverity} />}
          {zoneDamages.front_left_fender && <DamageIndicator x={46} y={80} count={zoneDamages.front_left_fender.count} severity={zoneDamages.front_left_fender.maxSeverity} />}
          {zoneDamages.front_right_fender && <DamageIndicator x={154} y={80} count={zoneDamages.front_right_fender.count} severity={zoneDamages.front_right_fender.maxSeverity} />}
          {zoneDamages.rear_left_fender && <DamageIndicator x={46} y={346} count={zoneDamages.rear_left_fender.count} severity={zoneDamages.rear_left_fender.maxSeverity} />}
          {zoneDamages.rear_right_fender && <DamageIndicator x={154} y={346} count={zoneDamages.rear_right_fender.count} severity={zoneDamages.rear_right_fender.maxSeverity} />}
          {zoneDamages.front_left_rim && <DamageIndicator x={43} y={120} count={zoneDamages.front_left_rim.count} severity={zoneDamages.front_left_rim.maxSeverity} />}
          {zoneDamages.front_right_rim && <DamageIndicator x={157} y={120} count={zoneDamages.front_right_rim.count} severity={zoneDamages.front_right_rim.maxSeverity} />}
          {zoneDamages.rear_left_rim && <DamageIndicator x={43} y={310} count={zoneDamages.rear_left_rim.count} severity={zoneDamages.rear_left_rim.maxSeverity} />}
          {zoneDamages.rear_right_rim && <DamageIndicator x={157} y={310} count={zoneDamages.rear_right_rim.count} severity={zoneDamages.rear_right_rim.maxSeverity} />}
        </svg>
        )}
      </div>

      {/* Side view — hybrid: filled zone polygons (hit areas) + SVG outline (visual) */}
      <div className={styles.diagramView}>
        <div className={styles.diagramLabel}>Side View</div>
        {sideImageUrl ? (
          <ImageZoneView
            imageUrl={sideImageUrl}
            zoneConfig={activeSideZones}
            zoneDamages={zoneDamages}
            selectedZone={selectedZone}
            hoveredZone={hoveredZone}
            onZoneClick={onZoneClick}
            onZoneHover={onZoneHover}
            ariaLabel="Vehicle side view"
          />
        ) : (
        <svg viewBox="0 0 1536 1024" className={styles.diagramSvg} aria-label="Toyota Yaris Cross side view" preserveAspectRatio="xMidYMid meet">

          {/* Layer 1: Zone hit-area polygons — capture hover/click, show colored fill */}
          {(Object.keys(activeSideZones) as DamageZone[]).map(zone => {
            const info = zoneDamages[zone];
            const hasDamage = info && info.count > 0;
            const isHov = hoveredZone === zone;
            const isSel = selectedZone === zone;
            const hoverColor = activeSideZones[zone]?.hoverColor || 'rgba(26, 143, 90, 0.13)';
            const hoverStroke = activeSideZones[zone]?.hoverColor || 'rgba(26, 143, 90, 0.35)';
            return (
              <path
                key={`hit-${zone}`}
                data-zone={zone}
                d={activeSideZones[zone].path}
                fill={hasDamage ? getSeverityColor(info.maxSeverity) : isHov ? hoverColor : 'transparent'}
                stroke={isSel ? 'var(--color-primary, #1a8f5a)' : hasDamage ? getSeverityStroke(info.maxSeverity) : isHov ? hoverStroke : 'transparent'}
                strokeWidth={isSel || isHov ? 2 : 1.5}
                strokeLinejoin="round"
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onClick={() => onZoneClick(zone)}
                onMouseEnter={() => onZoneHover(zone)}
                onMouseLeave={() => onZoneHover(null)}
              />
            );
          })}
          {/* Wheel hit circles */}
          {([['front_left_rim', 355, 624] as const, ['rear_left_rim', 1203, 634] as const]).map(([zone, cx, cy]) => {
            const info = zoneDamages[zone];
            const hasDamage = info && info.count > 0;
            const isHov = hoveredZone === zone;
            const isSel = selectedZone === zone;
            const hoverColor = getZoneHoverColor(zone) || 'rgba(26, 143, 90, 0.13)';
            return (
              <circle
                key={`hit-${zone}`}
                data-zone={zone}
                cx={cx} cy={cy} r={90}
                fill={hasDamage ? getSeverityColor(info.maxSeverity) : isHov ? hoverColor : 'transparent'}
                stroke={isSel ? 'var(--color-primary, #1a8f5a)' : hasDamage ? getSeverityStroke(info.maxSeverity) : isHov ? hoverColor : 'transparent'}
                strokeWidth={isSel || isHov ? 2.5 : 1.5}
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onClick={() => onZoneClick(zone)}
                onMouseEnter={() => onZoneHover(zone)}
                onMouseLeave={() => onZoneHover(null)}
              />
            );
          })}

          {/* Layer 2: SVG outline paths — visual only, no events */}
          {allSideViewPaths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              transform={`translate(${p.tx},${p.ty})`}
              fill={p.fill}
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* Layer 3: Damage indicators */}
          {zoneDamages.front_bumper && <DamageIndicator x={115} y={500} count={zoneDamages.front_bumper.count} severity={zoneDamages.front_bumper.maxSeverity} />}
          {zoneDamages.rear_bumper && <DamageIndicator x={1438} y={535} count={zoneDamages.rear_bumper.count} severity={zoneDamages.rear_bumper.maxSeverity} />}
          {zoneDamages.hood && <DamageIndicator x={305} y={375} count={zoneDamages.hood.count} severity={zoneDamages.hood.maxSeverity} />}
          {zoneDamages.windshield && <DamageIndicator x={500} y={300} count={zoneDamages.windshield.count} severity={zoneDamages.windshield.maxSeverity} />}
          {zoneDamages.roof && <DamageIndicator x={820} y={220} count={zoneDamages.roof.count} severity={zoneDamages.roof.maxSeverity} />}
          {zoneDamages.rear_window && <DamageIndicator x={1195} y={295} count={zoneDamages.rear_window.count} severity={zoneDamages.rear_window.maxSeverity} />}
          {zoneDamages.trunk && <DamageIndicator x={1328} y={475} count={zoneDamages.trunk.count} severity={zoneDamages.trunk.maxSeverity} />}
          {zoneDamages.front_left_door && <DamageIndicator x={680} y={445} count={zoneDamages.front_left_door.count} severity={zoneDamages.front_left_door.maxSeverity} />}
          {zoneDamages.rear_left_door && <DamageIndicator x={965} y={445} count={zoneDamages.rear_left_door.count} severity={zoneDamages.rear_left_door.maxSeverity} />}
          {zoneDamages.front_left_fender && <DamageIndicator x={360} y={475} count={zoneDamages.front_left_fender.count} severity={zoneDamages.front_left_fender.maxSeverity} />}
          {zoneDamages.rear_left_fender && <DamageIndicator x={1250} y={455} count={zoneDamages.rear_left_fender.count} severity={zoneDamages.rear_left_fender.maxSeverity} />}
          {zoneDamages.left_side && <DamageIndicator x={780} y={625} count={zoneDamages.left_side.count} severity={zoneDamages.left_side.maxSeverity} />}
          {zoneDamages.front_left_rim && <DamageIndicator x={355} y={624} count={zoneDamages.front_left_rim.count} severity={zoneDamages.front_left_rim.maxSeverity} />}
          {zoneDamages.rear_left_rim && <DamageIndicator x={1203} y={634} count={zoneDamages.rear_left_rim.count} severity={zoneDamages.rear_left_rim.maxSeverity} />}
        </svg>
        )}
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
