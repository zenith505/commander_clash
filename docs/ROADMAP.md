# Roadmap

17,274 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Each round takes the next item,
implements it with tests, and updates this file. `npm run blockers` shows how many cards each missing line blocks.

## Ken's standing instructions

- Keep going round after round until the plan is done; no need to ask before each round.
- Skip cards that aren't legal in any format.
- Don't guess on complex cards: research the rules and rulings first.
- Infinite or long loops: shortcut them like paper Magic (CR 732): propose a loop and a number of iterations,
  others accept or stop it earlier.
- A UI polish pass comes at the end. Don't reorder the game log (Ken rejected that).
- Each round clicks through the prompts and buttons it adds with a browser test (`npm run e2e`, Ken, Oct 15 2026).

## Next rounds

1. Mechanics that appear on many cards but are blocked as a group (`BY_COUNT=1 npm run blockers`).
   Left from the Roles/modified/can't be regenerated/equip round:
   - Role cards still out on other lines: reflexive "When you do, create a ... Role" (Curse of the Werefox, Merry
     Bards, Spellbook Vendor), Not Dead After All, Faunsbane Troll ("sacrifice an Aura attached to ~"), Kestia ("an
     enchanted creature or enchantment creature"), Seeds of Innocence-style "the controller of each of those".
   - "Can't be regenerated" still out: "for each creature destroyed this way" (Decree of Pain), Purge ("artifact
     creature or black creature"), Mageta ("except for ~"), The Abyss ("of their choice"), Scorching Lava (kicked
     "that creature"), Whippoorwill, Runesword.
   - Equip still out: "Equip—Pay {3} or discard a card", equip planeswalker, "Equip worthy"; bots never use an equip
     cost that sacrifices a creature (Demonmail Hauberk), only the human player does.
   - "It" after returning a card works for one target or "return ~"; "return up to N target ... Put a counter on each of
     them" and several cards don't.
   Left from the dungeons and punishers round (venture into the dungeon, completed dungeons, punishers, "X unless
   [condition]", named legendary tokens):
   - Venture still out on other lines: Sefris and Varis ("this ability triggers only once each turn"), Wandering
     Troubadour, Immovable Rod ("becomes untapped"), Intrepid Outlander (pack tactics), Radiant Solar (discard ~ from
     hand as a cost), Ranger's Hawk, Fifty Feet of Rope. Dungeon Delver (granting Hama Pashar's ability to commanders),
     Keen-Eared Sentry, Dungeon Crawler, Ellywick's "differently named dungeon" count. Dungeoneer's Pack's four-part
     sentence ("You take the initiative, gain 3 life, draw a card, and create a Treasure token").
   - "If you've completed a dungeon" inside an effect (Imoen, Safana, Caves of Chaos Adventurer, Rilsa Rael, White
     Plume Adventurer, Undermountain Adventurer, Tomb of Horrors Adventurer); as a static condition it works.
   - Punishers still out: per-opponent ones ("for each opponent, you create ... unless that player sacrifices",
     Acererak), "unless they discard a nonland card" (Bandit's Talent, Compulsive Research, Wrench Mind), "sacrifices
     a permanent unless they discard" (Possessed Portal), damage instead of life loss (Demanding Dragon, Mogis, Curse
     Artifact, Indoraptor), "another nonland permanent" (Torment of Venom), "that many permanents" (Archfiend of
     Spite), a count of blight counters (Rottenmouth Viper), "any number of times" (Forbidden Ritual). Bots choose a
     punisher option by simple rules (a spare token, then a spare card, else the life).
   - "Unless" conditions still out: "an opponent has 10 or less life" (Vampire Lacerator) and other conditions the
     static parser doesn't read.
   Left from the spell keywords round (tap or untap, buyback costs, undaunted, gravestorm, splice, awaken, miracle,
   epic, free casts from hand, timing points, overload leftovers):
   - Overload still out: Chemister's Trick ("attacks this turn if able": does it bind more than one combat?),
     Dragonshift, Fangs of Kalonia, March of Progress, Winds of Abandon, Mizzix's Mastery (copy an exiled card and
     cast the copy), Break the Ice, Rise and Shine, Spectacular Showdown, Eldritch Immunity, Corporeal Projection, Bail
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
   - Harmonize, Paradigm, Demonstrate are still out.
   Left from the modes round (repeated modes, pawprints, escalate, unchosen and random modes, tokens for others):
   - Mode lines still out: the Confluences of Cabaretti, Cosmium, Eldrazi, Maestros, Obscura and Riveteers
     (monocolored groups, goad, flicker tapped, "target player returns a creature card", a land from hand or
     graveyard, copy with haste); Seasons of Gathering, the Bold, the Burrow and Weaving; Inscription of Abundance;
     Inscription of Insight's "target player creates an X/X ... cards in their hand".
   - "Choose one that hasn't been chosen" cards still out on other lines: Breeches, Captive Audience, Gandalf, Gollum,
     Henrika, Kargan, Parapet Thrasher, Sol'Kanar, Survivor's Med Kit, Teval's Judgment, Fantastic Four, Zuko, Genku.
     Random modes still out: Outlaws' Merriment, Typhoid Mary.
   - Forbidden Orchard: "whenever you tap ~ for mana" is a trigger, not a mana ability (CR 605.1a), not modeled.
   Left from the haunt/Aura-host rounds:
   - Auras put onto the battlefield without being cast ask what they enchant (CR 303.4f), returns from exile and
     "until ~ leaves" included. An "until ~ leaves" Aura is placed after the instruction or state-based-action pass
     that made the source leave, not mid-instruction. Still out: Calix, Estrid, Push the Limit, Academy Rector's "you
     may exile it. If you do", Mount/Vehicle groups.
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
     number of target cards from your graveyard into your library"; "Return those cards ... at the beginning of the
     next end step" after exiling several (Eerie Interlude, Brago); "Choose target creature you don't control. Each
     creature you control deals damage equal to its power to that creature" (Kamahl's Will).
   - "Activate only if" mana abilities still out: "~ is a creature" (Flywheel Racer), "three or more lands with the
     same name", counters on ~ (Pyramid of the Pantheon, Tablet of Compleation).
   - An activated mana ability whose body isn't a plain "Add ..." (Leafkin Druid's "add {G}{G} instead") can't be
     activated while a "whenever ~ is tapped for mana, add one mana of any color" trigger would need a color choice
     (Fertile Ground on it): it's refused rather than asked. No supported card hits this yet.
   Left from the for-each-opponent/commander/mana value X round:
   - Reflexive "When you do" outside collect evidence (Lich's Relic, Balrog); "choose up to one target" (Luminate
     Primordial, Shellshock, Mega Flare); "third from the top" (Riptide Gearhulk); exchanges of control (Twist
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
   - "For as long as ~ remains tapped" (23 of 45 supported): storage lands' "remove any number of storage counters"
     (Bottomless Vault, Dwarven Hold, Sand Silos and others), dynamic target filters (Vedalken Shackles' "power less
     than or equal to the number of Islands", Old Man of the Sea, Entrancing Lyre's X, Seasinger), "a creature of an
     opponent's choice" (Preacher), "isn't of the chosen type" (Callous Oppressor), "other than ~" (Hisoka's Guard),
     attacking/blocked filters (Ice Floe, Whip Vine), "loses all abilities" (Immovable Rod), "becomes untapped"
     triggers (Coffin Queen, Tawnos's Coffin, The Pandorica), Giant Oyster's counters, Hivis's Dragon filter, Hedge
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
   - Spree modes that don't parse yet: outlaw groups (Caught in the Crossfire), "search for a basic land or Desert"
     and X/X tokens (Dance of the Tumbleweeds), "choose a creature you control. It gains" (Final Showdown),
     "if no other creature has greater power" (Getaway Glamer), "choose target opponent. Whenever ..." (Great Train
     Heist), total mana value (Lively Dirge), "Mount or Vehicle" / "Aura or Equipment" (One Last Job), copying an
     ability (Return the Favor), "half ... rounded up" (Rush of Dread), "exchange control of two target" (Shifting
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
   "if this spell was cast from exile" conditions on foretell cards (Haunting Voyage, Cosmos Charger), Earth
   Rumble's reflexive earthbend trigger and Avatar Kyoshi's "then untap that land", Feral Contest and Mark for
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
  supported), Rain of Riches, Vazi, Mr. House, Coin of Mastery (mana from an artifact source).
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
- Elesh Norn, Mother of Machines' "triggers an additional time" (its other ability, Torpor Orb's for opponents, works).
  With Torpor Orb, "whenever counters are put on" still triggers for counters a creature enters with.
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
- "Copy target activated or triggered ability" (Strionic Resonator). Changing the target of a spell with more than one
  target; Mirrorshell Crab's channel ability.
- "Activate only during your turn, before attackers are declared" with additional combats: it's allowed in each
  combat's beginning of combat step but not in an added main phase; check the rulings before relying on it. Random
  discards as a cost: bots use them only with spare cards in hand. "Exile it instead" with something else ("create a
  2/2 black Zombie", Kalitas).
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
  which shield applies first (CR 615.7, 616.1), are made for the player (bots' heuristic); so is splitting a shared
  "next N damage" among several recipients (Harm's Way). Turn-long rules (`GameState.damageRules`, "a source of your
  choice", Safe Passage) apply after the shields on a permanent or player. A source of your choice is offered from the
  battlefield and the stack only (not a commander in the command zone, which can't deal damage there anyway).
  Prevention still out: "that damage is dealt to that source's controller instead" (Reflect Damage), Eye for an Eye's
  "instead that source deals that much damage to you and ~ deals that much damage to that source's controller",
  Dark Sphere's "prevent half that damage, rounded down", Nova Pentacle's "target creature of an opponent's choice",
  "if damage is prevented this way, you may have ~ deal that much damage to target creature" (Channel Harm) and
  "to that creature" (Comeuppance), "sources of the color of your choice" (Prismatic Strands), Rhystic Circle's "any
  player may pay {1}", Heavy Fog's cast restriction; about 95 cards that mention prevention are still out (search
  the card data for "source of your choice" or "prevented this way"). a shield that redirects to
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
