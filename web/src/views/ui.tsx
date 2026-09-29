// The page's shared pieces (M9-S3, DL-103): words for assistive technology alone, a disclosure,
// chips, pills and badges, a banner, a number stepper and a file picker behind a button. Later
// stories build the Quest cards, the Party builder, the History and the tables from them. Nothing
// here computes a rule: each takes words and numbers a selector gave.

import { useEffect, useId, useRef, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { Icon, type IconName } from './icons';

/** Words read by assistive technology and not shown. */
export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className="visually-hidden" id={id}>
      {children}
    </span>
  );
}

/** Help on request: a disclosure, closed until the player opens it. */
export function About({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="about">
      <summary>
        <Icon name="about" />
        <span>{label}</span>
      </summary>
      <div className="about__body">{children}</div>
    </details>
  );
}

/** A disclosure: its summary, and what opens under it. */
export function Disclosure({ summary, children, open = false }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="disclosure" open={open}>
      <summary>
        <Icon name="chevron" className="disclosure__mark" />
        <span>{summary}</span>
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

/** How a chip, a pill or a banner reads: plain, good, bad, a warning, the accent or brass. */
export type Tone = 'plain' | 'good' | 'bad' | 'warn' | 'accent' | 'brass';

/** A short fact in a rounded frame, with an icon beside its words when it has one. */
export function Chip({ tone = 'plain', icon, children, title }: { tone?: Tone; icon?: IconName; children: ReactNode; title?: string }) {
  return (
    <span className={`chip chip--${tone}`} title={title}>
      {icon === undefined ? null : <Icon name={icon} />}
      <span>{children}</span>
    </span>
  );
}

/**
 * A number that matters, with its icon and its name: the name is shown where there is room and
 * always read. `value` changing replays a short flash, off under reduced motion.
 */
export function StatPill({
  icon,
  label,
  value,
  testId,
  tone = 'brass',
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  testId?: string;
  tone?: Tone;
}) {
  return (
    <span className={`stat stat--${tone}`} title={label}>
      <Icon name={icon} />
      <span className="stat__label">{label}</span>{' '}
      <span className="stat__value" data-testid={testId} key={typeof value === 'string' || typeof value === 'number' ? value : undefined}>
        {value}
      </span>
    </span>
  );
}

/** A count on the navigation: shown, and said in `words`. */
export function Badge({ count, words }: { count: number; words: string }) {
  if (count <= 0) return null;
  return (
    <>
      <span className="badge" aria-hidden="true">
        {count > 999 ? '999+' : count}
      </span>
      <VisuallyHidden>, {words}</VisuallyHidden>
    </>
  );
}

/** A notice across the view: an icon, what it says, and what can be done about it. */
export function Banner({
  tone,
  icon,
  children,
  actions,
  role,
  testId,
}: {
  tone: Tone;
  icon: IconName;
  children: ReactNode;
  actions?: ReactNode;
  role?: 'alert' | 'status';
  testId?: string;
}) {
  return (
    <div className={`banner banner--${tone}`} role={role} data-testid={testId}>
      <Icon name={icon} className="banner__icon" />
      <div className="banner__body">{children}</div>
      {actions === undefined ? null : <div className="banner__actions">{actions}</div>}
    </div>
  );
}

/**
 * A whole number between `min` and `max` with − and + beside it. The field is still a number
 * field, named by `label`, and a value typed beyond the bounds goes on as typed: the engine refuses
 * what it will not do, in a sentence.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const whole = Number.isFinite(value) ? Math.floor(value) : min;
  return (
    <span className="stepper-field">
      <label htmlFor={id}>{label}</label>
      <span className="stepper">
        <button type="button" className="stepper__step" aria-label={`${label}: one fewer`} disabled={disabled || whole <= min} onClick={() => onChange(Math.max(min, whole - 1))}>
          −
        </button>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={1}
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button type="button" className="stepper__step" aria-label={`${label}: one more`} disabled={disabled || whole >= max} onClick={() => onChange(Math.min(max, whole + 1))}>
          +
        </button>
      </span>
    </span>
  );
}

/** A file picker behind a button: the browser's own control, hidden, is what the label opens. */
export function FileButton({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label className={disabled ? 'button file-button is-disabled' : 'button file-button'}>
      <Icon name="load" />
      <span>{label}</span>
      <input ref={input} className="visually-hidden" type="file" accept={accept} disabled={disabled} onChange={onFile} />
    </label>
  );
}

/**
 * A popover's closing: a press outside `within`, or Escape, closes it, and Escape puts the keyboard
 * back on the control that opened it.
 */
export function useDismiss(open: boolean, close: () => void, within: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return undefined;
    function pressed(event: PointerEvent | MouseEvent): void {
      if (within.current !== null && event.target instanceof Node && !within.current.contains(event.target)) close();
    }
    function key(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      close();
      trigger.current?.focus();
    }
    globalThis.document.addEventListener('mousedown', pressed);
    globalThis.document.addEventListener('keydown', key);
    return () => {
      globalThis.document.removeEventListener('mousedown', pressed);
      globalThis.document.removeEventListener('keydown', key);
    };
  }, [open, close, within, trigger]);
}
