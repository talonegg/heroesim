import { useEffect, useRef } from 'react';
import type { Paragraph } from '../words';

/**
 * What happened, newest last, exactly as `narrate` worded it — the web client never
 * writes a sentence about the world of its own (ADR-0002, DL-01). Beats and returns are
 * the story; Board, coin and commit notes are bookkeeping, and read as such.
 */
export function Report({ paragraphs }: { paragraphs: readonly Paragraph[] }) {
  const log = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = log.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [paragraphs]);

  return (
    <section className="pane pane--report" aria-label="Report" data-testid="pane-report">
      <h2 className="pane__title">Report</h2>
      <div className="report" ref={log} data-testid="report-log" tabIndex={0}>
        {paragraphs.length === 0 ? (
          <p className="empty">Nothing has happened yet.</p>
        ) : (
          paragraphs.map((paragraph, index) => (
            <p
              className={`para para--${paragraph.kind}`}
              data-kind={paragraph.kind}
              data-testid={`para-${paragraph.kind}`}
              key={`${String(index)}.${String(paragraph.day)}.${paragraph.kind}`}
            >
              <span className="para__day">Day {paragraph.day}</span>
              {paragraph.text}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
