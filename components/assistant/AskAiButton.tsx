'use client';

import SparkleIcon from './SparkleIcon';
import { openAssistant, useAssistantAvailability } from './client';
import styles from './assistant.module.css';

/** Topbar entry point. Renders nothing until Rovora AI is switched on for the fleet. */
export default function AskAiButton() {
  const avail = useAssistantAvailability();
  if (!avail?.available) return null;
  return (
    <button type="button" className={`${styles.askBtn} fleetHover`} onClick={() => openAssistant()} aria-label="Ask Rovora AI" title="Ask Rovora AI">
      <SparkleIcon size={15} />
      <span className={styles.askLabel}>Ask AI</span>
    </button>
  );
}
