// The page's shared pieces (M9-S3, DL-103): words for assistive technology alone, a disclosure,
// chips, pills and badges, a banner, a number stepper and a file picker behind a button. Later
// stories build the Quest cards, the Party builder, the History and the tables from them. Nothing
// here computes a rule: each takes words and numbers a selector gave.
//
// M9-S6 (DL-106) adds the tones of the Morale and Regard bands, a column heading that orders its
// table, Regard as chips with the neutral ones folded under their count (the review's C8), and the
// one confirmation an act that lets a Hero go asks for (E4). M9-F2 (DL-115) adds tabs, for the
// Guild's parts.

import type { MoraleBand, RegardBand } from '@heroesim/engine';
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { narrowQuery } from '../breakpoints';
import type { SortDirection } from '../state/selectors';
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

/** How a Morale band reads beside a Hero: a warning when low, never colour alone (the word is there). */
export const moraleTones: Readonly<Record<MoraleBand, Tone>> = {
  wretched: 'bad',
  low: 'warn',
  steady: 'plain',
  high: 'good',
  elated: 'good',
};

/**
 * How a Regard band reads (the review's C8): one ramp from hostile through neutral to close, the same
 * on a Hero's page, the Guildmaster's and the Patrons'. The band's word is always there.
 */
export const regardTones: Readonly<Record<RegardBand, Tone>> = {
  hostile: 'bad',
  cool: 'warn',
  neutral: 'plain',
  warm: 'good',
  close: 'good',
};

/**
 * A short fact in a rounded frame, with an icon beside its words when it has one. `spoken`, when
 * given, is what a screen reader reads in place of the words shown, as the Board's "Away" is read
 * with its Day (v1.1.5-S11, DL-169 item 2); its `title` is then on the words shown, which the screen
 * reader skips, so that a tooltip saying what `spoken` says is not read twice (v1.1.5-S10). `picture`,
 * when given, stands before the words: a Unique Item's on a Roster tile (v1.1.5-S14), hidden from the
 * screen reader as it is everywhere.
 */
export function Chip({
  tone = 'plain',
  icon,
  picture,
  children,
  title,
  spoken,
}: {
  tone?: Tone;
  icon?: IconName;
  picture?: ReactNode;
  children: ReactNode;
  title?: string;
  spoken?: string;
}) {
  return (
    <span className={`chip chip--${tone}`} title={spoken === undefined ? title : undefined}>
      {icon === undefined ? null : <Icon name={icon} />}
      {picture}
      {spoken === undefined ? (
        <span>{children}</span>
      ) : (
        <>
          <span aria-hidden="true" title={title}>
            {children}
          </span>
          <span className="visually-hidden">{spoken}</span>
        </>
      )}
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
  hideLabel = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** The label is read and not shown: in a table, whose column heading says it (M9-S6). */
  hideLabel?: boolean;
}) {
  const id = useId();
  const whole = Number.isFinite(value) ? Math.floor(value) : min;
  return (
    <span className="stepper-field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
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

/**
 * A column's heading that orders its table by the column (M9-S6, the review's B4 and B8): marked
 * `aria-sort` while the table is in its order. What the order is and what it does is the selector's.
 */
export function SortHeader({
  label,
  direction,
  active,
  onSort,
  className,
}: {
  label: string;
  direction: SortDirection;
  active: boolean;
  onSort: () => void;
  className?: string;
}) {
  return (
    <th scope="col" className={className} aria-sort={active ? direction : undefined}>
      <button type="button" className={active ? 'sort is-active' : 'sort'} aria-label={`Order by ${label}`} onClick={onSort}>
        <span>{label}</span>
        <Icon name={direction === 'ascending' ? 'up' : 'down'} className="sort__mark" />
      </button>
    </th>
  );
}

/**
 * Rows of Regard, or of anything a band describes, with the neutral ones folded under their count
 * ("3 neutral", the review's C8): what `neutral` marks is the selector's. `row` draws one row's
 * content; the neutral are listed by name when opened.
 */
export function Folded<Row extends { neutral: boolean; name: string }>({
  rows,
  label,
  row,
  none = 'None',
}: {
  rows: readonly Row[];
  /** What the list is, for assistive technology. */
  label: string;
  row: (each: Row) => ReactNode;
  none?: string;
}) {
  if (rows.length === 0) return <p className="subtle">{none}</p>;
  const shown = rows.filter((each) => !each.neutral);
  const neutral = rows.filter((each) => each.neutral);
  return (
    <div className="folded">
      {shown.length === 0 ? null : (
        <ul className="regards" aria-label={label}>
          {shown.map((each, index) => (
            <li key={`${each.name}-${index}`}>{row(each)}</li>
          ))}
        </ul>
      )}
      {neutral.length === 0 ? null : (
        <Disclosure summary={`${neutral.length} neutral`}>
          <ul className="regards regards--neutral" aria-label={`${label}, neutral`}>
            {neutral.map((each, index) => (
              <li key={`${each.name}-${index}`}>{row(each)}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

/**
 * The one confirmation for an act that lets a Hero go, a Transfer out or an offer accepted (M9-S6,
 * the review's E4), as the saves' delete asks: what it costs said first, then the act and "Keep
 * them". The keyboard comes to it when it opens, so what it says is read.
 */
export function Confirm({
  label,
  children,
  confirm,
  confirmLabel,
  keep = 'Keep them',
  busy = false,
  onConfirm,
  onKeep,
}: {
  /** What is being confirmed, for assistive technology: `Transfer Finn Grimshaw?`. */
  label: string;
  children: ReactNode;
  /** The act's button, shown. */
  confirm: ReactNode;
  /** The act's button, read, where the words shown leave out whom it is for. */
  confirmLabel?: string;
  keep?: string;
  busy?: boolean;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest' });
    box.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="confirm" role="group" aria-label={label} tabIndex={-1} ref={box}>
      <Icon name="alert" className="confirm__icon" />
      <div className="confirm__body">
        {children}
        <div className="actions">
          <button type="button" className="button--danger" aria-label={confirmLabel} disabled={busy} onClick={onConfirm}>
            {confirm}
          </button>
          <button type="button" className="button--quiet" onClick={onKeep}>
            {keep}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Where the keyboard goes when a page opened in place closes (M9-S6): back to what opened it, as the
 * Party builder's rows do (M9-S4). `opened(id)` notes it; `closed()` returns to it once it is drawn.
 */
export function useReturn(): { opened: (id: string) => void; closed: () => void } {
  const opener = useRef<string | null>(null);
  const [back, setBack] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (back === null) return;
    const target = globalThis.document.getElementById(back.id);
    target?.scrollIntoView?.({ block: 'center' });
    target?.focus({ preventScroll: true });
  }, [back]);
  return {
    opened: (id) => {
      opener.current = id;
    },
    closed: () => {
      if (opener.current !== null) setBack({ id: opener.current });
    },
  };
}

/**
 * Whether the page is a phone's width, under `breakpoints.phone` (v1.1.5-S12): for what a phone shows in place of
 * what a wide screen does, as the Roster's Table shows tabs for its Columns panel. `false` where the
 * browser cannot say.
 */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => globalThis.matchMedia?.(narrowQuery).matches ?? false);
  useEffect(() => {
    const query = globalThis.matchMedia?.(narrowQuery);
    if (query === undefined) return undefined;
    const changed = (): void => setNarrow(query.matches);
    changed();
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return narrow;
}

/** A tab: its key, which names its panel, and its words. */
export interface TabItem<Key extends string> {
  key: Key;
  label: string;
}

/**
 * Tabs and the one panel open under them, in the ARIA tabs pattern (M9-F2, DL-115): the tabs a
 * `tablist` named by `label`; only the tab open is in the Tab order, and the arrow keys, Home and
 * End move between the tabs, each opening its panel as it takes the keyboard. The panel is named by
 * its tab and described by `describedBy`, as a part's region is by its sentence.
 */
export function Tabs<Key extends string>({
  label,
  tabs,
  open,
  onOpen,
  idOf,
  describedBy,
  children,
}: {
  label: string;
  tabs: readonly TabItem<Key>[];
  open: Key;
  onOpen: (key: Key) => void;
  /** The ids a tab and its panel take, from its key: `${idOf(key)}-tab` and `${idOf(key)}-panel`. */
  idOf: (key: Key) => string;
  describedBy?: (key: Key) => string;
  /** The open panel's content. */
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const move = (event: ReactKeyboardEvent<HTMLButtonElement>, at: number): void => {
    const last = tabs.length - 1;
    const to =
      event.key === 'ArrowRight' ? (at === last ? 0 : at + 1)
      : event.key === 'ArrowLeft' ? (at === 0 ? last : at - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    const next = to === null ? undefined : tabs[to];
    if (next === undefined) return;
    event.preventDefault();
    onOpen(next.key);
    list.current?.querySelector<HTMLElement>(`#${idOf(next.key)}-tab`)?.focus();
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label={label} ref={list}>
        {tabs.map((tab, at) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idOf(tab.key)}-tab`}
            className="tab"
            aria-selected={tab.key === open}
            aria-controls={`${idOf(tab.key)}-panel`}
            tabIndex={tab.key === open ? 0 : -1}
            onClick={() => onOpen(tab.key)}
            onKeyDown={(event) => move(event, at)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="tab-panel"
        role="tabpanel"
        id={`${idOf(open)}-panel`}
        aria-labelledby={`${idOf(open)}-tab`}
        aria-describedby={describedBy?.(open)}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}

/**
 * A filter's chips, display only (M9-F3, as the Market's Buy has them): All, then each option with
 * its count, the one shown pressed; nothing when there is one option or none to choose between.
 */
export function FilterChips<Key extends string>({
  label,
  options,
  shown,
  onShow,
  all = 'All',
}: {
  label: string;
  options: readonly { key: Key; label: string; count?: number }[];
  shown: Key | null;
  onShow: (key: Key | null) => void;
  /** The first chip's words, which shows every option; `null` for none, when an option is always shown. */
  all?: string | null;
}) {
  if (options.length < 2) return null;
  return (
    <div className="filters" role="group" aria-label={label}>
      {all === null ? null : (
        <button type="button" className="filter" aria-pressed={shown === null} onClick={() => onShow(null)}>
          {all}
        </button>
      )}
      {options.map((option) => (
        <button key={option.key} type="button" className="filter" aria-pressed={shown === option.key} onClick={() => onShow(option.key)}>
          {option.label}
          {option.count === undefined ? null : (
            <>
              {' '}
              <span className="filter__count">{option.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
