# Checks and Synergy requirements are Queries over the Party, written in content

A Check's score and a Synergy's requirements are Queries: JSON arrays, operator first, of five
types (a Set of the Party's Heroes, one Hero, a value of a Hero, a fact of a Hero, a number of the
Party), written in content and evaluated by the engine (`engine/src/quest-engine/query.ts`). The
engine evaluates them and nothing else: it holds no list of which Stats a Check reads, nor of
which Classes a Synergy wants. This extends ADR-0006. There, a new Stat, Class or Synergy was a
content change; here, a new way to read the Party is a content change too, unless it needs a new
operator. We chose this because the analysis behind DL-148 found that a weighted sum of the
Party's best or summed Stats lets the number of Heroes sent decide most Checks and any Stat stand
in for any other, and the owner asked that a Check say who it reads, "SQL like": the strongest
Warrior's Strength, the total Intelligence of the Mages and Healers, the Wits of the least agile
Hero.

## Consequences

The evaluator is pure and draws nothing, so a Query never moves a random draw. It reads each
Hero's effective Stats once an Encounter, through the one selector, and breaks every tie and runs
every sum in Party order, so the same Party reads the same to the last bit. An empty Set gives 0,
and a key content no longer defines reads 0 or matches no one (data-model rule 5).

A Query reads only the Party's own Heroes and their state on the Quest. It never reads the
Guildmaster or the Guild's dealings (M4's third risk), nor Regard between particular Heroes; a
test reads `check.ts` and `query.ts` to hold it so. Sex decides who takes part in a Check and never
a value. Validation lets it stand only in a filter of a Check's score, and never in a Synergy's
requirement, which is a gate. It refuses a Set filtered by Sex that is counted, by `count` or by a
value that reads nothing of a Hero: a number, a read multiplied by a literal 0, or a `weighted` of
no weight.

Type safety over Queries comes from content validation at load, as it does over Stat keys: every
node's type and arguments, every key, and a size of at most 64 nodes and 12 deep. Each refusal
names the Query's path. The old forms, an Encounter's weighted demands and a Synergy's counts of
Classes and Skills, load into Queries that read exactly as they did, so content written before
this decision plays the same.

A Hero's form (v1.1.4-S3, DL-154) scales the Stat values a Hero adds into a Check's score, and
nothing that chooses, filters or counts. So a wound or low spirits must never raise a score: a Stat
subtracted would be scaled with the rest, and a hurt Hero would subtract less. Validation refuses,
in a Check's score, any `-` whose right operand reads a Stat a Hero adds: a `stat`, a `weighted`, or
a Num of such a Val, at any depth. A raw Check, read without form, and a Synergy's requirement, read
as the Heroes are, may still subtract one.

Harm reads the Party in the same language (v1.1.4-S4, DL-155). An Injury's or a Death's `among` is
a Set Query, held as a Check's score is, Sex allowed in its filters, since it decides who takes part
in the harm and never a number. It is read of the Party as it stands at that consequence, hurt and
all, and narrowed to the Heroes the harm can fall on; when that leaves no one, any of them may be
hit. The Stats that expose to harm and guard against it are lists of Hero Stat keys beside it, not
Queries.

A text form, compiled when content is built, is not part of this decision. It is added only if
writing the arrays proves painful (DL-148 item 4).

*Recorded 2026-10-02* in v1.1.4-S1 (DL-151), from DL-148 items 4 to 6 and 20; the refusal of a
subtracted Stat added in v1.1.4-S3 (DL-154), and harm's `among` in v1.1.4-S4 (DL-155).
