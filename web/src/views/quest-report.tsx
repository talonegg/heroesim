// A Quest's return on the page (M9-F5, DL-111 items 2 and 3, DL-112 item 8): the Quest report, drawn
// on Guild › Home in the place the "Came home" cards had, one for each Party of the player's that
// came home in the last play, or an older one opened from its entry, with a way to close it; and the
// return's one entry, the same in the rail and in the player's Guild's History: the band in bold and
// the reward, a line per Hero behind a disclosure, and "Open the report".
//
// The report is a list of typed sections (`reportSections`), each drawn by its kind in the plan's
// order, and one with nothing to say is not drawn at all. Every word and number is
// `state/quest-return.ts`'s: nothing here computes a rule.

import { useId, useMemo, useState } from 'react';
import { capitalised, signed } from '../state/names';
import type { Segment } from '../state/narrate';
import { reportSections, type HomeGrief, type QuestReturn, type ReportSection, type ReturnEncounter, type ReturnEntry, type ReturnKey } from '../state/quest-return';
import { Names } from './history-entries';
import { Icon, type IconName } from './icons';
import { Chip, Disclosure } from './ui';

/** An Encounter's mark by its Degree (v1.1.4-S2): a star for a Triumph; its sentence names the Degree. */
const degreeIcons: Readonly<Record<ReturnEncounter['degree'], IconName>> = { triumph: 'fame', success: 'check', setback: 'cross', failure: 'cross' };

/** The id of a report's heading, which takes the keyboard when the report opens. */
export function reportHeadingId(key: ReturnKey): string {
  return `report-${key.partyId}`;
}

/** A Quest's report: its title, then its sections in order; an older one with a way to close it. */
export function QuestReport({ report, onClose }: { report: QuestReturn; onClose?: () => void }) {
  const sections = useMemo(() => reportSections(report), [report]);
  const id = reportHeadingId(report.key);
  return (
    <section className="report card" aria-labelledby={id}>
      <h3 id={id} tabIndex={-1} className="report__title">
        Quest report: {report.quest}
      </h3>
      {sections.map((section) => (
        <Section key={section.kind} section={section} />
      ))}
      {onClose === undefined ? null : (
        <div className="actions">
          <button type="button" onClick={onClose}>
            <Icon name="close" />
            <span>Close the report</span>
          </button>
        </div>
      )}
    </section>
  );
}

function Section({ section }: { section: ReportSection }) {
  switch (section.kind) {
    case 'quest':
      return (
        <p className="report__lead">
          <Chip tone={section.band === 'fail' ? 'bad' : 'good'} icon={section.band === 'fail' ? 'cross' : 'check'}>
            {section.bandWords}
          </Chip>{' '}
          <span className="subtle">
            {section.patron === null ? '' : `Offered by ${section.patron} · `}
            {section.heroes} · home on {section.when}
          </span>
        </p>
      );
    case 'encounters':
      return (
        <div className="report__section">
          <h4>Encounters</h4>
          <ol className="report__list">
            {section.encounters.map((encounter) => (
              <li key={encounter.key} className={encounter.outcome === 'success' ? 'is-met' : 'is-missed'}>
                <Icon name={degreeIcons[encounter.degree]} />
                <span>
                  <Names segments={encounter.segments} />
                  {encounter.used.length === 0 ? null : (
                    <ul className="report__used">
                      {encounter.used.map((used) => (
                        <li key={used.sentence}>
                          <Names segments={used.segments} />
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </li>
            ))}
            {section.used.map((used) => (
              <li key={used.sentence}>
                <Icon name="injury" />
                <span>
                  <Names segments={used.segments} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'rewards':
      return (
        <div className="report__section">
          <h4>Rewards</h4>
          <div className="chips">
            <Chip tone="brass" icon="wealth">
              Wealth {signed(section.wealth)}
            </Chip>
            <Chip tone={section.fame < 0 ? 'bad' : 'brass'} icon="fame">
              Fame {signed(section.fame)}
            </Chip>
            <Chip icon="up">XP +{section.xp} each</Chip>
          </div>
          <p>{section.loot.length === 0 ? 'No Loot' : `Loot: ${section.loot.join(', ')}`}</p>
        </div>
      );
    case 'heroes':
      return (
        <div className="report__section">
          <h4>Heroes</h4>
          <ul className="report__heroes">
            {section.outcomes.map((outcome) => (
              <HeroLines key={outcome.heroId} outcome={outcome} />
            ))}
          </ul>
          {section.home === null ? null : <AtHome home={section.home} />}
        </div>
      );
    case 'patron':
      return (
        <div className="report__section">
          <h4>The Patron</h4>
          <p>{section.standing.sentence}</p>
        </div>
      );
  }
}

function HeroLines({ outcome }: { outcome: Extract<ReportSection, { kind: 'heroes' }>['outcomes'][number] }) {
  const id = useId();
  const name: Segment[] = [{ kind: 'name', text: outcome.name, entityId: outcome.heroId, table: 'heroes' }];
  return (
    <li aria-labelledby={id} className={outcome.died ? 'is-missed' : undefined}>
      <strong id={id} className="report__hero">
        <Names segments={name} />
      </strong>
      <ul className="marks">
        {outcome.words.map((words) => (
          <li key={words}>{capitalised(words)}</li>
        ))}
      </ul>
    </li>
  );
}

/** What a Death cost the Heroes at home: one line, and each Hero whose Morale fell behind a disclosure (M9-F7, DL-120 item 7). */
function AtHome({ home }: { home: HomeGrief }) {
  return (
    <div className="report__home">
      <p>{home.sentence}</p>
      {home.heroes.length === 0 ? null : (
        <Disclosure summary={home.heroesWords}>
          <ul className="rows">
            {home.heroes.map((hero) => (
              <li key={hero.heroId}>
                <span>
                  <Names segments={[{ kind: 'name', text: hero.name, entityId: hero.heroId, table: 'heroes' }]} />: {hero.words}.
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

// ── The entry ────────────────────────────────────────────────────────────────────────────────

/** Words, each name a button to whom it names where `links` is on, as the History draws them; plain words where it is off, as the rail does. */
function Said({ segments, links }: { segments: readonly Segment[]; links: boolean }) {
  return links ? <Names segments={segments} /> : <>{segments.map((segment) => segment.text).join('')}</>;
}

/**
 * A return as one entry (DL-111 item 2): the History's sentence with its band in bold; a line per
 * Hero of the Party behind a disclosure; and "Open the report", which opens it on Guild › Home.
 */
export function ReturnEntryParts({
  entry,
  links,
  fresh,
  onReport,
}: {
  entry: ReturnEntry;
  /** Names open whom they name, as in the History; not in the rail. */
  links: boolean;
  /** The last play appended it: marked new. */
  fresh: boolean;
  onReport?: (key: ReturnKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="entry__line">
        {fresh ? <span className="new-tag">New</span> : null}
        <span className="entry__text">
          <Said segments={entry.lead} links={links} />
          <strong className="entry__band">{entry.bandSaid}</strong>
          <Said segments={entry.rest} links={links} />
        </span>
      </div>
      <button
        type="button"
        className="button--quiet fold"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${entry.heroesWords}: how each fared on ${entry.quest}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevron" className="fold__mark" />
        <span>{entry.heroesWords}</span>
      </button>
      <ul id={id} className="return__heroes" hidden={!open}>
        {entry.heroes.map((hero) => (
          <li key={hero.heroId}>
            <Said segments={hero.segments} links={links} />
          </li>
        ))}
      </ul>
      {onReport === undefined ? null : (
        <button
          type="button"
          className="button--quiet return__open"
          aria-label={`Open the report: ${entry.quest}, ${entry.when}`}
          onClick={() => onReport(entry.key)}
        >
          <Icon name="about" />
          <span>Open the report</span>
        </button>
      )}
    </>
  );
}
