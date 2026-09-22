'use client';

import { useState } from 'react';
import styles from './docs.module.css';

/**
 * A copyable code sample. Client-side only for the copy button — the code
 * itself is server-rendered inside the <pre>, so crawlers (and anyone with
 * JavaScript off) still read every example.
 */
export default function CodeBlock({
  code,
  label,
}: {
  code: string;
  /** Small caption above the block, e.g. 'cURL' or 'Response'. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked — the text is selectable anyway. */
    }
  };

  return (
    <div className={styles.codeWrap}>
      <div className={styles.codeBar}>
        <span className={styles.codeLabel}>{label ?? 'Example'}</span>
        <button className={styles.copyBtn} type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
