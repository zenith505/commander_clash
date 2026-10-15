# Roadmap

14,873 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Each round takes the next item,
implements it with tests, and updates this file. `npm run blockers` shows how many cards each missing line blocks.

## Ken's standing instructions

- Keep going round after round until the plan is done; no need to ask before each round.
- Skip cards that aren't legal in any format.
- Don't guess on complex cards: research the rules and rulings first.
- Infinite or long loops: shortcut them like paper Magic (CR 732): propose a loop and a number of iterations,
  others accept or stop it earlier.
- A UI polish pass comes at the end. Don't reorder the game log (Ken rejected that).

## Next rounds

1. By `npm run blockers` (a long tail of 3-card lines): "equip abilities you activate that target ~ cost {N} less",
   "when ~ enters, manifest dread, then attach ~ to that creature", "if you would draw a card except the first one you
   draw in each of your draw steps", "damage that would reduce your life total to less than N reduces it to N
   instead", "if you descended this turn", "exile up to three target cards from a single graveyard", "destroy target
   creature an opponent controls that was dealt damage this turn", "each opponent sacrifices a permanent of their
   choice unless they pay {N}", "whenever ~ becomes tapped, you gain N life and scry N", "when you cast a creature
   spell, sacrifice ~", Glyph Keeper's "becomes the target ... for the first time each turn", Hellfire Mongrel, "if
   you would gain life, you gain that much life plus N instead".

## Known gaps (from earlier rounds)

- Layer 3 (text-changing effects).
- "Divided as you choose" with X ("X damage divided", Rolling Thunder, Fire Covenant), distributing counters
  ("distribute three +1/+1 counters among one, two, or three target creatures"), divided prevention (Remedy), on a
  planeswalker (Chandra, Flameshaper); "up to X target", targets that must share something ("from a single
  graveyard").
- "The first spell you cast each turn costs less", "costs {1} less for each target", reductions of colored mana.
- Granted static abilities ('has "This creature can't block"'), battles, "can't attack unless", "becomes tapped".
- Protection from a player; protection that doesn't remove other Auras (Spectra Ward, Benevolent Blessing).
- Aura and Equipment triggers: "whenever ~ or equipped creature ..." that then says "it", "blocks or becomes blocked by
  a creature", Extra Arms's "it deals"; granted target taxes (Callaphe); "if it had counters on it, put its counters"
  (Host of the Hereafter).
- Alternative costs that aren't mana ("exile a green card from your hand", Pyrokinesis, Flameshot, Lashknife, Vine
  Dryad), for every spell (Fist of Suns, Jodah).
- Mana: "until end of turn, whenever a player taps an Island for mana" (High Tide, Bubbling Muck), "tapped for mana"
  triggers that aren't mana abilities (Manabarbs) or have conditions (Regal Behemoth, Barbflare Gremlin), "may add"
  (Snowfall), "for each Elf" (Elvish Guidance); replacing mana ("produces twice as much", Mana Reflection,
  Contamination). Autopay skips a land whose own mana can't be spent on the cost even when the extra mana from
  Mana Flare (which has no restriction) could be.
- "One or more creatures enter/die" (once per batch), "whenever ~ connives", "while ~ is in your graveyard".
- Choosing what to proliferate. "Exile any number of them and put the rest back in any order".
- Effects on the attackers as a group; impulse draw from an opponent's library; "play lands from the top of your
  library"; Glacierwood Siege's modal choice.
- Vorinclex (counters on players, halving), Academy Manufactor.
- "If ~ attacked or blocked this combat", "until end of combat", myriad attacking planeswalkers, "at the beginning
  of combat on each opponent's turn".
- "Copy target activated or triggered ability" (Strionic Resonator). Changing the target of a spell with more than one
  target; Misdirection's pitch cost; Mirrorshell Crab's channel ability.
- "Activate only during your turn, before attackers are declared" assumes one combat per turn (the engine has no
  extra combats). Random discards as a cost: bots use them only with spare cards in hand. "Exile it instead" with
  something else ("create a 2/2 black Zombie", Kalitas). "Prevent all damage that would be dealt by target instant or
  sorcery spell" (Hidden Retreat).
- "Skip your next draw step" (Fatigue) and other one-time skips; Ad Nauseam's repeat; Pain Seer's "becomes
  untapped"; Ivory Gargoyle.
- Champion triggers about the championed card (Mistbind Clique's "when a Faerie is championed"); reinforce X;
  Dodecapod's "with two +1/+1 counters". Prototype can't be chosen for free casts ("without paying its mana
  cost") yet.
- Blocking: "whenever ~ blocks two or more creatures" (Lairwatch Giant), "for each creature it's blocking" (Guardian
  of the Gateless), "an additional creature for each Equipment attached" (Kemba's Legion), Yare's "creature
  defending player controls". A blocker's damage among several attackers is divided automatically, like an
  attacker's among several blockers.
- Soulbond: "whenever ~ or a creature it's paired with is dealt damage" (Donna Noble, also Doctor's companion);
  granted trigger Breathkeeper Seraph's "at the beginning of your next upkeep".
- Backgrounds that grant static abilities (Criminal Past, Inspiring Leader, Master Chef, Raised by Giants), "enters
  or leaves the battlefield" triggers (Candlekeep Sage, Cryogen Relic), Veteran Soldier's "tapped and attacking that
  opponent", Faceless One. The sample decks have one commander each; two commanders (partners or a Background) work
  in the engine and `sample-decks.json` (`secondCommander`) but no sample deck uses them yet.
- Split second granted or conditional (Samut, Molten Disaster's "if it was kicked", Shadow the Hedgehog).
- Exploit granted to other creatures (Colonel Autumn, Henry Wu), "the exploited creature", "if it exploited that
  creature"; devour on tokens (Dragon Broodmother), "the number of Goblins it devoured".
- City's blessing text: "those creatures get +2/+2 instead", "half the creatures they control", "has hexproof and
  can't be blocked", "exile those tokens unless you have the city's blessing".
- Becoming a copy: double-faced cards (CR 707.8, they're unsupported entirely); copies chosen without targeting
  (Cytoshape, Deepfathom Echo, Sakashima's Will, Polymorphous Rush); "for as long as" durations (Assimilation Aegis,
  Blade of Shared Souls, Zygon Infiltrator, Secret Invasion); copying an exiled card (Dimir Doppelganger, The
  Mimeoplasm, Dermotaxi, Lazav, Wearer of Faces, Niko); targets "with mana value X" (Lazav, the Multifarious,
  Likeness Looter, The Mycosynth Gardens), "with a counter on it" (Volrath), "of the chosen type" (Mirror of the
  Forebears), "a second target" (Shuri); Permeating Mass, Crystalline Resonance, Hall of Echoes, Absorbing Man,
  Taskmaster, Gogo, Court of Vantress, Vesuvan Shapeshifter, Brudiclad, Infinite Reflection; planeswalkers (Saheeli,
  Oko, Kaya).
- Madness: "if its madness cost was paid" (Grave Scrabbler), X or non-mana madness costs, granting madness (Falkenrath
  Gorger), "whenever you discard a card, if it has madness" (Anje Falkenrath). A madness or suspended commander is
  moved to the command zone (the 903.9a choice is always yes).
- Suspend: X or non-mana suspend costs; cards that look at or change suspended cards and time counters (Jhoira,
  Clockspinning, Greater Gargadon, Deep-Sea Kraken, Delay, Dust of Moments, As Foretold, Chronozoa, vanishing).
- Bestow: non-mana bestow costs. Casualty X (Ob Nixilis), granted casualty (Anhelo). Dredge granted to other cards.
- Loops (CR 732): bots don't propose shortcuts (a bot activates one ability at most 8 times a turn instead), and the
  human can't shorten a shortcut someone else proposes. Fragmented loops (732.3) and "[A] unless [B]" loops (732.6).
  A shortcut replays choices literally, so a loop whose choices depend on what it reveals (scry, which card was drawn)
  stops after one round; the UI only repeats a loop that ends in the step it began in. A mandatory loop is recognized
  when the game state repeats with everyone only passing; one that needs a choice each time (a target) or grows a
  number forever is a draw only after 5,000 resolutions in a row.
- Banding: "bands with other", "creatures banded with ~" (Icatian Skirmishers, Camel, Urza's Engine). Bots never
  form bands. Banding's damage division (702.22j-k) is done automatically for the player who divides it, keeping as
  many of their creatures alive as possible.
- Enlist: two instances on one creature (702.154d), "if it enlisted a creature this combat" (Aradesh), Guardian of New
  Benalia's "Tap it." Offspring and squad: non-mana costs, granting them. Sunburst: Engineered Explosives.
- Speed: "creature or Vehicle" choices (Gas Guzzler, Perilous Snare, Pride of the Road, Kickoff Celebrations),
  Hazoret's "unless you have max speed", max speed replacement effects and cost reductions (Vnwxt, Far Fortune,
  Racers' Scoreboard, Lightwheel Enhancements), "where X is your speed" in The Speed Demon, Samut and Point the Way,
  Outpace Oblivion.
- "As though it weren't blocked" from an effect rather than an ability (Predatory Focus, Outmaneuver), Ruxa,
  Gurzigost. "At the beginning of the next cleanup step" for counters (Bounty of the Hunt), Cunning, Necromancy.
- Damage shields: outside combat damage the choices of which damage a prevention or redirection shield takes, and
  which shield applies first (CR 615.7, 616.1), are made for the player (bots' heuristic); a shield that redirects to
  the creature it protects, and chains of redirection, are untested. Hazduhr (named by its short name), Captain's
  Maneuver ("creature, planeswalker, or player"), Personal Incarnation.
- Planeswalkers: emblems (CR 114), "+X" loyalty abilities, compleated, "X" loyalty, "add mana" loyalty abilities,
  "activate loyalty abilities any time you could cast an instant" (Jace's Machinations), "aren't put into graveyards
  for having 0 loyalty" (Sanctum Lurker), "whenever you activate a loyalty ability", "whenever you put loyalty
  counters on a planeswalker"; copying planeswalkers; myriad and tokens "entering attacking" always attack the
  player, not a planeswalker; bots defend their planeswalkers only through their usual blocks. Behold.
- Triggers from the graveyard work for spells cast, permanents entering, upkeeps and other steps, and "one or more
  creatures attack / deal combat damage"; "while ~ is in your graveyard" (Furious Forebear, Boneyard Scourge), "when
  you discard ~" and other zones (exile) aren't modeled.
- Zone-change replacements: when an "exile it instead" effect and Darksteel Colossus's "shuffle it into its owner's
  library instead" both apply, its owner would choose the order (CR 616.1); it's exiled. Rest in Peace, Leyline of
  the Void and Dryad Militant ("if a card would be put into a graveyard from anywhere, exile it instead").
- "A creature dealt damage by ~ this turn" counts damage from an earlier object with the same card if it left the
  battlefield and came back the same turn (should be a new object, CR 400.7); Krovikan Vampire, Runesword.
- "Becomes tapped": "another ... becomes tapped", "during your turn", "for the first time each turn", "while it has a
  -1/-1 counter", granted ("Elves you control have \"Whenever this creature becomes tapped ...\""); filters with
  colors in only some alternatives (Royal Decree's "a Swamp, Mountain, black permanent, or red permanent").
- Learn: nobody has a sideboard, so it's always "you may discard a card; if you do, draw a card". Retriever Phoenix.
- "Mana a land could produce" for Gates (Gond Gate, Plaza of Harmony), "basic land" (Star Compass), "that land"
  (Benthic Explorers, Squandered Resources), Incubation Druid's "three mana of that type instead".
- "Multicolored creatures you control have ..." and other statics on multicolored or colorless permanents (Maze
  Glider, Glass of the Guildpact), "hexproof from monocolored", "for each of that spell's colors".
- Life: "whenever you lose life", "whenever a player loses life", "whenever you gain life for the first time each
  turn", "draw that many cards"; life-gain replacement effects other than doubling.
- Discarding: "whenever you discard one or more cards" (once per batch, "that many"), "draw that many cards" after "you
  may discard your hand. If you do" (Book Devourer), Hollow One's "for each card you've cycled or discarded this turn",
  "when you discard ~" (Bartered Cow); Ward—Discard a card at random and other ward costs (sacrifice, blight).
- Cycling: Astral Slide's "you may exile target creature. If you do, return that card at the beginning of the next end
  step", Decree of Justice's "you may pay {X}" when cycled, Gavi's alternative cycling cost.
- "Assigns no combat damage" after a destroy or gain control (Floral Spuzzem, Goblin Vandal, Kukemssa Pirates) and on
  Auras ("the first creature", Laccolith Rig, Farrel's Mantle); Gaze of Pain.
- Opening hand: revealing cards (the Chancellors, Gemstone Caverns' luck counter, CR 103.6b). Role tokens and Walker
  tokens (CR 111.10d, 111.10j-r). Shalai's "you, planeswalkers you control, and other creatures you control have
  hexproof"; protection or hexproof for players from a source other than "you have".

- Support X (The Crowd Goes Wild); converge in a cast trigger's "that spell" (Magmablood Archaic); "You draw X cards
  and lose X life" (Painful Truths).
- Firebending granted or on tokens ("gains firebending 2", "a token with firebending 1"), "whenever you firebend".
- Tap costs: "Tap X untapped creatures", land subtypes (Gates, Deserts), "artifacts and/or creatures".
- The Ring: Ringwraiths' "When the Ring tempts you, return this card from your graveyard", "your Ring-bearer's
  power", "protection from Ring-bearers", Aragorn's counter choice; legendary names shortened without a comma
  ("Galadriel", "Samwise", CR 201.5c) aren't recognized as the card itself yet.
- Phasing: "any number of target", "phases out until ~ leaves the battlefield" (Oubliette, The Moment), "can't phase
  in", "whenever ~ phases in or out", Teferi's Protection; flavor words before an ability ("Teleport —", CR 207.2d).
- Dungeons: "venture into the dungeon" (Lost Mine of Phandelver, Dungeon of the Mad Mage, Tomb of Annihilation) stays
  unsupported until every room of those three is modeled (Tomb's "unless" rooms, the Mad Mage's last rooms); only
  Undercity and the initiative work. Dungeoneer's Pack's compound sentence. "Completed a dungeon" conditions.
- Blitz and warp with non-mana costs; cards that care about warped or plotted cards ("void", "if it was warped").
  Reconfigure with non-mana costs. Transforming anything but an Incubator token (double-faced cards).
- Restricted mana: "of the chosen type" (Cavern of Souls, Secluded Courtyard), "and that spell can't be countered",
  "spells with {X} in their mana costs", "multicolored", "with flashback from a graveyard", cumulative upkeep, "an
  ability of a [type] source or a [type] spell" lists with three or more types, mana added by an enters trigger
  (Eager Flameguide, Boommobile), unlocking doors and turning face up.
- "Creatures your opponents control enter tapped": a permanent that enters at the same time as the one with the
  ability is treated as entering after it (CR 614.12 says it isn't affected).
- Clash: "whenever you clash" / "whenever you win a clash" triggers, "clash with defending player" (Marvo), Hoarder's
  Greed's "repeat this process", Whirlpool Whelm's "instead". Bots always clash with the next opponent in turn order.
- Endure on a compound sentence ("you lose 1 life and ~ endures 1"), "enters or attacks" triggers, Pay X life costs.
  Bolster with "differently named" counts. Melee on Lieutenant ("as long as you control your commander, ... have
  melee").
- Threshold activated abilities with "Activate only if there are seven or more cards in your graveyard", threshold
  granting quoted triggers, "choose a color" inside a threshold "If" sentence.
- Assist: bots never ask for or give help (everyone else is an opponent). Gang Up's "power X or less" target.
  Assist kicker (All-Star Kicker) and team-play cards.
- Attack taxes other than "{N} for each creature they control that's attacking you": domain X (Collective
  Restraint), "{1} for each of those creatures" (Dáin, Summon: Yojimbo), only nonblack creatures (Elephant Grass),
  costs to block.
- Blocking: "can't block creatures with power greater than ~'s power" (Spitfire Handler), "equal to or greater than
  the enchanted creature's toughness" (Ironclaw Curse), "unless you pay" (Hipparion), affected groups like "creatures
  your opponents control without flying or reach" (Sidar Kondo); lures with a filter ("All Walls able to block",
  Talruum Piper) or a condition (Seton's Desire).
- Untapping during other players' untap steps with color pairs ("green and/or blue", Murkfiend Liege), a condition
  (Quest for Renewal) or granted to a land (Urban Burgeoning).
- Top or bottom of a library for spells and graveyard cards (Aether Gust, Endless Detour, Subtlety) and for several
  objects at once (Aetherspouts).
- "Whenever a creature is dealt damage" (Death Pits of Rath, Shriveling Rot), "becomes tapped or is dealt damage"
  (Cryoshatter). Old-Growth Troll and Harold and Bob (they return as Auras). Mayhem without a cost (a land, CR
  702.187c). "You recruit" after a cast trigger (The Queen of Dale), "if that spell's mana value was 2 or less, recruit".
- Mana: "add N mana in any combination of colors" from a spell or trigger; mana that stays ("until end of turn, you don't lose this mana");
  Rite of Flame's count. Bots cast rituals only when the mana lets them cast a card they couldn't otherwise.
- Other "cast this spell only ..." restrictions (only "if you've cast another spell this turn" is supported).
- Land types (CR 305.7): a shock land's "you may pay 2 life" is still asked under Blood Moon (it has no abilities
  then, so it should just enter tapped); copy effects of lands under a land-type effect; "doesn't untap" for one
  enchanted permanent with "loses all abilities" (Stop Cold); Winter Orb ("players can't untap more than one land").
- Granted flashback is only "until end of turn" with the card's mana cost (Snapcaster Mage, Past in Flames); a
  static grant (Lier, Disciple of the Drowned) and Mission Briefing's "you may cast it this turn" are not modeled.

## Later

- Proper legend-rule choice, the 903.9 commander choice.
- Deck builder using the full card database, with rulings in the card preview.
- Better bots, then online play (the engine runs on a server; clients send actions).
