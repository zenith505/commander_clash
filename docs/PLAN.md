# Commander Clash: architecture and plan

## Data we have (from Scryfall bulk export, Oct 2026)

| File | Size | What it is |
|---|---|---|
| `all-cards-20261007211808.jsonl` | 2.9 GB | Every printing of every card in every language. One JSON card object per line. |
| `unique-artwork-20261007210232.jsonl` | 300 MB | One printing per unique illustration: 54,726 lines, 99% English, 37,606 oracle cards. |
| `rulings-20261007210031.jsonl` | 26 MB | 79,706 rulings for 20,080 cards. `{oracle_id, source, published_at, comment}`. |
| `MagicCompRules 20260925.pdf` | 2.5 MB | Comprehensive Rules, effective Sept 25 2026. 312 pages, ~3,000 numbered rules. Commander is rule 903. |

**How they link:** `oracle_id` is the key. Every printing of a card shares one
oracle_id; rulings attach to oracle_id. Artwork isn't stored locally: each card object
has `image_uris` (or `card_faces[].image_uris` for double-faced cards) pointing at
Scryfall's image CDN in sizes from `small` to `png`, plus `art_crop`.

For English play, unique-artwork already contains every card's oracle text, so the
build script uses it by default. all-cards only adds other languages and extra
printings; the script can stream it when we want printing choice.

After filtering out tokens, art cards, planes, schemes and vanguards we get **33,076
English playable cards**.

## Platform

TypeScript, split in two:

- **Engine** (`packages/engine`): a pure function `applyAction(state, action) -> state`.
  State is plain JSON, so games are serializable, replayable from a seed and action
  list, easy to test, and ready to run on a server for online play later. Bots and the
  UI use the same `legalActions` / `planCast` helpers.
- **Client** (`apps/web`): React + Vite. Runs in any browser; can be wrapped as a
  desktop app (Tauri/Electron) later without changing the engine.

Performance today: ~1 ms per engine action including a full state copy, which is plenty
for play. When we add search-based AI we'll switch to structural sharing.

## What works now

- 4 players, 40 life, command zone, commander tax, commander damage (21), commander
  returning to the command zone, deck validation (100 cards, singleton, color identity).
- Full turn structure with priority passing (all players must pass in succession), the
  stack, sorcery vs instant timing, land drops, mana abilities, auto mana payment.
- Combat: attacking any opponent, blocking, flying/reach, first strike, double strike,
  trample, deathtouch, lifelink, menace, vigilance, haste, defender, indestructible.
- State-based actions: life, empty library, lethal damage, legend rule, commander damage.
- Players leaving the game (their stuff leaves with them), last player standing wins.
- Bots that play lands, cast spells, attack and block.
- Browser UI: lobby, 4-seat table, hand, card preview, log, attack/block selection.

### Table UI (added 2026-10-08)

- **Stack overlay** (`StackOverlay` in `apps/web/src/App.tsx`): while anything is on the
  stack, the cards themselves cover the preview and log, top item first and largest.
  "Show log" tucks it into a tab; it reopens when something new goes on the stack. Bots
  pass more slowly while the stack has something on it so you can read it.
- **Priority mode** (`PriorityMode` in `useGame.ts`, saved in the browser): *Hold* (the
  default) stops whenever a response could matter (something on the stack, combat that
  involves you, an opponent's end step) and you have mana up, even with nothing to cast,
  so your pace doesn't give away your hand. It doesn't stop right after your own spell.
  *Auto-pass* only stops when you have an instant-speed play. Space passes, Esc cancels.
- **Commander damage** shows in a hover card on each player's name.
- **On-card state** (`modifications()` in `cards.ts`): +1/+1 / -1/-1 counters as a solid
  chip, until-end-of-turn P/T as a dashed chip, granted keywords as gold labels across the
  card, and the current P/T with power and toughness colored green (higher than printed)
  or red (lower).
- **Targeting arrows** (`Arrows.tsx`): arched arrows in each player's color. Yours follow
  the mouse while you choose and snap onto legal targets; a bot's appear dashed for a
  moment before it commits; every stack item's arrows stay until it resolves.

### Card effects (added 2026-10-08)

Card text is compiled into a small effect language (`packages/engine/src/oracle.ts` ->
`abilities.ts`) and executed by `effects.ts`:

- **Effects:** damage, draw, gain/lose life, destroy, exile, return to hand, tap/untap,
  +1/+1 and -1/-1 counters, +N/+N and keywords until end of turn, creature tokens, mill,
  counter target spell. Works on "target ...", "each opponent", "creatures you control",
  "it", "its controller", and "this creature".
- **Targeting** (CR 115, 601.2c, 608.2b): type, color, controller and tapped restrictions,
  hexproof; targets are re-checked on resolution and a spell with no legal targets left
  does nothing.
- **Triggered abilities** (CR 603): enters, dies, attacks, deals combat damage to a player,
  another creature you control enters, your upkeep, your end step. They wait in a queue
  and go on the stack in APNAP order before anyone gets priority; targets are chosen then.
- **Activated abilities** (CR 602): mana, {T} and "Sacrifice this" costs, sorcery-speed
  restriction, summoning sickness for {T}.
- **Statics:** enters tapped, can't block, can't be blocked, Flash, Hexproof.

**2,657 of 33,076 cards** are now fully supported (was 941): every line of their text is
compiled. The compiler reports each line it can't handle, which drives what to add next.
The five sample decks include instants and sorceries.

### Layers and continuous effects (added 2026-10-09)

Every characteristic the game reads (types, colors, keywords, power/toughness, controller)
now comes from `characteristics(state, object)` in `packages/engine/src/layers.ts`, which
applies all continuous effects in layer order (CR 613):

| Layer | What | Examples now working |
|---|---|---|
| 2 | control | Mind Control, Act of Treason, Steal Artifact |
| 4 | type and subtype | "becomes a 0/1 Frog", "is still a land", Changeling |
| 5 | color | "becomes white until end of turn" |
| 6 | add/remove abilities | lords granting flying, "loses all abilities" |
| 7b | set P/T | "becomes a 1/1" |
| 7c | modify P/T, then counters | anthems, Equipment, pump spells, +1/+1 / -1/-1 counters |
| 7d | switch P/T | "switch its power and toughness" |

Then rule flags (can't attack, can't block, can't be blocked, doesn't untap).

- **Two kinds of effect.** Effects from resolved spells and abilities lock the set of
  objects they affect when they resolve (CR 611.2c): a "creatures you control get +1/+1
  until end of turn" doesn't pump a creature that enters later. Static abilities
  (anthems, lords, Auras, Equipment) are re-evaluated continuously (CR 611.3a) and stop
  the moment their source leaves or loses its abilities.
- **Order within a layer** is timestamp order (CR 613.7) with dependencies (CR 613.8):
  an effect that would change what another effect applies to, or whether it exists,
  goes first; a dependency loop falls back to timestamps. Timestamps are refreshed when
  an object changes zones or becomes attached (CR 613.7d-e).
- **Locking across layers** (CR 613.6): once an effect starts applying in an earlier
  layer, it keeps applying to the same objects in later layers, even if those objects
  no longer match its text.
- **Control** (layer 2): a creature that changes control has summoning sickness for its
  new controller (CR 302.6) and is removed from combat (CR 506.4). Control effects end
  when their controller leaves the game (CR 800.4a).
- **Auras** target what they'll enchant as they're cast, enter attached (CR 303.4f), and
  go to the graveyard when the thing they enchant is gone or no longer legal (CR 704.5m).
  **Equipment** has Equip (sorcery speed, creature you control) and falls off anything
  that stops being a creature (CR 704.5n).
- **Evasion** checks are in one place (`blockProblem` in `game.ts`): flying/reach, fear,
  intimidate, shadow, landwalk, can't block, can't be blocked, plus menace.
- Also new: "can't be countered", "enters with N +1/+1 counters", activated costs like
  `{1}{R}` (a parser bug had been rejecting these), and the full creature-type list from
  CR 205.3m so the compiler can't mistake "Enchanted" for a creature type.
- **Not yet:** layer 1 (copy effects), layer 3 (text-changing), layer 7a
  (characteristic-defining P/T like `*/*`). Cards that need them stay unsupported.

The table shows the results: Auras and Equipment peek out above the permanent they're
attached to, a stolen permanent carries its owner's name, lost keywords are struck
through, and static P/T bonuses get a solid blue chip (temporary ones stay dashed).
Crowded battlefields shrink their cards to fit (down to 55%) before scrolling.

Rules tests: `packages/engine/test/layers.test.ts` works through the Comprehensive Rules'
own examples (CR 613.4d, 613.5, 613.6, 613.9 and others), and a consistency test plays bot
games with and without the characteristics cache and checks the logs match.

**3,535 cards are fully supported** (`npm run coverage` prints the count and the most
common lines still missing).

### Modal spells and target filters (added 2026-10-09)

- **Modes (CR 700.2)** (`packages/engine/src/modes.ts`): "Choose one", "Choose two",
  "Choose three", "Choose one or both", "Choose one or more" and "choose up to one", on
  spells, triggered abilities and activated abilities. Modes are chosen as the spell is
  cast (601.2b) or the trigger is put on the stack (603.3c), before targets. A mode whose
  targets can't be chosen can't be picked (700.2a), and only the chosen modes' targets are
  chosen (700.2c). The chosen modes then resolve in printed order as one spell, so a
  -1/-1 and a +1/+1 counter on the same 1/1 never see it as 0/0, and if every target is
  gone none of the modes happen, untargeted ones included (608.2b). A trigger with no
  choosable mode is removed; with only one possible choice it's made for you.
- **Mode picker** on the table: one click for "choose one", toggles plus Done otherwise;
  modes with no legal targets are greyed out. The chosen modes show on the stack.
- **Target filters**: with/without a keyword ("creature with flying"), power, toughness
  or mana value bounds, colors ("blue permanent"), supertypes ("nonbasic land",
  "legendary creature"), and attacking/blocking. They read current characteristics, so a
  creature that loses flying in response stops being a legal target.
- **Fixes:** split, adventure and double-faced cards were counted as supported with
  both halves' mana costs run together; they're unsupported until faces are modeled
  (CR 709-712). Automatic mana payment used a land's original controller, so a bot could
  try to tap a land stolen from it. Planning a cast now checks the chosen targets.

**3,722 cards are fully supported.** Of 607 modal cards, most of the unsupported ones fail
on a single mode: graveyard targets ("return target creature card from your graveyard"),
discard, fight, Treasure/Food tokens, scry, proliferate, "counter unless its controller pays".

### Choices during resolution, graveyards and tokens (added 2026-10-09)

- **Pausing a resolution.** A spell or ability can stop partway through to wait for a
  player (`s.resolving` in the engine). No one gets priority and state-based actions aren't
  checked until it finishes (CR 608.2, 704.3). Once it finishes, an instant or sorcery
  goes to the graveyard (608.2n).
- **Discard** (CR 701.9) works three ways. "Target player discards two cards": that
  player chooses. "Each opponent discards a card": each chooses in turn order, then all
  the cards are discarded at once (CR 101.4). "At random" is also supported. A hand with
  no more cards than the number discards whole, without asking.
- **Scry and surveil** (CR 701.22, 701.25) open a screen with two rows: the top of your
  library, in order, and the bottom (scry) or graveyard (surveil). Click a card to move it
  between rows. The log doesn't name the cards you scry, since they stay hidden.
- **Fight and "deals damage equal to its power to"** (CR 701.14). If either creature is
  gone, not a creature, or no longer a legal target, there's no damage at all. Each
  creature's own deathtouch and lifelink apply.
- **Targets in graveyards** (CR 109.2a, 115.2): "target creature card from your
  graveyard", "card from a graveyard", "from an opponent's graveyard", with the same type,
  color and mana value filters. Supported effects:
  - return it to its owner's hand;
  - return or put it onto the battlefield (tapped too);
  - exile it;
  - put it on top of or on the bottom of its owner's library;
  - "exile target player's graveyard", and each opponent's or all graveyards.

  A reanimated card enters under the control of the spell's controller (CR 110.2a) and
  still belongs to its owner. Reanimating anything that could be an Aura (enchantment or
  permanent cards) stays unsupported, because the player would have to choose what it
  enchants (CR 303.4f). A card that leaves the graveyard before the spell resolves is a
  new object, so the spell can't find it (CR 400.7). Choosing a graveyard target opens a
  picker that shows only the legal cards, grouped by graveyard.
- **"You may"** used to be dropped by the compiler, so "you may destroy target
  creature" always destroyed. Now the controller is asked Yes or No as it resolves
  (CR 608.2d). Its targets are still chosen when it goes on the stack (CR 603.3d). Bots
  say no when the effect would now hurt them, for example when their own creature was the
  only legal target.
- **Treasure, Food and Clue** (CR 111.10), plus investigate (CR 701.16):
  - **Treasure**: "{T}, Sacrifice ~: Add one mana of any color" is a mana ability with a
    sacrifice cost (CR 605.1a), so Lotus Petal-style cards work too. When a permanent can
    make the same color without being sacrificed, that ability is used. Automatic payment
    uses Treasures last.
  - **Clicking a permanent** with a choice of colors or a sacrifice cost now opens a small
    menu. Before, it tapped for the first color.
  - **Bots** cash in Food and Clues when they have mana to spare. They won't sacrifice a
    Treasure just to pay for one.
- **"Its controller" of a countered spell** uses who controlled the spell as the
  counterspell started resolving (last known information, CR 608.2h). Before, cards like
  Psychic Strike countered the spell but nobody milled.
- **Testing aid:** open the game with `?hand=Card A|Card B` to swap those cards from your
  library into your opening hand.
- Sample decks now include a few cards that use these mechanics.

**4,344 cards are fully supported.** Rules tests: `test/actions.test.ts` and
`test/graveyard.test.ts`.

### Table UI, round 3 (added 2026-10-09)

- **Combat by arrows.** Click an attacker, then the player it attacks; click a blocker,
  then the attacker. Arrows follow the mouse and snap only onto legal choices
  (`blockProblem` in the engine).
- **Hover preview** appears next to the mouse, for cards anywhere: battlefield, hand,
  stack, zones.
- **Auto-pass** always passes, except at stops you set by clicking steps on the phase
  track (saved in the browser). Your own main phases and your decisions always stop.
- **Floating hand**: a fanned hand at the bottom right that can be tucked away with the
  arrow (remembered). Your battlefield keeps room so the hand doesn't cover your lands.
- **Play log** says what was activated, with which cost, and at what.
- Abilities that are legal but do nothing right now (Staff of Domination's untap while
  it's untapped, CR 602.2) are marked "does nothing now", and bots skip them.

### Cycling, crew, convoke, ward, cast triggers (added 2026-10-09)

- **Cycling** (CR 702.29a): "[Cost], Discard this card: Draw a card", only from its
  owner's hand, at instant speed. Discarding is part of the cost, so the card is in the
  graveyard while the draw is on the stack. Clicking a card with cycling opens a menu: cast
  it (or play it) or cycle it. Bots cycle lands they don't need and spells they're far
  from casting. Typecycling (search the library) isn't supported.
- **Crew N** (CR 702.122a): tap any number of *other* untapped creatures you control with
  total power N or more. Summoning-sick creatures can crew (it isn't a {T} cost), a
  Vehicle can't crew itself, and a crewed Vehicle can crew another. The Vehicle becomes an
  artifact creature until end of turn and stays a Vehicle (CR 205.1b); it has its printed
  P/T only while it's a creature (CR 301.7). Choosing Crew opens a picker that suggests the
  cheapest crew (creatures that couldn't attack anyway first), with arrows into the
  Vehicle. Bots crew before combat when it gives up less attacking power than it adds.
- **Convoke** (CR 702.51): each creature you tap pays {1} or one mana of its color,
  including commander tax (702.51b); it can't pay {C}. Summoning-sick creatures can
  convoke. Matching creatures to colored symbols is a maximum matching, so a two-color
  creature doesn't take a symbol only another could pay. Casting a convoke spell asks
  which creatures to tap, suggesting some only when your mana can't pay; bots convoke
  when their lands fall short.
- **Ward {cost}** (CR 702.21a): when a spell or ability an opponent controls targets the
  permanent, ward triggers (once, however many of its targets name it). As it resolves the
  other player may tap mana (CR 605.3a) and pays, or the spell or ability is countered.
  A spell that can't be countered isn't. You get Pay / Don't pay buttons; bots pay when
  they can, and avoid aiming at warded permanents they couldn't pay for. Only mana costs
  (not "Ward—Pay 3 life").
- **"Whenever you cast" triggers** (CR 601.2i), prowess (702.108, each instance
  separately), "whenever an opponent casts", "whenever a player casts", with spell filters
  ("noncreature", "instant or sorcery", "white", "artifact"...). They go on the stack above
  the spell and resolve first. Ability words ("Magecraft —") are ignored (CR 207.2c);
  "cast or copy" counts as cast, since nothing copies spells yet.
- **Type-changing fix (CR 205.1).** "Becomes a 2/2 artifact creature" used to replace
  all the card's types; now it keeps them (205.1b). "A Golem artifact creature" keeps them
  too, except its creature types. Setting subtypes replaces only subtypes of the same
  kind, so "becomes a Frog" leaves an Equipment an Equipment and a Forest a Forest, and
  setting card types drops only the subtypes of card types the object lost (205.1a).
- Sample decks include a card for each of these mechanics (Vehicles are otherwise left
  out, since they need crew).

**4,717 cards are fully supported.** Rules tests: `test/mechanics.test.ts`.

### UI polish (added 2026-10-09)

- Cards in the graveyard picker, the zone viewer and the scry/surveil screen are larger,
  and the box around them leaves room for the highlight ring and the lift, which used to
  be cut off at the edges. Pickers with several rows scroll as a whole.
- The battlefield has the same room, so rings on cards at its edges aren't clipped.

### Mulligans and Ken's round 4 notes (added 2026-10-09)

- **Mulligans** (London, CR 103.5, with the multiplayer free first mulligan, CR 103.5c).
  The starting player declares first, then the others in turn order; everyone who chose
  to mulligan shuffles and draws 7 at the same time; this repeats until everyone keeps.
  Keeping after N mulligans puts N - 1 cards on the bottom (you pick them; the first pick
  goes lowest). No more mulligans once the kept hand would be zero cards. The bottoming is
  done when you keep, which is the same as doing it after each mulligan since the next
  mulligan would shuffle those cards back anyway. A player who concedes mid-mulligan drops
  out (the next player starts if it was the starting player). Bots keep 2 to 5 lands, or
  anything after two mulligans, and bottom spare lands or their most expensive spells.
  `createGame(..., { mulligans: true })`; the web game and the simulator use it.
- **Combat ends on time** (CR 511.3): creatures leave combat as the end of combat step
  ends, not at cleanup, so attack arrows are gone in main phase 2 (and "attacking" checks
  are false there).
- Arrows aimed at a player land on the player's name, which never moves (the turn dot is
  always laid out, just hidden off-turn), instead of the life total.
- Arrows draw above every window (graveyard picker, popups); an arrow to a card in an open
  picker points at it there and snaps to it while aiming.
- A phase-track stop on opponents' turns is used once: it clears after you pass priority
  in that step.
- The center bar is gone: turn, phase track, prompts, buttons and the priority toggle sit
  in a pane under the log (the stack overlay never covers it), so the seats get the height.
- Only the top of the stack draws its target arrows; the rest show theirs once on top.

### Protection, poison, exalted, landfall, regeneration (added 2026-10-09)

- **Damage in one place** (`src/damage.ts`, CR 120): combat, spells, abilities and fight
  all deal damage through `dealDamage`, so every rule below applies to every source.
- **Protection from a color** (CR 702.16, DEBT): can't be the target of spells of that
  color or abilities from sources of that color, damage from such sources is prevented,
  creatures of that color can't block it, and Auras/Equipment of that color fall off
  (704.5m/704.5n). "Protection from white and from red" is two abilities (702.16g). The
  card data only says "Protection", so the color comes from the rules text. Protection
  from creatures, everything, or card types isn't supported.
- **Shroud** (CR 702.18): can't be the target of anything.
- **Infect** (CR 702.90): damage to players is poison counters, to creatures -1/-1
  counters; lifelink still works. **Wither** (702.80): -1/-1 counters on creatures.
  **Toxic N** (702.164): combat damage to a player also gives N poison counters.
  Ten or more poison counters loses the game (CR 704.5c); the seat shows ☠ N.
- **Exalted** (CR 702.83): each instance triggers when a creature you control attacks
  alone (CR 506.5), +1/+1 until end of turn on that creature.
- **Landfall** ("Whenever a land you control enters"); a land with it sees itself enter
  (CR 603.6a). Ability triggers can refer to "it" (the creature that triggered them).
- **"Attacks each combat if able"** (CR 508.1d): you can't confirm attackers until it
  attacks (not if it's tapped or summoning sick, CR 508.1c). **"Can block only creatures
  with flying"** (509.1b).
- **Regeneration** (CR 701.19): "Regenerate ~" makes a shield that replaces the next
  destruction this turn (lethal damage, deathtouch, destroy effects): it stays, tapped,
  with its damage removed, and leaves combat. "It can't be regenerated" skips the shield.
  0 toughness isn't destruction, so regeneration doesn't help (704.5f). Shields end at
  cleanup (514.2). Bots regenerate a creature that a spell or ability is aimed at, or that
  would lose its fight once blocks are declared (one shield at a time); you can regenerate
  whenever you like, since a shield made early still works later in the turn.
- Sample decks include a card for each of these.

**5,189 cards are fully supported.** Rules tests: `test/combat-keywords.test.ts`.

### Blocking, lands, persist, prevention, life gain (added 2026-10-09)

- **Auto-pass fix:** on your own turn, once blockers are declared, auto-pass stops before
  damage if you have an instant or ability you could use (the active player gets priority
  first, CR 117.3a). With nothing to play it still passes.
- **Blocking triggers** (CR 509.3), once every defending player has declared: "whenever ~
  blocks", "becomes blocked", "blocks or becomes blocked" (once per combat), and "blocks a
  creature" / "becomes blocked by a creature" (once per creature, which "that creature" means;
  filters like "a creature with flying" work). **Bushido N** (702.45), **flanking** (702.25,
  blockers without flanking get -1/-1 and can die before damage), **rampage N** (702.23, blockers
  beyond the first counted as it resolves), "+1/+1 for each creature blocking it".
- **Evasion:** horsemanship (702.31); "can't be blocked by creatures with power 2 or less", "by
  Walls", "by blue creatures", "by artifact creatures"; "can't be blocked by more than one
  creature" (all CR 509.1b).
- **Lands that enter tapped unless ...** (CR 614.1d): two or fewer / two or more other lands,
  two or more basic lands, a Plains or an Island (check lands), a planeswalker, two or more
  opponents, a player at 13 or less life, opponents with eight or more lands. It doesn't count
  itself. **Shock lands** ("you may pay 2 life") and **reveal lands** ("you may reveal a Dragon
  card") ask you when you play them (CR 614.12); bots reveal when they can and pay life at 16 or
  more. A land put onto the battlefield by an effect doesn't pay or reveal.
- **Persist, undying** (702.79, 702.93): back with a -1/-1 (+1/+1) counter if it had none, read
  from last known information; a token doesn't come back. **Soulshift N** (702.46).
- **Damage prevention** (CR 615): "prevent the next N damage that would be dealt to any target
  this turn" shields (on creatures and players, shown as chips), and Fog. Protection is applied
  before shields, so it doesn't use them up. Shields end at cleanup.
- **"Whenever you gain life"** (CR 119.10): one trigger per life-gain event. A lifelink
  creature dealing combat damage to several things is one event; two lifelink creatures are two.
  All life gain now goes through one function.
- **Activated abilities:** "Activate only once each turn" (602.5b), "Pay N life" costs (119.4).
- **Threshold**: statics that apply while seven or more cards are in your graveyard.
- "Destroy target Wall", "target Elf": target phrases can name creature and basic land types.
- "This Aura" now reads as the card itself ("When this Aura enters, draw a card"), and in
  triggers about the permanent itself, "it" means that permanent ("put a +1/+1 counter on it",
  "untap it"), except in "dies" triggers.

**5,810 cards are fully supported.** Rules tests: `test/blocks-lands-prevention.test.ts`.

### Mana abilities, explore, cascade and more (added 2026-10-09)

- **Mana abilities** (CR 605) are compiled like other abilities now, not matched by a few fixed
  patterns: costs of {T}, mana ("{1}, {T}: Add {W}{U}", Signets), "Sacrifice ~", "Pay 1 life";
  more than one mana ("{T}: Add {C}{C}"); a choice ("{W} or {U}", "two mana of any one color");
  "for each creature you control" (Gaea's Cradle, Cabal Coffers); your commander's color identity
  (Arcane Signet, CR 903.4f); painlands' "deals 1 damage to you"; "doesn't untap during your next
  untap step"; "Activate only once each turn". Auto-pay plans with them: free sources first, then
  abilities that cost mana when they make more mana or a missing color, paying for them with
  sources whose colors aren't needed. Clicking a permanent with several options opens a menu
  listing each ability and what it adds. Tokens can have quoted abilities ('It has "Sacrifice
  this creature: Add {C}."', Eldrazi Spawn and Scions).
- **Explore** (701.44): a land goes to your hand; otherwise a +1/+1 counter, then you choose
  whether the card goes to your graveyard. With an empty library it just gets the counter, and if
  it left the battlefield you still reveal (rulings).
- **Renown N** (702.112, checked as it triggers and resolves), **bloodthirst N** (702.54),
  **fabricate N** (702.123, counters or Servos; Servos if it's gone), **modular N** (702.43,
  counts the +1/+1 counters it had as it died), **evolve** (702.100, compared again on resolution,
  with the new creature's last known P/T if it's gone), **battle cry** (702.91).
- **+1/+1 and -1/-1 counters cancel** as a state-based action (704.5q), after the same pass's
  deaths, so persist and modular still see both.
- **Cascade** (702.85): exiles until a nonland card with lower mana value, then asks whether to
  cast it without paying its mana cost (modes and targets as usual, from exile, during the
  resolution); the rest go to the bottom in a random order. Bots cast it when they like the targets.
- **Affinity for artifacts** (702.41) and the like reduce generic mana only (total cost, CR 601.2f);
  **improvise** (702.126) taps artifacts for generic mana when mana alone can't pay.
- New triggers: "when ~ becomes the target of a spell or ability", "at the beginning of the end
  step" (every turn's), "when ~ is put into a graveyard from the battlefield" (any permanent). In
  triggers after it left the battlefield, "it" and its name mean the card where it went ("return it
  to its owner's hand"). "Sacrifice ~" as an effect.
- **Fixed:** "target artifact creature" (and any two card types together) matched an artifact *or*
  a creature; it now needs both.

**6,244 cards are fully supported.** Rules tests: `test/mana-counters-cascade.test.ts`.

### X costs, counted amounts and last known information (added 2026-10-09)

- **X** (CR 107.3): announced while casting or activating, after modes and before targets
  (601.2b-c, 602.2b), paid as generic mana ({X}{X} pays it twice), and remembered by the spell
  on the stack (shown as "X = n"). A permanent's enters abilities and "enters with X counters"
  use the spell's X (107.3m). Cast without paying its mana cost, X can only be 0 (107.3b).
  Cost reductions come off the total, X included (601.2f). The game screen asks for X with a
  picker that starts at the most your mana can pay; bots pick a big X and never cast for X=0.
  Text that uses X without a way to choose it (no {X} cost and no "where X is") isn't trusted.
- **Counted amounts**: "for each creature you control", "equal to the number of cards in your
  hand", "where X is ...", "twice", "plus/minus N", devotion (700.5), domain, power, toughness
  and mana value of a creature or of the spell being countered, Auras and Equipment attached to
  it, cards in graveyards and libraries, life totals. A resolving spell counts once, as it
  resolves, and a pump it gives stays the same afterwards (608.2h, 611.2c: Craterhoof Behemoth).
  A static ability counts again whenever it's checked (611.3a: "gets +1/+1 for each artifact you
  control", Death's Shadow). A negative result counts as 0 (107.1b).
- **\*/\* creatures** (604.3): power and toughness defined by an ability are applied in layer 7a
  (613.4a), so later effects still modify them; one that loses all abilities is 0 for each *.
  Only on the battlefield for now (in other zones * reads as 0).
- **Last known information** (608.2h): a creature that left the battlefield is used as it last
  existed there: Swords to Plowshares gives life equal to the exiled creature's power to its
  controller then; "Sacrifice ~: it deals damage equal to its power" uses its power before the
  sacrifice; dies triggers see its last power (Bottle Golems).
- "It" after "create a token" means that token ("create a 3/3 ... and put X +1/+1 counters on it").

**6,719 cards are fully supported.** Rules tests: `test/amounts-x.test.ts`.

### Library search, typecycling, kicker and additional costs (added 2026-10-10)

- **Searching a library** (CR 701.23): tutors, land ramp, fetch lands and "cards named ~".
  Searching for a card with a stated quality ("a basic land card") lets you find fewer, even none
  (701.23b); "a card" or "N cards" must find as many as possible (701.23d). Cards found aren't
  shown to other players unless the text says to reveal them (701.23e). "You may search ... then
  shuffle" is one choice: saying no means no shuffle. Templates: into your hand, onto the
  battlefield (tapped), on top after shuffling (Vampiric Tutor), into the graveyard, and the
  Cultivate split ("put one onto the battlefield tapped and the other into your hand"; with only
  one found it goes onto the battlefield, per the rulings). The game screen shows a search window
  with your matching cards grouped by name; bots take lands of the basic type they have fewest of,
  or their biggest castable spell. An Aura put onto the battlefield this way needs something to
  enchant chosen (303.4f), so those cards aren't supported yet.
- **Typecycling** (702.29e): "Forestcycling {1}" discards the card to search for a Forest card;
  it counts as cycling for "whenever you cycle" (702.29f).
- **Kicker and multikicker** (702.33): chosen while casting, after modes and before X and
  targets (601.2b); the kicker cost is added to the total cost and still has to be paid when the
  spell is cast without paying its mana cost (118.9d). "If it was kicked" text, "enters with N
  counters if kicked", "when ~ enters, if it was kicked" (an intervening if, 603.4), cards with two
  kicker costs ("if it was kicked with its {1}{G} kicker") and multikicker counts all work. Kicked
  status belongs to the spell and the permanent it becomes, and is forgotten when it changes
  zones again. A kicked mode that needs new targets (702.33g) isn't supported yet. The game
  screen asks with a bar (Kick it / Don't kick, or a count for multikicker); bots kick when they
  can afford it.
- **Additional costs** (601.2f-h): "As an additional cost to cast this spell, sacrifice a
  creature / discard a card / pay N life / exile N cards from your graveyard". Sacrificed objects
  are remembered (608.2h), so "the sacrificed creature's power" works (Fling).
  A spell can't discard itself to pay its own cost (601.2a). The game screen
  asks you to pick the permanent or cards; bots sacrifice tokens and cheap permanents (never
  their commander), pay life only when they're well ahead, and discard their least useful card.

**7,147 cards are fully supported.** Rules tests: `test/search.test.ts`, `test/kicker-costs.test.ts`.

### Effects on groups, and creature types or colors chosen (added 2026-10-10)

- **Groups of permanents**: "destroy all artifacts, creatures, and enchantments", "each creature
  without flying", "all creatures you control with a +1/+1 counter on them", "other Elves you
  control", "Return all creatures to their owners' hands", "untap all lands you control". These
  don't target (CR 115.10), so hexproof and protection don't stop them. "Artifacts and enchantments"
  means each permanent that is either one. Who's in the group is decided as the effect happens, and
  a pump it gives stays with those creatures only (CR 611.2c). "~ deals 1 damage to each creature
  and each player" deals it all at once (CR 120.3), so lifelink is one life gain.
- **Static abilities for groups**: "Each creature you control with a +1/+1 counter on it has
  trample", "All Sliver creatures have haste", "Other creatures you control with flying get +1/+1",
  "Artifacts you control have indestructible". Who they apply to is checked continuously.
- **"Other" in a spell**: after "target creature you control", "other creatures you control" means
  all but that target (Phalanx Tactics). When it means "other than the Zombies just named" (In
  Oketra's Name) the card isn't supported yet.
- **Choosing a creature type or color** (CR 614.12, 205.3m): "As ~ enters, choose a creature type"
  is chosen as it enters, before state-based actions and its enters triggers, and forgotten when it
  leaves (CR 400.7). "Choose a creature type. Destroy all creatures that aren't of the chosen type"
  is chosen as the spell resolves. Changelings are every creature type. Supported uses: groups and
  counts "of the chosen type/color" (Plague Engineer, Engineered Plague, Kindred Dominance, Distant
  Melody), "Add one mana of the chosen color" (Coldsteel Heart, the Gates, the Thriving lands), "Whenever
  you cast a spell of the chosen color" (Diamond Mare), creature-type lords (Instruments of War).
  The game screen asks for a color with five buttons, and for a creature type with a searchable list
  that puts the types already on the battlefield and in your hand first. Bots name what opponents
  have most of for harmful effects and their own most common type or color otherwise.
- **Bots and sweepers**: a bot casts "destroy all" and "damage to each" effects only when they hurt
  the opponents more than itself, weighing creatures, lands and its commander.

**7,547 cards are fully supported.** Rules tests: `test/mass-choose.test.ts`.

### "Counter unless they pay", energy, the monarch, "you may pay" (added 2026-10-10)

- **"Counter target spell unless its controller pays {3}"** (CR 118.12): Mana Leak, Force Spike,
  Spell Pierce, No More Lies ("exile it instead"), Countervailing Winds ("{1} for each card in your
  graveyard", counted as it resolves, not counting itself), Clash of Wills and Condescend ("{X}"),
  Mundungu ("{1} and 1 life"), and abilities like Spiketail Hatchling's. The spell's controller is
  asked as it resolves and can tap mana then; a cost of {0} is just paid (CR 118.5). A spell that
  can't be countered isn't, and nobody is asked. "Whenever a player casts a spell, counter it unless
  that player pays {3}" (Nether Void) works the same way, like ward.
- **Energy** (CR 107.14): "you get {E}{E}", "you get an amount of {E} equal to ...", "Pay {E}{E}:"
  costs (mana abilities too), and "you may pay {E}{E}. If you do, ...". Energy shows as ⚡ next to
  a player's life.
- **"You may pay {1}. If you do, ..."** with mana, life or energy: asked as it resolves, with a Pay
  button that taps what's needed. If you can't pay, you aren't asked; paying to untap something
  already untapped isn't asked either. Everything after "If you do," in that sentence depends on
  paying.
- **The monarch** (CR 725): "you become the monarch". The monarch draws a card at the beginning
  of their end step; a creature that deals combat damage to the monarch makes its controller the
  monarch. Both are triggered abilities with no source, controlled by the monarch. If the monarch
  leaves the game, the active player becomes the monarch (725.4). A 👑 marks the monarch.
- **Bots** pay "unless" costs and "you may pay" costs when they can and it's worth it, counter a
  spell with "unless its controller pays" only when that player can't pay, use counter abilities on
  the battlefield, and attack an opponent who is the monarch unless someone else is low enough to
  finish.

**7,724 cards are fully supported.** Rules tests: `test/counter-energy-monarch.test.ts`.

### Casting from graveyards, buyback, rebound, unearth (added 2026-10-10)

- **Flashback** (CR 702.34): cast an instant or sorcery from your graveyard for its flashback
  cost, including costs with extra parts ("Flashback—{1}{U}, Pay 3 life."). It's exiled whenever
  it leaves the stack afterwards, so a countered flashback spell is exiled too.
- **Jump-start** (CR 702.133): cast it from your graveyard for its mana cost plus discarding a
  card; exiled afterwards. **Retrace** (CR 702.81): cast it from your graveyard by also discarding
  a land card; it goes back to the graveyard, so it can be cast again.
- **Escape** (CR 702.138): cast it from your graveyard for its escape cost, exiling the stated
  number of *other* cards from your graveyard. "~ escapes with N +1/+1 counters" works.
- **Buyback** (CR 702.27): an optional extra cost asked when you cast; if paid, the spell returns
  to your hand as it resolves (not if it's countered).
- **Rebound** (CR 702.88): cast from your hand, it's exiled as it resolves, and at your next
  upkeep you may cast it from exile for free. These are delayed triggered abilities (CR 603.7),
  which now work in general.
- **Unearth** (CR 702.84): at sorcery speed, return the creature from your graveyard; it gains
  haste, is exiled at the next end step, and is exiled instead if it would leave the battlefield.
- **On the table:** your graveyard gets a green ring and a ✦ when a card there can be cast or
  used. Click it, click the card, and pick "Flashback", "Unearth" and so on from its menu.
- **Bots** flash back, jump-start, retrace (only with lands to spare), escape, pay buyback when
  they can afford it, recast rebound spells, and unearth creatures before combat.

**7,889 cards are fully supported.** Rules tests: `test/graveyard-cast.test.ts`.

### Echo, cumulative upkeep, evoke, dash, delve, living weapon, scavenge (added 2026-10-10)

- **Echo** (CR 702.30): at the beginning of your upkeep, if the permanent came under your control
  since your last upkeep began, pay its echo cost or sacrifice it. So it's asked once, at the first
  upkeep after you get it. Costs that aren't mana ("Echo—Discard a card") aren't modeled yet.
- **Cumulative upkeep** (CR 702.24): each of your upkeeps it gets an age counter, then you pay the
  cost once for each age counter, all of it or none, or sacrifice it. Mana and life costs work;
  ones with a choice ("{G} or {W}") or an action ("Sacrifice a creature") don't yet. If you can't
  pay, it's sacrificed without asking.
- **Evoke** (CR 702.74): cast it for its evoke cost instead; it's sacrificed as it enters. Its own
  enters abilities resolve first, so Mulldrifter still draws two.
- **Dash** (CR 702.109): cast it for its dash cost instead; it has haste and goes back to its
  owner's hand at the beginning of the next end step.
- **Delve** (CR 702.66): exile cards from your graveyard as you cast it, each paying for {1} of
  the generic mana. A picker suggests just enough cards to make it affordable.
- **Living weapon** (CR 702.92): the Equipment enters with a 0/0 black Phyrexian Germ token and
  attaches to it (Batterskull, Flayer Husk).
- **Scavenge** (CR 702.97): from your graveyard, as a sorcery, exile the card to put +1/+1
  counters equal to its power on target creature.
- **On the table:** clicking a card with evoke or dash opens a menu with "Cast it", "Evoke" or
  "Dash". The echo and cumulative upkeep prompts have Pay and Don't pay buttons.
- **Bots** pay echo, pay cumulative upkeep while it stays cheap, evoke creatures whose enters
  ability they want when the full cost is out of reach, dash when they can't pay the full cost,
  delve away cards that do nothing else in their graveyard, and scavenge onto their creatures.

**7,998 cards are fully supported.** Rules tests: `test/upkeep-alt-costs.test.ts`.

### Morph, megamorph, disguise: face-down creatures (added 2026-10-10)

- **Casting face down** (CR 702.37, 708): from your hand, for {3}, as a nameless, colorless 2/2
  creature spell with no abilities, types or mana cost. The log says "casts a face-down creature
  spell" without naming it, and other players see a blank striped card. You still see what it is
  (hover it, or look at the small label on the card).
- **Turning it face up** (CR 702.37e, 116.2b): a special action. Any time you have priority, pay
  its morph cost and it becomes the real card at once. It doesn't use the stack, so it can't be
  responded to. Abilities that say "when ~ is turned face up" trigger. It didn't just enter, so
  "when ~ enters" abilities don't (CR 708.8). Counters, damage, Auras and effects already on it
  stay.
- **Megamorph** (CR 702.37b): the same, plus a +1/+1 counter as it's turned face up.
- **Disguise** (CR 702.168): the same, but while face down it also has ward {2}.
- **Leaving play** (CR 708.9): a face-down permanent or spell is revealed when it goes anywhere
  else, and the log names it. Its own "when ~ dies" abilities don't trigger, because face down it
  had none. A countered face-down spell goes to the graveyard face up.
- Only mana costs for now; "Morph—Reveal a white card" and similar aren't modeled. Manifest and
  cloak (cards put onto the battlefield face down by other effects) are not done yet.
- **On the table:** clicking a morph card in your hand gives "Cast it" and "Cast face down {3}".
  Clicking your face-down creature gives "Turn face up" with its cost.
- **Bots** cast morph creatures face down when they can't afford the real cost, then turn them
  face up as soon as they can pay.

**8,103 cards are fully supported.** Rules tests: `test/face-down.test.ts`.

### Auras' abilities, edicts, bounce lands, "until it leaves", riot, unleash, afterlife (added 2026-10-10)

- **"Enchanted creature" and "equipped creature"** in abilities: "When this Aura enters, tap enchanted
  creature", "{R}: Enchanted creature gets +1/+0 until end of turn", "Regenerate enchanted creature".
  If the Aura was sacrificed to pay for the ability, it's the creature the Aura was attached to as it
  last existed (CR 608.2h).
- **Picking your own permanents** (CR 701.21): "sacrifice a creature", "each opponent sacrifices a
  creature of their choice", "target player sacrifices an artifact", "return a land you control to its
  owner's hand" (the bounce lands, Kor Skyfisher). Nothing is targeted. Each player picks in turn order,
  starting with the active player, and then they all go at once (CR 101.4). With only as many as they
  must pick, there's no choice to make. A bounce land with no other land returns itself (rulings).
- **"Exile ... until ~ leaves the battlefield"** (CR 610.3): Banishing Light, Banisher Priest and the
  like. When the source leaves, the card comes back right away under its owner's control, as a new
  object (no counters). If the source left before its ability resolved, nothing is exiled
  (CR 610.3b). An exiled token doesn't come back. An Aura comes back attached to something it can
  enchant, which its owner picks (CR 303.4f); with nothing legal it stays in exile (CR 303.4g).
- **"When this Equipment enters, attach it to target creature you control"**, and "attach ~ to target
  creature you control" as an ability. It only attaches to something it legally could (a creature for
  an Equipment, what an Aura can enchant, nothing with protection from it).
- **"Target creature can't block this turn"**, "can't attack this turn", "can't attack or block this turn".
- **Riot** (CR 702.136): enters with your choice of a +1/+1 counter or haste (for as long as it stays).
- **Unleash** (CR 702.98): may enter with a +1/+1 counter; it can't block while it has any +1/+1 counter.
  Riot's and unleash's choices are made as it enters, so abilities that trigger on it entering
  (evolve) see the counter.
- **Afterlife N** (CR 702.135): when it's put into a graveyard from the battlefield, create N 1/1 white
  and black Spirit tokens with flying.
- **On the table:** to sacrifice or return, click your glowing permanents, then Sacrifice or Return.
  Riot and unleash ask with two buttons.
- **Bots** sacrifice or return their least valuable permanents (a tapped land first, for bounce
  lands), choose haste for riot when they can still attack this turn, and take unleash's counter
  unless they're low on life.

**8,413 cards are fully supported.** Rules tests: `test/auras-edicts.test.ts`.

### Sacrifice and discard costs on abilities, "as long as" abilities (added 2026-10-10)

- **"Sacrifice a creature: ..."**, "Sacrifice another creature:", "{1}, Sacrifice an artifact or land:",
  "{1}, Discard a card: ...": costs paid as you activate, after choosing targets (CR 602.2b, 601.2h),
  so nobody can respond by killing what you sacrificed. "Another" can't be the ability's own source.
  "The sacrificed creature's power" is that creature as it last existed (CR 608.2h).
- **"As long as" abilities** (CR 604.1, 611.3): they apply only while the condition is true, checked
  all the time.
  - "~ gets +1/+2 as long as you control a Forest" (Kird Ape), "another artifact", "no untapped lands",
    "an opponent controls an Island", "a white or black permanent".
  - Metalcraft (three or more artifacts), delirium (four or more card types among cards in your
    graveyard, CR 205.2a), descend (permanent cards in your graveyard), threshold.
  - "As long as it's attacking", "it's enchanted / equipped", "it's modified" (counters, Equipment,
    or an Aura its controller controls, CR 700.9), "it has a +1/+1 counter on it".
  - "During your turn, ~ has first strike."
  - "~ can't be blocked as long as defending player controls an artifact": the player it's attacking.
  - What the condition looks at is seen after earlier layers, so an effect that makes an artifact
    stop being one turns metalcraft off (CR 613.8).
  - Not yet: "This spell has flash as long as ..." (it works from your hand), and "each creature you
    control can't be blocked as long as defending player ..." (each attacker has its own defending player).
- **Targets and groups** can now say "untapped", "token" and "nontoken" ("destroy target untapped
  creature", "each player sacrifices a nontoken creature").
- **On the table:** after choosing targets, click what to sacrifice (it glows), then Sacrifice and
  activate; a discard cost asks with your hand's cards.
- **Bots** only sacrifice tokens worth little (or a land when they have plenty), and only discard
  with a full hand.

**9,019 cards are fully supported.** Rules tests: `test/activation-costs.test.ts`, `test/as-long-as.test.ts`.

### Several targets, "up to" targets, "another target" (added 2026-10-10)

- **"Up to two target creatures", "two target artifacts", "one or two target creatures"**: each is a
  target of its own. One instance of "target" can't pick the same thing twice (CR 115.3). "Up to"
  targets may be left unchosen, even all of them; a spell with none chosen isn't targeted and still
  resolves (CR 115.6). With some chosen, it doesn't resolve only when every chosen one is illegal
  (CR 608.2b), and illegal ones are just skipped.
- **"Another target creature"**: different from the targets before it ("Target creature gets +2/+2.
  Another target creature gets -2/-2"), or, on a permanent's ability with no target before it, not that
  permanent ("{T}: Untap another target permanent", Junk Diver can't return itself).
- **Damage**: "any other target" (Arc Trail), "each of two targets", "deals damage equal to its power to
  each of two other target creatures".
- **"That creature doesn't untap during its controller's next untap step"**, and "those creatures".
- **On the table:** an "up to" target shows Choose none (or Done once you've picked one), and says how
  many more you may choose. Things you've already picked for the same spell aren't offered again.
- **Bots** only fill "up to" targets with things they want to hit or help, and don't cast a spell
  whose targets would all be empty.
- Not yet: "divided as you choose among" (dividing damage or counters), "up to X target", and targets
  that must share something ("two target creatures that share a creature type", "from a single graveyard").

**9,380 cards are fully supported.** Rules tests: `test/targets.test.ts`.

### Spells that cost more or less (added 2026-10-10)

- **Cost changes from permanents**: "Instant and sorcery spells you cast cost {1} less to cast"
  (Goblin Electromancer), "Noncreature spells cost {1} more to cast" (Thalia, which taxes its controller
  too), "Artifact and enchantment spells your opponents cast cost {2} more", "During turns other than
  yours, spells you cast cost {1} less", mana value limits, and "from your graveyard".
- **A spell's own reductions**: "This spell costs {1} less to cast for each creature on the battlefield"
  (Blasphemous Act), "costs {X} less, where X is ...", and "costs {1} less if you control a Wizard"
  (or any "as long as" condition from the last round).
- **The order follows CR 601.2f**: the printed cost plus additional costs, then increases, then
  reductions. Reductions only take off generic mana (CR 118.7a), and a free cast still pays increases
  (CR 118.9d). A permanent that loses its abilities stops changing costs.
- **Autopay locks the cost first** (CR 601.2f-g): when a spell's cost depends on the board, it won't
  sacrifice a Treasure for mana if that would make affinity for artifacts count one fewer.
- Not yet: "the first spell you cast each turn costs less", "costs {1} less for each target", and
  reductions of colored mana.

**9,493 cards are fully supported.** Rules tests: `test/cost-changes.test.ts`.

### Abilities given to other permanents, backup (added 2026-10-10)

- **Quoted abilities in layer 6** (CR 613.1f): 'Enchanted creature has "{T}: This creature deals 1 damage
  to any target."', 'Creatures you control have "{T}: Add one mana of any color."', 'All Slivers have
  "Sacrifice this permanent: ..."', 'Until end of turn, target creature gains "When this creature dies,
  ..."'. "This creature" in the quote is whatever has the ability. Losing all abilities removes the ones
  given earlier, not later (CR 613.7). A "{T}" ability given to a creature still needs it to have been
  under your control since your turn began (CR 302.6).
- **Dies abilities given until end of turn still trigger**: leaving the battlefield looks back in time
  (CR 603.10a), so the creature's last known abilities count.
- **Backup N** (CR 702.165): N +1/+1 counters on target creature, and if it's another creature, the
  abilities printed below backup until end of turn. Two backups trigger separately.
- **On the table:** a permanent that gained abilities shows a "+1 ability" chip; hover for the text. Its
  menu lists the ability like its own.
- **Bots** put an Aura that gives an upkeep edict or life loss ("At the beginning of your upkeep,
  sacrifice a creature") on an opponent's creature, and don't pay for an ability with the token it targets.
- Not yet: static abilities given this way ('has "This creature can't block"'), quotes that name the
  granting card (CR 201.5a: that name means the card, not the creature), and battles ("a player or
  battle" is read as a player, since nothing can attack a battle yet).

**9,699 cards are fully supported.** Rules tests: `test/granted-abilities.test.ts`.

### Umbra armor, "If you do", extort, damage triggers (added 2026-10-10)

- **Skulk** (CR 702.118b): can't be blocked by creatures with greater power.
- **Umbra armor** (totem armor, CR 702.89a): if the enchanted creature would be destroyed, its damage is
  removed and the Aura is destroyed instead. A regeneration shield is used first (CR 616.1).
- **"You have no maximum hand size"** (Reliquary Tower, CR 402.2): no cleanup discard.
- **"You may discard a card. If you do, draw two cards"** (CR 608.2c): the draw happens only if you
  actually discarded, so with an empty hand nothing happens. Same for "you may draw a card. If you do,
  discard a card" and "you may sacrifice it. If you do, ...".
- **Extort** (CR 702.101a): whenever you cast a spell, you may pay {W/B}; each opponent loses 1 life and
  you gain the total lost. "You gain life equal to the life lost this way" (Gray Merchant,
  Exsanguinate) works the same way.
- **Damage triggers**: "Whenever this creature deals damage, you gain that much life", "deals combat
  damage", and "deals combat damage to a player, that player discards a card" / "draw that many
  cards". One source dealing damage to several things at once is one event, so it triggers once with
  the total (CR 603.2c).
- **Statics for attacking or blocking creatures**: "Attacking creatures you control have double strike".
- **"This spell costs {3} less to cast if it targets a tapped creature"**: the target is chosen before
  the cost is worked out (CR 601.2c, 601.2f), and autopay won't tap the target for mana.
- Not yet: battles, "can't attack unless", "becomes tapped" triggers.

**9,850 cards are fully supported.** Rules tests: `test/umbra-extort-damage.test.ts`.

### Protection from anything, attack and block rules, mentor (added 2026-10-10)

- **Protection from qualities other than colors** (CR 702.16a): from artifacts, creatures, enchantments,
  instants, lands, planeswalkers, a creature type ("from Goblins", "from Demons and from Dragons"),
  multicolored, monocolored, colorless, each color, and everything. As before, protection stops
  targeting, damage, blocking, and being enchanted or equipped.
- **"Gains protection from the color of your choice until end of turn"** (Mother of Runes, Gods Willing):
  the color is chosen as it resolves. "As ~ enters, choose a color. ~ has protection from the chosen
  color" works too. Bots use these to answer a colored spell or ability aimed at their creature, and pick
  that color.
- **Attack restrictions**: "can't attack unless defending player controls an Island" is checked for each
  player you attack (CR 506.2, 508.1c), and "can't attack alone" (CR 506.5). On the table, you can only
  aim such a creature at a player it may attack.
- **Block restrictions and requirements**: "can't block alone", "creatures with power less than ~'s
  power can't block it", "must be blocked if able" and "all creatures able to block ~ do so" (Lure). The
  blocks you declare have to obey as many requirements as they can without breaking a restriction
  (CR 509.1c); the block bar says what's still needed.
- **"Target creature can't be blocked this turn"**, and "~ can't be blocked this turn".
- **Mentor** (CR 702.134a): a +1/+1 counter on target attacking creature with lesser power.
- **"Target player or planeswalker"** (Lava Axe), "target opponent or planeswalker".
- **"Put target creature on top of (the bottom of) its owner's library"**. A commander put into its
  owner's library goes to the command zone instead (CR 903.9b).
- **"Attacking creatures get +1/+1 until end of turn"**: whichever are attacking as it resolves.
- Not yet: Auras whose protection "doesn't remove" themselves, "can block an additional creature",
  and protection from a player.

**10,163 cards are fully supported.** Rules tests: `test/protection-combat-mentor.test.ts`.

### Enters and leaves triggers, stun and shield counters, raid, connive (added 2026-10-10)

- **"Whenever a creature enters"**, "another Ally you control", "~ or another enchantment you control",
  "a creature enters under an opponent's control": "it" and "that creature" mean the one that entered.
- **"When ~ leaves the battlefield"**, whatever zone it goes to (CR 603.6c), looking back in time.
- **Linked exile** (Fiend Hunter, Banisher Priest style, CR 607.2a): "When ~ enters, exile target
  creature" and "When ~ leaves the battlefield, return the exiled card to the battlefield under its
  owner's control" only return what that ability exiled.
- **Stun counters** (CR 122.1d): untapping one removes a counter instead, in the untap step or from an
  effect. "Tap target creature and put a stun counter on it", "~ enters tapped with three stun
  counters on it". Shown as a chip on the card.
- **Shield counters** (CR 122.1c): damage or destruction removes a counter instead, even damage that
  can't be prevented. "~ has trample as long as it has a shield counter on it".
- **"Put a +1/+1 (shield, stun) counter on a creature you control"**: chosen as it resolves, not
  targeted.
- **Draw triggers**: "whenever you draw a card", "whenever an opponent (a player) draws a card" (with
  "that player"), and "whenever you draw your second card each turn", counting every card drawn that
  turn (CR 121.2).
- **Raid and intervening "if"** (CR 603.4): "When ~ enters, if you attacked this turn, ...", "At the
  beginning of your upkeep, if you control three or more artifacts, ...". The ability only triggers if
  it's true, and does nothing if it's no longer true as it resolves. "~ enters with a +1/+1 counter
  on it if you attacked this turn", and a spell's "If you attacked this turn (you control a Wizard),
  ..." checked as it resolves.
- **Connive** (CR 701.50): draw, discard, and a +1/+1 counter for each nonland card discarded. It still
  draws and discards if the creature already left.
- **"If that creature would die this turn, exile it instead"** and "If a creature dealt damage this way
  would die this turn, exile it instead" (Anger of the Gods): a replacement for the rest of the turn,
  so its dies triggers don't happen.
- Not yet: "one or more creatures enter" (once per batch), "whenever ~ connives", "if a creature would
  die this turn" for every creature, and "you may have it connive".

**10,659 cards are fully supported.** Rules tests: `test/enters-leaves-counters.test.ts`.

### "Whenever another creature dies", heroic, proliferate, amass, blink (added 2026-10-10)

- **"Whenever a creature dies"** and its variants: "another creature", "a creature you control", "an
  opponent controls", "a nontoken creature", "~ or another Zombie you control", "a creature you control
  with a +1/+1 counter on it", "a creature dealt damage by ~ this turn", "equipped (enchanted) creature".
  These look back in time (CR 603.10a): the creature is checked as it last existed, and permanents that
  leave at the same time (a board wipe, one pass of state-based actions) see each other die, so Blood
  Artist sees every creature a wrath kills, itself included. "It" and "that card" are the card in the
  graveyard; "its power" is as it last existed.
- **Heroic**: "Whenever you cast a spell that targets ~", once per spell.
- **Proliferate** (CR 701.27): the choice is made for the player: their own permanents' counters (other
  than -1/-1, stun, age, time and fade), opponents' permanents' -1/-1 and stun counters, their own
  energy, and opponents' poison.
- **Amass** (CR 701.47): a 0/0 black Army token if you have none, then +1/+1 counters on your Army,
  which also becomes the amassed type.
- **Blink**: "Exile target creature you control, then return it to the battlefield under its owner's
  control" (a new object, so its enters abilities trigger again) and "Return that card ... at the
  beginning of the next end step" (with a +1/+1 counter, or under your control). Tokens don't come back.
- Not yet: choosing what to proliferate yourself, "can block an additional creature", "one or more
  creatures die", and dies triggers that work from the graveyard ("while ~ is in your graveyard").

**10,949 cards are fully supported.** Rules tests: `test/dies-heroic-proliferate.test.ts`.

### Looking at the top cards, fading, vanishing, dethrone, each upkeep (added 2026-10-10)

- **"Look at the top N cards of your library"** then "Put one (two) of them into your hand and the rest
  into your graveyard / on the bottom", "You may reveal a creature or land card from among them and put
  it into your hand", "You may put one of those cards back on top". The player picks in a window showing
  the cards looked at; cards that don't match are shown but can't be taken. "On the bottom in any order"
  puts them there in a random order for now.
- **Afflict** (CR 702.130), **dethrone** (702.105: checked as it attacks, ties count), **training**
  (702.149), **fading** (702.32) and **vanishing** (702.63: removing the last time counter triggers the
  sacrifice, so it uses the stack), **ward—pay N life**.
- **"At the beginning of each (player's) upkeep / each player's draw step, that player ..."**: "that
  player" is the active player; draw-step triggers come after the turn's draw (CR 504.2). "Draws an
  additional card" is one more draw.
- **"Sacrifice ~ unless you pay {U}"** (and "unless you pay 3 life"), **"Draw a card at the beginning of
  the next turn's upkeep"** (a delayed trigger, whoever's turn is next), **"Other artifact creatures you
  control get +1/+1"**, **"Target creature deals damage to itself equal to its power"**.
- Fix: mana abilities activated just before casting are part of paying for the spell (CR 601.2g), so
  what they trigger (a death trigger from sacrificing an Eldrazi Scion) goes on the stack after the spell
  is cast, not before. Before, a bot could end up trying to cast a sorcery with that trigger on the stack.
- Not yet: putting cards back "in any order" yourself, "tap target creature defending player controls".

**11,154 cards are fully supported.** Rules tests: `test/dig.test.ts`, `test/fading-dethrone.test.ts`.

### Charge, spore, oil and other named counters (added 2026-10-10)

- Counters of any name (CR 122.1): "put a spore counter on ~", "~ enters with three charge counters on
  it", "{T}, Remove a charge counter from ~: Add one mana of any color", "Remove three spore counters
  from ~: Create a 1/1 green Saproling", "{2}, Remove a +1/+1 counter from ~: ...". Removing counters is
  a cost (CR 602.2b): it can't be activated without enough of them.
- Counting them: "for each oil counter on it", "the number of charge counters on ~", as it last existed
  after it's sacrificed to pay for the ability.
- Bots use abilities that remove named counters (they run out, so it isn't an endless loop).
- Permanents show their named counters as chips.

**11,323 cards are fully supported.** Rules tests: `test/named-counters.test.ts`.

### Playing exiled cards, extra land drops, "whenever you attack" (added 2026-10-10)

- **Impulse draw**: "Exile the top two cards of your library. Until the end of your next turn (until end
  of turn), you may play those cards." The cards are exiled face up; you may cast them (paying their
  costs, with normal timing) or play a land among them as your land for the turn. The permission is for
  that object only (CR 400.7) and ends with the turn it names. Exile glows (✦) when you can play
  something there; click it to choose. Bots play these cards before the ones in hand.
- **"You may play an additional land on each of your turns"** (CR 305.2a).
- **"Whenever you attack" / "Whenever one or more creatures (Elves, nontoken Vampires) you control
  attack"**: once per declaration, however many attack.
- **"Whenever one or more creatures (Rogues) you control deal combat damage to a player"**: once for each
  player dealt damage that step (per the rulings), "that player" being that player.
- Not yet: effects on "they"/"those creatures" (the attackers as a group), impulse draw from an
  opponent's library, "play lands from your graveyard / the top of your library".

**11,381 cards are fully supported.** Rules tests: `test/impulse.test.ts`.

### Token and counter doublers (added 2026-10-10)

- **Replacement effects on how many** (CR 614.1a, 616.1): Parallel Lives, Anointed Procession, Mondrak
  ("twice that many tokens"), Primal Vigor (anyone's tokens and +1/+1 counters), Doubling Season (tokens
  and any counters on your permanents), Hardened Scales ("that many plus one"), Branching Evolution,
  Corpsejack Menace, Benevolent Hydra ("another creature"), Xorn (one extra Treasure).
- Each copy applies again: two Parallel Lives make four times as many. When several apply, the plus-ones
  go first and then the doubles, which is the order the affected player would pick.
- They apply to every effect that puts counters or creates tokens, "enters with counters" included
  (that's the rulings), but not to counters put on as a cost. A creature with its own doubler isn't
  affected by it as it enters, since only permanents already there count (CR 614.12).
- Not yet: Vorinclex (counters on players and halving), "instead create one of each" (Academy
  Manufactor), -1/-1 counters from wither and infect damage.

**11,393 cards are fully supported.** Rules tests: `test/doublers.test.ts`.

## Roadmap

1. ~~Effects system~~ and ~~oracle text compiler~~ (first version done).
2. **More templates, by frequency** (`npm run coverage`): "divided as you choose", abilities that work from the graveyard ("Return ~ from your graveyard"), "if you do",
   split/adventure/double-faced cards. ~~Auras and Equipment~~, ~~enters with
   counters~~, ~~modal spells~~, ~~scry/surveil, discard, fight, graveyard targets,
   Treasure/Food/Clue~~, ~~cycling, crew, convoke, ward, prowess and "whenever you
   cast"~~, ~~protection, shroud, infect/wither/toxic, exalted, landfall, regeneration, must
   attack~~ done. ~~blocking triggers, conditional tapped lands, persist/undying/soulshift, prevention,
   life-gain triggers, threshold~~ done. ~~mana abilities with costs or several mana, explore, renown,
   bloodthirst, fabricate, modular, evolve, battle cry, cascade, affinity, improvise~~ done. ~~X costs,
   "for each" / "equal to the number of" / "where X is", */* creatures, last known information~~ done. ~~library search, typecycling, kicker, additional
   costs~~ done. ~~"all"/"each" groups, choosing a creature type or color~~ done. ~~"counter unless
   they pay", energy, the monarch, "you may pay ... If you do"~~ done. ~~flashback, jump-start,
   retrace, escape, buyback, rebound, unearth, delayed triggers~~ done. ~~echo, cumulative upkeep,
   evoke, dash, delve, living weapon, scavenge~~ done. ~~morph, megamorph, disguise~~ done. ~~"enchanted creature" abilities, edicts, bounce lands, "exile until ~
   leaves", riot, unleash, afterlife~~ done. ~~sacrifice/discard costs on abilities, "as long as"~~ done. ~~"up to N targets", "another target"~~ done. Next by
   count: see `npx tsx tools/coverage.ts`.
   Hand-written overrides for cards that don't fit a template.
3. ~~Layers and continuous effects~~ (CR 613, done except layers 1 and 3), replacement
   effects (CR 614), and choices (targets, ~~modes~~, ~~X~~, ordering triggers).
4. ~~Mulligans (London + Commander free mulligan)~~, proper legend-rule choice, 903.9 choice.
5. Deck builder using the full card DB, with rulings in the card preview.
6. Better bots, then online play (engine runs on a server; clients send actions).
