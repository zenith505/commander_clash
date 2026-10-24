# Roadmap

23,840 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Most played (EDHREC rank): top
1,000: 992 of 992 (100%), top 2,000: 1,989 of 1,989 (100%), top 5,000: 4,647 of 4,988 (93%).

Since round 89 (Oct 20 2026) rounds take cards in popularity order: `npm run popular` lists the most played Commander
cards that don't play yet, most played first, with the lines that block each one (EDHREC rank from
`data/popularity.json`; `npm run popularity` rebuilds it from the Scryfall extract). Each round starts at the top of that
list and groups cards that share a mechanic. There is no stopping point (Ken, Oct 20 2026: "Popular, no stop"): rounds
go on in popularity order until every legal card plays. `npm run blockers` still shows how many cards each missing
line blocks.

## Ken's standing instructions

- Keep going round after round until the plan is done; no need to ask before each round.
- Skip cards that aren't legal in any format.
- Don't guess on complex cards: research the rules and rulings first.
- Infinite or long loops: shortcut them like paper Magic (CR 732): propose a loop and a number of iterations,
  others accept or stop it earlier.
- A UI polish pass comes at the end. Don't reorder the game log (Ken rejected that).
- Each round clicks through the prompts and buttons it adds with a browser test (`npm run e2e`, Ken, Oct 15 2026).

## Next rounds

00. Most played first (`npm run popular`). Out after round 143, most played first: Encroaching Mycosynth (it changes
   the types of cards in every zone and of spells), Hushbringer (no rulings model yet for "dying doesn't cause
   abilities to trigger" with leaves-the-battlefield batches and look-back), Chaos Dragon, Swift Reconfiguration,
   Selvala's Stampede, Mana Echoes, Unfinished Business, Champions of the Perfect, Bag of Holding, Altered Ego,
   Tezzeret, Betrayer of Flesh, Alania, Divergent Storm, Spell Stutter, Nicol Bolas, Dragon-God; Wildfire Devils and
   Arcane Proxy too. Smaller gaps from round 143: bots sacrifice to Scavenger's Talent only when the best creature
   card in their graveyard is worth more than the creatures they'd give up; what happens to Palace Jailer's
   exiled creature once the Jailer's controller has left the game isn't modeled (no rulings on it).
   Smaller gaps from round 142: mana spent only on costs that contain {X} (Elementalist's Palette,
   Rosheen Meanderer, Nexos) can't pay a cost with {X} asked for as a spell or ability resolves (Condescend's "unless
   its controller pays {X}") or a special action's; Unsettled Mariner doesn't trigger when a spell's target is changed
   to you or your permanent; Vivien's −2 puts the rest on the bottom in the order they were looked at; bots cast Reins
   of Power only in their own first main phase, at the opponent with the strongest army, and Slippery Bogbonder's bot
   moves only harmful counters (onto an opponent's creature). Karazikar's "whenever an opponent attacks another
   one of your opponents" has no rulings on planeswalkers and battles, so it stays out. Prowl cards still out for other
   lines: Earwig Squad (search an opponent's library for three cards), Knowledge Exploitation, Noggin Whack, Notorious
   Throng (the damage dealt to your opponents this turn), Stinkdrinker Bandit, Auntie's Snitch. Smaller gaps from round
   141: Metalworker's buttons reveal the first artifact cards in your hand (you choose how many, not which: the mana is
   the same); with two Mystic Reflections waiting, they apply in the order they resolved rather than the entering
   creature's controller choosing (CR 616.1); bots cast a spell for its prowl cost whenever they can and it's cheaper,
   and cast Mystic Reflection only as an ordinary targeted spell; proliferate (now also "X times", Tromell) still
   gives every counter it can without asking. Smaller gaps from round 140: Jegantha's and the Wellspring's mana that can't pay generic
   costs pays only colored symbols of its own color (with Chromatic Orrery-style "spend as any color" it still doesn't
   pay a symbol of another color), and with two hybrid symbols the payment picks them greedily, one at a time; the
   autopay's rainbow and "hopes" heuristics ignore that restriction; bots answer Ghostly Dancers' choice with the first
   one that can be done (return the enchantment card), always put a land with Hakbal when they can, and unlock the door
   with the highest mana cost; "you may return a card from your graveyard to your hand. If you do, ..." with no such
   card is now skipped without asking, as "you may discard a card. If you do" with an empty hand already was. Smaller gaps from round 139: bots use Rikku's Steal in
   their second main phase (its evasion is then wasted that turn), and only when the opponent's creature they'd pick
   has a counter that helps; bots give Yes Man away and use Bucknard's Everfull Purse and Hithlain Rope whenever they
   can; "the player to your right" is the one before you in turn order (CR 101.4: turn order goes to the left).
   Smaller gaps from round 138:
   bots dredge a land card (The Necrobloom) only with no land in hand and fewer than seven lands out; bots keep Victory
   Chimes' {C} for themselves (another player's mana never helps a bot, there are no teams); bots choose Bane of the
   Living's X by trying each X on a copy of the game, but join forces amounts and Aurelia's Vindicator's X are still
   rules of thumb. Smaller gaps from round 137: bots turn Aurelia's Vindicator face up with X the number of targets
   they'd pick; in join forces an opponent's bot keeps the mana for its dearest instant or flash card, and bots pay no more than what finds them cards (draws, their own
   mills, basic lands), all they can for Liege of the Hollows; Mnemonic Deluge's copies are cast one after another;
   bots flicker with Another Round only their own nontoken, noncommander creatures with an enters trigger (or face
   down, or entering with counters) that have no counters or Auras on them. Smaller gaps from round 136: bots exile
   Mardu Siegebreaker's creature with an enters ability (never a commander or a token), and take Angel of Serenity's
   targets from opponents' creatures and their own graveyard only; the Second Doctor's opponents' bots draw unless its
   controller is the only opponent they have left. Smaller gaps from round 135: bots use Doubling Cube only for a plan of eight or more land taps that ends
   in one spell or ability (not with convoke or improvise). Smaller gaps from round 134: Astarion's Thirst has no rulings
   and follows CR 608.2h and 903.9a (a commander exiled this way is still in exile as it resolves). Smaller gaps from round 133: "put your
   choice of a +1/+1 counter or ..." with "up to one" target still asks which when no target was chosen; Yennett's "if
   its mana value is odd" is out. Smaller gaps from round 132: bots choose Selective Obliteration's color by the worth of their own one-color
   permanents and take Atraxa's cards one at a time, the first that fits. Smaller gaps from round 131: Thundermane Dragon checks a creature card's printed
   power (a */* card counts as 0); with several "cast from the top" permissions the one that gives haste is used;
   Hoarder's Overflow ("When ~ enters and whenever you expend 4"), Blood Operative and Council's Deliberation
   ("whenever you surveil, if ~ is in your graveyard") are out; bots answer Zada's copy order with the first creature
   offered. Smaller gaps from round 130: Laboratory Maniac is taken over Out of the Tombs when both would replace a draw
   (no choice between the two, CR 616.1), and bots return the creature card with the highest mana value;
   Thought-String Analyst (face down), This Is How It Ends, Hunted by The Family, Missy, Midnight Crusader Shuttle,
   Genesis of the Daleks and Danse Macabre are still out. Smaller gaps from round 129: Zirda's companion condition is still
   ignored (companions play as normal cards); bots pick the villainous option that looks cheaper to them by a rough
   count, never cast Doomsday, and take the costliest card for Lord of the Void and Necromantic Selection. Smaller gaps from round 128: bots take
   Orzhov Advokist's counters unless its controller is the only opponent they could attack, and always reveal for
   Counterbalance; "untap a creature you control" (White Plume Adventurer) offers only the tapped ones, or none;
   Songbirds' Blessing asks before choosing the Aura's host. Smaller gaps from round 127: bots use Demon of Fate's
   Design's life cast only while they'd stay at 15 life or more. Smaller gaps from round 126: with two commanders, Geode Golem asks which one first, then
   whether to cast it; bots choose Pippin's card type from the opponent's spell or ability on the stack, else creatures;
   Bane of Bala Ged's pick prompt reads "click 2 (permanent) of yours". Smaller gaps from round 125: bots sacrifice for
   Fandaniel when the loss is at least a quarter of their life, or at least 4 with a creature worth 3 or less; Strong
   Back's reductions apply to the equip or Aura spell's first target only; Tezzeret, Master of the Bridge's affinity is
   a cost reduction from Tezzeret, not a keyword on the spells; Godo's "untap it and all Samurai" untaps in two steps
   (nothing can happen between them). Smaller gaps from round 124: Chandra, Flame's
   Catalyst is still out (Emet-Selch's "cast target card from your graveyard" works only for a whole line); Abdel Adrian
   and Glorious Protector ask what to exile even when they've already left the battlefield (nothing is exiled then); bots
   give Xantcha and Captive Audience to the opponent with the least life; goading is handled as a layer 6 effect, so
   "goaded creatures" (Bothersome Quasit) waits on the goad as a dependency (CR 613.8). Smaller gaps from round 123:
   "unless you waterbend" (Waterbending Lesson), waterbend {X} costs, "whenever you waterbend" (Avatar Aang), Watery Grasp
   and Aang's Iceberg (other lines) are out; you don't pick what waterbend taps: autopay pays mana first, then taps what
   makes no mana, noncreatures, then the smallest creatures (as for improvise), for ward—waterbend and spells too; bots
   don't waterbend with creatures that could still attack this turn; a draw an opponent's Notion Thief replaces isn't
   offered Underrealm Lich's replacement too (CR 616.1); a token doubler with Yenna attaches every Aura token copy to the
   same chosen permanent. Smaller gaps from round 122: Veteran Bodyguard and Weathered Bodyguards are out; autopay
   never forages for mana (on purpose: what to forage is the player's choice; bots do); "you may forage. If you do"
   (Bushy Bodyguard, Treetop Sentries, Curious Forager) and "whenever you forage" (Corpseberry Cultivator) are still out;
   Nuclear Fallout and the other rad cards with milled-card triggers are out; Alchemist's Gambit, Inspired Idea and
   Lantern Flare (cleave with other lines) are out; Dream Harvest (exile until mana value 5, then cast them free) and
   Rumbling Ruin are out; bots separate Liliana of the Veil's piles by a rough worth of each permanent; bots never cast
   Glorious End and end the turn only with nothing of their own on the stack; Arachne's card types leave out Kindred.
   Arahbo, Inalla, Sahir and The Ur-Sphinx have eminence but other lines keep them out. Smaller gaps from round 120: bots don't plan around The Chain
   Veil or Ichormoon Gauntlet; bots never use One with the Multiverse's free cast to cast a prototype card prototyped;
   the attack screen doesn't pre-filter whom Weathered Sentinels may attack (the engine refuses the others). Smaller gaps from round 119: Zaxara, Geometer's Arthropod, Glava, Nev, Owlin Spiralmancer and
   Elementalist's Palette (their {X} lines) are
   out; mana abilities with {X} don't trigger Unbound Flourishing (they can't be copied anyway). Smaller gaps from
   round 118: Selfless Squire triggers once for each player's batch of prevented damage; bots choose Kozilek, the
   Broken Reality's targets with their general target logic, not by who would gain most.
   Smaller gaps from round 116: bots never use "target creature it's
   blocking" abilities (Tinder Wall, Wall of Corpses, Goblin Snowman; bots activate abilities in their own main phase
   only); bots stop paying Lim-Dûl's Vault life after four looks; round 115's Assault
   Suit, Brass Herald, Alrund, Vigean Intuition, Winding Way, Sages of the Anima and Serra's Emissary (kindred) are
   still out.
   Smaller gaps from round 114: "target player adds two mana in any combination
   of colors" (another player adding it) is out; Quicksilver Fountain (each player floods a land of
   their choice) and Eluge (a cost reduction for each flooded land) are out; Cemetery Illuminator and the other "look at the top card, you may cast it if ..." cards are
   out; Lozhan ("any target that isn't a commander") is out; Knacksaw Clique, Pale Wayfarer, Pili-Pala and Puresight Merrow
   ({Q} with another cost or a mana ability) are out; Moxite Refinery (Remove X counters as a cost) and Subversive
   Acolyte are out; bots never choose Aetheric Amplifier's "each kind of counter you have" mode. Smaller gaps from round
   113: autopay never exiles a creature to Food Chain (choosing what to exile is the player's; bots do use it);
   Urianger Augurelt's Arcanum abilities are out.
   Smaller gaps from round 112: Karn, the Great Creator and Coax from the Blind Eternities only take a card from exile
   (decks have nothing outside the game); "whenever your commander enters" watches the commanders you own; Innocuous
   Researcher, Horn of the Mark and Landroval ("two or more creatures attack a player"), Vivi's Persistence and Endless
   Ranks of HYDRA (graveyard triggers) and We Ride at Dawn (its convoke line) are still out; Multiversal Passage's menu
   asks about paying 2 life before the basic land type (the card chooses the type first; nothing hidden depends on the
   order). Smaller gaps from round 111: the tap picker names its cards in the singular ("click 5 untapped artifact or
   creature of yours"). Smaller gaps from round 110: a bot controlling another player's
   turn (CR 723) makes them do only what they must (no spells, abilities or attacks); Oviya, Automech Artisan is out
   (its "it" lines). Smaller gaps from round 109: bots keep the legend with the most attachments and counters, then
   the non-token, then the oldest. Smaller gaps from round 108: bots choose fame when their best creature has power 2 or less, else
   fortune; Witness Protection's new name counts in rules checks, but the card picture still shows the printed card.
   Smaller gaps from round 107: "Sacrifice A and
   B" costs read only two different single-word types (Jarad); "No more than one creature can attack ~ each combat" is checked for attacks on the planeswalker
   only, and bots move at most that many attackers onto it; "at the beginning of that player's next end step" works for
   a single exiled card (The Eternal Wanderer; no legal card needs more); impending is read only as "Impending N—[mana cost]" on creature cards;
   number words go up to twenty plus thirty, forty and fifty. Smaller gaps from round 106: bots never
   exile cards for the Marches, and pay a Defiler's life only with 20 or more life to spare; bots never activate
   "Return ~ to its owner's hand" abilities (Shigeki, Recurring Nightmare, Krasis Incubation); mana Tecutlan made that's
   still in your pool is spent before other mana of its color, so a permanent spell paid from the pool discovers whether
   or not you meant it to; a granted quoted ability
   names the Class in its description (Druid Class); Return to Dust asks "may" after its second target was chosen.
   Smaller gaps from round 105: Kotis, the Fangkeeper (cast spells with total mana value X from among the exiled cards); bots
   activate Chainer only in their own main phase with an empty stack, five or more cards in hand and a creature card of
   mana value 2 or more they can afford in the graveyard; Valakut Exploration and other "for as long as it remains
   exiled" impulse draws link only when the card has one such exile. Smaller gaps from round 104: bots activate Kozilek, the Great
   Distortion only against spells with mana value 3 or more; The Water Crystal with Bruvac applies the doubling first
   without asking (CR 616.1); Ojer Axonil doesn't raise damage that's already been prevented to 0; Kozilek's X picker
   offers X up to the greatest mana value in your hand even when no spell on the stack has it. Smaller gaps from round 103: experience
   counters play (Meren, Kalemne, Mizzix, Ezuri) but Azula, Daxos, Minthara, Kratos, Katara, Zuko and Kelsien are out
   on other lines; companions can't be used as companions (decks have nothing outside the game; the card plays as
   itself, CR 702.139a); counters of several kinds put at once (All Will Be One with Guide of Souls) are put one kind
   after another, so "whenever you put counters" triggers fire once per kind; Chandra, Torch of Defiance casts the
   exiled card for its mana cost only; Celebrate the Harvest, Surveyor's Scope, Vaan,
   Land's Edge, Leonardo and Stormscale Anarch (other "if the discarded card" variants), Interdict, Bruenor's {0}
   equip. Smaller gaps from round 102: Subtlety; Hithlain Rope (seating left and right); "can't be sacrificed"
   granted to another permanent (Garland, Assault Suit, Jon Irenicus, Stilt-Man, Zurgo); Kindle the Carnage, Forbidden
   Ritual; Agatha's Soul Cauldron lends abilities after every ability-removing effect (no timestamp order against
   "loses all abilities"); a permanent that can't be sacrificed still reads "sacrifices" in some log lines of the effect
   that tried. Smaller gaps from round 101: counter costs on spells (Quilled Greatwurm, Dawnhand); Ancient Imperiosaur, Everything Comes
   to Dust and Knight-Errant of Eos (what convoked them); Nissa's two-sentence "Nth time" branches; Rose Room
   Treasurer, Soulbright Flamekin; Eivor and Sludge Titan ("and/or" after a mill); Spinal Parasite, Brightflame,
   Spiteful Repossession; an exile ability that can't be told apart from the card's other exiles keeps the card out
   ("returns exiled cards it can't link"); bots casting Pitiless Carnage may sacrifice nothing; the bot removing chosen
   counters takes helpful kinds off others' permanents and harmful ones off its own, and never plays around time or
   lore counters. Smaller gaps from round 100: Muck Drubb ("a spell that targets only a single creature"); Forge Anew's free equip only for equip costs that are all mana, and always taken when it
   applies; Kambal copies only the tokens still on the battlefield as its trigger resolves; two grants of "Toxic 1" may
   count once; K'rrik gives no explicit choice to pay life with lands untapped (autopay prefers mana); Notion Thief's
   order against the player's own draw replacements, and several Thieves at once; Trostani Discordant, Not of This
   World; Webstrike Elite and Rampaging War Mammoth (an X from the cycling cost in their targets); the other "you may
   pay {X}. When you do" cards (Halo Forager, Isareth, Rose Room Treasurer, Tester of the Tangential); "can't attack
   unless you control more creatures than defending player" (Goblin Goon, Mogg Toady, Monstrous Hound); Kaboom!,
   Soulfire Eruption ("choose any number of targets. For each of them, ..."). Smaller gaps from round 99: Depala, Azor's other line,
   Bane's and Biomancer's Familiar's other lines, Cadric, The Master, Sliver Gravemother, Spider-Verse and Mirror
   Box (Mirror Gallery and Council of Reeds play: the legend rule doesn't apply); the other tiered cards (Cloud, Ice,
   Tifa, Vincent); Archetypes; "can't attack you" limits by count (Crawlspace, Judoon). With Silent Arbiter's "no more
   than one creature can block" the requirement check only compares blocks that keep to the limit; bots trim attacks
   and blocks to a combat limit (requirements first, then the biggest). "You may pay {X}" offers X up to 40. Chain of
   Smog between bots stops when a hand runs out (bots copy discard Chains only at an opponent with cards in hand, and
   discard for Chain of Plasma only with four or more cards). Smaller gaps from round 98: World at War ("after the
   second main phase"); bots answer Chain of Vapor's copy only with 7+ lands and a target an opponent controls. Smaller gaps from round 97: the other "whenever you put counters" triggers (Orah,
   Kros, Rikku, Captain Marvel, Defiant Greatmaw, Aragorn, Invisible Woman, Riveteers Ascendancy, Kate Stewart's second
   line); "Sacrifice X" in a mana ability (Springjack Pasture), in a spell's text (Nahiri's Lithoforming, Empty the
   Laboratory) or with "reveals the top X" (Lonis), Champion of Stray Souls' graveyard ability; bots never use "Sacrifice
   X" abilities, and always take Tainted Pact's first card; with Narset, Parter of Veils an optional draw is still
   offered (it then draws nothing); "historic" is read for targets, spells and costs since round 98, but "historic" in
   an "or" list (", historic or ...") is still out;
   Tempt with Discovery shuffles each library after each search instead of once at the end (the same result). Smaller gaps from
   round 96: Ugin's Nexus (its "would be put into a graveyard" line), Stranglehold ("can't search libraries"),
   Gerrard's Hourglass Pendant, Gond Gate ("Gates you control"), Neoform ("with an additional +1/+1 counter"), Vivien
   on the Hunt's +1, Elite Arcanist, the
   Plans whose other lines are out (Claim the Kingdom, Political Triumph, Robot Domination, Rewrite History). Who puts
   counters (Vorinclex, Innkeeper's Talent) is the effect's controller; for costs and "enters with" counters it's the
   permanent's controller. With both a doubler and Vorinclex's halving on the same counters the order is picked
   for the player (CR 616.1): halved first for -1/-1, stun and poison counters, doubled first for the rest. Smaller gaps from round 95: Cinder
   Cloud, Intrude on the Mind (counting the cards put into the graveyard this way), face-down piles (Fortune's Favor,
   Riddles in the Dark, Curator of Destinies, Sauron's Ransom, Atris) and piles of permanents (Liliana of the Veil's
   −6, Do or Die, Make an Example), Jace, Architect of Thought's +1 and −8; Tibalt's Trickery compares only the front
   face's name of a modal double-faced spell; "cast this turn" filters (castThisTurn) read the printed card, so
   Maskwood Nexus's creature types for cards off the battlefield don't count there; Conduit of Worlds casts for the
   mana cost only (no alternative costs); bots never flash in Opposition Agent in response to a search, and "the one
   that entered most recently" is read from the permanents' timestamps. Smaller gaps from round 94: "X mana in any combination of colors" with {X} in the cost (Wizard's Rockets)
   or chosen among a few colors (Hazel of the Rootbloom); Triumph of Cruelty (a target in "... if you control the
   creature with the greatest power"); Fastbond and the "you play a land or cast a spell" triggers (Cemetery
   Protector, Infernal Sovereign); bots move Forgotten Ancient's counters only onto an evasive creature of theirs.
   Smaller gaps from round 91 still out: Tail Swipe, Contractual Safeguard,
   Return to Dust (addendum targets), Tergrid ("sacrifices a
   nontoken permanent or discards a permanent card"), Zenith Chronicler ("each other player" meaning other than the
   player who cast the spell). From round 92: "hexproof from" only works for colors, monocolored and multicolored
   (not artifacts, instants, planeswalkers, activated abilities, "each of its colors" or "that color": Jaheira,
   Elenda, Volatile Stormdrake, Tam, Mondo Gecko, Skrelv, Sungold Sentinel stay out); "Tribal" cards still out (the
   data calls them all Kindred now). Bots never cast Donate, Harmless Offering or Bazaar Trader's ability (they would
   only give away their own permanents), never use Lion's Eye Diamond (automatic payment doesn't either), and cast from
   Bolas's Citadel only while their life stays 15 or more. Round 88 leftovers still out: Ob Nixilis of the Black Oath
   and Karn, Living Legacy emblems, Karn, Scion of Urza, Toralf, Death Kiss, Burning-Rune Demon, Emergent Ultimatum,
   Ecological Appreciation, Ormos. Bots never exile a Spirit Guide from their hand for mana (the player can, from the
   hand-card menu; autopay doesn't use it either). Bots don't hold Teferi's Protection for anything but lethal combat
   damage or a board wipe of their own permanents worth 12+ mana value; bots only animate the biggest creature card
   with Animate Dead, and pay Sylvan Library's life only with 30 or more. To check: token creation by Jace-style
   effects may skip token doublers.
0. Cards with faces (CR 709, 710, 712, 715, 722): 486 of the 846 legal ones play now (`npm run faces` lists each
   layout's support and the lines blocking it): 181 of 388 transforming double-faced (all 36 Invasion Sieges),
   109 of 151 adventurer, 78 of 123 split (15 of 28 Rooms), 49 of 98 modal double-faced, 51 of 67 preparation, 18 of
   19 flip. All 14 meld cards play (CR 701.42). No line blocks two faced cards any more: each one left is out on a
   line of its own (`npm run faces`). Still out:
   - Transformers: only Goldbug of the 15 plays; the others each have a line of their own (Starscream needs "whenever
     you become the monarch" and "if there is no monarch", Cyclonus an additional beginning phase).
   - Transform: craft (702.167), "As ~ transforms into ~" (712.20: Curse of Leeches, Ludevic, Sephiroth, Zenos each
     need their own work).
   - Other battle cards still out: Death Kiss ("whenever a creature an opponent controls attacks one of your
     opponents", "becomes monstrous, goad up to X"). Bots don't aim spells at battles (except Portent Tracker's counters
     and "each battle they protect") and attack only their own Sieges. Bots never return their own Dragon with Zurgo and
     Ojutai.
   - Cast triggers left out: "a spell that has flash" (Slitherwisp: flash given by another effect isn't tracked on
     the spell) and "a spell with cascade" (cascade granted by Maelstrom Nexus and others isn't on the spell).
   - Rooms: 13 still out on their doors' own lines.
   - Flip: Sasaya's back face.
   - Meld: bots don't save Hanweir Battlements' mana for its meld ability (they use it for haste). "Twice this turn"
     for loyalty abilities of other permanents (Kaito, Urza Assembles the Titans) isn't supported.
   - Preston, God-Pharaoh's Gift, Ardyn, Hour of Eternity, Dino DNA and Hashaton are blocked on other lines.
   - Still out from earlier rounds: Treacherous Pit-Dweller ("enters from a graveyard, target opponent gains control
     of it"), Leyline of the Guildpact ("each nonland permanent you control is all colors"), Sphinx of the Guildpact
     ("hexproof from monocolored").
   - Readings to check with Ken: Marchesa's "since your last turn" counts from the start of your previous turn;
     "loses all counters" (Final Act) removes poison and energy, the only player counters the engine has; Lazotep
     Convert and Body Double list creature cards in every graveyard.
   - Bots don't plan around day and night (casting two spells to make it day). Bots put lands on the bottom with
     Valakut Awakening only when they have five or more lands out, and spells that cost more than their lands plus two.
1. Mechanics that appear on many cards but are blocked as a group (`BY_COUNT=1 npm run blockers`).
   Left from rounds 87 and 88 (emblems, tap any number, excess damage, different names):
   - Emblems still out: emblems with activated abilities (Ob Nixilis of the Black Oath, Karn, Living Legacy: they need
     activating from the command zone and a button for it), Ral's storm on spells. Karn, Scion of Urza (an opponent
     chooses, then silver counters in exile) and Karn, Living Legacy's "pay any amount of mana".
   - Excess damage still out: Toralf ("any target other than that permanent"), Vikya ({Q} costs).
   - "It" in a cast trigger is the spell only as the first instruction ("Whenever you cast an Elf spell, it gains
     haste"); "untap ~. It gains ..." (Pristine Skywise, Bloodsky Berserker) is about the permanent and isn't parsed.
   - Tap any number still out: as an additional cost (Burn at the Stake, Explosive Singularity), "each player may tap"
     (Raiding Party), "If you do, ... each of those Vampires" (Urge to Feed). Bots tap every creature offered except,
     on their own turn before combat, ones that could still attack.
   - "With different names" still out: Emergent Ultimatum and Ecological Appreciation (an opponent chooses cards to
     shuffle back, then casting or putting the rest), Burning-Rune Demon ("exactly two cards ... that have different
     names"), discard costs (Ormos).
   Left from the power-up and mutate round (CR 702.193: Brave Brawler, Hulk, Wonder Man, Iron Fist; CR 702.140, 730:
   Gemrazer, Huntmaster Liger, Snapdax, Nethroi, Mindleecher):
   - Power-up still out: Kang (extra turn), Loki (short name), Quicksilver ("in your opening hand"), Stature and Viv
     ("if its power is ..."), Thanos (odd or even), Nick Fury (double-faced). Wonder Man's extra activation is added
     once per Wonder Man you control (no rulings yet). "Put a +1/+1 counter and an indestructible counter on it" is
     two counter events one after the other, not one.
   - Mutate still out: Archipelagore ("up to X target creatures"), Auspicious Starrix and Illuna (exile until X
     permanent cards / a nonland permanent card), Brokkos (cast from your graveyard using its mutate ability, also
     Nethroi-style permissions "using its mutate ability"), Everquill Phoenix (a Feather token whose quoted ability says
     "~"), Otrimi ("creature card with mutate"), Parcelbeast (look at the top card, a land onto the battlefield),
     Vadrok ("you may cast target noncreature card ... without paying").
   - Merged permanents: no effect in the engine turns a merged permanent face down (CR 730.2f; mutating onto or under
     a face-down creature and turning it face up work); a merged permanent with an instant or sorcery card, flip and
     double-faced components (730.2h-j) and stickers aren't handled. The owner isn't asked for the exile timestamps of
     its cards (730.3b): nothing in the engine reads an exiled card's timestamp, so the order can't be seen. "The second card from the top" of a library a merged permanent went to isn't asked for. A
     merged token with card components under a "card" replacement (730.3e) is treated like any other merged permanent.
   - Bots put the bigger body on top and cast a mutate creature for its mutate cost only when its mana cost is out of
     reach.
   Left from the round after mutate ("up to N" divided targets, merged cards leaving together, "becomes untapped"):
   - "Becomes untapped" still out on other lines: Arbiter of the Ideal (manifestation counters), Daring Thief and
     Disciple of Deceit, King Macar, Fishing Pole, Ghostly Pilferer; "become untapped" for two (Tui and La); "during
     your untap step" (The Ninth Doctor).
   Left from the round after backgrounds (the last five Backgrounds, kinship with last-known types, Leaf-Crowned Elder,
   Adeline's planeswalker choice, tempting offers, airbend and "its owner may cast it" exiles, Nalfeshnee):
   - Granted myriad's tokens still attack the player only, not a planeswalker.
   - Tempting offers: each accepting player's part runs one after the other, not at the same time (it matters only
     with triggers that care about batches). Their choices stay open and in turn order (CR 101.4b, Tempt rulings), not
     hidden like Show and Tell's. Bots always accept: accepting never leaves a bot behind the other opponents, and the
     offerer gets only what the bot also gets. Still out: Tempt with Discovery ("who searches a library this way"),
     Tempt with Mayhem (copies), Braids, Fandaniel, Wernog, The Second Doctor ("who doesn't"), Step Between Worlds and
     Turtles in Time ("each player who does draws seven").
   - Granted persist and undying (Haunted One) are abilities, not keywords: "creatures with undying" doesn't see them.
   - Airbend still out: Aang, Airbending Master ("another target creature"), Airbender Ascension and Avatar's Wrath
     (other lines). Suspend Aggression and Elite Spellbinder ("its owner may play it until the end of their next turn",
     "look at target opponent's hand. You may exile a nonland card from it"), Extraordinary Journey.
   - Choreographed Sparks ("this spell can't be copied").
   Left from the round after tempting offers (Show and Tell's hidden picks, "each player may search / scry / draw",
   "any player may activate this ability", "any player may ... If a player does / If no one does", Scion of Halaster's
   replacement order, Adeline with a token doubler):
   - Bots never activate another player's "any player may activate" abilities, and the UI's auto-pass doesn't stop for
     them (click the permanent to open its menu). Those with {T}, mana abilities, graveyard or hand abilities, or costs
     that sacrifice or exile the permanent stay unsupported, as do Temporal Extortion (half your life), Truce, Shah of
     Naar Isle, Carrion Rats and Wurm, Mana Cache, Xantcha, Casey Jones, Glittering Lion and Lynx, Volrath's Dungeon,
     and Kaya's -3.
   - "Any player may ...": the chosen actions all happen after everyone has chosen. Shivan Wumpus's ruling has each
     one happen as it's chosen; the outcome is the same for the supported cards.
   - Kwain's "each player who drew a card this way" counts those who chose to draw, even from an empty library.
   - Hypergenesis and Eureka (each player in turn puts a card in, again until no one does) are still out: their cards
     enter one at a time, and as-enters choices wait until the spell finishes resolving.
   Left from the round after Show and Tell (Alhammarret's Archive and dredge in either order, Grand Abolisher, Living
   Death, Parallax Wave, Memory Jar, life swaps, Glacial Chasm, Terminus, Bonfire of the Damned, "each other opponent",
   a trigger's creature as the damage source, Steel Golem and Nikya, Rites of Flourishing, Curious Obsession):
   - Life swaps still out: Heart of Bogardan, Spirit of Resistance.
   - "You can't cast" variants other than creature or noncreature spells are still out. Ward costs still out: discard
     a card at random (Alpharael), discard a card of a kind (Saruman of Many Colors), "discard a card or pay {2}"
     (Titania), blight, collect evidence, poison counters; most of these cards have other lines that are out too.
   - Bots cast Living Death, Terminus and Memory Jar by their usual rough value, without weighing whose creatures or
     hands they help.
   Left from the round after Living Death (last-known power for intervening-if checks, last-known "can't be
   prevented", life swaps that use the difference, ward costs with life or a sacrifice, Kosei, Human Torch, Parapet
   Thrasher, "target opponent exiles a card from their hand", "Cowards can't block Warriors", "target creature can't
   block ~ this turn", Electric Eel):
   - Exiling from hand still out: "you may play that card" or face down (Fiend of the Shadows, Kheru Mind-Eater,
     Lightstall Inquisitor), "until ~ leaves the battlefield" (Intellect Devourer), Arcane Artisan, Ashiok's -3, Muse
     Vessel's second ability, Karn Liberated's -14, Ruthless Negotiation ("if ~ was cast from a graveyard"). Bots
     exile the cards they'd discard, without weighing that exile loses graveyard value they don't have anyway.
   - Bots decide Human Torch's and The Thing's "you may pay {R}{G}{W}{U}" with the usual "may pay" check, not by
     what it would do.
   - Mill costs: Charmed Pendant ("the milled card's mana cost") and The Warring Triad ("target player adds") are
     still out.
   - Bots don't use "target creature can't block ~ this turn" (Duct Crawler, Spin Engine) or the Intimidators'
     "becomes a Coward" on purpose: they value them by the usual rough check.
   Left from the voting and storage lands round (CR 701.38: Council's Judgment, Coercive Portal, Tyrant's Choice,
   Brago's Representative, Illusion of Choice; storage lands like Bottomless Vault and Calciform Pools, depletion lands
   like Hickory Woodlot and Land Cap):
   - Votes still out: Tivit ("enters or deals combat damage"), Council Guardian (protection from the colors with the
     most votes), Split Decision ("Choose target spell", then "the spell"), Messenger Jays ("for each card drawn this
     way"), Sail into the West, Galadriel, Expropriate, Fateful Tempest, Selvala's Stampede, Travel Through Caradhras;
     votes for a player (Mob Verdict, Círdan), Trap the Trespassers, Truth or Consequences ("an opponent at random");
     the Sagas Vault 11 and Trial of a Time Lord; "whenever players finish voting" (Grudge Keeper, Model of Unity,
     Erestor: an opponent counts only if none of their votes match yours, rulings); Elrond; the Planechase "Will of the
     Planeswalkers" cards.
   - Bots vote by a rough count of what each choice does for them (bot-votes.ts), and always take an optional extra
     vote.
   - Storage lands still out: Crucible of the Spirit Dragon (X mana in any combination of all five colors: too many
     buttons), City of Shadows ("Exile a creature you control" cost); Decree of Silence and Force Bubble (depletion
     counters as a trigger's or replacement's count).
   - Autopay and bots take one storage counter at a time from a storage land (never more than a payment needs, so
     a bigger amount is only from the land's menu); a bot keeps Bottomless Vault-style lands tapped until they have
     three counters, and doesn't use "{1}, {T}: Put a storage counter" on purpose.
   Left from the card names round (CR 201.4: Meddling Mage, Pithing Needle, Cabal Therapy, Memoricide, Surgical
   Extraction, Conjurer's Ban, Reflector Mage, Kindle):
   - The names offered are those of the cards in this game, so typing in the picker can show a name that's only in a
     hidden library; a name from outside the game can't be chosen (it would do nothing here). The picker's first list
     shows only cards you've seen.
   - Still out: "if they can't" (Brain Pry), damage per revealed card (Thought Hemorrhage), "put all of them with that
     name into your hand" (Desperate Research, Wood Sage, Tamiyo), Academic Probation's other mode, the chosen card
     from a revealed hand (Lobotomy, Shimian Specter, Pick the Brain, Reap Intellect), Deadly Cover-Up, Deicide ("if the
     exiled card is a God card"), Invasive Surgery, Kotose, "look at an opponent's hand, then choose any card name"
     (Sorcerous Spyglass, Anointed Peacekeeper), Alpine Moon, Skyseer's Chariot, Cheering Fanatic, Null Chamber, Booby
     Trap, Petrified Hamlet, names another player chooses (Conundrum Sphinx, Petra Sphinx, Vexing Arcanix), random
     cards from an opponent's hand (Dementia Sliver, Nebuchadnezzar), Isperia, Mindblaze, Liar's Pendulum, Lammastide
     Weave ("its mana value"), "an additional ... for each card named ~" (Growth Cycle, Rune Snag), "as you cast ~"
     (Aether Burst), Sound the Call.
   - Bots name what they've seen: an opponent's commander or permanent for a ban, a graveyard card for Memoricide, the
     most common card in their own library or hand for a guess.
   Left from the Roles/modified/can't be regenerated/equip round:
   - Role cards still out on other lines: Not Dead After All, Faunsbane Troll ("sacrifice an Aura attached to ~"), Kestia ("an
     enchanted creature or enchantment creature"), Seeds of Innocence-style "the controller of each of those".
   - "Can't be regenerated" still out: Purge ("artifact
     creature or black creature"), Mageta ("except for ~"), The Abyss ("of their choice"), Scorching Lava (kicked
     "that creature"), Whippoorwill, Runesword.
   - Equip still out: equip planeswalker, "Equip worthy"; bots never use an equip
     cost that sacrifices a creature (Demonmail Hauberk), only the human player does.
   - "It" after returning a card works for one target or "return ~"; "return up to N target ... Put a counter on each of
     them" and several cards don't.
   Left from the dungeons, punishers, once-each-turn and Classes rounds:
   - Batch triggers ("whenever one or more ...", CR 603.2c) still out: "for the first time each turn" on cards put into
     a graveyard (Crawling Sensation), irregular plurals ("Mice"), "experience counters", "with base power and
     toughness N/N", decayed tokens (Ghoulish Procession), "entered from a graveyard", and anything about the moved
     cards as a group ("those cards", "one of them", "the greatest mana value among them").
   - Venture still out on other lines: Wandering Troubadour ("if you had a land enter this turn"), Ranger's Hawk ("tap
     another untapped creature you control" as a cost), Immovable Rod, Intrepid Outlander (pack tactics), Radiant
     Solar, Fifty Feet of Rope, Dungeon Delver (granting Hama Pashar's ability to commanders), Keen-Eared Sentry,
     Dungeon Crawler, Ellywick's "differently named dungeon" count.
   - "If you've completed a dungeon" inside an effect still out: Caves of Chaos Adventurer (a free play of the exiled
     card), White Plume Adventurer ("untap a creature you control").
   - Punishers still out: "unless they discard a nonland card" (Bandit's Talent, Compulsive Research, Wrench Mind),
     "sacrifices a permanent unless they discard" (Possessed Portal), "another nonland permanent" (Torment of Venom),
     "that many permanents" (Archfiend of Spite), "any number of times" (Forbidden Ritual). Rottenmouth Viper's
     trigger works; its "sacrifice any number of nonland permanents, costs {1} less for each" additional cost doesn't
     (it needs a picker when casting). The same "sacrifice any number of X, then that many" shape blocks Pitiless
     Carnage, Renounce, Reprocess, Scapeshift, Malevolent Witchkite, Mana Seism and Lich-Knights' Conquest.
   - Classes (CR 716) still out on other lines: Cleric Class's level 3 ("you gain life equal to that creature's
     toughness"), Warlock Class ("the life they lost this turn"), Paladin Class ("during your turn" cost increase),
     Fighter Class ("blocks it this combat if able"), Leader's Talent ("if it had a counter on it"), Gourmand's Talent
     ("for the first time each turn"), Bandit's Talent, the Stormchaser Otter token ("blue and red ... with prowess").
     Copying a Class doesn't copy its level (716.2b); no supported card copies one yet.
   - "Unless" conditions still out: "an opponent has 10 or less life" (Vampire Lacerator) and other conditions the
     static parser doesn't read.
   Left from the batch triggers, channel and graveyard round:
   - "That many basic land cards" (Settle the Wreckage) is still out.
   - "You may cast this card from your graveyard" works with a condition or extra costs; still out: "or from exile"
     (Squee, the Immortal), "but not from anywhere else" (Haakon), "if a creature not named ~ died this turn"
     (Ebondeath), "and/or" in its cost (Demilich), "rather than paying its mana cost" (Worldheart Phoenix, Scourge of
     Nel Toth), "using its blitz / bestow / mutate / warp ability".
   - Exiling from a graveyard: one player's choice works; "each player exiles a card from their graveyard" (Augusta),
     "any player may" (Carrion Rats), and "If it's a creature card" after it (Graveyard Shovel) are out.
   - Triggers still out: "When ~ enters and whenever ..." (Exuberant Fuseling), "another creature you control or a land
     you control" (Long Feng), "they create a Treasure token" (Pain Distributor), "Players can't play lands"
     (Territorial Dispute). "Return a card from your graveyard to your hand" inside modes (Gix's Command, Kairi) and
     "You return ..." (Dark Intimations, Cruel Ultimatum) are out.
   Left from the Field of Ruin, crime, discover and suspect round:
   - Bots never use an "Exile ~" cost (Relic of Progenitus, Feldon's Cane), as with sacrificing their own permanent.
     "Equip—Pay {3} or discard a card" (Bloodthorn Flail) is two equip abilities, one for each cost.
   - "Add {B} or {G} for each" (Culling Ritual), Deadly Tempest's "each player loses life equal to the number of creatures
     they controlled that were destroyed this way".
   Left from the Cases round (Cases, enters with a number of counters, dies-return tapped, several cards entering
   together, "can't be the target of"):
   - Cases (9 of 13 legal supported) still out: Burning Masks ("Choose one of them. You may play that card this turn"),
     Gateway Express ("Each creature you control deals 1 damage to that creature"), Pilfered Proof ("turned face up", a
     Clue in its token replacement), Uneaten Feast (granting "You may cast this card from your graveyard"); Case File
     Auditor's "When ~ enters and whenever you solve a Case" (the engine has a "solved" event for it).
   - "Enters with a number of counters equal to" still out: "three minus X" (Slumbering Trudge), Ulamog; Kurbis, Marath,
     Dyadrine and Gyrus are blocked on other lines.
   - Dies-return still out: Not Dead After All, Vincent's Limit Break, Phytotitan ("at the beginning
     of their next upkeep").
   - Several cards from among the top ones: "with total mana value N or less" (Ao, Michelangelo's Technique, Smelting
     Vat), two destinations in one sentence (Bounty of Skemfar, Wakanda Forever!), "tapped and attacking" (Arthur, Jet,
     Winota, Owlbear Cub), "where X is" in the look (Ajani Outland Chaperone, Famished Worldsire, Emergent Woodwurm), the X
     of an enters or cast trigger (Knickknack Ouphe, Genesis Hydra), exiled top cards (Xenagos, Tezzeret), "that many
     cards" (Gishath), "If you put fewer than two lands" (Expand the Sphere), "land and/or legendary permanent cards"
     (Kamahl's Druidic Vow), "When a creature is put onto the battlefield this way" (Vivien's Invocation, Gilgamesh).
   - "Can't be the target of" still out: "unless it attacked or blocked this turn" (Lurker), "can't be enchanted by other
     Auras" (Anti-Magic Aura), Wall of Shadows.
   Left from the snow-mana rounds (snow mana, mana that remembers its source, "was spent", sacrifice the rest):
   - Autopay doesn't try to spend mana from creatures for Inga and Esika, or a single color for Steel Exemplar.
   - Snow: all 45 legal {S} cards are supported. Mana Reflection and Nyxbloom Ancient multiply mana as a replacement
     effect while a {T} mana ability resolves (CR 106.12b); other "produces ... instead" replacements (Contamination,
     Infernal Darkness, Pulse of Llanowar) are out.
   - "Each player chooses ..., then sacrifices the rest" still out: Natural Balance, Promise of Loyalty's vow counters,
     Stick Together's party, Single Combat's "can't cast creature or planeswalker spells until the end of your next
     turn".
   - "Return a creature card from your graveyard to the battlefield" (chosen, not targeted) works, also for each player
     (Exhume, Crypt Champion); still out: Infernal Offering (its other part), "at random"
     (Moldgraf Monstrosity, Tomb Tyrant), "with total mana value N or less" (Lively Dirge), "where X is ..." outside a
     spell's own count, and cards blocked on other lines (Tayam, Tyvar, Sauron).
   Left from the round after Cataclysm (distribute, step-by-step becomes, Cover of Winter, flavor words, Threaten,
   Balancing Act, exhaust and boast):
   - Distributing counters as it resolves works for "among any number of creatures you control"; still out: Crashing
     Wave (waterbend {X}, stun counters among tapped creatures your opponents control).
   - "Becomes" without a duration works on ~ itself; still out: Tenth District Hero ("named Mileva").
   - Threaten's "untap ... and gain control of it" works; still out: Temporary Insanity's target filter, Spinal
     Embrace (sacrifice "if you do").
   - Exhaust and boast abilities work, exhaust mana abilities too (CR 702.177a, 702.142a), and Elvish Refueler; still
     out: the "whenever you boast / activate an exhaust ability" triggers.
   - Gained abilities in quotes that end a sentence before "until end of turn" (`gains "... draw a card." until end of
     turn`) are split in two by the sentence splitter, so such cards stay out.
   Left from the round after Balancing Act (exhaust mana, protection from players, "when you lose control of", granted
   cascade, abilities being activated, tokens created this turn):
   - Protection from a player (CR 702.16k) works for "each of your opponents", "the chosen player" and Guardian
     Archon's secret choice; still out: "you and target permanent you control each gain protection from".
   - Cascade given to spells works, "the next noncreature spell you cast this turn has cascade" too; still out: Bigger
     on the Inside (a granted {T} ability that makes another player add mana, then their next spell has cascade),
     Yidris ("as you cast spells from your hand this turn"), Zhulodok ("Cascade, cascade" granted in quotes), Aurora
     Phoenix ("whenever you cast a spell with cascade").
   - "Whenever a player activates an ability that isn't a mana ability" works; "an ability of an artifact they
     control" (Avalanche of Sector 7, which counts mana abilities too) and Artifact Possession are still out.
   Left from the round after mana spent (a discard inside an "if", autopay that avoids harm, skips, keyword and finality
   counters):
   - Keyword and +1/+1 counters count on cards in other zones (CR 122.1b), but printed-card filters (a card in a
     graveyard "with flying") don't see them; no supported card puts counters on a card off the battlefield yet.
   Left from the decayed, Theros gods, reveal-top and same-name round:
   - Decayed still out on other lines: Diregraf Horde ("When you do, exile up to two target cards from graveyards"),
     Ghouls' Night Out, Gisa ("They gain decayed"), Poppet Stitcher,
     Tainted Adversary ("pay {2}{B} any number of times").
   - Gods still out on other lines: Athreos (both), Ephara, Keranos, Klothys, Phenax, Purphoros Bronze-Blooded.
   - "Reveal the top card of your library. If it's a X card, A. Otherwise, B" works for a card type filter and moves
     of "it"; still out: "you may reveal ... If a X card is revealed this way" (Elven Farsight, Galadriel, Isolated
     Watchtower, Urza Assembles the Titans, Doors of Durin, Vesuvan Drifter), "with mana value 3 or less" (Kellan),
     "of the chosen type" (Bloodline Shaman), "it" meaning the source (Harsh Deceiver), amounts from the revealed card
     (Nissa's Revelation, Sapling of Colfenor, Baneful Omen), "repeat this process" (Countryside Crusher), casting it
     (Descendants' Path, Jadzi), several "If it's" lines (Druidic Satchel).
   - "Target X and all other Xs with the same name as that X" works on the battlefield; still out: cards in a graveyard
     (Echoing Return, Rat King), "not named ~" (Detention Sphere), Legion's End's "exiles all cards with that name from
     their hand". (Splinter, Eradicate, Scour, Sowing Salt and Crumble to Dust work since the card names round; The End
     is out on its cost line.)
   Left from the round after suspect (outlaws, conditional flash, discover X, keyword choices):
   - Discover still out: "you may tap two untapped artifacts and/or creatures you control. If you do, discover 3"
     (Caparocti Sunborn), "where X is the greatest power among them" (Aloy), "the mana value of the exiled card" (Ellie and
     Alan). "If you cast it" works on enters triggers only (The One Ring's protection is out).
   - Suspect still out: "you may suspect one of the other creatures" (Frantic Scapegoat), "as long as ~ remains on the
     battlefield, that creature is also goaded" (Hot Pursuit), Nelly Borca's "you and the controller of those creatures
     each draw a card".
   - Crime still out: "exile up to one target black card from your graveyard and copy it" (Kaervek).
   - Conditional flash still out: "five or more mana values among cards in your graveyard" (Graveyard Shift), "two or more
     instant and/or sorcery cards in your graveyard" (spell mastery: Swift Reckoning). "~ has flash as long as" on a
     permanent stays out on purpose (it doesn't work in your hand, CR 113.6e); "This spell has flash" does.
   - "Your choice of" keywords works once per ability, on "gain(s)"; "It gains your choice of" after another instruction
     (Hungering Puppetbeast) is out.
   Left from the spell keywords round (tap or untap, buyback costs, undaunted, gravestorm, splice, awaken, miracle,
   epic, free casts from hand, timing points, overload leftovers):
   - Overload still out: Dragonshift, Fangs of Kalonia, March of Progress, Winds of Abandon, Break the Ice, Rise and Shine, Spectacular Showdown, Eldritch Immunity, Corporeal Projection, Bail
     Out (their "each" lines). Fall of the Titans' Surge {X}{R}. Bots never overload Counterflux.
   - Splice with a cost that isn't mana (Horobi's Whisper, Hundred-Talon Strike, Torrent of Stone, Veil of Secrecy,
     Roar of Jukai), a second splice line, and splice onto a spell with X, modes, kicker, buyback or another
     alternative cost. Memory Crystal ("buyback costs cost {2} less").
   - Miracle: the card is always revealed when it's the first one drawn (revealing is optional in the rules) and the
     cast is offered as the trigger resolves; Bonfire of the Damned and Terminus are out on their own lines.
   - Epic: Eternal Dominion, Neverending Torment, Undying Flames are out on their own lines. Bots cast an epic spell
     only as their last spell in hand.
   - Free casts from hand still out: "mana value 1 or 2", "equal or lesser mana value" (Reinterpret, Press the
     Enemy), "shares a card type" (Counterlash), "where X is ..." (Gandalf, Party Guest, Epistolary Librarian), "once
     during each of your turns" (Zaffai, Vision), named filters (West Coast Expansion's Hero spell).
   - Tap-or-untap variants: Telekinetic Bonds, Tolarian Kraken, Chain Stasis. Berserker's Frenzy ("before combat or
     during combat before blockers are declared"). Arcum's Sleigh and Kjeldoran Guard ("only if defending player
     controls ..."), Grizzled Wolverine's "only if a creature blocks it", Ashen Ghoul's "creature cards above it".
     Coastal Wizard, Lady Sun, Diaochan, Maddening Imp, Norritt, Arcum's Whistle, Blood Frenzy and Berserk are out on
     their other lines.
   Left from the round after cascade ("when you lose control of", face-down exile, attach target Equipment,
   harmonize, paradigm, demonstrate):
   - "When you lose control of ~" works (603.2, rulings on Khârn: leaving the battlefield or a control change; the
     player who lost control controls the trigger). A control change before the first state check of a newly placed
     permanent isn't noticed.
   - Attach target Equipment works (Brass Squire, Kemba, Magnetic Theft and 9 more); still out: Frodo ("with mana value
     2 or 3"), Grip of Phyresis, Weapons Vendor, Barret, Blacksmith's Talent, Captain America, Cloud's other line,
     Noctis, Raubahn (ward-pay life), Sokka Swordmaster.
   - Harmonize (CR 702.180) works on 8 cards; still out: Glacial Dragonhunt, Nature's Rhythm, Synchronized Charge,
     Songcrafter Mage (granting harmonize). Paradigm works on all 5 cards and demonstrate on all 6.
   - Secret choices in triggers (Stalking Leonin, Emissary of Grudges) are out.
   Left from the round after harmonize (Khârn, dice, face-down exile you may play, main phase triggers, more cascade
   grants, exile until a nonland card):
   - Khârn the Betrayer: damage dealt to it by several sources at once is one control change, and the opponent for
     non-combat damage is chosen automatically (the opponent with the most life). Stolen Uniform's "if it's attached to
     a creature you control" is checked only as the trigger resolves.
   - Dice (CR 706) work with results tables, modifiers, "ignore the lower roll", natural results, Pixie Guide-style
     advantage, "roll two and choose one result" (Wild, Reckless and Grave Endeavor; bots take the higher result) and a
     reflexive trigger using the result (Ancient Bronze Dragon) and Valiant and Arcane Endeavor; still out: "roll again" / "reroll" (Delina,
     Pixie Guide's Wyll-style rerolls of others), Iron Mastiff, Chaos Dragon, Neverwinter Hydra, Treasure Chest
     (conditional search), Ancient Brass Dragon, Farideh, Thunderwave ("not chosen"), planar die.
   - Abilities that work only from your graveyard work (Loathsome Troll); bots don't use them.
   - Face-down exile you may play works (Three Wishes, Outrageous Robbery, Intet, Gonti, Rev and 3 more); "mana of any
     type" doesn't cover Phyrexian symbols' life option (they still need their color or 2 life). Three Wishes' upkeep
     cleanup is one delayed trigger per card. Still out: Klaw ("whenever you play a card from exile"),
     Blightwing Bandit, Edward Kenway, Apple of Eden, Predators' Hour, Bloodsoaked Insight.
   - Main phase triggers work for "your first / precombat main phase", "each player's first main phase", "each of your
     postcombat main phases", "your second main phase" and "each of your main phases" (505.1), with mana for other
     players (Belbe, Eladamri's Vineyard, Blinkmoth Urn) and restricted mana (Abstract Paintmage); still out: Carpet of
     Flowers ("up to X mana of any one color"), Monastery Siege, "add mana in any combination of colors" from a trigger
     (Cosmic Crucible).
   - "Exile / reveal until a nonland card" works for casting it now or this turn and for Treasure Hunt; still out:
     damage or +X/-X by its mana value (Erratic Explosion, Kaboom!, Undying Flames, Goblin Machinist), "if the spell's
     mana value is ..." (Bre, Breaching Dragonstorm, Ryan Sinclair, Solstice Revelations), paying life or energy instead
     (Bismuth Mindrender, Amped Raptor), each opponent / each player (Fevered Suspicion, Etali, Plargg and Nassari),
     suspend and time counters (Kang Prime, The Tenth Doctor), Neera, Demonlord Belzenlok ("repeat this process").
   Left from the round after dice (choose an opponent, choose a die result, leaves-the-battlefield triggers, searching
   another player's library):
   - "Choose an opponent" as a spell resolves works (Myrkul's Edict; bots choose the strongest opponent); "You and that
     player each ..." (the Offerings) is out.
   - Still out from this round's search: Power of Persuasion ("until the end of your next turn" control), The Ozolith,
     Taeko, Nikara, Sandstone Oracle, Wrenn and Seven.
   - Bots take the higher die and the strongest opponent, and still don't use abilities that work from the graveyard.
   Left from the round after #60 and the round after Kruphix (filters up to an amount, unspent mana, half of an amount,
   "X or less", life gained this turn, tapped and attacking from hand, library and/or graveyard, free casts from your
   graveyard):
   - "With power / mana value less than or equal to <amount>" works for targets, groups, searches and free casts, and
     "you may ... if that creature's power is less than or equal to" (Nimbus Champion); still out: "that damage" in other
     trigger shapes (Broodcaller Scourge, Glamdring), Old Man of the Sea, Sphere of Annihilation, Quag Feast
     ("the chosen permanent"), Titan's Presence (a reveal cost), Vulpine Harvester ("their total power"), Sundering
     Archaic (colors spent).
   - "Your team" is "you" (CR 102.4), as is Azra Bladeseeker's "each player on your team", and "Partner with" works (27
     cards); still out: "each of your teammates" (Imperial Mask), Combo Attack, surge (Fall of the Titans). Pir and other
     "Partner with" cards are out on their other lines.
   - "Target ... with mana value X or less, where X is ..." works for the life you gained this turn (Celestine, Moseo);
     still out: damage dealt (Venerable Warsinger), players attacked (Custodi
     Soulcaller), Go-Shintai of Hidden Cruelty, Ancient Brass Dragon (a die roll's X with "total mana value X or less"),
     casting from revealed library cards (Sunbird's Invocation), Kamahl's Druidic Vow, Eldritch Evolution, Rally the
     Ancestors. Wishing Well and "with mana value equal to" an amount work.
   - "Total mana value / power N or X or less" for a group of targets works (Rampaging Yao Guai, Orcus, Patch Up,
     Reunion of the House), only one such group per ability. An enters trigger's own X works (Dune Drifter, Kinetic
     Ooze). "Double the number of each kind of counter you have" (on players) is out.
   - The life you gained this turn: still out are Betor, Sproutback Trudge, Willowdusk ("whichever is greater"), Shanna
     ("X can't be greater than"), Enlightened Confidant, Will, Scion of Peace (cost reduction by X), Tivash ("pay X
     life"), Astarion, Ocelot Pride (city's blessing token copies), Witch of the Moors ("and you return"), Aerith and
     Doctor Jane Foster ("return that card to the battlefield instead"), Follow the Lumarets, Lunar Convocation ("gained
     and lost").
   - "Put a creature card from your hand onto the battlefield tapped and attacking" works, with a choice of what it
     attacks (CR 508.4), as do Kaalia, Shadowfax ("lesser power") and Sneak Attack (haste, sacrificed at the end step);
     still out: Minion of the Mighty (pack tactics), Arni Metalbrow, Ultra Magnus,
     Strefan. Tokens created attacking still attack what the source attacks, without the choice.
   - "Search your library and/or graveyard" works (the planeswalker deck cards, Finale of Devastation); the player is
     asked "library too, or only the graveyard?" only when the graveyard has a card that fits, so searching nothing just
     to skip the shuffle isn't offered. "A card named A or B" works (Bogbrew Witch, Dragonstorm Forecaster): it splits
     only between names of two or more words, since a name may hold "or" (Fight or Flight). "A card named A and/or a card
     named B" works for a library search (Alpine Houndmaster); Agency Outfitter ("graveyard, hand and/or library") is out.
   - "If X is N or more" works in a spell; still out: "instead" (Finale of Revelation), "destroy all other creatures"
     after making tokens (Martial Coup), Banefire, Finale of Eternity and Finale of Promise.
   - "You may cast target ... card from your graveyard without paying its mana cost" works (Torrential Gearhulk,
     Dreadhorde Arcanist, Goblin Dark-Dwellers and 6 more); still out: "Until end of turn, you may cast" (Sins of the
     Past), Vadrok. "Cast an instant or sorcery spell from among them" with where the rest go works (Muse
     Vortex, Epic Experiment, Collected Conjuring).
   - Half an amount: "they lose half their life", "pay half your life" (rulings: 0 with 0 or less life), "Round up each
     time", each player's own half work; still out: Temporal Extortion ("any player may pay"), Heartless Hidetsugu
     (per-recipient damage), Aspect of Wolf, The Goose Mother, Banshee, Chainer's Torment, Doomsday, Death
     Wish, Contaminated Drink (rad
     counters), Contested Game Ball and War Elemental ("dealt combat damage", "its owner"). Split the Party works.
   - Damage amount replacements and per-source prevention work (double, triple, +N, half, "prevent N of that damage",
     "all but N", "can't be prevented"; the affected player orders them with shields, CR 616.1); still out: Neriv and
     Obosh (mana value of the source), Bitter Feud, Desperate Gambit and Forcefield (next-time doubling on a chosen or
     unblocked source), Quest for Pure Flame, Taii Wakeen, Goblin Goliath and Jeska (other lines), Rankle and Torbran
     (a "player or battle" trigger), the Ajani emblem, Lightning Surge, Arrow Storm, Banefire and Demonfire
     (conditional "can't be prevented"), Flames of the Blood Hand, Volcano Hellion, and prevention with extra effects
     (Nine Lives, Swans of Bryn Argoll, Mindskinner, Hostility, Weeping Angel, Ironscale Hydra). A replacement applies
     to all of one source's damage to one recipient at once, so one order per recipient. Bots' attacks and blocks count
     doublers, halvers and prevention.
   - Coin flips (CR 705) work for "If you win / lose the flip", "until you lose a flip" and "whenever you win a coin
     flip" (25 cards); still out: Krark's Thumb, Edgar's "come up heads" (705.3), heads or tails (Odds // Ends, Mana
     Clash, Two-Headed Giant, Rakdos the Showstopper, Molten Sentry), a flip for each (Mutalith Vortex Beast, Fighting
     Chance), Fiery Gambit, Game of Chaos, Squee's Revenge, Crooked Scales, Krark the Thumbless, Planar Chaos, and lines
     that are out for other reasons (Goblin Bangchuckers' "itself", Chance Encounter, Okaun). Bots weigh a flip whose loss costs
     them something as the average of its two outcomes (Bottle of Suleiman), and use "phase out or bounce, else
     sacrifice it" flips (Frenetic Efreet) only to save the permanent.
   - "Each other creature you control enters with an additional +1/+1 counter on it" works from permanents already on
     the battlefield (Renata, Grumgully, Dragonstorm Globe, Oath of Gideon, Arlinn); still out: "for each" (Giada,
     Bioengineered Future), "of the chosen type" (Metallic Mimic), conditions (Vampire Socialite, Dearly Departed),
     "this turn" (Combine Guildmage, Zameck Guildmage), mana that adds the counter (Animal Attendant, Guildmages' Forum),
     and one without "other" that could describe its own card.
   - Bots take the first offer for "what does it attack" (the player the source attacks) and search both zones.
   - "Whenever a creature attacks you (or a planeswalker you control)", "whenever a creature blocks", "whenever a creature
     you control becomes blocked", "whenever a source an opponent controls / a creature deals damage to you", "deals
     combat damage to a player or planeswalker" and "untap up to N lands" work; still out: "player or battle" (Rankle,
     Torbran's other lines), "untap up to N" other permanents, "attacking alone" on an Aura or a target (Security
     Bypass, Crowd of True Believers, Viper), and "choose target face-up exiled card" (Riftsweeper, Blink).
   Left from the delayed end step round ("sacrifice / exile / return it at the beginning of the next end step" about
   objects named earlier, exile now and return later, "until your next end step", "if you controlled that permanent"):
   - Still out: haste for a card put from the hand with a filter or from the graveyard (Meek Attack, Treacherous Urge,
     Swift Warkite, Greasefang); "gets ... and gains" with no duration (Goblin Ski Patrol); Manaform Hellkite and
     Urabrask's Forge (X/X tokens); "investigate X times"
     (Disorder in the Court); "any number of target ... return each of them" (Semester's End, Brago); Flickerform
     ("and all Auras attached to it"); Memory Jar (exile hands face down); Teferi's Time Twist, Phelia, Koya, Norin,
     Conciliator's Duelist, Mistmeadow Vanisher, Vizier of Deferment, Charming Prince; Avacyn and Resurrection Orb,
     From the Catacombs, Moira and Teshar, Kheru Lich Lord; copy tokens with "except" or "for each" (Hate Mirage,
     Twinflame, Kindred Charge, Jaxis); Spinal Embrace, Lae'zel's Acrobatics, Golden Argosy, Identity Thief, Wake to
     Slaughter; "If you controlled it, ... Otherwise, its controller" (Unyielding Gatekeeper) and Azog's amass.
   - Simplifications: "sacrifice those creatures / them at the next end step" makes one delayed trigger per object
     (CR 603.7 has one for all; no supported card can tell); a flicker's return is one trigger for all the cards.
   Left from the reflexive triggers round ("When you do" after a payment, a sacrifice, a may, a mill, a roll, a count
   or a token, CR 603.12; named tokens; "that artifact gains haste" after putting it onto the battlefield):
   - Reflexive triggers still out: "pay {X}. When you do" (Isareth, Halo Forager, Numa, Rose Room Treasurer); "remove a counter from" any kind (Slumbering
     Walker); "exile N cards from your graveyard. When you do" (Kroxa, Young Necromancer, Kishla Trawlers); Wick's
     Patrol ("the greatest mana value among cards in your graveyard");
     Red Hulk, Hylda, Ziatora, Tiger-Tribe Hunter, Surtland Flinger, Bolg, Edgar's Awakening, Leyline Tyrant ("any
     amount"), Rubble Rouser, Novel Nunchaku, Old Man Willow ("or a token"), Greasefang, Kher Keep ("~" in a token's
     name), Murmuration, Mordor Trebuchet, The Great Unclean One. The Balrog is out on its cost reduction.
   Left from the reflexive spells and "triggers an additional time" round (CR 603.12 on instants and sorceries,
   amass's "when you do" and "the amassed Army", 603.2d):
   - Reflexive spells still out: Ill-Timed Explosion ("the greatest mana value among cards discarded this way" carried
     into the trigger), Grishnákh ("power less than or equal to the amassed Army's power"), Goblin Plate Mail ("attach
     ~ to the amassed Army"), Espers to Magicite, Edgar's Awakening, Ugin's Binding, Plumb the Forbidden.
   - "Triggers an additional time" still out: Bifur, Clara Oswald, Cloud, Dr. Beverly Crusher, Dungeon Delver, Echoes
     of Eternity, Gandalf the White, Hama Pashar, Jabs, Krang, Panoptic Projektor, Roaming Throne, Sanctum of All, The
     Masamune, Valiant Emberkin, Veyran, Virtue of Knowledge, Wayta, Windcrag Siege, Wizard's Staff.
   - Simplifications: amass with several Armies uses the one with the most +1/+1 counters (CR 701.47a lets you
     choose); a source leaving at the same time as the dying creature is matched against its current card, not its
     last known characteristics, for "a triggered ability of a [kind]" (only matters if its types were changed).
   Left from the modes round (repeated modes, pawprints, escalate, unchosen and random modes, tokens for others):
   - Mode lines still out: the Confluences of Cabaretti, Cosmium, Eldrazi, Maestros, Obscura and Riveteers
     (monocolored groups, goad, flicker tapped, "target player returns a creature card", a land from hand or
     graveyard, copy with haste).
   Left from the delayed-triggers-with-a-duration round ("until end of turn, whenever ...", CR 603.7b):
   - Only cast, dies and combat-damage-to-a-player events can be such a trigger; still out: tapped for mana (High
     Tide, Bubbling Muck), attacks, blocks, life gain, other damage, Subira ("a creature you control with power 2 or
     less" as the dealer), Spiritualize and the rest of the 11 unsupported ones.
   - "Whenever you cast a spell that targets ..." still out: "that targets only ..." (Leyline of Resonance, Loki,
     Beamsplitter Mage, Feather), "targets ~" except heroic (Druid of Horns, Speedball), "an Equipment spell or a spell
     that targets" (Danitha, Sword of Hope), and "those creatures" in the effect (Storm, Windrider; Dack's emblem).
   - Crush Underfoot ("choose a Giant creature you control") is out because its Kindred type isn't parsed.
   - "Choose one that hasn't been chosen" cards still out on other lines: Breeches, Captive Audience, Gandalf, Gollum,
     Henrika, Kargan, Parapet Thrasher, Sol'Kanar, Survivor's Med Kit, Teval's Judgment, Fantastic Four, Zuko, Genku.
     Random modes still out: Outlaws' Merriment, Typhoid Mary.
   Left from the round after Seasons (lists of targets, Vivid, Gates/Deserts/Caves, counts):
   - Lists of targets under one verb work for destroy, exile, tap, untap and return to hand; still out: lists returning
     to the battlefield (they enter at the same time; Thwart the Grave also has commas inside one target), and "it" or
     "its controller" after a list (Acolyte Hybrid-style "its controller draws").
   - Vivid still out: Aurora Awakener, Sanar ("reveal until X permanent/nonland cards"), Prismabasher ("up to X
     target"), Prismatic Undercurrents ("up to X basic land cards"), First Family ("and spells you've cast this turn"),
     General Tazri ("colors among those creatures"), Happily Ever After.
   - "Cards drawn this turn" still out: Fists of Flame, Proft's Eidetic Memory ("minus one"), Molten Psyche, Niko Aris,
     Immortus, Elenda and Azor, Deem Inferior and Sylvan Library (other lines).
   - "Differently named" still out: Neriv ("differently named tokens"), Survey Mechan (an activated ability costing
     {X} less), Ellywick's emblem.
   - "Players being attacked" works for Pack Attack; the rest are out on other lines (Amber Gristle O'Maul, Apothecary
     White, Commander Liara Portyr, Dimir Strandcatcher, Iron Mastiff, Norn's Decree, Suppressor Skyguard).
   - Gates still out: Gond Gate, Guild Summit, Sage of the Maze (other lines).
   - "Didn't attack this turn" without Season of the Witch's exception (Aggression, Air Nomad Student, Erg Raiders,
     Kratos, Angel's Trumpet) isn't parsed yet; `GameObject.couldAttack` records who could attack each turn.
   Left from the X/X tokens, tapped-for-mana and "for as long as you control" round:
   - Tapped-for-mana triggers still out: Price of Glory (intervening "if it's not that player's turn"), Mana Web,
     Treasure Nabber; the Offerings with two "choose an opponent" choices in one ability.
   - "For as long as you control ~" still out: "can't become untapped" (Spider-Woman), "you may play that card for
     as long as you control ~" (Lightning, Victor Mancha, Taster of Wares), "with lesser power" / "power less than
     ~'s power" targets (Rangers of Ithilien, Vodalian Mindsinger), Willbreaker, The Wretched, Pyreswipe Hawk
     (expend), Seasinger.
   - "Exiles a creature or planeswalker they control with the greatest mana value" (Blot Out, End of the Hunt): the
     sacrifice version works; exiling needs an "exile" pick action and prompt. "The greatest mana value among" cards
     in a graveyard, historic permanents or your commanders (Traverse Eternity, Hapatra, Tangleweave Armor) is out.
   - "Destroy all tokens" (plural token nouns), Black Widow's "deals combat damage to an opponent" trigger.
   Left from the haunt/Aura-host rounds:
   - Auras put onto the battlefield without being cast ask what they enchant (CR 303.4f), returns from exile and
     "until ~ leaves" included. An "until ~ leaves" Aura is placed after the instruction or state-based-action pass
     that made the source leave, not mid-instruction. Still out: Calix, Estrid, Push the Limit, Mount/Vehicle groups.
   - Auras that transform: Lignify (the Kindred type), Witness Protection and Honest Work (a new name), Frozen in Ice
     ("can't become untapped"), Withercrown (granted upkeep trigger with "unless you sacrifice"), Swift
     Reconfiguration (Vehicle with crew), enchant unions with a subtype (In Too Deep, Sugar Coat, Puppet Crafting).
   - "Whenever a creature you control attacks" bodies still out: Hellrider ("the player or planeswalker it's
     attacking"), Ingris ("that creature deals 1 damage": the attacker as the source), Silumgar ("creatures defending
     player controls"), Shared Animosity, Kestia ("an enchanted creature or enchantment creature"), Kitsune Ace (a
     modal trigger about "that Vehicle"). Commanders: Drillworks Mole ("up to one target commander creature"),
     Subjugate the Hobbits ("each noncommander creature with mana value 3 or less").
   Left from the filter lands/divided damage/X costs round:
   - Divided damage still out: Impact Resonance, Ghired's Belligerence's populate, Pollen Remedy (kicker that isn't
     mana). The divide panel says "divide the damage" for prevention too (Remedy).
   - "Any number of target players" still out: Communal Brewing, Hollow Marauder, Kaboom!, Memory Vampire, Singularity
     Rupture, Curse of Surveillance, The Death of Gwen Stacy; Will of the Abzan (below).
   - X in additional costs still out: Bond of Agony and Necrologia (their effect lines), "each player sacrifices X
     lands" (Devastating Dreams), "with mana value X" (Fix What's Broken, Vicious Rivalry), Devastating Summons' X/X
     tokens, Insidious Dreams, Recall, Nahiri's Wrath, Abandon Hope; X in an activated ability's non-mana cost (Gix,
     Champion of Stray Souls, Martyr of Bones); "X target cards from a single graveyard" (Rats' Feast); waterbend {X}.
   - Bots don't sacrifice nontoken permanents for mana abilities on their own (Ashnod's Altar, Phyrexian Tower): only
     the human player does, from the ability menu.
   Left from the mana abilities/any number of targets round:
   - "Up to X target" where X isn't the spell's own X ("where X is ...",
     verse counters, monstrosity, kicker count); target counts with a group condition ("with total mana value 8 or
     less", "with different controllers", "that each have a different mana value", "with equal toughness"); "for each
     creature destroyed/exiled this way, its controller creates" (Descent of the Dragons, Hour of Need); "Shuffle any
     number of target cards from your graveyard into your library"; "Choose target creature you don't control. Each
     creature you control deals damage equal to its power to that creature" (Kamahl's Will).
   - "Activate only if" mana abilities still out: "~ is a creature" (Flywheel Racer), "three or more lands with the
     same name", counters on ~ (Pyramid of the Pantheon, Tablet of Compleation).
   - An activated mana ability whose body isn't a plain "Add ..." (Leafkin Druid's "add {G}{G} instead") can't be
     activated while a "whenever ~ is tapped for mana, add one mana of any color" trigger would need a color choice
     (Fertile Ground on it): it's refused rather than asked. No supported card hits this yet.
   Left from the for-each-opponent/commander/mana value X round:
   - "Choose up to one target" (Luminate
     Primordial, Shellshock, Mega Flare); exchanges of control (Twist
     Allegiance, Reins of Power); "creatures and lands target opponent controls don't untap during their next
     untap step" (Exhaustion).
   - Bots choose X for "with mana value X" counterspells (Spell Blast) but cast Killing Glare-style "power X or less"
     removal only with as much X as they can pay; they never hold a free Fierce Guardianship for a bigger threat.
   Left from the conditional targets/Will cycle/hideaway conditions round:
   - "Choose target X ... If the gift was promised, instead choose target Y ... the chosen" (Too Evil to Stay Dead,
     Expel the Unworthy, The Eagles Are Coming!); "pays {4} instead" (We Say Thee Nay!); "any number of ... instead"
     (Earth's Mightiest Heroes); "twice X ... instead"
     (Stonesplitter Bolt, Torch the Tower).
   - The rest of the gift cards: Bilbo's Gambit, Coiling Rebirth, Cruelclaw's Heist, Dawn's Truce, Longstalk Brawl,
     Octomancer, Parting Gust, Perch Protection, Starfall Invocation; Dark Apostle's "Gift of Chaos" is a flavor word.
   - Wills still out: Sakashima's, Kamahl's and Will of the Abzan (above).
   - "Each player may discard their hand and draw ..." works; Snort's "each opponent who discarded their hand this
     way" and Imposing Grandeur's "the greatest mana value of a commander they own" don't.
   - Hideaway: Evercoat Ursine, Smuggler's Buggy, Rabble Rousing ("create that many"), Wiretapping.
   Left from the teamwork/conspire/gift/tribute/hideaway/cipher round:
   - Tribute: Flame-Wreathed Phoenix's granted dies trigger, Oracle of Bones' free cast from hand. Cipher: Arcane
     Heist, Hidden Strings, Trait Doctoring, Undercity Plague. Conspire: Traitor's Roar ("it deals damage equal to its
     power to its controller").
   - Known simplifications: two instances of conspire or tribute on one object act once; a cipher host that "loses all
     abilities" still casts the encoded card; who has seen a hideaway card isn't updated when its permanent changes
     control; teamwork counts a negative power as 0 (like crew). Bots use teamwork and conspire only with creatures
     that couldn't attack anyway, and promise a gift only when it turns on something of the spell's own.
   Left from the untap/entwine/distribute/job select/bargain round:
   - "For as long as ~ remains tapped" (27 of 40 legal supported): dynamic target filters (Vedalken Shackles' "power less
     than or equal to the number of Islands", Old Man of the Sea, Entrancing Lyre's X, Seasinger), "a creature of an
     opponent's choice" (Preacher), "isn't of the chosen type" (Callous Oppressor), "other than ~" (Hisoka's Guard),
     attacking/blocked filters (Ice Floe, Whip Vine), "loses all abilities" (Immovable Rod), "when ~ becomes untapped
     or ..." delayed triggers from an activated ability (Coffin Queen, Tawnos's Coffin, The Pandorica), Giant Oyster's counters, Hivis's Dragon filter, Hedge
     Whisperer and The Blackstaff of Waterdeep's animation.
   - Entwine with a non-mana cost (Betrayal of Flesh, Solar Tide); the other unsupported entwine cards fail on a mode.
   - Job select (11 of 19): granted quoted abilities that don't compile (Ninja's Blades, Blue Mage's Cane, Summoner's
     Grimoire, Astrologian's Planisphere, Dancer's Chakrams' "other commanders you control"), "for each artifact you
     control" (Machinist's Arsenal), Reaper's Scythe's soul counters.
   - Bargain (12 of 20): "twice X" and "instead it deals 3 ... and you scry"
     (Stonesplitter Bolt, Torch the Tower), "look at the top eight
     instead" (Farsight Ritual), Beseech the Mirror's free cast, Back for Seconds, Rowan's Grim Search, Thunderous
     Debut, Realm-Scorcher Hellkite's mana.
   Left from the Spree/Saddle/Station/Curse round:
   - Curses (14 of 47 supported): "whenever a player attacks enchanted player with one or more creatures" (Chaos,
     Inertia, Shallow Graves), "Curses attached to that player" counts (Thirst, Surveillance, Misfortunes), damage to
     enchanted player (Bloodletting's doubling, Stalked Prey, Hospitality, Grievous Wound), "untap all nonland
     permanents they control" for Curse of Bounty's "does the same", attaching a Curse to another player (Archnemesis,
     Maddening Hex), "when enchanted player loses the game" (Vengeance), Cruel Reality's "if the player can't",
     Curse of Oblivion's graveyard exile, decayed Zombie tokens (Restless Dead),
     Overwhelming Splendor, Curse of Silence, Overencumbered, Paradox Haze, Shadow of the Second Sun, Tenuous Truce.
   - Spree modes that don't parse yet: "search for a basic land or Desert"
     and X/X tokens (Dance of the Tumbleweeds), "choose a creature you control. It gains" (Final Showdown),
     "if no other creature has greater power" (Getaway Glamer), "choose target opponent. Whenever ..." (Great Train
     Heist), total mana value (Lively Dirge), "Mount or Vehicle" / "Aura or Equipment" (One Last Job), "half ... rounded up" (Rush of Dread), "exchange control of two target" (Shifting
     Grift), Smuggler's Surprise.
   - Saddle: "the creature that saddled it this turn" (Giant Beaver, Rambling Possum, Calamity, Fortune, The Gitrog),
     effects that make a Mount saddled (Guidelight Matrix, Kolodin, Alacrian Armory), "is saddled" and "becomes
     saddled for the first time each turn" (Archmage's Newt, Caustic Bronco, Stubborn Burrowfiend), "saddles a Mount
     or crews a Vehicle" triggers (Canyon Vaulter, Reckless Velocitaur), "Mount or Vehicle" groups (Cloudspire Captain),
     Bounding Felidar, Guardian Sunmare, Lagorin, Ornery Tumblewagg. Bots only saddle Mounts that have an "attacks
     while saddled" trigger.
   - Station and levelers: a striation is all or nothing, so cards with one unparsed line there stay out (Entropic
     Battlecruiser, Exploration Broodship, Hearthhull, Inspirit, The Seriema, Echo Mage, Hedron-Field Purists,
     Lighthouse Chronologist, Lord of Shatterskull Pass); "stations permanents using its toughness" (Tapestry Warden).
     Bots station after combat with summoning-sick creatures, or any creature while above 20 life.
2. By `npm run blockers` (a long tail of 2- and 3-card lines): Rageform-style "it becomes an Aura ... manifest the
   top card", "for each other attacking ~" naming the card itself (Aurochs Herd) and Shared Animosity's "that share a
   creature type with it". Left from the additional-combat round: "at the beginning of that combat" and "each combat
   this turn" delayed triggers (Moraug, World at War, Full Throttle), "only the chosen creatures / land creatures can
   attack during that combat phase" (Last Night Together, Bumi), "skips their next combat phase" (Stonehorn Dignitary,
   False Peace, Moment of Silence), Take the Bait's "after this phase" extra combat, "attacks for the first
   time each turn" on creatures other than the source and group attack triggers (Desert Were-Worm, Akki Battle Squad,
   Éomer), Raphael's "deals combat damage to a player for the first time each turn", "untap it and all Samurai you
   control" (Godo), Moraug's "for each time it has attacked this turn"; "it can't be blocked this combat" (Ma Chao),
   "whenever ~ or a commander you control attacks alone"; play-from-top riders: Bolas's Citadel's life payment,
   Elsha's flash, Thundermane Dragon's haste, Mikey & Don's counter, Galea's attach, Falco Spara's and Into the Pit's
   extra costs, historic and snow filters (Crystal Skull, The Fourth Doctor, Isu), "spells with flash or flying"
   (Errant and Giada), Vizier of the Menagerie's "spend mana of any type", Experimental Frenzy's "can't play cards from
   your hand", granted look-at-top (Glowcap Lantern), "until end of turn, you may look at the top card" (Gwenom, The
   Belligerent). Left from the ripple/sneak round: Karai's "if a sneak cost was paid this turn", sneak conditions on
   Last Ronin's Technique and Turncoat Kunoichi, Melek and Mistbreath Elder, putting cards from a hand on the bottom
   in any order (Arjun, Mindmoil), granting cascade, and the owner's order when several target spells or permanents
   go to the bottom at once (CR 401.4). Left from the
   earthbend/foretell round: {X} foretell and freerunning costs (Starnheim Unleashed, Monastery Raid),
   "if this spell was cast from exile" conditions on foretell cards (Cosmos Charger), Avatar Kyoshi's "then untap that land", Feral Contest and Mark for
   Death's lures with extra clauses, Kingpin of Crime.

## Known gaps (from earlier rounds)

- Layer 3 (text-changing effects).
- "Divided as you choose" with X ("X damage divided", Rolling Thunder, Fire Covenant), distributing X counters
  and "then" riders (Biogenic Upgrade), divided prevention (Remedy), on a
  planeswalker (Chandra, Flameshaper); "up to X target" with an X that isn't the spell's own (Rats' Feast, Martyr of
  Bones' "up to X target cards from a single graveyard").
- "Costs {1} less for each target", reductions of colored mana, "the first face-down / kicked spell you cast each
  turn" (Kadena, Vine Gecko), Radagast's "and can be cast as though it had flash", Eluge's "{U} (or {1}) less".
  Equip reductions "that target enchanted creature" (Strong Back).
- Granted static abilities ('has "This creature can't block"'), battles, "can't attack unless", "becomes tapped".
- Protection from a player; protection that doesn't remove other Auras (Spectra Ward, Benevolent Blessing).
- Aura and Equipment triggers: "whenever ~ or equipped creature ..." that then says "it", "blocks or becomes blocked by
  a creature", Extra Arms's "it deals"; granted target taxes (Callaphe); "if it had counters on it, put its counters"
  (Host of the Hereafter).
- Graveyard order (CR 404.3) is modeled: cards put into a graveyard at the same time are arranged by their owner when
  a card in the game reads the order. Still out: Volrath's Shapeshifter (its text changes with the top card, layer 1/3),
  Bösium Strip (cast the top instant or sorcery of your graveyard, exile it after), Phyrexian Grimoire (an opponent
  picks one of the top two), Circling Vultures, Genesis and Kheru Lich
  Lord (blocked by other lines).
- Collect evidence (CR 701.59) works as an optional additional cost, an alternative cost, an ability's cost and a "you
  may" on resolution; still out: ward—collect evidence (Axebane Ferox), bestow with it (Detective's Phoenix), "collect
  evidence X" (Incinerator of the Guilty, Urgent Necropsy), "if evidence was collected, instead" (Analyze the Pollen,
  Extract a Confession), and cards blocked by other lines (Cryptex, Polygraph Orb, Hedge Whisperer, Lamplight Phoenix,
  Memory Vampire, Tenth District Hero, Deadly Cover-Up).
- Mana from a Treasure (CR 106.3) is tracked; still out: Devour Intellect ("instead" with a choice), Kalain's
  "enters with an additional +1/+1 counter" (that static family isn't supported), Alchemist's Talent (Classes aren't
  supported), Coin of Mastery (mana from an artifact source).
- Sagas (CR 714) and read ahead (702.155) work for 35 of 209; still out: the 29 double-faced Sagas (transform after
  the last chapter), and chapters with lines not parsed yet ("for as long as ~ remains on the battlefield", "until your
  next turn", triggers that last "this turn", "you and target opponent each ..."). Classes, Cases, Rooms and Sieges
  are still unsupported. Bots don't read ahead past chapter I.
- Alternative costs: bots never use Fist of Suns' {W}{U}{B}{R}{G} or the Shoals (an X spell for an
  alternative cost), never cast Invigorate (no combat-trick logic for alternative costs), and use the other
  alternative costs only when they can't pay the mana cost (surge and spectacle whenever allowed; overload when hitting
  each of them is worth clearly more than the best single target). The game remembers only some of what happened in a turn
  (`GameState.turnLog`: searches, permanents entering, destructions by an opponent, creatures dealing damage to a
  player, life gained, cards put into a graveyard); more "this turn" conditions need more of it.
- With Torpor Orb, "whenever counters are put on" still triggers for counters a creature enters with.
- "Becomes the target": "deals 2 damage to that spell's controller", "an ability that targets only it" (Agrus Kos),
  "becomes the target of an Aura spell". A player who can't win (Abyssal Persecutor) still wins as the last player left
  (CR 104.2a).
- Mana: "until end of turn, whenever a player taps an Island for mana" (High Tide, Bubbling Muck), "tapped for mana"
  triggers that aren't mana abilities (Manabarbs) or have conditions (Regal Behemoth, Barbflare Gremlin), "may add"
  (Snowfall), "for each Elf" (Elvish Guidance); replacing mana ("produces twice as much", Mana Reflection,
  Contamination). Autopay skips a land whose own mana can't be spent on the cost even when the extra mana from
  Mana Flare (which has no restriction) could be.
- "One or more creatures enter/die" (once per batch), "whenever ~ connives", "while ~ is in your graveyard".
- Choosing what to proliferate. "Exile any number of them and put the rest back in any order".
- Effects on the attackers as a group; impulse draw from an opponent's library; Glacierwood Siege's modal choice.
- Vorinclex (counters on players, halving), Academy Manufactor.
- "If ~ attacked or blocked this combat", "until end of combat", myriad attacking planeswalkers, "at the beginning
  of combat on each opponent's turn".
- "Copy target activated or triggered ability" (Strionic Resonator). Mirrorshell Crab's channel ability.
- "Activate only during your turn, before attackers are declared" with additional combats: it's allowed in each
  combat's beginning of combat step but not in an added main phase; check the rulings before relying on it. Random
  discards as a cost: bots use them only with spare cards in hand.
- "Skip your next draw step" (Fatigue) and other one-time skips; Ad Nauseam's repeat.
- Champion triggers about the championed card (Mistbind Clique's "when a Faerie is championed"); reinforce X;
  Dodecapod's "with two +1/+1 counters". Prototype can't be chosen for free casts ("without paying its mana
  cost") yet.
- Blocking: "whenever ~ blocks two or more creatures" (Lairwatch Giant), "for each creature it's blocking" (Guardian
  of the Gateless), "an additional creature for each Equipment attached" (Kemba's Legion), Yare's "creature
  defending player controls". A blocker's damage among several attackers is divided automatically, like an
  attacker's among several blockers.
- Soulbond: "whenever ~ or a creature it's paired with is dealt damage" (Donna Noble, also Doctor's companion);
  granted trigger Breathkeeper Seraph's "at the beginning of your next upkeep".
- Faceless One ("choose a color before the game begins"). The sample decks have one commander each; two commanders (partners or a Background) work
  in the engine and `sample-decks.json` (`secondCommander`) but no sample deck uses them yet.
- Split second conditional on a kicker (Molten Disaster's "if it was kicked"); Shadow the Hedgehog's "if mana from an
  artifact was spent" works.
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
  which shield applies first (CR 615.7, 616.1), are made for the player (bots' heuristic); so is splitting a shared
  "next N damage" among several recipients (Harm's Way). Turn-long rules (`GameState.damageRules`, "a source of your
  choice", Safe Passage) apply after the shields on a permanent or player. A source of your choice is offered from the
  battlefield and the stack only (not a commander in the command zone, which can't deal damage there anyway).
  Prevention still out: "that damage is dealt to that source's controller instead" (Reflect Damage), Eye for an Eye's
  "instead that source deals that much damage to you and ~ deals that much damage to that source's controller",
  Nova Pentacle's "target creature of an opponent's choice",
  "if damage is prevented this way, you may have ~ deal that much damage to target creature" (Channel Harm) and
  "to that creature" (Comeuppance), "sources of the color of your choice" (Prismatic Strands), Rhystic Circle's "any
  player may pay {1}", Heavy Fog's cast restriction; about 95 cards that mention prevention are still out (search
  the card data for "source of your choice" or "prevented this way"). a shield that redirects to
  the creature it protects, and chains of redirection, are untested. Hazduhr (named by its short name), Captain's
  Maneuver ("creature, planeswalker, or player"), Personal Incarnation.
- Planeswalkers: emblems (CR 114) work with static abilities, triggered abilities on the common events
  (EMBLEM_EVENTS in oracle/grants.ts), cost changes, "no maximum hand size", damage prevention (Ajani Steadfast),
  "your opponents can't cast noncreature spells" (Narset), extra draws (Sarkhan), haste for a spell cast (Tyvar) and
  loyalty abilities at instant speed (Teferi, Temporal Archmage); still out: emblems with activated abilities (Karn,
  Ob Nixilis of the Black Oath), granted keywords on spells (Ral's storm).
  Emblems show as a chip in their owner's seat header. "+X" loyalty abilities, compleated, "X" loyalty, "add mana" loyalty abilities,
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
  turn", "draw that many cards"; life-gain replacements other than doubling and "plus N". When Alhammarret's Archive
  and Heron of Hope both apply, "plus 1" is always applied first (the better order); the player should choose (CR
  616.1). Archive's draw doubling applies before dredge is offered (the player should choose the order).
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
- Phasing: "phases out until ~ leaves the battlefield" (Oubliette, The Moment), "can't phase
  in", "whenever ~ phases in or out", Teferi's Protection; flavor words before an ability ("Teleport —", CR 207.2d).
- Manifest and cloak: from another player's library ("manifest the top card of that player's library"), from a hand
  (Scroll of Fate), several cards from a face-down pile (Become Anonymous, Primordial Mist), "manifest dread X times",
  "whenever you manifest dread", Cloudform's "it becomes an Aura with enchant creature"; Arbiter of the Ideal's
  manifestation counters. Ward granted with a variable or non-mana cost (Minthara's ward {X}, Mishra's "Ward—Sacrifice a
  permanent"), Thran Power Suit's "for each Aura and Equipment", Plate Armor's equip reduction, Leyline Immersion's
  restricted mana ability; anthems for legendary or nonlegendary creatures and "each creature you control with a counter
  on it" (Flowering of the White Tree, Cathedral Acolyte).
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
- Assist: bots never ask for or give help (everyone else is an opponent).
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
- Land types (CR 305.7): copy effects of lands under a land-type effect; Winter Orb ("players can't untap more than one land").
- Granted flashback is only "until end of turn" with the card's mana cost (Snapcaster Mage, Past in Flames); a
  static grant (Lier, Disciple of the Drowned) and Mission Briefing's "you may cast it this turn" are not modeled.

- Mana abilities with costs other than {T} and mana (Ashnod's Altar, Phyrexian Altar and about 50 other supported
  cards) use the stack like other activated abilities; they shouldn't (CR 605.3b). Exert as a mana-ability cost
  (Oasis Ritualist, Arena of Glory) stays unsupported until that's fixed.
- Monstrosity X and "when ~ becomes monstrous" that uses X (Polukranos, Hydra Broodmaster); "becomes monstrous" on
  legendary names shortened without a comma (Hythonia). Combat Celebrant's exert ("untap all other creatures you
  control and after this phase, there is an additional combat phase"). "Whenever a source deals damage, if it
  dealt damage this turn" and sources "that dealt damage this turn".

## Later

- Proper legend-rule choice, the 903.9 commander choice.
- Deck builder using the full card database, with rulings in the card preview.
- Better bots, then online play (the engine runs on a server; clients send actions).
