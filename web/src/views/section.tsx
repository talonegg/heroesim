// The page's views and their parts (M9-S3, DL-103). The page is views in a shell, one at a time
// (DL-99 item 1): each view is a labelled region with its heading, which takes the keyboard when the
// view opens, and a part of a view (the Unattached pool in the Roster, Buy in the Market) is a
// labelled region inside it with a heading of its own.
//
// Seven views since M9-F2 (DL-111 items 5 to 7, DL-112 item 5, DL-115): the Guildmaster, Guild,
// Roster, Board, Rankings, Market and History. The Hall view is gone: the Guildmaster and the Market
// are views of their own, and the Hall is a part of the Guild. The Guild's parts are tabs under its
// heading, one open at a time (`guildParts`), each a tab's panel rather than a region with a heading.
//
// Each view and each part keeps its sentence saying what it is for and what its controls do, the
// page's `help` (the CLI's usage text, `cli/src/args.ts`, adapted; DL-73 item 9). The sentence is
// still the region's accessible description, and a test still holds every region to it, but the
// page shows it on request, under the view's "About this view", and not by default (DL-99 item 1
// amends DL-73 item 9).

import type { ReactNode } from 'react';
import { About } from './ui';

/** A view the navigation opens, one at a time. */
export type ViewId = 'guildmaster' | 'guild' | 'roster' | 'board' | 'rankings' | 'market' | 'history';

/** A part of a view, a region inside it. */
export type PartId = 'offers' | 'pool' | 'guilds' | 'patrons' | 'buy' | 'sell';

/**
 * A part of the Guild, a tab under its heading (M9-F2): Home, the home view's digest; Hall, its
 * premises; and from M9-F3 (DL-116) Stores, everything it owns, and Treasury, its accounts.
 */
export type GuildPartId = 'home' | 'hall' | 'stores' | 'treasury';

/** Anything the page can take the player to: a view, a part, and the regions outside the views. */
export type SectionId = ViewId | PartId | GuildPartId | 'new-game' | 'game' | 'rules';

/**
 * The views in the navigation's order, one order at every width (DL-112 item 5, DL-113 item 1): the
 * Guildmaster at the top, then the phone's bar, Guild, Roster, Board and Rankings, then what "More"
 * holds there, Market and History.
 */
export const viewIds: readonly ViewId[] = ['guildmaster', 'guild', 'roster', 'board', 'rankings', 'market', 'history'];

/** The Guild's parts in the order of their tabs, Home first. */
export const guildParts: readonly GuildPartId[] = ['home', 'hall', 'stores', 'treasury'];

/** Each view's parts, in the order the view shows them: the Guild's are its tabs. */
export const partsOf: Readonly<Record<ViewId, readonly (PartId | GuildPartId)[]>> = {
  guildmaster: [],
  guild: guildParts,
  roster: ['offers', 'pool'],
  board: [],
  rankings: ['guilds', 'patrons'],
  market: ['buy', 'sell'],
  history: [],
};

/** The view a part is in. */
export const viewOf: Readonly<Record<PartId | GuildPartId, ViewId>> = Object.fromEntries(
  viewIds.flatMap((view) => partsOf[view].map((part) => [part, view])),
) as Record<PartId | GuildPartId, ViewId>;

/** Whether `id` is one of the Guild's parts. */
export function isGuildPart(id: string): id is GuildPartId {
  return (guildParts as readonly string[]).includes(id);
}

/** Each region's heading; a Guild part's is its tab's name. */
export const titles: Readonly<Record<SectionId, string>> = {
  guildmaster: 'Guildmaster',
  guild: 'Guild',
  roster: 'Roster',
  board: 'Board',
  rankings: 'Rankings',
  market: 'Market',
  history: 'History',
  home: 'Home',
  hall: 'Hall',
  stores: 'Stores',
  treasury: 'Treasury',
  offers: 'Transfer Offers',
  pool: 'Unattached pool',
  buy: 'Buy',
  sell: 'Sell',
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
    'Your Guild, in parts, one open at a time from the tabs under its heading: Home, what needs you this Turn; ' +
    'Hall, its premises; Stores, everything it owns; and Treasury, its accounts. This browser keeps the part open.',
  home:
    'What needs you this Turn: why time last stopped, each Quest a decision needed or a Quest to staff names, and, ' +
    'when your Guild fell below the Bankruptcy floor, the Day Bankruptcy falls on and the ways to sell what it holds ' +
    'and to the Board; the Bankruptcy countdown while your Guild is below the floor; how the Parties that came home fared; the ' +
    'Transfer Offers waiting for an answer; the Parties still out and the night each returns; and the Quests on ' +
    'their last Day on the Board.',
  board:
    'The Quests on offer, each with its terms: a Quest’s Fame is won on a success and lost on a failure. Its name ' +
    'unfolds what it demands, the Skills that help, its Encounters and how hard it is beside the rest of the Board; ' +
    'order the Board by reward, difficulty or the Day each leaves, and this browser keeps the order. Choose a Party ' +
    'for one: each Hero’s row says whether they can go, and their Morale, Stats and Skills for this Quest, and opens ' +
    'their page. As you pick Heroes and consumables, the preview says what the Party would meet and whether it would ' +
    'be sent, and "Send the Party" sends it within the current Turn. A Party chosen and not sent is kept while you ' +
    'look elsewhere, until it is sent, its Quest leaves the Board or another game is started or loaded. ' +
    rivalsReminder,
  roster:
    'Your Heroes, each with their Class, Level and Age, their Morale and where they are. Open a Hero’s page for ' +
    'their Stats by area, with what gear adds and a hint of how far each may grow, their gear and Skills, their ' +
    'Relationships and their History; from it, put gear the Guild holds on them, take it off, or transfer them to ' +
    'another Guild, which asks first.',
  hall:
    'Your Guild’s premises: each facility’s grade, what it does, and Build, which raises it one grade for the cost ' +
    'on the button. Each grade does more than the one below it, and each adds to the Upkeep, which the Treasury gives.',
  stores:
    'Everything your Guild owns, wherever it is: what it holds, the gear each Hero on the Roster carries, at home or ' +
    'away, and what its Parties took. Show one kind, or one place, at a time with the chips above the table; a ' +
    'Hero’s name opens their page. What it holds sells at the Market for the price given; sell it there, and put ' +
    'gear on a Hero or take it off from their page.',
  treasury:
    'Your Guild’s accounts: its Wealth; its Upkeep, with the night of its next payment and what it is made of; the ' +
    'Bankruptcy floor, and the countdown while the Wealth is below it; and the ledger, every change to the Wealth ' +
    'read from the History, newest first, a page at a time. Show income or expense, and one category, with the ' +
    'chips; the totals are of what is shown. A name opens whom it names.',
  rankings: 'Where every Guild stands, and the Patrons who offer the Quests.',
  history:
    'What happened, newest first, a page at a time, by Day and time of day: your Guild’s, the world’s or a ' +
    'Rival’s, one choice away. Your Guild’s leaves out your Heroes’ XP and Morale, Regard, the Upkeep and the ' +
    'Market’s purchases and sales, and a Rival’s its Upkeep, purchases and sales; a Hero’s own History keeps ' +
    'everything. The world’s is what changed the world: Guilds founded, succeeded and folded, every Guild’s Quests ' +
    'taken and how they went, and a Patron’s Regard for a Guild moving into a new band. What your last play added ' +
    'is marked new. A Party’s Encounters fold under how its ' +
    'Quest went, and each Rival’s routine under one line, save in a Hero’s own History; open either to read it all. ' +
    'A name opens whom it names: ' +
    'a Hero’s page, a Guild’s page, or anyone else’s History. Find anyone the History names by name, a Hero who has ' +
    'died, retired or left the world among them.',
  offers:
    'A Rival’s bid for one of your Heroes waits here until you accept it, decline it or it expires. Accepting sends ' +
    'the Hero to that Guild for the fee; their gear stays with you, and the Heroes left behind who held them in high ' +
    'Regard lose Morale. Accept asks before it lets the Hero go.',
  pool:
    'Heroes on no Roster, whom any Guild may sign for a signing fee. A Hero of a higher Level will not sign for a ' +
    'Guild whose Fame is below what their Level asks: their row is set back, and Recruit is disabled. Order the pool ' +
    'by Class or by fee from their headings. Recruit signs one to your Roster for the fee; open a Hero to see their ' +
    'Stats first.',
  guildmaster:
    'Your character in the world, who runs your Guild: their Sex, Age and what you wrote of them. Their Stats bear on ' +
    'running the Guild, never on fighting: each says what it bears on. Their Traits help or hinder the Guild, each ' +
    'with what it does, and their Regard for others is shown as a band, the neutral ones folded under their count.',
  market: 'The Market, where your Guild buys Items for its Heroes and Parties and sells what it holds: Buy, then Sell.',
  buy:
    'Buy Items the Market has for sale at its price each, the number chosen; show one kind at a time with the chips ' +
    'above the table. The Market’s stock is drawn afresh each morning.',
  sell:
    'The Items your Guild holds and has not put on a Hero: gear to put on one from their page, consumables a Party ' +
    'can carry, and anything the Market will buy. Sell sells the number chosen for what the Market pays for each, ' +
    'which is less than it costs. Gear a Hero carries is not the Guild’s to sell until it is unequipped.',
  guilds:
    'Every Guild in one table, yours marked, in the Rankings by Fame at first. A column’s heading orders the table ' +
    'by it: by Fame or by Wealth it is the Rankings, where Guilds level share a place; by any other column the order ' +
    'is for display, and Place still reads by Fame. A folded Guild is listed last, with the Day it folded. Open a ' +
    'Guild for its Roster, with the Transfer fee your Guild would pay to take each Hero in, and its Hall and ' +
    'Guildmaster.',
  patrons:
    'Those who offer Quests, each of a walk of life: their Regard for your Guild, your Guildmaster’s Regard for them, ' +
    'and their Quests on the Board now. A Patron’s Regard for your Guild rises and falls with how their Quests go, ' +
    'weighs on how often they post to the Board, and recovers toward neutral with time. Those neutral both ways are ' +
    'folded under their count.',
  'new-game':
    'Found a Guild, name its Guildmaster, and take Quests from the Board. Under “Your Guildmaster”, set their sex and ' +
    'age, choose their Traits within the Trait budget, and write their Birthplace, Appearance and Biography; whatever ' +
    'you leave is drawn from the seed. The seed makes the world: the same seed and ' +
    'the same choices make the same game. Or load a game saved in this browser, or a save file, the CLI’s or one ' +
    'exported here.',
  game:
    'Save the game in this browser under a name, to load it here later, even after the page is closed; export the ' +
    'game, or a save kept here, as the file the CLI writes, which the CLI or this page can load. Loading a save, or ' +
    'starting a new game, puts it in place of the game in hand, which is lost unless saved or exported first. ' +
    '“Debug: the whole History” opens every entry of the History, unfiltered and unfolded, with its event type.',
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
