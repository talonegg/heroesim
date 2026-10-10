# Heroesim

A guild-management simulation. The player runs a Guild of Heroes, takes Quests from Patrons,
chooses who to send, and grows the Heroes and the Guild over years. The engine is mechanical
first; story-rich modules such as Campaigns and Scenarios extend it.

Entries cite what they restate: R and N numbers are in `docs/requirements.md`, ADRs in
`docs/adr/`, DL numbers through `docs/decisions/index.md`, and the pre-M0 review's letters in
`docs/decisions/archive/pre-m0-review.md` (DL-215). "To be built" marks a decision the build
does not carry yet.

## Language

### People and groups

**Guild**:
An organisation of Heroes with a Guildmaster, a Roster, a Hall, Wealth, Fame and a controller
(R7). The player's Guild and Rival Guilds are both Guilds, and the rules treat them alike, save
the accepted exceptions named under Controller.
_Avoid_: Company, Agency, Faction

**Guildmaster**:
The person who runs a Guild: a named individual whose Stats and Traits bear on running it, never
on fighting, for a Guildmaster joins no Party (R8; joining one is a later feature). Every Guild
has one (R7 to R9); the player's character is the Guildmaster of the player's Guild. Distinct
from the player, the human at the keyboard, who sees what their Guildmaster sees and pays: a Hero's
Potential hints through the Guildmaster's Judgement, and every fee at their Negotiation. The CLI and
the page show a Hero, a Quest and a Hero of the pool or a Roster in one reading of the world through
the Guildmaster, each laying it out its own way (DL-241).
_Avoid_: Player, Owner, Boss

**Hero**:
A named individual who undertakes Quests, described by Attributes, Stats, Skills, Traits and
States: on one Guild's Roster, or an Unattached Hero on none. A dead or retired Hero is out of
play and stays in the History.
_Avoid_: Adventurer, Character, Unit, Employee

**Roster**:
The set of Heroes a Guild currently employs. No Guild's Roster is capped: it grows as far as its
Guild's finances support (DL-185).
_Avoid_: Team, Squad, Stable

**Party**:
The Heroes a Guild assigns to one Quest, existing for that Quest's duration. A Party once
dispatched is never called home (DL-89); only its Guild's fold disbands it early (DL-28).
_Avoid_: Team, Squad, Band

**Patron**:
A person or body that offers Quests to Guilds. A Patron who is a person has a sex, which comes
with their name when it is drawn and which their Portrait follows; a Patron that is a body has none
(DL-125, DL-130). Every Patron drawn so far is a person; a body, shown with an emblem of its
Sphere, is to be built.
_Avoid_: Client, Employer, Quest-giver

**Sphere**:
The walk of life a Patron belongs to, which decides the kinds of Quest they offer.
_Avoid_: Faction (until Factions exist), Category

**Contact**:
A non-player character the player can deal with who assists or hinders Quests, influences the
world as it advances and affects Campaign progress, but does not offer Quests.
_Avoid_: NPC, Ally, Informant

**Rival Guild**:
Any Guild the player does not run: a Rival, for short, whose controller is a Disposition. It
competes for Quests, Heroes and Rankings.
_Avoid_: Enemy, Opponent, AI guild, Competitor

**Disposition**:
The named rule set that makes a Rival Guild's choices.
_Avoid_: AI, Personality, Strategy

**Controller**:
What makes a Guild's choices: the player for the player's Guild, a Disposition for a Rival. It
is the only difference between Guilds (ADR-0002). No rule asks which controller a Guild has,
save the accepted exceptions ADR-0002 lists: the game ends when the player's Guild ends, the
Transfer Generator never takes from it, its controller acts first on the Board, and Random
Events befall it alone (DL-82).
_Avoid_: AI, Brain, Owner

**Guild Battle**:
The owner's diagram's name for conflict between Guilds. For now it maps to the deferred ending
Defeated by a Rival and to Rival encounters during Quests; direct contests between Guilds are a
separate later feature (DL-89). None of them is built.
_Avoid_: Guild war, Battle (alone), Clash

**Guild Banner**:
The picture that stands for a Guild beside its name wherever a title names it. For now every
Guild shows the banner's Silhouette; later a Guild's Banner is heraldry drawn at its founding,
which the player designs for theirs at setup, with a picture in its place for a Guild a module or
Campaign brings (DL-125; the Silhouette by DL-129, heraldry to be built).
_Avoid_: Flag, Crest, Logo, Emblem (kept for a Patron that is a body)

### What a Hero is made of

**Attribute**:
A fixed or slowly changing fact about a person. A Hero's are name, sex, age, Background and
Class (R12), and two descriptive Attributes, with a Portrait (DL-135, DL-142); a Guildmaster's are
name, sex and age, and the three descriptive Attributes (R8; DL-88, DL-100), with a Portrait
(DL-125, DL-130).
_Avoid_: Property, Field, Detail

**Descriptive Attribute**:
One of the short texts about a Guildmaster or a Hero that no rule reads. A Guildmaster has three:
**Birthplace**, a place and not the Guild's Background; **Appearance**; and **Biography**. A Hero
has two of them, an Appearance and a Biography, and no Birthplace, since their Background says
where they are from. The player may write them for their Guildmaster at setup, each trimmed and held to a length (R8; DL-88 item 3, DL-100 item 3,
DL-102). By DL-125 the setup form writes all three from content on request, for the sex and age
chosen or drawn, and any left blank are written when the Guildmaster enters play, for every
Guildmaster: the player's, a Rival's and a successor's. A Guildmaster's Appearance keeps to what
their Portrait shows: a mapped picture's narrative is taken as it is, and no Appearance describes
clothing (DL-126, DL-127). The Birthplace, Appearance and Biography
are written from `content/descriptions.json`, by sex and age band, the Biography with the Guild's
Background and the Traits, and the setup form's "Write them for me" and "Again" fill the fields
(DL-132). A successor's Biography says they came to the chair, not the Background's
founding, and the form writes only the fields left blank or still as written, which follow the
Guildmaster as the setup changes (DL-133). A Biography follows the Portrait: its origin is
written by the picture's Station, its career by its Callings and hooks, and its closing by its
Temper (DL-134 item 6, DL-141). Every Hero's two are written as they are generated, in the
pool or on a Roster, and the player never edits them, since the player sets up no Hero: the
Appearance is their picture's narrative, or drawn from the phrases by sex and age band as a
Guildmaster's is; the Biography is written from their Background, their Class at their age band,
their first two Traits and, with a picture, its hooks and Temper (DL-135 item 6, DL-142).
_Avoid_: Detail, Origin, Backstory, Bio, Description

**Portrait**:
The picture of a person, three wide by four high, shown on their details and on their History:
a Guildmaster's, a Hero's and a Patron's. Every Guildmaster and Hero has one where a picture fits:
it is chosen to fit a person already drawn, by their sex, age and a Hero's Class, and never changes
them, and one whom no picture fits shows the Silhouette of their sex (DL-134, DL-135). Every
Guildmaster's is chosen to fit them as they enter play, the player's, a Rival's and a
successor's, and no two living Guildmasters, retired or in office, share a picture (DL-141,
DL-144); the player may instead choose one at setup, which is theirs whatever it fits. Every
Hero's is chosen to fit them as they are generated, in the pool or on a Roster: the Class must
match, and a picture no Hero on a Roster or in the pool has is taken first, one repeating once
every one that fits is (DL-142). A save holds the Portrait by
its picture's key (DL-125, DL-130). Each picture has a row in content that reads it: its apparent
age, Station, Temper, Callings or a Hero's Classes, Features, narrative and hooks, the Biography's
sentences written for that picture alone and not a module's Hook (DL-134, DL-135 item 2,
DL-138). Every picture is drawn in graphite on cream paper (DL-126); the first are the owner's
two, one of each sex (DL-131). The page's setup form offers the pictures, with the Portrait the
seed would choose beside them, and the CLI's `new --portrait` chooses one. The form
offers them as a grid of one sex's thumbnails at a time, and a person's thumbnail, or their small
Silhouette, stands beside their name in the Roster, the Unattached pool and the Guilds' table (DL-135
item 9, DL-145).
_Avoid_: Avatar, Profile picture, Headshot, Image (alone)

**Silhouette**:
The stand-in picture shown where no picture exists yet: a head and shoulders of the person's sex
for a Portrait, a banner's outline for a Guild Banner, a chest's for a Unique Item. A Guildmaster
shows it where no picture fits them, or every one that does is held by another living Guildmaster,
retired or in office (DL-125, DL-129, DL-135 item 3, DL-144). A Hero shows it where no picture of
their sex, band and Class exists, as every Hero does while content has no Hero picture (DL-135
item 8).
_Avoid_: Template (a Quest template is another thing), Placeholder, Default image

**Station**:
The walk of life a person was born to: `common`, `trade` or `gentry`. A picture's row reads one,
and each Hero Background has one: Fallen gentry is gentry, Town apprentice trade, and the other six
common. A Guildmaster's Biography begins from their picture's Station, and a Hero's Portrait is
preferred of their Background's (DL-134 item 4, DL-135 item 5; in content and read, DL-138,
DL-141).
_Avoid_: Rank, Class (a Hero's Class is another thing), Caste, Birth

**Calling**:
What a Guildmaster did before the Guild's chair, read from their picture, one or two to a picture:
`soldier`, `adventurer`, `scholar`, `mage`, `explorer`, `merchant` or `lawyer`. Each suits some
Guildmaster Traits and clashes with others, set once for the Calling, so that a Portrait is
preferred whose Callings clash with none of the Guildmaster's Traits. A Biography's career is
written by it. A Hero's picture has Classes instead (DL-134 item 4, DL-135 items 1 and 2; in
content and read, DL-138, DL-141).
_Avoid_: Career, Profession, Job, Class (on a Guildmaster)

**Temper**:
The manner a picture's face shows, such as stern, composed or wry. The closing sentence of the
Biography of a Guildmaster or Hero with the picture is written by it (DL-134 item 4, DL-135 item 2;
in content and read, DL-138, DL-141).
_Avoid_: Mood, Personality, Disposition (a Rival Guild's is another thing), Trait

**Feature**:
What a picture shows of the body, such as a beard, a scar or an eyepatch, defined once for every
picture and never clothing (DL-127). A Feature may be on male pictures only, and may show Hero
Traits, as a scar shows Scarred, so that a Hero who holds one is given a picture that shows it where
one fits (DL-134 items 3 and 4, DL-135 item 3; in content and read, DL-138, DL-142).
_Avoid_: Keyword, Tag, Mark, Trait

**Class**:
A Hero's fixed archetype, chosen at generation: Warrior, Rogue, Mage or Healer. It raises its
leading Stats, sets how each Level grows Stats, gates Skills and is the first input to
Synergies.
_Avoid_: Role, Job, Type, Archetype

**Stat**:
A numeric capability that a Quest is assessed against and that grows with experience. Stats
are a keyed set defined in content, each in one of four areas. A Hero's initial Stats:
Physical (Strength, Dexterity, Weaponry, Constitution, Endurance), Mental (Intelligence,
Knowledge, Perception, Wits, Courage, Willpower), Magical (Arcana, Power, Spelllore, Spirit,
Resistance) and Social (Leadership, Charisma, Diplomacy, Adaptability). A Guildmaster's:
Inspiration, Influence, Negotiation, Coaching, Judgement. No Stat name is shared between
Heroes and Guildmasters, so a Stat key names one thing.
_Avoid_: Attribute (see above), Ability, Score

**Leading Stat**:
A Stat a Class favours: raised at generation and given most of each Level's growth. Every Class
leads four; DL-87 gives each a fifth (to be built). No Class leads Leadership, which grows
slowly and alike for every Hero (DL-87).
_Avoid_: Primary Stat, Main Stat, Class Stat

**Skill**:
A named proficiency a Hero holds, rated 1 to 5. A Hero either has a Skill at a rating or
does not have it at all.
_Avoid_: Ability, Talent, Trait (on a Hero), Perk

**Trait**:
A named binary mark: on a Guildmaster, a buff or penalty to the Guild or to a Class; on a Hero,
a lasting mark such as one left by a healed Injury. Guildmaster Traits and Hero Traits are two
lists in content, a key in one only, and each Trait carries a list of effects, so that a Trait may
later trade a buff for a penalty (DL-87 item 6, DL-150 items 1 and 2, DL-159). A Guildmaster or
a Hero holds none or more of their own list, never two of which one excludes the other, each
exclusion holding both ways. A Guildmaster Trait has a cost, a buff costing points and a penalty
refunding them, and one effect or more (DL-87 item 5, DL-88 item 4, DL-100). A Hero Trait has none
or more: Stat changes, which the Hero's effective Stats carry as gear's, and an Encounter bonus, added
to every Check of the Encounters it names once for the Party however many hold it (DL-148 items 24
and 26, DL-150 item 8, DL-159). A Trait an Injury leaves replaces any the Hero holds that it
conflicts with (DL-150 item 5).
_Avoid_: Perk, Flaw, Buff, Modifier (as a noun)

**Earned Trait**:
A Hero Trait a Hero gains on a Quest, rarely. A positive one is drawn on an Encounter's Triumph
and kept only if the Quest ends a strong success; a negative one falls only on a Hero injured by
the same Encounter at the Degree Failure. It reads the Degree, not "failed" as a reroll does, which
takes in a Setback: a Hero hurt at a Setback earns none. At most one a Hero a Quest, none held
already nor one that conflicts with one held, and each a Milestone, as is a Trait lost to an
Injury's (DL-148 items 25 to 27, DL-150 item 5, DL-168 item 5, DL-159, DL-172). Which it is,
positive or negative, is where content lists it: in an Encounter's Triumph consequences or its
Failure ones.
_Avoid_: Perk, Achievement, Level-up

**Trait budget**:
The points a Guildmaster's Traits may cost in all, `guildmasterTraitBudget`, so the dearer buffs
need a penalty beside them. The player's choice at setup and every drawn Guildmaster, a Rival's
or a successor's, keep within it and hold no excluded pair (DL-88 item 4, DL-100 item 3).
_Avoid_: Point buy, Allowance, Points (alone)

**Stat points**:
The points a player shares among their Guildmaster's five Stats when they choose them at setup,
`guildmasterStatPoints` (50, the drawn Stats' mean of 10 each). Each Stat chosen is 5 to 15, the
range the Stats are drawn from; the Stats may cost no more than the points in all, and points left
unspent are lost. Every Stat is chosen or none is. A drawn Guildmaster, the player's under "Choose
for me", a Rival's or a successor's, is not held to them (DL-149 item 5, DL-153).
_Avoid_: Point buy, Pool (alone), Points (alone), Stat budget

**Level**:
A Hero's rank of experience. XP earned from Quests and training raises it, and each Level
raises Stats along the Class's growth profile.
_Avoid_: Rank, Tier, Grade

**XP**:
Experience points, earned from Quests and training, that raise a Hero's Level. A Quest's XP is
split across the Party sent, its Dead counted: each Hero who comes home takes an equal share,
rounded down, and a Hero who dies takes none, their share lost (DL-182, DL-184).
_Avoid_: Experience (alone), Points, Growth

**Potential**:
A hidden per-Hero ceiling on each Stat, shown to the player only as a hint, which the
Guildmaster's Judgement sharpens: by DL-85 a poor Judge sees fewer, coarser hints and a sharp
one finer hints (to be built). By DL-83, Decline lowers it too (to be built).
_Avoid_: Cap, Ceiling, Talent, Rating

**Decline**:
The yearly loss of a Hero's Stats in some areas once past an age (R17). Today a Level can grow
a lost point back; by DL-83 Decline lowers Potential too, so it cannot (to be built).
_Avoid_: Ageing (for the loss itself), Deterioration

**State**:
A transient condition of a Hero: an Injury, Morale, Death, and the Regard the Hero holds for
others.
_Avoid_: Status, Condition, Flag

**Injury**:
A State with a type and a number of Days to heal, faster in an infirmary. Some types leave a
permanent Trait when they heal.
_Avoid_: Wound, Damage, Hurt

**Death**:
A permanent State. A dead Hero leaves the Roster but stays in the History.
_Avoid_: Loss, Removal, Casualty

**Morale**:
A Hero's contentment.
_Avoid_: Happiness, Mood, Loyalty

**Morale band**:
One of the named ranges a Hero's Morale falls in. A Hero's Form on a Quest is the first rule to
read them (DL-154); Random Events are to read them too (DL-82).
_Avoid_: Mood, Tier

**Regard**:
The opinion one entity holds of another, whether Hero, Guild, Guildmaster or Patron.
_Avoid_: Reputation, Opinion, Affinity, Standing

**Regard band**:
One of the named ranges a Regard value falls in; a History entry is recorded when a value
crosses one.
_Avoid_: Tier, Level (of Regard)

**Relationship**:
A score between two entities computed from the Regard each holds for the other.
_Avoid_: Bond, Link, Connection

### Work

**Quest**:
A piece of work offered by a Patron and undertaken by a Party, whose outcome is determined by
the Quest Engine.
_Avoid_: Mission, Commission, Job, Contract, Task

**Quest template**:
A content row a Quest is drawn from: its Spheres, Skills, requirements, the ranges
of its difficulty, duration and Party size, its reward and Fame effect, its tags, its Loot
table, its kinds of Encounter and any Finale. A Quest copies what it carries at generation, so a
changed template never alters a Quest already offered (DL-25). Its tags weight the draw of its
Encounters: within a kind, an Encounter is drawn `encounterTagWeight` times as often for each tag
it shares with the template (DL-148 item 22, DL-160); they are kept too for
Random Events' conditions (DL-82).
_Avoid_: Quest type, Blueprint, Archetype

**Stat demand**:
A Hero Stat a piece of work asked for, with a weight; a Quest template's or an Encounter's
weights summed to one (DL-06, DL-42). Gone: a Quest's are shown nowhere and read
by no rule (DL-148 items 16 and 17, DL-157), an Encounter's went with content's old form
(DL-192), and a Quest template's and a Quest's too (DL-193). What a Check reads
is its Query (ADR-0010); the Board shows it.
_Avoid_: Requirement (a Quest's requirements are its Party size and any Class or Skill it needs),
Weighting

**Quest Engine**:
The part of the engine that assesses a Quest against the Party sent and produces the outcome:
effects on each Hero, reward or penalty, Loot, and what the world learns from it.
_Avoid_: Mission Engine, Combat system, Resolver

**Encounter**:
One typed step of a Quest, resolved by its Checks with typed consequences. An Encounter has one
to four Checks, combined by its pass formula (`and`, `or` and `at-least`, every Check named once)
into its Degree, and its consequences may differ by Degree: a Triumph's are Success's unless it
has its own, and a Setback's Failure's (DL-148 item 7, DL-152). Each is of one
kind, `combat`, `travel`, `social`, `arcane`, `stealth` or `lore` (for Intelligence and Knowledge:
riddles, records and clues, DL-160), and may carry tags, as a Quest template does. The kind
is data, written in lower case inside a sentence ("on lore Encounters"); `lore` names a kind of
Encounter, never a Background.
_Avoid_: Beat, Scene, Event

**Check**:
The comparison of a Party's capability against an Encounter's difficulty. Its score is a Query
over the Party (DL-151), an Encounter written the old way loading into one Check
whose score is the same weighted sum of Stats. An Encounter has one to four Checks, each named for
the narration and the Board, each rolled every time, and each with its own target, a flat part
and a part that grows with the Quest's difficulty (DL-148 item 7, DL-152). A
raw Check's capability is its score alone, with no Skill, Synergy, teamwork or consumable added: a
gate, such as a count of the Heroes strong enough against a flat target (DL-152).
_Avoid_: Roll (for the whole), Test, Save

**Query**:
A reading of the Party, written in content as a list with its operator first, which the engine
evaluates: some of the Party's Heroes (a Set), one of them, a number or a fact of one Hero, or a
number of the Party, such as the strongest Warrior's Strength or the total Intelligence of the
Mages and Healers. A Check's score and a Synergy's requirements are Queries (DL-148 items 4 to 6,
ADR-0010, DL-151). A Query reads only the Party's own Heroes on the Quest,
never the Guildmaster or the Guild's dealings, nor Regard between Heroes. Sex decides who takes
part in a Check and never a value: it stands only in a filter of a Check's score, never in a
Synergy's requirement, and a Set filtered by it is never counted, by `count` or by a value that
reads nothing of a Hero.
_Avoid_: Formula, Expression, Script, Filter (for the whole)

**Degree**:
How a Check came out, read from its roll against its target: a **Triumph**, a Success, a
**Setback** or a Failure. A Triumph is a Success by a wide margin, a Setback a Failure by a narrow
one. An Encounter takes the Degree its pass formula gives: the worst of an `and`, the best of an
`or`, the k-th best of an `at-least` k; the Check that set it decided it. A strong success needs
Triumphs (DL-148 item 8, DL-152).
_Avoid_: Tier, Grade, Result (alone)

**Form**:
How much of themselves a Hero brings to a Check on a Quest: a factor on the Stats they add to a
score, from their Morale band, and lower once they are hurt on the Quest. The band is read from
their Morale on the Quest: their Morale as they set out plus the Morale the Quest's Encounters have
cost or given them so far, their own since a loss may be steadied (DL-155). Form never changes
their Exposure or Guard. Filters, the choice of the best or worst Hero, Synergy requirements, Skills,
Level, age and counts read a Hero as they are, and so does a raw Check. The Party builder says in
one line what the Party's Form does to its odds, naming no Hero (DL-148 items 9 to 12, DL-154).
_Avoid_: Condition, Fitness, Mood

**Exposure**:
How likely harm on a Quest is to fall on a Hero rather than another. An Injury or a Death may name
the Heroes it falls on, a Set Query (`among`), and the Stats that expose to it (`exposedBy`): of
those it can fall on, the less of those Stats' range a Hero has, the likelier it is them: the
weakest three times as likely as the strongest at the first `exposureRange`. `among` is read over
those it can fall on, so an Injury on the weakest falls on the weakest unhurt Hero, passing over one
already hurt; a Death's over the living Party (DL-168 item 6, DL-178). When
`among` names no one it can fall on, any of them may be hit, so leaving the front rank at home
dodges nothing (DL-148 item 14, DL-155).
_Avoid_: Aggro, Threat, Targeting

**Guard**:
How much of a harm a Hero shrugs off: an Injury's or a Death's chance on them, or a Morale loss,
less for a Hero with more of the range of the Stats it names (`guardedBy`, `steadiedBy`): half for
the strongest at the first `guardRange`. Exposure and Guard read a Hero's effective Stats, so armour
protects (DL-148 item 14, DL-155).
_Avoid_: Defence, Armour (for the whole), Resistance, Save

**Finale**:
A fixed last Encounter a Quest template names, met after the drawn ones: the Quest's count of
Encounters is unchanged, its last place the Finale. An Encounter named as a Finale is never drawn
into a place. On such a Quest Loot also needs the Finale to end a Triumph. The four hardest
templates are to have one (DL-148 items 22 and 23, DL-160, the four written in
DL-166).
_Avoid_: Boss, Climax, Final Encounter

**Quest band**:
How well a Quest went: failure, success or strong success, read from the share of its
Encounters the Party came through at Success or better (DL-42). A strong success needs every
Encounter at Success or better and half of them Triumphs: DL-83's margin, made a share of
Triumphs (DL-148 item 8, DL-152). By DL-85 it pays a premium (to be built).
_Avoid_: Result, Grade, Tier

**Chance band**:
The word an estimated chance is shown in: Hopeless below 10%, Unlikely to 35%, Even to 65%, Likely
to 90% and Near certain from 90% (`chanceBands`). The numbers in the detail are floored to a
multiple of 5, between 5 and 95 unless the chance is 0 or 1, which show 0 and 100 (DL-157, DL-168
item 10). The estimate reads what each Check reads of a proposed Party as it will come home, its
Morale, Regard and Injuries moved by each night away, on the Quest's own Encounters, drawn when it
was posted. It reads the Guild as it is when the Party sets out, and assumes no one falls: no Hero
hurt or killed on the way, and no Morale moved by an Encounter. So the words come with "if no one
falls", and the numbers stay in the detail (DL-148 item 15, DL-156, DL-157).
_Avoid_: Odds (for the word), Rating, Difficulty

**Best Party**:
The Party the engine would send on a Quest from a Guild's free Heroes (`bestParties`, DL-237):
first those its Class and Skill requirements take, then whoever most raises the estimated chance of
success up to its least Party size, then each Hero who raises it by more than the Guild's
**Party margin** (DL-175), up to its greatest. A Rival sends it, at its Disposition's margin; the Board shows the
player's, "Your best Party", at the configuration's `playerPartyMargin`, and the harness's policy
sends that (DL-148 item 17, DL-157).
_Avoid_: Strongest Party, Optimal Party, Recommended Party

**Board**:
Where the Quests currently on offer are posted. Every Guild draws from it.
_Avoid_: Quest log, Noticeboard, Job board

**Loot**:
Items awarded by a Quest's outcome.
_Avoid_: Drops, Rewards (for Items), Treasure

**Quest report**:
What a Party's return tells the Guild, read from the History: the Quest, its Patron and its band;
each Encounter with the consumables used; the reward, Wealth, Fame, XP and the Loot; each Hero's
outcome, and what a Death cost the Heroes at home (DL-120); and the Patron's Regard for the Guild,
the band the Quest moved it into or its band now (DL-111, DL-118). Shown on the Guild's Home when a Party comes home, and again from the return's
entry.
_Avoid_: Debrief, Summary, Result

**Loot table**:
A content list of Items, each with a weight and a quantity range, from which a Quest's Loot is
drawn. A Quest carries one only when its template names one and it is hard enough (DL-52).
_Avoid_: Drop table, Treasure table

**Synergy**:
An authored bonus that applies when a Party meets its requirements: conditions on the Party
written as Queries, every one of which must hold, such as at least one Warrior and one Healer
(DL-148 item 20, DL-151, the old list of Classes and Skills loading into
them). Relationship between members scales teamwork separately.
_Avoid_: Combo, Bonus (alone), Chemistry

**Campaign**:
A plotted set of Quests and Inciting Events, triggered through the World Engine, that changes
the world as it unfolds and can be won or lost.
_Avoid_: Storyline, Arc, Chapter, Season

**Inciting Event**:
A change in the world, drawn at random or prescribed by an active Campaign, that produces
Quests or alters the World State (R6). Unlike a Random Event it may produce Quests; its
generator is a later module that belongs with Campaigns (DL-82).
_Avoid_: Trigger, Hook, Plot point

**Random Event**:
Something that befalls the player's Guild or the Heroes on its Roster as time passes, drawn at
night by the Random Events module from content with conditions (R3, R6). By DL-82 it befalls
the player's Guild alone, a fourth accepted exception to ADR-0002; it is an outcome, never a
choice the player answers; it never causes a Death; and, unlike an Inciting Event, it never
produces a Quest.
_Avoid_: Incident, Happening, Event (alone)

### The world and time

**World State**:
Everything the engine knows: Guilds, Heroes, Patrons, Regard, Quests, the Board, Items, the
installed modules' slices, and the History. A save is a snapshot of it.
_Avoid_: Game state, Model, Database, Save (for the data itself)

**World Engine**:
The part of the engine that advances the World State Turn by Turn, according to the rules and
each Guild's controller, calling each installed module at its hooks.
_Avoid_: Simulation, Game loop, Orchestrator

**Generator**:
A part of the engine that draws new things into the world from the seed, at creation and as
time passes: the Heroes, Guild, Patron and Quest Generators, and the Transfer Generator's bids.
The Random Event and Inciting Event generators come later, as modules (requirements §2).
_Avoid_: Factory, Spawner

**State Engine**:
A part of the engine that advances one kind of entity each night: the Hero State Engine
(healing, Morale drift, Regard decay, Retirement), the Guild State Engine (Upkeep, the
Bankruptcy floor and the Fame floor) and the Patron State Engine (Patron Regard recovering
towards neutral).
_Avoid_: System, Manager, Updater

**Event**:
A typed record of one change the engine made, saying when it happened and whom it concerns.
Engine calls return events, never prose; front ends narrate them and the History keeps each as
an entry (ADR-0003). A module's own events are typed by the module.
_Avoid_: Message, Log line; "Event" alone for a Random or Inciting Event

**History**:
The record inside the World State of every event, kept per Guild and per Hero with a list of
Milestones; never bounded, and no entry is dropped (R36). Every discrete change is an entry;
nightly drift, and the changes DL-84 names, are recorded only when they cross a band. A Hero
generated into the Unattached pool enters the History once hired: their arrival, and their leaving
the pool if never hired, are events and not entries, and a hired Hero's History begins at their
signing (DL-211). The page
shows a Guild's History with some entries left out, none dropped: the player's Guild's without
its Heroes' XP and Morale, Regard moving, Upkeep, purchases and sales, and a Rival's without Upkeep,
purchases and sales (DL-111, DL-117). In the player's Guild's, a Party's return is one entry, its
Encounters and its Heroes' Levels that night gathered under it (DL-118), and its Injuries and Deaths
standing beside it as entries of their own (DL-120). A Hero's,
a Guildmaster's and a Patron's leave out nothing.
_Avoid_: Event log, Journal, Audit trail

**World History**:
The History's entries that change the world rather than one Guild: the world made and its rules
adopted, Guilds founded, succeeded and folded, the game's end, every Guild's Quests taken and
their outcomes, and a Patron's Regard for a Guild moving into a new band (DL-111, DL-117). A
choice of the History's beside the player's Guild's and each Rival's. The whole History, every
entry unfiltered, is not a choice but the game menu's debug view, "Debug: Whole History" (DL-120).
_Avoid_: World log, Chronicle, News

**Milestone**:
A History entry marked as one a Hero's or a Guild's page always shows first: a Level gained,
a Death, a Transfer, a Trait gained or lost, a Campaign beat. No entry is dropped; a Milestone is one that is surfaced.
_Avoid_: Highlight, Achievement, Key event

**Day**:
Three Turns: morning, afternoon and night. A player reads the Day of the Year, from Day 1 to Day 360,
with its Year: "Year 2 Day 45", "Year 2 Day 45, afternoon", "the night of Year 2 Day 45"; the engine
counts Days from 0 and never resets them (amended 2026-10-06, DL-206 items 30 to 33, DL-210).
_Avoid_: Tick, Round

**Turn**:
The unit by which the World Engine advances, three to a Day. The Board and Market refresh in the
morning and the Rivals act in the afternoon; at night Quests conclude, and healing, Morale
drift, ageing, Upkeep and the ending checks fall, as Random Events will once that module exists
(R3, approach §2). Quests span several Days.
_Avoid_: Step, Phase, Tick

**Year**:
360 Days, 1,080 Turns (`turnsPerYear`, whole Days), by which ages and the calendar are counted: the
game begins in Year 1, Day 1, as players read it; the engine counts Years from 0 (DL-125 names it;
amended 2026-10-06, DL-206 items 8 and 30, DL-210, originally "begins in Year 0").
_Avoid_: Season, Annum

**Action**:
A choice made through the engine, accepted with events or refused with a typed reason and
nothing changed: dispatching a Party, recruiting, a Transfer, a Transfer Offer or its answer,
buying, selling, equipping and unequipping gear, building an Improvement, and rebase. The player
acts between Turns, while time stands still; the Rivals act in the afternoon. A refusal, an
Action's or a new game's setup's, is said in one sentence for the CLI and the page alike, each
naming its own way whom it concerns (DL-240).
_Avoid_: Command (a front end's word), Move, Order

**Outing**:
An action that takes the Guildmaster out of the Hall: the Market, and later scouting and Patron
visits. The limit of one Outing per Turn arrives with the second kind of Outing; until then the
Market is the only one and is not limited (R4, pre-M0 review B1). When the limit comes, it binds
every Guild (DL-89). Actions inside the Hall are never limited.
_Avoid_: Action point, Move, Trip

**Fast forward**:
Playing Turn after Turn for a watched Guild until a Fast-forward stop holds or a set number of
Turns has passed; it lands exactly where as many single Turns would (DL-33).
_Avoid_: Skip, Auto-play, Simulate

**Fast-forward stop**:
A typed reason Fast forward halts. Some always stop it: an ending, the watched Guild falling below
the Bankruptcy floor, its Party coming home, a decision it needs to make, a Transfer Offer for it,
and a module asking; others only when the caller names them: a Quest its free Heroes can staff
appearing, even with a Party out, and the Unattached pool refreshing (`StopReason`, DL-33, DL-85,
DL-101). To be built: an opt-in stop for a Random Event (DL-82).
_Avoid_: Interrupt, Pause, Breakpoint

**Watched Guild**:
The Guild whose Parties, decisions and Transfer Offers stop Fast forward, named by whoever runs
it: in a front end, the player's. So no rule needs to ask which Guild is the player's (DL-33).
_Avoid_: Current Guild, Active Guild

**Rebase**:
The action by which a game in play adopts the rules now in force: its configuration becomes the
current defaults, and a Milestone records when (pre-M0 review D1). Until then a loaded game
plays under the rules it began with, a field newer than the save reading as today's default
(DL-84). DL-82 extends rebase to modules' tunables (to be built).
_Avoid_: Upgrade, Migration (which changes a save's shape, not its rules)

### Modules

**Module**:
A feature that plugs into the World Engine rather than the core: it owns a slice, is called at
its hooks, and changes the core's rows only through its effects (ADR-0005, DL-76, DL-77). The
core is a complete game with none installed. By DL-82 a game's modules are chosen when it
begins, on by default, and recorded in its save, and an older save takes one on only when the
player adopts it (to be built). Which later features are modules is decided per feature, in its
epic (DL-89).
_Avoid_: Plugin, Extension, Add-on, Mod

**Module slice**:
The part of the World State a module owns, under its id. The core copies it with the rest of
the world and never reads inside it; the module makes, migrates and validates it and keeps its
own tunables there (DL-76, DL-78).
_Avoid_: Module state, Namespace, Store

**Hook**:
A point in the Turn where the World Engine calls each installed module: morning, afternoon and
night. At a hook a module reads the world without changing it, changes its own slice, makes its
own events, applies effects and may ask Fast forward to stop (DL-77). DL-82 adds a hook at
rebase, through which a module adopts its current tunables (to be built).
_Avoid_: Callback, Handler, Listener

**Effect**:
One of the few typed changes a module may make to the core's rows, each run by the core's own
rule and explained by the core's own event naming the module: adjusting Morale, Wealth or
Regard, injuring a Hero, and offering a Quest (DL-77). A new kind is an engine change with a
decision of its own, and by DL-82 no effect reaches an Unattached Hero (to be built). Not a
Trait's effect, the buff or penalty a Trait applies.
_Avoid_: Write, Mutation, Command

### Setup

**Background**:
The named narrative history of a Guild or a Hero, with two owners as Trait has: a Guild's,
chosen by the player for theirs at setup and drawn for a Rival's, and a Hero's, drawn at
generation (R5, R12). Flavour only: no rule reads it, and DL-85 keeps it so for now, to be
revisited.
_Avoid_: Backstory, Origin, Lore

**Scenario**:
A preset starting situation with some randomness: the opening debt, Roster, resources and any
authored Campaign a new game begins with.
_Avoid_: Difficulty, Preset, Mode, Start

### Trade and standing

**Wealth**:
A Guild's coin: the currency that buys Items, recruits Heroes, pays Upkeep and builds the
Hall. Its accounts are read in the Treasury (DL-111).
_Avoid_: Gold, Money, Funds

**Treasury**:
The Guild's accounts: its Wealth, its Upkeep, and every change to its Wealth, read from the
History by category (Upkeep, Quest rewards, Market, Hall, Heroes and Other); a part of the Guild's
view (DL-111, DL-116).
_Avoid_: Bank, Coffers, Vault

**Upkeep**:
The recurring cost of the Roster's wages and the Hall's maintenance.
_Avoid_: Wages (alone), Salary, Running costs

**Hall**:
The Guild's premises: an infirmary, a training yard and quarters, each raised by Improvements
and, later, staffed by Workers.
_Avoid_: Base, Headquarters, Guildhall, Facilities

**Improvement**:
A one-off purchase for Wealth that raises a Hall facility's grade.
_Avoid_: Upgrade, Building, Feature

**Worker**:
A non-Hero person hired for a wage within Upkeep, whose Stat scales what a Hall facility does.
_Avoid_: Staff, Employee, NPC, Hireling

**Market**:
Where the Guild buys and sells Items. An Item sells for less than it costs to buy.
_Avoid_: Shop, Store, Exchange, Bazaar

**Market Engine**:
The part of the engine that refreshes the Market and prices Items.
_Avoid_: Economy, Shop system

**Item**:
A thing the Guild owns and equips or expends: permanent gear that a Hero carries, or a
consumable that is used up.
_Avoid_: Equipment (for the general concept), Gear (for consumables), Inventory

**Gear**:
An Item a Hero carries in one of their slots, changing their Stats; a slot holds one Item at
most (R30, DL-48).
_Avoid_: Equipment, Kit

**Consumable**:
An Item a Party is given at dispatch and the Quest Engine uses up; what is left comes home with
the Party (R23, R30, DL-50).
_Avoid_: Supplies, Potion (for the general concept)

**Holding**:
The Items a Guild owns that no Hero carries and no Party has taken (DL-48).
_Avoid_: Inventory, Stash, Vault

**Stores**:
Everything the Guild owns, wherever it is: its Holding, the Gear its Heroes carry, and what its
Parties have taken; a part of the Guild's view, read only for now (DL-111, DL-113 item 2, DL-116). Not the Market, where Items are bought and sold.
_Avoid_: Inventory, Armoury, Stash

**Common Item**:
An Item that is not an individual: tools, potions, ordinary gear. It has a quantity and may
be held in several places at once, including the Market.
_Avoid_: Stackable, Generic item, Commodity

**Unique Item**:
An Item that is an individual, magical, special or belonging to a Campaign, with exactly one
holder at a time. By DL-125 it shows its picture beside its name, or a chest's Silhouette until it
has one, in the Stores, the Market's Sell and a Hero's Gear (DL-129). No Unique
Item has a picture yet, so each shows the Silhouette. The Roster's
Tiles show it too (DL-182, DL-183), before its name in its Item's chip, and a Hero who carries one has a thin gold glow
around their tile, and around their row in the Roster's Table, which shows no picture.
_Avoid_: Artefact, Legendary, Named item

**Unattached Hero**:
A Hero on no Roster, in a pool the Heroes Generator refreshes and every Guild recruits from
for a signing fee.
_Avoid_: Free agent, Mercenary, Recruit (as a noun), Candidate

**Transfer**:
Moving a Hero between Guilds for a fee, in either direction. Transferring out a Hero costs the
Morale of each Hero who stays and held them in high Regard (R28, pre-M0 review D5); by DL-82 it
also lowers those Heroes' Regard for the Guildmaster, and by DL-85 Heroes content or close with
their Roster refuse to leave (both to be built).
_Avoid_: Sell, Buy, Trade, Signing, Poach (until poaching is a distinct thing)

**Transfer Offer**:
A pending bid for a Hero, held until accepted, declined or expired. A Rival answers a bid at
once and the player's Guild through Transfer Offers: a difference of controller, not a rule
about the player's Guild (DL-57, DL-85). On the page, Offer alone is short for it (DL-125).
_Avoid_: Bid, Request

**Transfer lock**:
The Days after a Transfer during which that Hero cannot be transferred again: 90, the same for
every Guild (DL-60, DL-69; confirmed by DL-85).
_Avoid_: Cooldown, Embargo

**Transfer Generator**:
The weekly night rule by which Rivals bid for one another's Heroes. It never takes from the
player's Guild, an accepted exception to ADR-0002 (listed there, DL-59). Its own bids keep both Rosters
within the range a Rival is generated with: a bound on the Generator alone, not a cap on any Roster,
kept for now only to constrain testing load and to be removed (DL-185, in the backlog).
_Avoid_: Transfer window, Trade market

**Fame**:
A Guild's renown, rising and falling with Quest outcomes; never spent. It orders the Rankings
and gates which Unattached Heroes will sign for a Guild (R10, pre-M0 review B4); dealings with
Patrons, Contacts and Inciting Events will move it later. DL-85 accepts it as dormant for now:
its further uses wait for Scouting and Contacts.
_Avoid_: Reputation, Prestige, Renown, Standing

**Rankings**:
Every Guild in play ordered by Fame or by Wealth; a folded Guild is out of them (R10, DL-28).
Ordering by any other Guild statistic is a later feature (requirements §2).
_Avoid_: League, Leaderboard, Ladder, Score

### Endings

**Ending**:
How a Guild's story closes: Retirement, Bankruptcy or Roster wiped in the first build; Defeated
by a Rival, Hall lost, capture and indenture, and Ultimate Campaign Victory later (R34). The
player's Guild's ending ends the game; a Rival's folds it (pre-M0 review A2, DL-28). Retirement
is an ending for the player's Guild alone: a Rival whose Guildmaster retires carries on under a
successor (Succession; DL-83 item 19, DL-100).
_Avoid_: Game over (for a Rival), Loss, Defeat (alone)

**Retirement**:
A Hero or Guildmaster leaving the game at the end of a career. A Hero's is a yearly chance that
rises with each year of age past a threshold and is higher while injured (R20, DL-29); by DL-83
it reads the Hero's injury history (to be built). A Guildmaster's comes at a fixed age,
`guildmasterRetirementAge`, 61 from DL-113, on the night of the Day they reach it, a Turn known
from their founding (`retirementTurn`, DL-114): the player's Guildmaster's is an ending (R34,
DL-28), and a Rival's Guildmaster's is met by Succession, the retired Guildmaster keeping their
row and History with the Turn of their Retirement (DL-83 item 19, DL-100).
_Avoid_: Ageing out, Quitting

**Succession**:
A new Guildmaster taking over a Rival Guild whose Guildmaster retires, the Guild carrying on with
its Roster, Wealth, Fame, Hall and Items (DL-83 item 19, superseding DL-28's fold; DL-100). The
successor is drawn as a founding Rival's Guildmaster is, within the Trait budget, with a name no
one in play has; their Regard starts neutral, and the Regard others held for the retired
Guildmaster stays with the retired Guildmaster. A Milestone names the Guild and both
Guildmasters, and no replacement Rival is founded. The player's Guildmaster is never succeeded:
their Retirement ends the game.
_Avoid_: Replacement (a new Rival after a fold), Handover

**Bankruptcy**:
A Guild's Wealth staying below the Bankruptcy floor for a grace of Days, after which the Guild
ends. For the player's Guild the game ends; a Rival folds: its Heroes go to the Unattached pool,
its Unique Items to the Market, and its stacks of Common Items are discarded (pre-M0 review D6
as DL-51 and DL-54 carry it out; words aligned by DL-87).
_Avoid_: Insolvency, Game over, Ruin

**Roster wiped**:
The ending of a Guild with no Heroes on its Roster and too little Wealth to sign the cheapest
Unattached Hero (R34, DL-28).
_Avoid_: Wipe-out, Party wipe

**Fold**:
What a Rival's ending does to it: it leaves play and the Rankings, its Parties in flight are
disbanded unresolved, its Heroes go to the Unattached pool, its Unique Items are sold to the
Market and its stacks of Common Items discarded, and a new Rival replaces it after a delay of
30 Days (DL-28, DL-51, DL-54; words aligned by DL-87; the delay confirmed by DL-83). Only a Rival
folds.
_Avoid_: Collapse, Dissolution, Elimination, Game over (for a Rival)

### Measuring

**Harness**:
The program that plays many seeded games under the automatic policy and reports the counters
every balance decision is read against (N10). Each game it plays is a twenty-year slice, not a
whole game (DL-83). By DL-82 a run with the default modules carries the balance targets, and a
run of the core alone guards the core.
_Avoid_: Simulator, Test bot, Benchmark

**Automatic policy**:
The harness's stand-in for the player: fixed rules that play the player's Guild through the same
actions a human would. DL-83 adds an active policy beside it, and the harness reports both (to be
built).
_Avoid_: AI, Bot, Autoplayer

### Tools

**Content editor**:
The owner's local page and commands for changing the content the game ships, `npm run edit`; never
part of the deployed game, and never touching a saved game. A kind of content is edited as a list
of keyed rows through its forms; Traits are the first kind (DL-150 items 7 to 12, DL-161). Each
change is checked with the content's checks and held as a pending edit until "Finish", which writes
the files, raises the content version by one and runs the tests, putting every file back if one
fails. It never commits.
_Avoid_: Mod tool, Admin page, Trait editor (for the whole)

**Edit session**:
The content editor's pending edits of one kind, from the first edit to "Finish": each checked with the
kind's checks as it is made and held between commands, and "Finish", which writes the files, raises a
version, the content's or the config's, by one, runs the tests and puts every file back if one fails.
A "Finish" cut off is put back by the next command. The Traits are edited in one, and the tuning
values in another, the same session over two kinds of file (DL-244).
_Avoid_: Draft, Transaction (for the whole)

**Content kind**:
One kind of content, in its module of `content/src/kinds/`: the file it is written in, the shape of
its rows and how they are read, their defaults, and its rules with their refusals (DL-243). Content is
read kind by kind and then checked kind by kind, every refusal naming its file or table and key; the
page reads with the kinds' readers alone. A Trait's effects are each described once by their fields,
and read, checked and offered in the content editor's forms from that description. The content
editor's Traits edit two content kinds, the Guildmaster's and the Hero's.
_Avoid_: Schema (for one kind)

**Uses register**:
The one list, in code (`content/src/uses/`), of every place a Trait is used: where its key stands in
content, and which rules of the engine and checks of the content read Traits. The content editor
finds a Trait's uses through it; the drift test holds it to the code, and
`docs/agents/traits-register.md` is written from it (DL-150 item 14, DL-161, DL-219).
_Avoid_: Index, Catalogue, Usage map
