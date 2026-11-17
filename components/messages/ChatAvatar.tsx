'use client';

import FleetIcon from '@/components/fleet/FleetIcon';
import { initialsOf } from '@/lib/messages/types';
import { avatarHue } from './format';
import styles from './messages.module.css';

interface Props {
  size?: number;
  /** Person avatar. */
  person?: { userId: string; name: string; avatarUrl: string | null } | null;
  /** Group avatar instead of a person. */
  group?: { id: string; isEveryone: boolean; announcement: boolean } | null;
}

export default function ChatAvatar({ size = 40, person, group }: Props) {
  const box = { width: size, height: size, fontSize: Math.round(size * 0.36) };

  if (group) {
    const icon = group.isEveryone ? 'staff' : group.announcement ? 'megaphone' : 'staff';
    return (
      <span className={`${styles.avatar} ${group.isEveryone ? styles.avatarEveryone : styles.avatarGroup}`} style={box} aria-hidden>
        <FleetIcon name={icon} size={Math.round(size * 0.46)} stroke={1.7} />
      </span>
    );
  }

  const name = person?.name ?? '?';
  if (person?.avatarUrl) {
    return (
      <span className={styles.avatar} style={box} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={person.avatarUrl} alt="" />
      </span>
    );
  }
  return (
    <span
      className={styles.avatar}
      style={{ ...box, background: `hsl(${avatarHue(person?.userId ?? name)} 45% 46%)` }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
