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

*Amended 2026-10-05.* The old forms are no longer read (v1.1.6-S6, DL-192): every shipped
Encounter and Synergy was written in Queries by v1.1.4-S10, and an Encounter without `checks`, or a
Synergy whose `requires` is not a list, is refused.

A Hero's form (v1.1.4-S3, DL-154) scales the Stat values a Hero adds into a Check's score, and
nothing that chooses, filters or counts. So a wound or low spirits must never raise a score: a Stat
subtracted would be scaled with the rest, and a hurt Hero would subtract less. Validation carries
the sign each node adds into a Check's score with down to every Stat a Hero adds (a `stat`, or a
pair of a `weighted`), and refuses the score where that sign may be negative, naming the node that
turned it so: a `-` whose right operand reads the Stat (v1.1.4-S3), a `weighted` or `ranked` with a
negative weight, and a `*` beside an operand that is, or may be, negative, such as a count less a
number (v1.1.4-S9 and its verification, DL-162). A Stat negated twice counts for the score again,
and is accepted. A raw Check, read without form, and a Synergy's requirement, read as the Heroes
are, may still do any of these.

Harm reads the Party in the same language (v1.1.4-S4, DL-155). An Injury's or a Death's `among` is
a Set Query, held as a Check's score is, Sex allowed in its filters, since it decides who takes part
in the harm and never a number. It is read of the Party as it stands at that consequence, hurt and
all, and narrowed to the Heroes the harm can fall on; when that leaves no one, any of them may be
hit. The Stats that expose to harm and guard against it are lists of Hero Stat keys beside it, not
Queries.

What a Check reads is shown to the player from the same Queries (v1.1.4-S5, DL-156). The engine
gives a typed account of a Query (`describeQuery`): each node names what it aggregates, the Set it
reads and its filters, the Stats with their weights, and the Skills, Classes, Backgrounds and
Traits by key. It returns no prose (ADR-0003); the CLI and the page word it from content's names.
So a new operator needs its node in the account and its words in both front ends.

A text form, compiled when content is built, is not part of this decision. It is added only if
writing the arrays proves painful (DL-148 item 4).

*Amended 2026-10-05.* The operators are a table (v1.1.6-S10, DL-196): a row for each operator of
each type, holding its signature, the arguments it takes, and its evaluation
(`engine/src/quest-engine/query/operators.ts`), which the evaluator walks; `query.ts` takes the
Party. The checks of a Query's type, keys, size, Sex and signs that content validation runs at load
are the engine's too, `queryProblems` (`query/problems.ts`), which reads the same signatures;
content's checker calls it with where the Query stands (a Check's score, a raw Check's, a Synergy's
requirement, an `among`) and the keys content defines, and holds no table of its own. The page
checks no Query, and its script carries none of the checks. So a new operator is a row, with its
sign beside the checks, its account and its words; a row missing for an operator of content's
types fails to compile.

*Recorded 2026-10-02* in v1.1.4-S1 (DL-151), from DL-148 items 4 to 6 and 20; the refusal of a
subtracted Stat added in v1.1.4-S3 (DL-154), of a negative weight or factor on a Stat in
v1.1.4-S9 (DL-162), harm's `among` in v1.1.4-S4 (DL-155), the account of a Query in v1.1.4-S5
(DL-156), and the operators' table with `queryProblems` in v1.1.6-S10 (DL-196).
