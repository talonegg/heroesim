# Heroesim — the Guild Management Design

The target design of the `v1.2` line: what the game is building toward, by the twelve parts an
independent design brief asked a guild-management game to define before its Quests. The owner's
answers that shape it are DL-256. It is a draft, to be refined as each epic plans its part. The
pillars it serves are [`requirements.md`](./requirements.md) §1. The order the parts are built in is
[`plan.md`](./plan.md) §3, and what is built today is [`requirements.md`](./requirements.md) §2 and §3.
Each part's numbers (rates, sizes, wages) are asked in its epic's inputs table, not here.

## The aim

The player runs an institution, not a Party. Heroes are its people and Quests its fixtures. Over one
Guildmaster's career, the player signs Heroes of uncertain worth, develops them through managed careers,
chooses who goes on Quests that matter, competes with Rival Guilds, and ends with a legacy. A Quest
serves the management and never becomes its master system.

## How it is judged

The owner plays each release's build for a few in-game years at its close
([`agents/delivery.md`](./agents/delivery.md), A release, step 2). The playtest is scored by which of
these nine sentences the player finds themselves saying. Each epic names the sentence it aims at.

1. "I can't send her; she's exhausted."
2. "He needs another year of development."
3. "I need to give him a chance."
4. "Those two shouldn't be in the same Party."
5. "If I don't renew her Contract, someone else will take her."
6. "She's becoming a star."
7. "I don't want him to retire."
8. "We need to find his replacement."
9. "She's the future Captain."

## The twelve parts

1. **The calendar.** Three Turns a Day, the rhythm unchanged (principle 10). Quests are fewer, longer
   and weightier, so each one matters (DL-257).
   - A Quest template offers Tiers. A higher Tier is longer, harder and richer in Wealth, XP and
     Loot, and has more Beats: lines of its story, each with an Encounter drawn from a pool. The
     Tiers' figures are a ladder in config that a template may override.
   - The shared Board offers the Tiers that fit the world's mean Level, and a Tier may ask a Guild for
     a minimum of Fame. The Board may grow over the Years, up to a cap.
   - In time, the Quests a Guild is offered grow with its Fame and its Patrons' Regard (part 7).
2. **The Hero's career.**
   - A Hero ages, Declines, retires or dies, as today.
   - Death is rare and falls on the hardest Tiers, and the Board marks a Quest that can kill Deadly.
     One setting, the Death factor, and each Tier's Death scale multiply every Death chance in
     content, so the rate is tuned without code (DL-257).
   - A Career stage is worked out from age, Level and record: Prospect, Regular, Veteran, Champion
     or Retired. It is shown on the tile and the Hero's page. Ambitions and the Legacy review read
     it, and no other rule does.
   - Fatigue is a State. It rises each Day on a Quest, faster on harder ones, and falls at home,
     faster with better quarters. A tired Hero performs worse and is injured more often. It shows
     on the Roster and in the Party builder.
   - Each Hero has one Ambition, drawn from a simple list in content that later expansions enrich:
     the captaincy, Fame, Wealth, mastering a Skill, teaching, or retiring early. Whether it is met
     moves their Morale, which shapes their Contract demands, their renewals and whether they listen
     to a Rival. A Hero never refuses to be sent.
3. **The recruitment pipeline.** A deeper Unattached pool: Heroes of every age and Level, an older one
   better now and with less room to grow. Fame decides who will sign.
4. **Development.**
   - Each Hero has a Training focus, an area or a Skill, that steers their growth, and Skills grow.
     A Hero at home trains safely, and a Hero on a Quest grows faster, at risk.
   - Decline lowers Potential, so a lost point does not grow back (DL-83).
   - Later, a Mentor: a veteran paired with a junior, whose growth leans toward the Mentor's
     strengths, and a Trait, good or bad, may pass on. A Mentor at home is a Hero not on a Quest.
5. **Selection.**
   - Every Party is two Heroes or more, a template asking for more where its work needs it. No
     template has a maximum and nothing caps the Parties out (DL-257).
   - XP is divided by the Party sent, so each Hero beyond the work's need costs the others (DL-182).
   - Later, a Party smaller than its template's floor may go, at a greater difficulty or cost.
   - One Captain for each Guild, named by the player. The Party the Captain goes with gains Morale
     and effectiveness, and the Roster gains a little Morale while the Captain is at home.
   - Regard moves both ways. Failures and Deaths sour a Party, Heroes competing for a place or the
     captaincy grow cool, and Mentors and successes build bonds. Named bands, friends and rivals,
     show in the Party builder.
6. **Contracts.**
   - Every Hero in every Guild has a Contract: a wage and a length.
   - At its end, the Hero renews at a new wage, shaped by their Level, Morale and Fame, or leaves for
     the Unattached pool, where any Guild may sign them.
   - The player may release a Hero, with a payout.
   - Then poaching: a Rival may approach a Hero during their Contract. A Hero whose Morale is low or
     whose Ambition is unmet may ask to go. The player raises the wage, sells, or refuses at a cost to
     the Hero's Morale.
7. **Reputation.**
   - Fame stays one total figure. It orders the Rankings, gates who will sign and, later, sets how
     many Private offers come.
   - A Guild's Reputation in each Sphere is worked out from the Regard that Sphere's Patrons hold for
     it. It is worked out, not stored, and the page names a Guild by its strongest Sphere.
   - Private offers: a Patron at warm Regard or better sends a Guild Quests of its own, beside the
     shared Board, and more as the Guild's Fame rises.
   - Fame raises the stakes: a famous Guild's failures cost more Fame and Regard, its Heroes ask
     higher wages, and harder Quests come to it.
8. **The Guild's growth.** The Hall's three facilities as today. Later, Workers in posts, and the
   Hall's grades 4 to 6 as late-game Wealth sinks (DL-83).
9. **The Rivals.** They compete. They weigh reward, Fame and Patron when they choose a Quest,
   recruit the best Hero they can afford, and dispatch whenever they can staff a Party, and the first
   pick of the Board is shared. Every rule here binds every Guild alike (ADR-0002).
10. **Retirement and the ending.**
    - The game ends at the Guildmaster's Retirement, as R34 says. There is no dynasty.
    - The ending is a Legacy review: the Guild's record, its greatest Heroes by career statistics, its
      Milestones, and a title earned. Then an Aim the player chooses at setup, judged
      at the review.
    - The Guild's culture is named from its record (its strongest Spheres, its Roster's age and
      turnover, the risk it took) and no rule reads it. Rules that read it are a later step.
    - Later, a retiring Hero may stay on as a Worker, in a post: trainer, physician, scout or Mentor.
11. **Information and scouting.**
    - An Unattached Hero's Stats show as ranges until scouted, which changes R29. Scouting is an
      Outing, which brings R4's limit of one Outing a Turn. The Guildmaster's Judgement sets how
      sharp the hints are (DL-85 item 11).
    - The page keeps the 20 Stats and layers them:
      - **Tiles:** a Captain icon, and indicators of Morale and Fatigue. A summary figure for
        each Stat area, and the wage, are to be designed later, the figure named then.
      - **Table:** the Captain icon, and filterable columns for Morale, Fatigue, Ambition and
        Contract.
      - **Phone:** the Captain icon beside the name. Morale, Fatigue, Ambition and Contract form a
        category of their own, chosen and opened as the Stat areas are.
12. **The player's decisions.** At each stop, the player decides:
    - whom to send, with whom, and whether the Captain goes;
    - whom to rest, and what each Hero trains;
    - whom to renew, release, scout and sign;
    - how to answer a Rival's approach.

    Between stops, the systems above make the stories.

## Words this line adds

Each word enters [`CONTEXT.md`](../CONTEXT.md) in the epic that builds it, before its code. Seven
clash with today's glossary, which is changed first (principle 13):

| Word | What it is to mean | The clash |
| --- | --- | --- |
| Contract | A Hero's wage and length with their Guild | Avoided for Quest: becomes "Contract (a Hero's is another thing)" |
| Reputation | The Regard a Sphere's Patrons hold for a Guild, combined into one figure | Avoided for Regard: becomes "Reputation (a Guild's in a Sphere is another thing)" |
| Career stage | Prospect, Regular, Veteran, Champion or Retired | "Career" is avoided for Calling |
| Worker | The glossary's word for what the owner calls staff | "Staff" is avoided for Worker, so Worker stays |
| Tier | One rung of the ladder a Quest template offers, each longer, richer and with more Beats | Avoided for Level, Morale band, Regard band, Degree and Quest band: the first four become "Tier (a Quest's is another thing)", Quest band's "Tier (the one a Quest is posted at is another thing)" |
| Beat | A line of a Quest template's narrative, with the pool its Encounter is drawn from | Avoided for Encounter: Encounter drops it |
| Rivals, a Regard band | Two Heroes who regard each other badly, beside friends | Rival names a Rival Guild: the band takes another word, or becomes "Rival (a Hero's is another thing)" |

The other words this line adds raise no clash: Captain, Fatigue, Ambition, Training focus, Mentor,
Private offer, Deadly, Death factor, Legacy review and Aim.
