// The page's views and their parts (M9-S3, DL-103). The page is views in a shell, one at a time
// (DL-99 item 1): each view is a labelled region with its heading, which takes the keyboard when the
// view opens, and a part of a view (the Unattached pool in the Roster, the Market in the Hall) is a
// labelled region inside it with a heading of its own.
//
// Each view and each part keeps its sentence saying what it is for and what its controls do, the
// page's `help` (the CLI's usage text, `cli/src/args.ts`, adapted; DL-73 item 9). The sentence is
// still the region's accessible description, and a test still holds every region to it, but the
// page shows it on request, under the view's "About this view", and not by default (DL-99 item 1
// amends DL-73 item 9).

import type { ReactNode } from 'react';
import { About } from './ui';

/** A view the navigation opens, one at a time. */
export type ViewId = 'guild' | 'board' | 'roster' | 'hall' | 'rankings' | 'history';

/** A part of a view, a region inside it. */
export type PartId = 'offers' | 'pool' | 'guildmaster' | 'held' | 'market' | 'guilds' | 'patrons';

/** Anything the page can take the player to: a view, a part, and the regions outside the views. */
export type SectionId = ViewId | PartId | 'new-game' | 'game' | 'rules';

/** The views in the navigation's order: Guild, the home view, first. */
export const viewIds: readonly ViewId[] = ['guild', 'board', 'roster', 'hall', 'rankings', 'history'];

/** Each view's parts, in the order the view shows them. */
export const partsOf: Readonly<Record<ViewId, readonly PartId[]>> = {
  guild: [],
  board: [],
  roster: ['offers', 'pool'],
  hall: ['guildmaster', 'held', 'market'],
  rankings: ['guilds', 'patrons'],
  history: [],
};

/** The view a part is in. */
export const viewOf: Readonly<Record<PartId, ViewId>> = Object.fromEntries(
  viewIds.flatMap((view) => partsOf[view].map((part) => [part, view])),
) as Record<PartId, ViewId>;

/** Each region's heading. */
export const titles: Readonly<Record<SectionId, string>> = {
  guild: 'Guild',
  board: 'Board',
  roster: 'Roster',
  hall: 'Hall',
  rankings: 'Rankings',
  history: 'History',
  offers: 'Transfer Offers',
  pool: 'Unattached pool',
  guildmaster: 'Guildmaster',
  held: 'What the Guild holds',
  market: 'Market',
  guilds: 'Guilds',
  patrons: 'Patrons',
  'new-game': 'A new game',
  game: 'This game',
  rules: 'New rules available',
};

/** Said with the Board, as the CLI says it after every dispatch (pre-M0 review D2). */
export const rivalsReminder = 'Rivals take Quests from the Board each afternoon: a Quest left on it may be gone by then.';

/** What each region is for and what its controls do: its accessible description. */
export const help: Readonly<Record<SectionId, string>> = {
  guild:
    'What needs you this Turn: why time last stopped and the choices it names, how the Parties that came home fared, ' +
    'the Transfer Offers waiting for an answer, the Parties still out and the night each returns, and the Quests on ' +
    'their last Day on the Board.',
  board:
    'The Quests on offer, each with its terms: a Quest’s Fame is won on a success and lost on a failure. Its name ' +
    'unfolds what it demands, the Skills that help, its Encounters and how hard it is beside the rest of the Board; ' +
    'order the Board by reward, difficulty or the Day each leaves. Choose a Party for one: each Hero’s row says ' +
    'whether they can go, and their Morale, Stats and Skills for this Quest, and opens their page. As you pick Heroes ' +
    'and consumables, the preview says what the Party would meet and whether it would be sent, and "Send the Party" ' +
    `sends it within the current Turn. ${rivalsReminder}`,
  roster:
    "Your Heroes. Open a Hero's page for their Stats with hints of how far each may grow, their gear and their " +
    'History; from it, put gear the Guild holds on them, take it off, or transfer them to another Guild.',
  hall:
    'Your Guild’s premises. Build raises a facility one grade for the next grade’s cost. Each grade does more than ' +
    'the one below it, and each adds to the Upkeep.',
  rankings: 'Every Guild in play, ordered by its Fame or by its Wealth: choose which.',
  history:
    'What happened, newest first, a page at a time, by Day and time of day: your Guild’s, the whole History or a ' +
    'Rival’s, one choice away. What your last play added is marked new. A Party’s Encounters fold under how its ' +
    'Quest went, and each Rival’s routine under one line; open either to read it all. A name opens whom it names: ' +
    'a Hero’s page, a Guild’s page, or anyone else’s History. Find anyone the History names by name, a Hero who has ' +
    'died, retired or left the world among them.',
  offers:
    'A Rival’s bid for one of your Heroes waits here until you accept it, decline it or it expires. Accepting sends ' +
    'the Hero to that Guild for the fee; their gear stays with you, and the Heroes left behind who held them in high ' +
    'Regard lose Morale.',
  pool:
    'Heroes on no Roster, whom any Guild may sign for a signing fee. A Hero of a higher Level will not sign for a ' +
    'Guild whose Fame is below what their Level asks. Recruit signs one to your Roster for the fee; open a Hero to ' +
    'see their Stats first.',
  guildmaster:
    'Your character in the world. Their Stats bear on running the Guild, never on fighting: each says what it bears ' +
    'on. Their Traits help or hinder the Guild, and their Regard for others is shown as a band.',
  held:
    'The Items your Guild holds and has not put on a Hero: gear to put on one from their page, consumables a Party ' +
    'can carry, and anything the Market will buy.',
  market:
    'Buy Items the Market has for sale at its price each, and sell what your Guild holds for what the Market pays, ' +
    'which is less. Gear a Hero carries is not the Guild’s to sell until it is unequipped. The Market’s stock is ' +
    'drawn afresh each morning.',
  guilds:
    'Every Guild, yours and the Rivals’, a folded one marked with the Day it folded. Open a Rival to see its Roster, ' +
    'with the Transfer fee your Guild would pay to take each Hero in, its Hall and its Guildmaster.',
  patrons:
    'Those who offer Quests, each of a walk of life. A Patron’s Regard for your Guild rises and falls with how their ' +
    'Quests go, weighs on how often they post to the Board, and recovers toward neutral with time.',
  'new-game':
    'Found a Guild, name its Guildmaster, and take Quests from the Board. The seed makes the world: the same seed and ' +
    'the same choices make the same game. Or load a game saved in this browser, or a save file, the CLI’s or one ' +
    'exported here.',
  game:
    'Save the game in this browser under a name, to load it here later, even after the page is closed; export the ' +
    'game, or a save kept here, as the file the CLI writes, which the CLI or this page can load. Loading a save, or ' +
    'starting a new game, puts it in place of the game in hand, which is lost unless saved or exported first.',
  rules:
    'This release’s rules differ from those the game was started with. The game keeps playing under its own until ' +
    'you adopt the new ones, which changes how it plays from then on; its History records when.',
};

/** The heading's id of a region: what a button that takes the player there focuses. */
export function headingOf(id: SectionId): string {
  return `${id}-heading`;
}

/** The sentences of `ids`, each the accessible description of its region, shown on request. */
export function HelpFor({ ids, label }: { ids: readonly SectionId[]; label: string }) {
  const [first, ...rest] = ids;
  return (
    <About label={label}>
      {first === undefined ? null : (
        <p id={`${first}-help`} className="about__lead">
          {help[first]}
        </p>
      )}
      {rest.length === 0 ? null : (
        <dl className="about__parts">
          {rest.map((id) => (
            <div key={id}>
              <dt>{titles[id]}</dt>
              <dd id={`${id}-help`}>{help[id]}</dd>
            </div>
          ))}
        </dl>
      )}
    </About>
  );
}

/**
 * A view: a labelled region with its heading, which the navigation moves the keyboard to, and
 * "About this view", which holds its sentence and its parts'.
 */
export function View({ id, children, aside }: { id: ViewId | 'new-game'; children?: ReactNode; aside?: ReactNode }) {
  const parts = id === 'new-game' ? [] : partsOf[id];
  return (
    <section id={id} className={`view view--${id}`} aria-labelledby={headingOf(id)} aria-describedby={`${id}-help`}>
      <div className="view__head">
        <h2 id={headingOf(id)} tabIndex={-1}>
          {titles[id]}
        </h2>
        {aside}
        <HelpFor ids={[id, ...parts]} label="About this view" />
      </div>
      {children}
    </section>
  );
}

/** A part of a view, or of the game menu: a labelled region inside it; its sentence is in the view's "About". */
export function Part({ id, children, className }: { id: PartId | 'game' | 'rules'; children?: ReactNode; className?: string }) {
  return (
    <section
      id={id}
      className={className === undefined ? 'part' : `part ${className}`}
      aria-labelledby={headingOf(id)}
      aria-describedby={`${id}-help`}
    >
      <h3 id={headingOf(id)} tabIndex={-1}>
        {titles[id]}
      </h3>
      {children}
    </section>
  );
}

/** A heading at `level`, for a part that sits at different depths: a Hall in its view, or on a Guild's page. */
export function Heading({ level, id, children }: { level: 3 | 4 | 5 | 6; id?: string; children: ReactNode }) {
  const Tag = `h${level}` as const;
  return <Tag id={id}>{children}</Tag>;
}

/** Label and value pairs: the label in small capitals over its value. */
export function Terms({ pairs }: { pairs: readonly (readonly [string, string | number])[] }) {
  return (
    <dl className="terms">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
