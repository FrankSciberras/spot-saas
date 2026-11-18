'use client';

// Safe Markdown for assistant answers: paragraphs, **bold**, `code`, bullet and
// numbered lists, and simple tables. Rendered to React elements — never
// dangerouslySetInnerHTML — so nothing in an answer can inject markup. Links
// are only kept when they point inside the dashboard (/fleet/…).

import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './assistant.module.css';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/fleet(?:\/[A-Za-z0-9_-]+)*\/?)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(
        <Link key={`${key}a${i}`} href={m[2]}>
          {m[1]}
        </Link>,
      );
    } else if (m[3]) {
      out.push(<strong key={`${key}b${i}`}>{m[3]}</strong>);
    } else if (m[4]) {
      out.push(<code key={`${key}c${i}`}>{m[4]}</code>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
const isTableRow = (line: string) => /^\|.*\|$/.test(line.trim());
const isDivider = (line: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());

export default function AssistantMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;

  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${k++}`}>{inline(para.join(' '), `p${k}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => <li key={idx}>{inline(it, `l${k}-${idx}`)}</li>);
    blocks.push(list.ordered ? <ol key={`o${k++}`}>{items}</ol> : <ul key={`u${k++}`}>{items}</ul>);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Table: a header row, a |---| divider, then body rows.
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushPara();
      flushList();
      const head = cells(line);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) body.push(cells(lines[i++]));
      i -= 1;
      const tk = k++;
      blocks.push(
        <div key={`t${tk}`} className={styles.tableWrap}>
          <table>
            <thead>
              <tr>{head.map((h, c) => <th key={c}>{inline(h, `t${tk}h${c}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{head.map((_, c) => <td key={c}>{inline(row[c] ?? '', `t${tk}r${r}c${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      blocks.push(<p key={`h${k++}`}><strong>{inline(heading[1], `h${k}`)}</strong></p>);
    } else if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className={styles.md}>{blocks}</div>;
}
