# Roadmap

27,452 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Most played (EDHREC rank): top
1,000: 992 of 992 (100%), top 2,000: 1,989 of 1,989 (100%), top 5,000: 4,944 of 4,988 (99%), top 10,000: 9,063 of
9,979 (90%).

Since round 89 (Oct 20 2026) rounds take cards in popularity order: `npm run popular` lists the most played Commander
cards that don't play yet, most played first, with the lines that block each one (EDHREC rank from
`data/popularity.json`, every ranked Commander-legal card since round 162; `npm run popularity` rebuilds it from the
Scryfall extract). Each round starts at the top of that
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

00. Most played first (`npm run popular`). Out after round 156, most played first: Karazikar, the Eye Tyrant (no
   rulings yet), Encroaching Mycosynth and Biotransference (they change the types of cards in every zone and of
   spells), Hushbringer (no rulings model yet for "dying doesn't cause abilities to trigger" with leaves-the-battlefield
   batches and look-back), Crucible of the Spirit Dragon ("remove X storage counters: add X mana in any combination of
   colors", spendable only on Dragons: the mana mix needs a picker per X and the spend restriction); Thrilling Discovery
   and Old One Eye ("you may discard two cards. If you do": no ruling on discarding with fewer in hand); Wildfire
   Devils, Arcane Proxy, Don & Leo, Problem Solvers ("exile up to one target artifact ... and up to one target creature
   ... Then return them") too; Braid of Fire (cumulative upkeep "Add {R}": a payment that adds mana, which empties at
   the end of the upkeep step); Clockspinning (a counter on a suspended card); The Legend of Yangchen (each player in
   turn chooses among the opponents' permanents); Umbra Mystic (with several Auras, which one's umbra armor applies is
   the controller's choice, not modeled); Lozhan, Dragons' Legacy ("Adventure spell", "any target that isn't a
   commander"); Helga, Skittish Seer (its mana's spend restriction); Jinnie Fay, Jetmir's Second ("if you would create one or more
   tokens, you may instead": a choice at every token creation, and tokens are created in many places, some outside a
   resolution); Conspiracy Theorist, Cayth, Phial of
   Galadriel and Shadowgrange Archfiend (a line each with no piece yet); Elturel Survivors (lands the defending player controls), Within Range (creatures attacking each
   opponent); Blatant Thievery ("for each opponent, gain control of target permanent that player controls": whether the
   spell can be cast when an opponent controls no permanent it could target isn't settled by CR 601.2c or the
   rulings); Thieving Varmint ("spells you don't own": the mana spending rule needs the spell's owner wherever mana is
   checked and paid); Balor ("whenever ~ attacks or dies", "choose one or more. Each mode must target a different
   player", "discards three cards at random"); New Blood (changing a creature type in a card's text, CR 612); Guff
   Rewrites History (one target for each player, then each of them exiles until a nonland card and may cast it);
   Deeproot Pilgrimage ("one or more nontoken Merfolk you control become tapped": taps at the same time aren't one
   event yet); Syr Vondam, Sunstar Exemplar ("when ~ dies or is put into exile while its power is 4 or greater": its
   last known power on a leaves trigger of its own); Aang's Journey (kicked: one search for a basic land card and a
   Shrine card); Tasha, the Witch Queen (page counters, "a spell you don't own"); Mirrormind Crown and Moonlit
   Meditation ("the first time you would create one or more tokens each turn, you may instead create copies": the same
   choice at token creation as Jinnie Fay); Sokrates, Athenian Teacher (a granted prevention whose draws count the
   damage prevented); Aminatou, the Fateshifter (−6: each player gains control of the next player's nonland permanents in
   a chosen direction); Sunken Palace (mana that copies the spell or ability it's spent on); Mathemagics ("target player draws 2ˣ cards":
   no cap yet on a draw that size, for the engine or for bots); Dream Chisel and Kadena, Slinking Sorcerer (a face-down
   creature spell's cost reduction: the cost filters see the card, not the face-down spell, CR 708.4); Ronin, Shadow
   Stalker ("Sacrifice an Equipment attached to ~" as a cost); Ulalek, Fused Atrocity (copy each other spell and ability you control: a copy of every kind of
   stack object, abilities included); Surge to Victory (the trigger it grants for the turn has to remember the exiled
   card it copies); Norman Osborn // Green Goblin (Green Goblin gives mayhem to cards in your graveyard); Zarda,
   Heroes' Advocate ("Heroes" in the plural isn't read as a creature type) and Rashel ("Auras you control have exalted"
   on noncreature permanents). Out after round 160: Zenos yae Galvus // Shinryu (a creature chosen as it enters,
   remembered on the permanent; "as this transforms, choose an opponent"; "when the chosen player loses the game, you
   win"); Filigree Vector (two "any number of target" slots in one ability: only one per ability is modeled); Kaito,
   Bane of Nightmares (a planeswalker that's a creature during your turn, with ninjutsu onto its loyalty); Elenda,
   Saint of Dusk ("hexproof from instants": hexproof from a card type isn't modeled, only from colors); Xu-Ifit,
   Osteoharmonist (the creature "has no abilities" as it enters, so its own enters-tapped, enters-with-counters and "as
   it enters" abilities mustn't apply, rulings; those are read from the printed card as it enters). Out after round 161:
   Toralf, God of Fury // Toralf's Hammer (the front face's "any target other than that permanent" is easy, but the
   Hammer grants the equipped creature an ability whose cost unattaches the Hammer and whose damage the Hammer deals,
   rulings: an ability granted by an Equipment that names the Equipment isn't modeled). Out after round 162, each with a
   piece of its own: Possibility Storm (the spell cast from a hand is exiled by its trigger, then cards until one that
   shares a card type with it), Izzet Generatorium (an energy replacement and "if you've paid or lost four or more {E}
   this turn"), Triple Triad (every player's exiled top card, playable for free by mana value), Mm'menon, the Right Hand
   (mana spendable only on a spell cast from anywhere but your hand), Arvinox, the Mind Flail ("isn't a creature unless
   you control three or more permanents you don't own", face-down cards you may cast), Cyber Conversion (turning a
   permanent face down, rulings: not a double-faced one), Sothera, the Supervoid (each opponent chooses a creature to
   exile, a card exiled with it returns), Tempt with Mayhem (each opponent may copy a spell they don't control, then
   you copy it for each who did), Sin, Unending Cataclysm (removing counters from any number of permanents as it
   enters), Doors of Durin (reveal the top card, then trample or hexproof until your next turn by what you control),
   Goldberry, River-Daughter ("a counter of each kind not on ~", "one or more counters"), Sauron's Ransom (an opponent
   makes a face-down pile and a face-up pile, which the UI would have to hide), Tromokratis ("can't be blocked unless
   all creatures defending player controls block it", CR 509.1c). Out after round 163: Gale, Waterdeep Prodigy (cast
   a card from your graveyard as its trigger resolves, with an exile replacement for that spell), Damping Sphere (a
   land's mana replaced by {C} when it makes two or more, which has to come after other mana replacements like Mana
   Reflection, CR 616.1), Captain Howler, Sea Scourge (+2/+0 for each card discarded in one batch, then a trigger
   for "that creature" this turn), Angel of Jubilation (no paying life or sacrificing creatures for any cost),
   Olivia, Crimson Bride (the returned creature gains a leaves condition on legendary Vampires), Relentless Dead
   ("you may pay {X}" on a dies trigger, then a target with mana value X), Cache Grab ("if you control a Squirrel or
   returned a Squirrel card this way"), Rot Hulk (up to X targets, X the number of opponents), Calix, Destiny's Hand ("until target enchantment you control
   leaves the battlefield"), Xenagos, the Reveler (any number of creature and land cards from among seven onto the
   battlefield), Great Unclean One (a token for each opponent with less life than you). Out after round 164: Agility
   Bobblehead (up to X targets, X counted as it's activated; "can't be blocked except by creatures with haste"),
   Nahiri's Resolve (exile any number of your artifacts and creatures, then return those cards at your next upkeep),
   Omo, Queen of Vesuva (everything counters: every land type, every creature type), Shelob, Child of Ungoliant
   (creatures dealt damage this turn by a Spider you controlled; a copy that's a Food artifact and loses its other
   card types), Professor Hojo (a cost reduction for the first activated ability that targets a creature you control;
   "become the target of an activated ability"), Squee, Dubious Monarch (an alternative cost from the graveyard that
   exiles four other cards, not escape), Moxite Refinery ("remove X counters" of any kinds as a cost), Reverse the
   Polarity ("counter all other spells"; "creatures can't be blocked this turn" means the creatures there as it
   resolves, CR 611.2c), Battle Cry Goblin and the other pack tactics cards (no rulings on when the attackers' total
   power is counted). Out after round 165: Fblthp, Lost on the Range (plot a card from the top of your library), Teyo,
   Geometric Tactician (its −2: no attacks unless conflicting directions, rulings; not done yet), Gavel of the
   Righteous ("remove a counter" of any kind as an equip cost, so a choice of kind), Minthara, Merciless Soul (ward
   {X} that changes with the game), Terra, Magical Adept // Esper Terra (the back face: token copies of enchantments,
   "up to three lore counters", chapter IV's mana and exile-and-return), Balefang (a token named Baneslayer Angel),
   Rendmaw ("play a card with two or more card types"), Historian's Boon (the "triggers" variant), Hero of Bretagard
   (an exile trigger counting cards and permanents), Kid Loki (a static for each creature), Abby, Merciless Soldier
   (named tokens plus entering under an opponent's control), Astelli Reclaimer ("mana value X or less" in a target
   with X the mana spent to cast it), Wurmquake (corrupted, then "another one of those tokens"). Out after round 166:
   The Everflowing Well (a permanent becomes a copy of a spell), Summon: Esper Valigarmanda (cast a card exiled with ~
   with mana of any type), Champions of Minas Tirith ("that opponent may pay {X}", and "can't attack you" only, not
   your planeswalkers, per the rulings), Zurzoth, Chaos Rider ("one or more Devils attack one or more players", "those
   players"), Ashling, Rekindled (mana spendable only on spells with mana value 4 or greater), Gideon's Sacrifice (all
   damage redirected to one permanent), Expand the Sphere (proliferate "the difference" times), Kellan, the Kid ("from
   anywhere other than your hand"), The Master, Transcendent ("milled this turn"), Everlasting Torment (all damage as
   though it had wither), Kotis, the Fangkeeper (cast any number of the exiled spells), Vial Smasher the Fierce (an
   opponent at random, then that player or their planeswalker), Ragost, Deft Gastronaut (artifacts become Foods with a
   granted ability), Observed Stasis ("remove enchanted creature from combat"), Eshki, Temur's Roar ("that spell's
   power"), Pili-Pala ({Q} in a mana ability), Mariposa Military Base ("you may have ~ enter tapped. If you do, ...").
   Out after round 167: Dinosaurs on a Spaceship and Deep-Sea Kraken (abilities that work while the card is exiled,
   triggered by a time counter coming off or by "if ~ is suspended"; the many ways counters are removed don't send such
   events yet), The Infamous Cruelclaw ("cast that card by discarding a card rather than paying its mana cost", a new
   alternative cost with its own prompt and bot), Squandered Resources (mana of a type the sacrificed land could
   produce: which land is sacrificed decides the color, and autopay picks colors before costs), Greymond, Avacyn's
   Stalwart (two abilities chosen as it enters; only one chosen keyword is kept), Shelinda, Yevon Acolyte ("put a
   counter on that creature if ... Otherwise, put a counter on ~"), Gaea's Blessing ("put into your graveyard from your
   library" triggers). Round 167 went down the list to Accumulate Wisdom (rank 5,595).
   Out after round 168: Cosima, God of the Voyage (an ability that works while it's exiled, like Dinosaurs on a
   Spaceship), Yasharn, Implacable Earth ("players can't pay life or sacrifice nonland permanents to cast spells or
   activate abilities": a check on every cost, autopay and bots included), Orvar, the All-Form ("when a spell or ability
   an opponent controls causes you to discard ~": who caused a discard isn't kept), Share the Spoils (each player plays
   from its exiled cards on their own turn, with mana of any type, and "whenever an opponent loses the game"), Sanctum
   of All (Shrine triggers that trigger an additional time), Master Warcraft (you declare everyone's attackers and
   blockers), Chef's Kiss (gaining control of a spell, then targets chosen at random), Make an Example (each opponent
   separates their creatures into piles: a pile prompt per opponent), Perplexing Chimera (exchanging control of a
   permanent and a spell), Karn, Living Legacy ("pay any amount of mana" as an effect), Benevolent Blessing (protection
   that doesn't remove your Auras and Equipment already attached), Ashling, the Limitless (spells that gain evoke as
   they're cast), Omnath, Locus of All ("three mana in any combination of its colors" from a trigger), Crypt Rats
   ("spend only black mana on X": a spend rule for part of a cost), Summons of Saruman (casting from among the milled
   cards). Round 168 went down the list to Glen Elendra Guardian (rank 5,741), skipping over the cards still listed by
   `npm run popular`.
   Out after round 169: Siren's Ruse ("if a Pirate
   was exiled this way": the creature as it was exiled, after the flicker made a new object), Security Bypass ("as long
   as enchanted creature is attacking alone"), Ephara, God of the Polis (creatures that entered last turn aren't kept),
   Tangled Colony ("the amount of damage dealt to it this turn" isn't kept), Pontiff of Blight (granting extort, a
   triggered keyword, to other creatures), Dreadhound ("a creature card is put into a graveyard from a library" triggers), Carnivorous Canopy (the
   destroyed permanent's last known mana value), Skyfisher Spider ("you may gain N life. If you do": not a checkable
   may), Endurance Bobblehead (up to X targets with X counted as it's activated), Esix, Fractal Bloom (a token
   replacement that copies a creature you choose). Round 169 went down the list to Venser, the Sojourner (rank 6,376),
   skipping over the cards still listed by `npm run popular`.
   Out after round 170: Carth the Lion (a loyalty cost raised for planeswalkers you control), Scorched Ruins and Lotus
   Vale (sacrifice two untapped lands as they enter), Hooded Blightfang (its second ability needs a "deals damage to a
   planeswalker" trigger; the first parses now), Cosmic Rebirth ("if you don't put it onto the battlefield" after a may), Bane's Contingency ("if that
   spell targets a commander you control ... instead"), Killer Service (pay mana and sacrifice as one "may" cost),
   Sapling of Colfenor (gain toughness and lose power from the revealed card). Round 170 went down the list to Cloud,
   Planet's Champion (rank 7,020), skipping over the cards still listed by `npm run popular`.
   Out after round 171, each needing a piece of its own: Haakon, Stromgald Scourge (cast only from the graveyard, and
   Knight spells from the graveyard), Averna, the Chaos Bloom (a land among the cards cascade exiles), Anax, Hardened
   in the Forge ("if the creature had power 4 or greater, create two ... instead"), Armory Automaton
   ("attach any number of target Equipment"), Glen Elendra's Answer
   (counter all spells and abilities opponents control), Desertion (a countered card put onto the battlefield instead),
   Chandra, Spark Hunter (+2: "sacrifice an artifact or discard a card. If you do"), Phyrexian Unlife and Lich's Tomb
   and Transcendence (life at 0 or less with damage as infect, a sacrifice per life lost, life gained per life lost),
   Starving Revenant (no count of the
   cards a surveil kept on top), Mistbreath Elder (returning another creature with "if you do / otherwise"), Cult
   Conscript ("a non-Skeleton creature died this turn": the deaths this turn keep no creature types), Verdeloth the
   Ancient ("other" applies to the Treefolk only), Mandate of Peace ("end the combat phase"), Spectra Ward ("this effect
   doesn't remove Auras"), Chain Assassination ("if another creature died this turn"), Knight of New Alara (+1/+1 for
   each of its colors), Welcome the Dead (cards put into your graveyard from your hand or library this turn), Konda's
   Banner (creatures that share a color or a creature type with the equipped creature), Fork and Evereth ("except that
   the copy is red"), Benefactor's Draught ("whenever a creature an opponent controls blocks" for the turn), Blood for
   Bones (a battlefield return then "another" to the hand), Voracious Bibliophile (draw as many as the spell has
   targets), Locket of Yesterdays (cards with the same name as the spell), Huskburster Swarm (creature cards you own in
   exile and in your graveyard), Larval Scoutlander ("a land or Lander"), Urdnan, Dromoka Warrior (double strike
   "if that creature has two or more +1/+1 counters ... instead"), Admiral Brass, Unsinkable (a Pirate returned with
   base power and toughness 4/4), Alena, Kessig Trapper (the
   greatest power among creatures that entered this turn), Kyoshi Island Plaza (Shrines you control), Widespread
   Brutality (the amassed Army deals damage equal to its power). Round 171 went down the list to Hunter's Blowgun (rank
   7,721), skipping over the cards still listed by `npm run popular`.
   Out after round 172: Primal Growth ("Kicker—Sacrifice a creature": a kicker that isn't mana needs its own cast
   choice and prompt), Plague Reaver ("return it to the battlefield under that player's control at the
   beginning of their next upkeep": a delayed return under an opponent's control), Elenda, Saint of Dusk (its second
   sentence, "an additional +5/+5 as long as", is a static of its own). Round 172 took the cards from the list below
   that parse with small pieces (Tainted Remedy, Balan, Marcus, Serra the Benevolent, Oblivion Stone, Curator's Ward
   and others) and easy ones further down, to Grinning Ignus (rank 8,293); `npm run popular` from Godsend (rank
   7,725) on is still to go through.
   Out after round 173: Godsend (exiling one of the creatures blocking or blocked by the equipped creature, and
   "can't cast spells with the same name as a card exiled with ~"), The Red Terror (a damage trigger for any red
   source you control), Amped Raptor (casting a card by paying energy instead of its mana cost), Repeated
   Reverberation (a delayed copy of the next instant, sorcery or loyalty ability), Outlaws' Merriment (a mode chosen
   at random), Moldgraf Monstrosity (two creature cards at random from a graveyard), Hidetsugu and Kairi (life loss
   between the exile and the free cast), Scuttlemutt ("the color or colors of your choice" needs a multi-color
   picker), Role Reversal, Shifting Loyalties, Daring Thief and The Trickster-God's Heist (two targets that "share a
   card type" or "permanent type": no target rule between two targets yet), Conjured Currency ("target permanent you
   neither own nor control"), Visions of Duplicity (flashback cheaper by a commander's mana value). Round 173 went
   down the list from Godsend to Dovin, Hand of Control (rank 8,497), taking the cards that parse with small pieces,
   and took the other cards that share their mechanics wherever they are in the list: exchanging control (Switcheroo,
   Avarice Totem, Kitsune, Djinn of Infinite Deceits, Modify Memory and others), "you may sacrifice an artifact or
   discard a card", "the discarded card's mana value", "shuffle your library" and "target creature other than this
   creature".
   Out after round 174: Radagast the Brown and Conjurer's Mantle ("a card that shares a creature type with" a
   creature, among the cards looked at), Quicksilver Elemental (gaining a creature's activated abilities), Secret of
   Bloodbending (controlling a player), Chiss-Goria, Forge Tyrant (granting affinity for artifacts), Molecule Man
   (granting miracle), Confiscation Coup (paying energy equal to the target's mana value), Zoyowa Lava-Tongue and
   Osseous Sticktwister (a punisher read back with "didn't"), Scriv, the Obligator (Aura tokens with abilities), Craig
   Boone, Novac Guard (a reflexive damage trigger with "unless that creature's controller"), Spelltwine (casting copies
   of exiled cards), Ultimate Magic: Meteor ("if ~ was cast from exile" with a choice for each opponent), Spectral
   Searchlight (another player adds the mana), Rat King, Verminister ("all other cards with the same name"),
   Valgavoth's Onslaught (manifest dread X times), Motivated Pony ("untap those creatures" after a Food entered),
   Valentin, Dean of the Vein (a reflexive trigger from a replacement), Spider-Verse ("from anywhere other than your
   hand"), Captain America, First Avenger (unattaching an Equipment as a cost), Desert Warfare, Soulfire Eruption,
   March of Reckless Joy ("up to two of those cards"), Círdan the Shipwright (secret council for players), Dragonlord
   Kolaghan, Back for Seconds (bargain's "instead"), Sanctuary Warden (removing a counter from a chosen permanent as a
   cost), Kamiz, Obscura Oculus, Commander Liara Portyr, Bre of Clan Stoutarm, Lich's Mastery, Thunderwave,
   Contamination, Amzu, Swarm's Hunger, Ravenous Rotbelly, Enchanted Evening, Luxurious Locomotive and Subterranean Schooner ("crewed it"), Gwen Stacy ("for as long as you control ~"),
   Aurelia, Exemplar of Justice (its "choose up to one target creature you control" sentence with color conditions
   doesn't parse yet), Relic Amulet ("that much"), Hankyu (a granted ability with its own counters), Essence Sliver
   ("whenever a Sliver deals damage", any damage: no trigger for that yet), Topography Tracker (an explore
   replacement). Round 174 went down the list from Myojin of Cryptic Dreams to Detention Sphere (rank 8,455), then took
   the easy cards from there to about rank 8,880 (Risk Factor, What Must Be Done, Necklace of Girion, Savor the
   Moment, Uglúk, Midnight Tilling, Tax Collector, Over the Edge), plus Jadelight Ranger and Defossilize ("explores,
   then it explores again"); `npm run popular` from Detention Sphere on is still to go through.
   Out after round 175: Detention Sphere (exiles every permanent with the same name, and returns them all: one exile
   linked to several cards), Tangle Wire (the upkeep player taps one permanent of their choice for each fade counter),
   Steward of the Harvest (gaining the activated abilities of exiled land cards), Solitary Sanctuary ("whenever you
   tap an untapped creature an opponent controls": who tapped it isn't recorded), Werewolf Pack Leader (pack tactics,
   and "isn't a Human"), Agent's Toolkit (moving one counter of a chosen kind), Heroes in a Half Shell ("one or more
   ... deal combat damage" with "each of those creatures"), Ran and Shaw ("if you cast them and" a graveyard count),
   Rampaging Aetherhood (paying any amount of {E} for counters), Unstable Glyphbridge (a creature chosen for each
   player, then destroy the rest), Flitterwing Nuisance (an activated ability that makes a this-turn trigger), Curious
   Forager (forage with a reflexive trigger), From the Catacombs (a corpse counter, the initiative and an exile
   replacement together), Loki, God of Mischief ("becomes the target of an ability you control"), Katsumasa, the
   Animator ("if it's not a Vehicle"), Slagstone Refinery (put into a graveyard or exile from the battlefield, one
   trigger), Inalla, Archmage Ritualist (an eminence copy with haste, exiled at end step), Threats Undetected (four
   creature cards with different powers, an opponent chooses two), Leader, Super-Genius (a connive replacement), This
   Is How It Ends (villainous choice after a shuffle), Azor's Gateway (counting mana values among cards exiled with
   it), Tamiyo, Collector of Tales, Anchor to Reality (the sacrificed permanent's mana value after a search), Detective's
   Phoenix (bestow with collect evidence, cast from the graveyard), Visions of Ruin (flashback cheaper by a
   commander's mana value), Strata Scythe (imprint a land from the library), Wickersmith's Tools ("one or more -1/-1
   counters are put on a creature"), Printlifter Ooze (turned face up), Adrestia ("if an Assassin crewed it"),
   Sorcerous Squall (casting from an opponent's graveyard), Narset, Enlightened Master (free noncreature casts from
   among exiled cards), Azra Oddsmaker ("choose a creature" with a this-turn trigger), Capricopian (reselecting the
   attacked player, activated by that player), Aggressive Mining ("you can't play
   lands"), Essence Sliver (any damage by a Sliver), Hunting Wilds (Forests put onto the battlefield this way become
   3/3), Overwhelming Splendor (a player can't activate abilities that aren't mana abilities), Gandalf, Goblins' Bane
   (Flameshape's face-down exile with play permission), Mastermind's Acquisition (a card from outside the game), Qal
   Sisma Behemoth (an attack cost of its own), The Ancient One (a reflexive mill from a discard), Deathgorge Scavenger
   ("you may exile" with two "if it's a" results), Tithe. Round 175 went down the list from Detention Sphere to
   Capricopian (rank 8,592), then took the easy cards from there to about rank 9,100 (Plate Armor, Indebted Spirit,
   Subjugate the Hobbits, Biovisionary, Bower Passage, Karametra's Blessing, Zuko's Conviction and others), plus the
   cards that share their mechanics: "can't attack or block unless" any condition (Bontu the Glorified, Hazoret the
   Fervent, Lupine Prototype, Technodrome, Training Drone and others), "whenever you cast a spell with {X} in its mana
   cost" (Zaxara, Nev, Owlin Spiralmancer, Lattice Library, Geometer's Arthropod), "enchanted creature or enchantment
   creature" (Feast of Dreams, Nyx Herald, Kestia, Temple Thief).
   Out after round 176: Extract Brain (an opponent chooses X cards from their hand for you to look at), Astelli
   Reclaimer (X is the mana spent to cast it), Divergent Transformations and Chaos Mutation (each player's replacement
   in APNAP order), Black Panther, Wakandan King ("move all +1/+1 counters ... if one or more are moved this way, that
   much"), Grell Philosopher (Horrors gain an opponent's artifact's activated abilities), Pulmonic Sliver (a granted
   replacement), Etrata, Deadly Fugitive (a granted turn-face-up ability and cloak), The Creation of Avacyn (turning
   the exiled card face up), Honest Work (a name change), Pawpatch Recruit ("target creature other than that
   creature" needs the trigger's subject at target choice), Jhoira's Timebug and Greater Gargadon (suspended cards),
   Huntmaster of the Fells (two targets, one about the other's controller), Archelos, Lagoon Mystic (enters tapped or
   untapped by its own state), Venerable Warsinger (a target's X from the trigger's damage, unknown at targeting),
   Rushed Rebirth (a this-turn dies trigger with "lesser mana value" than that creature), Barrin, Tolarian Archmage (no
   turn log of permanents put into hands), Omarthis (manifest a counted number), Pull from Eternity (no targets in
   exile yet), Wall of Shards (cumulative upkeep "an opponent gains 1 life"), Shadow of the Grave (the discard log keeps
   card keys, not the cards), Rampaging War Mammoth (cycling {X}), Pizza Face (an optional target that becomes a
   Mutant creature), the hybrid Mimics ("a spell that's both blue and red": no all-of-these-colors filter), Does
   Machines, Crown of Convergence ("share a color with that card"). Round 176 went down the list from Bristlebud Farmer to about rank
   9,240 (Kelsien, the five Runes, Great Hall of the Biblioplex, Questing Druid, Worldslayer, Progenitor Exarch,
   Diviner of Mist, Anje Falkenrath, Unite the Coalition, Zedruu, Lotuslight Dancers, Dream Eater, Chandra,
   Flamecaller, Ever-Watching Threshold, Bonder's Ornament, Alpha Status, Swallowed by Leviathan, Fae Offering, Death
   Tyrant, Silverfur Partisan, Tainted Indulgence, The Tabernacle at Pendrell Vale, Public Thoroughfare, Fear, Fire,
   Foes!, Scrounging Bandar, Malboro, Kothophed, Argent Dais, Propagator Drone, Vampire Nocturnus, Mul Daya
   Channelers, Lluwen, Wartime Protestors, Horned Loch-Whale, Sinkhole Surveyor, Haliya, Realm Seekers, Reality Heist
   and others), taking the easy ones.
   Out after round 177: Muraganda Petroglyphs ("creatures with no abilities"), Ertai's Scorn and Even the Score
   (colored cost reductions), Skyscribing (forecast), Clever Conjurer ("not named ~" in target legality), Zaffai,
   Thunder Conductor (an opponent chosen at random), Super-Soldier Serum, Xathrid Demon, Minion of Leshrac and Oath
   of Lim-Dûl (their other lines), Geralf, the Fleshwright ("each other Zombie that entered this turn": the count
   leaving out the one that entered), Oketra's Last Mercy and Long Rest ("lands you control don't untap during your
   next untap step", lands that enter later too), Trench Behemoth and Sizzling Soloist ("attacks during its
   controller's next combat phase if able"), Brotherhood Outcast (an Aura card returned to the battlefield), Fury Charm
   (time counters on a suspended card), Exterminate! (replicate by tapping a Dalek), Flaming Gambit (the player
   redirects the damage to a creature), Drach'Nyen ("the exiled card's power"), Kalamax ("whenever you copy an instant
   spell"), Extinction Event (odd or even), Fateful Handoff (draw by a target's mana value, then give it away),
   Reprocess (sacrifice any number of three kinds), Wave of Rats ("if it dealt combat damage to a player this turn"),
   Darksteel Angel (-1/-1 counters can't be put), Reality Acid, Hammerheim (landwalk), Coalition Victory. Round 177
   went down from rank 9,240 to about rank 10,060 (Frost Titan, Seasoned Pyromancer, Devil's Play, Mind Funeral,
   Custodi Lich, Resolute Archangel, Jadelight Spelunker, Smaug, Tatyova, Gaddock Teeg, Aether Storm, Taigam, Lord of
   the Pit, Biorhythm, Flux, Awaken the Erstwhile, Martha Jones, Phoenix Fleet Airship, Bloodspore Thrinax, Yorvo,
   Prismari Pianist, Baru, Sokka, Arcbound Tracker, Gold Rush, Tainted Treats and others), taking the easy ones.
   Out after round 178: Giott, Colossal Rattlewurm, Dregscape Sliver, Foe-Razer Regent, Mathas, Ozox and Arcbound
   Javelineer (their other lines), Yosei, the Morning Star (targets limited by the other target, a player), Ravener
   (must attack a target opponent), Zameck Guildmage ("this turn" extra counters as creatures enter), Cunning
   Nightbonder (spells "cast", copies left out), Bushy Bodyguard and Treetop Sentries (forage as an effect, a new
   choice), Ride Down ("blocked by that creature"), Flesh Reaver (damage to several recipients at once), Quest for the
   Nihil Stone (two intervening-if conditions), Alpharael (ward with a random discard), Fealty to the Realm. Known
   limits: Spellbreaker Behemoth and Carrion Grub read a spell's or card's printed power, so a */* is 0 there. Round 178
   went down from rank 10,060 to about rank 10,640 (Baneful Omen, Galvanic Relay, Lightning, Security Sergeant, Daxos
   of Meletis, Isolated Watchtower, Tale of Momo, Fix What's Broken, Avatar of Might, Deepwood Denizen, Drillworks
   Mole, Azure Fleet Admiral, Gwafa Hazid, Hour of Devastation, Iridian Maelstrom, Thran Turbine, Spellbreaker
   Behemoth, Cursed Recording, Lulu, Fertile Thicket, Mirko Vosk, Dimir Charm, Gandalf, White Rider, Steal the Show,
   Willowdusk, Gisa's Favorite Shovel, Reality Smasher, Voice of Resurgence, Throatseeker and others), taking the easy
   ones, and further cards sharing their mechanics (Psychic Spiral, Hurkyl's Recall, Perennation, Cemetery
   Recruitment, Carrion Grub, Curse of Thirst).
   Out after round 179: Smoldering Egg (counters equal to the mana spent on another spell), Cryptic Spires (circled
   colors), Jadzi, Oracle of Arcavios, Oskar, Rubbish Reclaimer, Strict Proctor and Kadena's Silencer (countering
   triggered abilities), Alacrian Armory, Deadly Cover-Up, Chandra, Fire Artisan (loyalty counters removed),
   Kusari-Gama, Reap (X targets set by another target), Fearless Swashbuckler ("a Pirate and a Vehicle attacked"),
   Friendly Rivalry (two differently targeted creatures each dealing damage), Invoke Justice (counters distributed
   among a target player's creatures), The Eagles Are Coming!, Thief of Blood, Eldrazi Mimic ("base power and
   toughness become" another's), Arcbound Javelineer ("Remove X counters" as a cost), Wonderscape Sage ("unless that
   land had a nonbasic land type"), Tajuru Preserver and Sigarda (sacrifice prevention), Pandemonium (another player
   chooses targets), Curse of Shallow Graves ("that attacking player may"), Namor (blue mana symbols in a cost), Tune
   Up (a Vehicle becoming an artifact creature with no duration), Bounding Felidar ("for each of those creatures" after
   counters), Gleam of Authority ("other creatures" there means other than the enchanted creature), Azog, Sengir,
   Mysterio, Gate to the Aether. Round 179 went down from rank 10,640 to about rank 11,250 (Caller of the Claw,
   Obzedat, Herald of Amity, Ajani Unyielding, Bess, Mana Breach, Nahiri, Heir of the Ancients, Goldwardens' Gambit,
   Expel from Orazca, Mystical Dispute, Stern Scolding, Roalesk, King Macar, Deathrender, Oathkeeper, Goro-Goro and
   Satoru, Catapult Fodder, From Father to Son, Besmirch, Sly Instigator, Strategic Betrayal, Wasitora, Millicent,
   Unnatural Moonrise, Rally the Ancestors, Ever After, Olivia, Mobilized for War, Kurbis, Vile Redeemer and others),
   taking the easy ones.
   Out after round 180: Tom, Bert, and William and Fang, Roku's Companion (returning as another type), Spellweaver
   Helix, Ian Malcolm, Chaotician, New Way Forward, Grenzo, Dungeon Warden, Trove Warden, The Nipton Lottery, Emergent
   Sequence, The Seventh Doctor, Lucy MacLean, Gideon Jura, Treacherous Greed ("a creature that dealt damage this
   turn"), Foggy Swamp Visions, Gate to the Afterlife, Galloping
   Lizrog, Dimir Machinations (exiling some of target player's top cards), Read the Runes, Liege of the Tangle, Sunder
   the Gateway (transform an Incubator you control), Myriad Construct, Zaffai, Thunder Conductor (an opponent chosen at
   random), All-Seeing Arbiter, Life's Finale (an opponent's library into their graveyard), Aerith Rescue Mission (a
   stun counter on one of them), Territorial Aetherkite, Stunning Reversal, Manabond, Glowcap Lantern (granting "look at
   the top card of your library any time"), Wernog, Jinxed Choker, Fall of the Impostor (the greatest power among a
   target opponent's creatures), Eligeth (scry replaced by draw), The Astonishing Ant-Man ("remove any number of
   counters" as a cost), Power Surge (untapped lands at the start of the turn), Jace, Cunning Castaway, Curse of
   Vengeance, Shaile ("entered under your control this turn"), Tales of the Ancestors. Round 180
   fixed "other" in Auras' and group statics (Bravado, Conclave's Blessing, Vampirism, Heroes' Podium, Sliver Legion:
   other than the permanent it affects; Daru Stinger and Kjeldoran Javelineer counted their target's counters) and went
   down from rank 11,250 to about rank 11,770 (Anoint with Affliction, Ceaseless Conflict, Desperate Measures, Egon,
   Faithbound Judge, Feast on the Fallen, Kami of Transience, Lightmine Field, Mark of Sakiko, Miles "Tails" Prower,
   Caradora, Melira, Samut, She-Hulk, Herald of Ilharg, Vengeful Regrowth, Panther Habit, Tide Shaper, Essence
   Symbiote, Mask of the Schemer, Vantress Gargoyle, Aether Snap, Serra Avenger and others), taking the easy ones.
   Out after round 181: Horrid Shadowspinner (the number discarded is fixed as you choose to draw), Luminate Primordial
   ("that player gains life equal to its power", per target), Old Man Willow ("another creature or a token" to
   sacrifice), Terrifying Presence, Delirium, Heroic Feast, Fated Clash, Rent Is Due, Avengers Assemble!, Chocobo Camp,
   Transcendence, Fumble, Goblin Assassin, Kasmina, Enigma Sage, Codie, Vociferous Codex, Jetfire, Hollow Marauder,
   Gorex, the Tombshell, Council's Deliberation, Lumbering Megasloth, Braids's Frightful Return, Awakening of
   Vitu-Ghazi, Quiet Speculation, Breaking of the Fellowship, Amareth, Stoic Farmer, See the Unwritten, Razorlash
   Transmogrant, Auntie Blyte, Nimble Trapfinder, Willie Lumpkin, Ajani Unrelenting, Kitt Kanto, Ellie, Azor, Oko the
   Ringleader, Fiery Annihilation, Spell Crumple; past rank 12,200: Academy Loremaster, Cait, Celebrate the Harvest,
   Cephalid Constable, Choice of Damnations, Cut Propulsion and Wisecrack ("deals damage to itself equal to its
   power"), Evin, Ghired (populate tapped and attacking), Last-Ditch Effort, Misfortune Teller, Peer Pressure, Reckless
   Blaze, Resplendent Marshal, Sporogenic Infection, Ward of Bones. Round 181 went down from rank 11,770 to about rank
   12,330 (Ugin's Conjurant and Polukranos, Unchained (damage prevented by removing +1/+1 counters), Hinder (top or
   bottom of the library), Urge to Feed, Mogg Infestation, Toxin Sliver, Moonstone Harbinger and Wax-Wane Witness ("gain
   or lose life during your turn"), Heidegger, Teachings of the Archaics, Scourge of the Skyclaves, Skanos Dragonheart,
   Gloom Ripper, Backlash, Tribute to Hunger, Turn the Earth, Curse of Stalked Prey, Wall of Essence, Eyeblight
   Massacre, Kirri, Of One Mind, Eagle of Deliverance, Tui and La, Carnival of Souls and others), taking the easy ones.
   Out after round 182 (ranks 12,330 to 13,222): City of
   Solitude (mana abilities only on your turn), Words of Waste, Kirtar's Wrath and Cleansing Meditation (threshold
   "instead" sweepers), Chandra, Heart of Fire, Lynde, Salt Road Ambushers, Origin of the Hidden Ones, Grab the Reins,
   Pyromancer Ascension, Verdant Mastery, Primal Adversary, Planar Void, In Too Deep, Dollhouse of Horrors, Harald
   Unites the Elves, Peerless Samurai, Exquisite Archangel, Icewrought Sentry, Kellan, Planar
   Trailblazer, Najal, Rescue from the Underworld, Seal of the Guildpact, Fear of Infinity, Elderscale Wurm, Cradle of
   Vitality, Helm of Kaldra, Brilliant Ultimatum, Catastrophe, Will Kenrith, Cultural Exchange, Magus of the Order,
   Scheming Fence, Oath of Lieges, Helm of Obedience, Concerted Effort, Belbe's Portal, Edgewall Innkeeper, Simic
   Manipulator, Endless Whispers, Burn from Within, Skyfire Phoenix, Contagion, Gutter Grime, Coffin Queen, Genesis
   Storm, Grim Return, Infernal Offering, Varolz, Undercellar Sweep, Wave of Vitriol, Martyrdom, Soul-Scar Mage,
   Remembrance, Spy Network, Dimir Doppelganger, Jailbreak, Inverter of Truth, Immovable Rod, Hypergenesis, Soul
   Transfer and the rest of the 222 still unsupported in that range; past it: Phytohydra (damage replaced by +1/+1
   counters even when it can't be prevented, which needs its controller's order against prevention shields), Intimidation
   Bolt ("other creatures can't attack": other than the target), Fade Away, Viashino Heretic, Dazzling Reflection,
   Arcbound Fiend, Consume Spirit, Pestilent Spirit, End Hostilities.
   Round 182 went down from rank 12,330 to about rank 13,222 (Temporal Cleansing, Deem Inferior, Lost Days, Happy Hogan
   and Trickster's Stratagem (second from the top or the bottom, the owner's choice), Phyrexian Hydra, Pain
   Magnification, Gnoll War Band and Furious Spinesplitter (opponents dealt damage this turn), No Witnesses, Skull
   Storm, Basandra, Stinkdrinker Bandit, Guardian of the Gateless, Angelic Guardian, Simian Sling, Valiant Rescuer,
   Mortuary, The Final Days, Nature's Revolt, Living Lands, Kormus Bell, Ambush Commander, Invincible Hymn, See Beyond
   and others), taking the easy ones.
   Round 183 (the lanes met at about rank 13,200, so every card left is one a round skipped) went back to the top of
   `npm run popular` for harder ones: Rhino, Barreling Brute (a spell with mana value 4 or greater cast this turn),
   Wildgrowth Walker, Lurking Chupacabra, Merfolk Cave-Diver and Shadowed Caravel ("whenever a creature you control
   explores"), Glacial Dragonhunt and Evie Frye ("when you discard a nonland card this way"), Pyretic Rebirth and Lie in
   Wait ("that card's" value after it moved), Guardian of Tazeem and Koth ("if that land is an Island"), Duskmantle Seer,
   Axgard Artisan (the first time a kind of counter is put on it each turn), Ludevic, Necro-Alchemist, Unravel (less
   mana spent than its mana value), Virulent Wound (its controller as it died gets the poison counter), Ashling, the
   Extinguisher, Blot Out and End of the Hunt, Predatory Impetus, Crack in Time, Long Feng, Risona, Structural Assault
   (artifacts put into graveyards this turn), Thrilling Discovery ("discard two cards. If you do"), Lantern of Insight,
   Mathemagics (2ˣ), Spirit of the Labyrinth, Dosan the Falling Leaf, Skyfisher Spider, Siren's Ruse ("if a Pirate was
   exiled this way") and Getaway Glamer ("if no other creature has greater power").
   Out after round 183 (looked at, not done): Karazikar, Encroaching Mycosynth and Biotransference (types of cards in
   every zone), Hushbringer, Within Range (each opponent's own count of creatures attacking them), Elturel Survivors (a
   static count of the defending player's lands), Shelinda, Yevon Acolyte (the entered creature's power once it has left), Shadowgrange Archfiend (the
   greatest power among creatures sacrificed this way), Old One Eye (a trigger from the graveyard), Phyrexian Soulgorger
   (cumulative upkeep that sacrifices creatures), Tangled Colony (damage dealt to it this turn), Judge Unworthy (scry, then reveal, then damage).
   Round 184 went on from the top: pack tactics, the total power of the creatures attacked with as they were declared
   (Battle Cry Goblin, Gnoll Hunter, Hobgoblin Captain, Intrepid Outlander, Minion of the Mighty, Targ Nar, Tiger-Tribe
   Hunter), Troyan and Helga (mana for spells with mana value N or greater or with {X}), Elenda, Saint of Dusk, Eshki
   ("that spell's power"), Lozhan ("any target that isn't a commander") and the Adventure spell triggers (Storyteller
   Pixie, Chancellor of Tales, Gorion), Vial Smasher the Fierce and Curse of the Pierced Heart ("that player or a
   planeswalker that player controls", a new prompt), "choose an opponent at random" (Raving Dead, Ruhan of the Fomori,
   Truth or Consequences), Doran, Besieged by Time, Phial of Galadriel, Ral Zarek (coins no one calls), Robot
   Domination, and "up to X targets, where X is ..." counted as the targets are chosen (Endurance Bobblehead,
   Prismabasher, Mogis's Marauder, Archipelagore, Aether Burst, Recantation, Rumbling Crescendo, Serra's Liturgy, Vile
   Requiem). Fixed: Blightwing Bandit exiled the top card of your own library, not that opponent's.
   Out after round 184 (looked at, not done): Blood Scrivener (a draw
   replaced by two draws and a life loss), Knight Rampager (a target chosen at random), Rot Hulk (up to X cards returned
   from a graveyard to the battlefield), Agility Bobblehead ("can't be blocked except by creatures with haste"),
   Pili-Pala ({Q} in a mana ability), Trail of Mystery ("whenever a permanent you control is turned face up"), Sarkhan
   the Masterless (each Dragon deals damage to the attacker), Ephara, God of the Polis (another creature entered under
   your control last turn), Mindblade Render (combat damage dealt by a Warrior), Dreadhound (a creature card put into a graveyard from a library), Indoraptor (bloodthirst
   X), Werewolf Pack Leader ("isn't a Human").
   Round 185 went on from the top: "if it's not that player's turn" (Price of Glory), cards "put there from the
   battlefield this turn" returned (Faith's Reward, Second Sunrise, Thrilling Encore, Gerrard's Hourglass Pendant,
   Gleancrawler, No Rest for the Wicked, Twilight Shepherd, Gerrard, Weatherlight Hero), "{3}, {T} or {U}, {T}" (the
   Shards, the same code as Lane B's round B15, plus Crystal Shard and Erratic Portal's "return ... unless its
   controller pays"), Gavel of the Righteous (equip by removing a counter), Fire Nation Turret, Blood Tribute (life
   lost this way: what the life total actually lost), Wand of the Worldsoul (the next spell has convoke), Enhanced
   Surveillance, Erdwal Illuminator (the first investigate each turn), "if you put a counter on a creature this turn"
   (Lasting Tarfire, Lord Jyscal Guado), Duskmantle Guildmage (a delayed "whenever a card is put into an opponent's
   graveyard"), Strong (life from radiation), Energybending, Gran-Gran, granted "spells your opponents cast that target
   ~ cost more" (Jubilant Skybonder, Callaphe), Reverse the Polarity, Corrupted Crossroads (mana for devoid spells),
   Shadow, Mysterious Assassin.
   Out after round 185 (looked at, not done): Liesa, Shroud of Dusk (commander tax paid as 2 life each time), Font of
   Agonies (no event for paying life), Angel of Jubilation and Yasharn (which costs pay life or sacrifice, every cost
   path audited), Whirlwind Denial (one payment prompt per spell and ability), Crucible of the Spirit Dragon (X mana in
   any combination).
   Round 186 went on from the top: "become ... in addition to their other types" for other permanents (Tangletrove
   Kelp's Clues, Vihaan's Treasures, Shadow Puppeteers' "red Dragon with base power and toughness 4/4", Nissa of
   Shadowed Boughs' +1), Katilda ("Spirits and/or enchantments", and her Rising Dawn), "players who control more lands
   than you" (Oreskos Explorer), "the number of cards looked at while scrying this way" (Elvish Mariner, Elrond),
   Equipment that's attached as it brings a creature (Pre-War Formalwear, Fractal Harness, Field-Tested Frying Pan),
   "the amount of life you gained" kept as the ability resolves (Frying Pan, Hurska Sweet-Tooth, The Archimandrite's
   trigger), Red Death, "whenever ~ evolves" (Watchful Radstag, Renegade Krasis), Eris (different mana values among
   instants and sorceries), Soldevi Adnate ("black or artifact creature"), Varchild, Hadana's Climb ("two or more
   counters" conditions, also Urdnan), Dowsing Device ("Then transform ~ if ..."), countering abilities from a kind of
   source and what happens to that permanent (Green Slime, Trickbind, Rust, Brown Ouphe, Nimble Obstructionist),
   Campfire (commanders from the command zone and graveyard to hand), Radiant Destiny, Lifecraft Engine (crewed
   Vehicles are the chosen type), Nicanzil ("explores a land card" / "a nonland card"), Mayael's Aria (each condition
   after its instruction, checked in turn), Commodore Guff, Sigarda's Summons, Prismatic Undercurrents.
   Out after round 186 (looked at, not done): Interdimensional Web Watch (mana spendable only on spells cast from
   exile: a spell's ManaUse doesn't know its zone, as for Mm'menon), Barrow-Blade ("that creature loses all abilities" for a blocker or
   blocked creature), Ironsoul Enforcer ("~ or a commander you control attacks alone"), Smirking Spelljacker (exile
   target spell, cast it later), Koll, the Forgemaster ("if it was enchanted or equipped" as it died), Sorceress's
   Schemes ("an exiled card with flashback you own" as a target), Fumiko the Lowblood (bushido X, counted as it
   resolves), Archon of Coronation (damage that doesn't cause life loss).
   Round 187 went on from the top: "the greatest mana value of a commander you own on the battlefield or in the command
   zone" (the Visions cycle's flashback costs {X} less, Cloudkill, Majestic Genesis, Imposing Grandeur with each
   player's own commanders), Visions of Dread (the target opponent picks the card, which enters under your control;
   browser test), "When there are N or more X counters on ~" with number words (Mazemind Tome, Deadly Designs), "exile
   it. If you do" (Archfiend's Vessel), Nine Lives (prevent damage to you and put a counter on it, one for each
   source), Chocobo Kick (kicked: twice that much damage), Bane's Contingency ("if that spell targets a commander you
   control", as it resolves), Echoing Return ("all other cards with the same name"), Cosmic Rebirth, "whenever a
   creature you control with deathtouch deals damage to a planeswalker / player or planeswalker" (Hooded Blightfang,
   Vraska, Swarm's Eminence), Chain Assassination ("if another creature died this turn"), Geralf, the Fleshwright
   ("each other Zombie that entered the battlefield under your control this turn"), Security Bypass ("as long as
   enchanted creature is attacking alone"), "with lesser mana value" in enters triggers (Clement, the Worrywort) and
   "with lesser toughness" in dies triggers (Colfenor, the Last Yew; "other target creature card" is other than the one
   that died, which also fixes Jackdaw Savior, rulings), Exponential Growth (doubling X times), granted extort (Pontiff
   of Blight), Analyze the Pollen (either search, by evidence).
   Out after round 187 (looked at, not done): Force Bubble (damage to you replaced by that many counters on it),
   Killer Service ("you may pay {2} and sacrifice a token": a paid "may" with a sacrifice in it), Abundant
   Harvest ("choose land or nonland": a new choice).
   Round 188 went on from the top: "choose odd or even" (Extinction Event, Mutinous Massacre, Twins of Discord,
   Zimone's Hypothesis, Thanos, Gollum, Ashling's Prerogative; zero is even; new Odd/Even buttons with a browser test),
   "sacrifice two untapped lands instead" (Lotus Vale, Scorched Ruins; both picked together, browser test) and "an
   untapped Mountain / Island" (Balduvian Trading Post, Soldevi Excavations), Gatta and Luzzu (damage prevented
   becomes +1/+1 counters), "that player / target opponent becomes the monarch" (M'Baku, Starscream), Sapling of
   Colfenor, Gix's Command ("on up to one creature", anyone's), Thunderous Velocipede, Kibo ("each player creates" a
   named token), Botanical Brawler ("the first time +1/+1 counters have been put on that permanent this turn"),
   Wolverine ("double all damage ~ would deal", "if ~ dealt damage to another creature this turn"), Elvish Guidance
   ("an additional {G} for each Elf on the battlefield"), Ringwraiths ("when the Ring tempts you" from the graveyard),
   Slime Against Humanity, Morningtide's Light ("until your next turn, prevent all damage that would be dealt to you").
   Fixed: "until your next turn" damage effects (Lightning, Army of One) now end when that turn begins; before, they
   came back on every other player's turn.
   Out after round 188 (looked at, not done): Protean Hydra (a trigger on counters removed by any cause), Caustic Bronco
   (no "saddled" condition), Jared Carthalion, Garland, Royal Kidnapper, Lavabrink Venturer, Haakon (cast only from the graveyard), Earthshape, Sigarda's Splendor ("note your life total"), Basri Ket's -2,
   Ochre Jelly, Kamahl's Druidic Vow, Green Sun's Twilight, Industrial Advancement, Froghemoth.
   Round 189 went on from the top: "copy that spell X times" (Storm King's Thunder, with X kept from the Thunder;
   Photon Blast Barrage), "choose one. If ..., (you may) choose both instead" on triggers (SOLDIER Military Program
   with "up to two Soldiers you control" picked as it resolves, browser test; Disciple of Perdition; Prophetic Titan,
   where delirium means both), "then if it has exactly four +1/+1 counters on it" (Ayara's Oathsworn), a group dealing
   damage equal to each one's power (Bartz and Boko, Moonlight Hunt), "its controller searches ... with a stun counter
   on it" (Magmatic Hellkite), Saffi Eriksdotter (only into your graveyard), Vraska the Unseen's +1 ("whenever a
   creature deals combat damage to ~"), Cult Conscript ("a non-Skeleton creature died under your control this turn"),
   Game Over ("a player's life total is less than or equal to half their starting life total"), Tainted Sigil,
   Henrika's back face ("with flying, deathtouch, and/or lifelink"), Celeborn the Wise, By Invitation Only (browser
   test).
   Out after round 189 (looked at, not done): Belt of Giant Strength (equip cost less by the target's power), Retribution
   of the Ancients ("remove X +1/+1 counters from among creatures you control" as a cost), Pact Weapon and Jace, Mirror
   Mage ("draw a card and reveal it", now in Lane B's round B19, to reuse), Verdeloth the Ancient, Faerie Fencing, Flame
   Discharge, Steer Clear ("if you controlled a ... as you cast this spell"), Depth Defiler, Pyrrhic Strike and Surge
   of Acclaim (spells with "choose both instead": only triggers do it so far), Symmetry Matrix, Icebreaker Kraken, Mass
   Diminish, Display of Power, Jason Bright, Spider-Man 2099, Blood for Bones, Quakebringer, Widespread Brutality,
   Belligerent Yearling, Lorthos, Zidane, Discerning Financier, Dragonspark Reactor, Eight-and-a-Half-Tails.
   Round 190 went on from the top: "that many plus one of each of those kinds of counters" on any permanent you control
   (Pir, Imaginative Rascal), granted fabricate (Cayth, Famed Mechanist, with Pir), "as long as it was cast" on a static
   ability (The Tarrasque), a revealed creature put onto the battlefield tapped and attacking (Raph & Mikey), "until you
   reveal X land cards, where X is ..." (The Ring Goes South), "sacrifice another creature or an artifact" (Gut, True
   Soul Zealot: Gut itself only while it's an artifact), "whenever you create a Blood token" (Voldaren Bloodcaster; a
   token-created trigger now sees the token on the battlefield when several enter together), "remove all but one +1/+1
   counter from it, then you gain 1 life for each ..." (Lily Bowen), Fractals with the total power each player's exiled
   creatures had (Oversimplify), "target artifact creature's controller sacrifices it. That player may search ..."
   (Arcum Dagsson), Scrap Mastery, Wedding Announcement, Hex Magic, "whenever ~ or equipped creature attacks" with "its
   power" (Tanuki Transplanter), Thada Adel ("search that player's library ... Until end of turn, you may play that
   card").
   Out after round 190 (looked at, not done): Sewer Nemesis (done in Lane B's round B21, left to it), Aether Refinery
   ("pay one or more {E}"), Emeritus of Ideation ("becomes prepared"), Welcome to . . . // Jurassic Park, Case of the
   Uneaten Feast, Raul, Trouble Shooter (cards milled this turn), Cait Sith, Scouring Swarm, Brigid's back face, Bring to
   Light (colors of mana spent), Fractured Powerstone (planar die), The Lost and the Damned, Oft-Nabbed Goat (only your
   opponents may activate, and control changes), Radiant Lotus, Brotherhood Headquarters, Maralen, Abstruse
   Appropriation, Ixhel, Cybership, Impulsivity, Intrepid Paleontologist, Ravenloft Adventurer, Kagha, Obeka, Tale of
   Katara and Toph, Ramses, Shuri, Wall of Stolen Identity, Scion of the Ur-Dragon, Hourglass of the Lost, Kaya the
   Inexorable, Yuffie, Summon: Kujata, Soul Immolation, Ruxa, Omenpath Journey, Havengul Lich, Out of Time, Breath of
   Fury, Firkraag, Tam, Ivy, Disorienting Choice, Endless Sands, Tyvar the Bellicose, Sidisi, Pir's Whim, Eruth,
   Drowner of Truth, Command the Dreadhorde.
   Round 191 went on from the top: base power and toughness "and are Juggernauts in addition to their other creature
   types" (Graaz, Unstoppable Juggernaut), "the exiled card's power/toughness" (Lobelia Sackville-Baggins, with "that was
   put there from the battlefield this turn"; Morbid Bloom, Scour the Desert), a chosen hand card revealed and put on the
   bottom of its owner's library, then a draw (Vendilion Clique, browser test), "unless its controller pays twice {X}"
   and "put up to two of them into your hand" (Thassa's Intervention; Shadow Prophecy, The Mana Rig), "whenever you put
   a counter on a creature you control" once each turn (Mikey & Leo), "the first non-Lemur creature spell with flying
   you cast during each of your turns" (Momo, Friendly Flier), "whenever one or more creatures that are enchanted by an
   Aura you control attack", any player's attack, and "tap up to one target creature and goad it" (Killian, Decisive
   Mentor), "choose a permanent type" (Creeping Renaissance, browser test), "if you didn't draw cards this way" (Mr.
   Foxglove), "add twice that much {G}" (Fangorn, Tree Shepherd), "search your graveyard, hand, and library" and "with a
   legendary Equipment attached to it" (Kassandra, Eagle Bearer), "if you put a Town card into your hand this way" (Town
   Greeter), starting loyalty X (Nissa, Steward of Elements: CR 306.5b and 107.3m, so X 0 puts it into the graveyard;
   the bot casts it for 1 or more).
   Out after round 191 (looked at, not done): Jin Sakai, Ghost of Tsushima ("attacks a player, if no other creatures are
   attacking that player"), Stiltzkin, Moogle Merchant ("target opponent gains control of another target permanent you
   control. If they do, ...").
   Round 192 went on from the top: "at the beginning of your next first main phase, add X mana in any combination of
   colors, where X is that spell's mana value" (Plasm Capture), "the total power of creatures goaded this way" (Havoc
   Eater), "choose one or more. Each mode must target a different player" (Vindictive Lich: no more modes than players
   it can target, the bot too), "or a creature spell you control becomes the target" (Surrak, Elusive Hunter), "reveal
   cards until you reveal two land cards" (Skyserpent Seeker), "you may have any number of them phase out" (Change of
   Plans), "each Sliver card in each player's hand has slivercycling" (Homing Sliver), an intervening "if" on a "whenever
   a source you control deals noncombat damage" trigger (Fear of Burning Alive), "distribute X +1/+1 counters among any
   number of target creatures" (Grove's Bounty, Broodlord), "exile a nonland card from it until ~ leaves the
   battlefield" (Deep-Cavern Bat), "it enters tapped and attacking that player" (Shark Shredder), "while it has a +1/+1
   counter on it, prevent that damage and remove a +1/+1 counter" (Undergrowth Champion), "until the end of your next
   turn, you may cast that card and you may spend mana as though it were mana of any color" for an exiled creature
   (Hurl Through Hell). Rules fix: damage that can't be prevented is now dealt to the Phantom creatures (Phantom
   Centaur and the like), still removing a counter (rulings).
   Out after round 192 (looked at, not done): Red Sun's Twilight (copies of the destroyed artifacts), Irencrag Feat,
   Oath of Nissa, Sharae of Numbing Depths and Hylda ("becomes tapped by you"), Sigurd, Dog Umbra, Call for Aid, Narset
   of the Ancient Way, Razorfield Ripper (reconfigure cost), Silverquill the Disputant (granted casualty), Lorehold the Historian (granted
   miracle), Coram, Brimaz, Mindleech Mass, The Blue Spirit, Linvala, Shield of Sea Gate, Requiem Monolith, Behemoth of
   Vault 0, Abigale (loses all abilities, keyword counters), Once Upon a Time, Tasigur, Hazezon, Corrupted
   Shapeshifter, Balor (its modes), Unbreathing Horde ("for each other Zombie you control and each Zombie card in your
   graveyard"), Horde of Notions (playing a land card during resolution), Undead Alchemist, Auntie Ool (ward—blight),
   Chaos Defiler (random choice among chosen permanents), Onakke Oathkeeper.
   Round 193 went on from the top: "whenever you cast a spell this turn" as a Saga chapter (Showdown of the Skalds,
   Origin of Thor: "deals damage equal to its power to each opponent" too), "if you do, it becomes plotted" (Kellan
   Joins Up, Jace Reawakened), "reveals cards until they reveal a creature card. Put that card onto the battlefield
   under your control" (Curse of Unbinding), "exile a card at random from your graveyard. You may play that card this
   turn" (Tersa Lightshatter), "until your next turn, creatures your opponents control attack each combat if able" and
   "each tapped creature deals damage to itself" (The Akroan War), "each player chooses three nonland permanents they
   control. Destroy all other nonland permanents" (Fall of the First Civilization), Primal Surge (repeat the process),
   "cards of the chosen type" after "choose a creature type" (For the Ancestors), "when you next cast a spell with {X}
   in its mana cost this turn ... half X life" (Brass Infiniscope), "unless target opponent has ~ deal 3 damage to them"
   (Pia's Revolution), "attach any number of Equipment you control to target creature you control" (Beatrix, Loyal
   General; Battlefield Improvisation's "if that creature is attacking"), "at the beginning of the next combat, return
   those cards ... and those creatures gain haste until end of turn" (Legion's Initiative), and day and night:
   "whenever day becomes night or night becomes day" (not when it first becomes day or night, rulings), "if it's
   neither day nor night, it becomes day as this creature enters", The Celestus's switch (The Celestus, Vadrik, Brimstone
   Vandal, Component Collector, Firmament Sage, Gavony Dawnguard, Obsessive Astronomer, Sunrise Cavalier, Sunstreak
   Phoenix, Celestus Sanctifier), and "look at the top two cards of your library. Put one of them into your graveyard"
   (Jace, the Living Guildpact). Rules fix: "half X, rounded down" where X is defined elsewhere (a spell's X) kept the
   whole X.
   Out after round 193 (looked at, not done): Shilgengar, Sire of Famine, Armed and Armored ("choose a Dwarf you
   control. Attach any number of Equipment you control to it"), World War Hulk, Hatchery Sliver, Magus Lucea Kane, Make
   Your Own Luck, Lilah, Undefeated Slickshot, Soulcipher Board ("remove an omen counter ... then if it has no omen
   counters on it, transform it").
   Round 194 went on from the top: "each opponent loses life equal to the number of creatures attacking them" (Within
   Range), "+X/+0, where X is the number of lands defending player controls" (Elturel Survivors), "dies or is put into
   exile while its power is 4 or greater" (Syr Vondam), "the greatest power among creatures sacrificed this way" and
   "Madness—{2}{B}, Pay 8 life" (Shadowgrange Archfiend, browser test), "each Dragon you control deals 1 damage to that
   creature" (Sarkhan the Masterless), "you may pay {X}. If you do, return another target Zombie card with mana value X"
   (Relentless Dead), "if its power is less than ~'s power. Otherwise" (Shelinda), "you may pay {2} and sacrifice a
   token" / "pay {1} and sacrifice an artifact" / "pay {1}{R} and discard a card" (Killer Service, Sokenzan Smelter,
   Wolf of Devil's Breach), "if the creature had power 4 or greater" (Anax), "if it was enchanted or equipped" (Koll),
   "~ or a commander you control attacks alone" (Ironsoul Enforcer), "as long as you're the monarch, damage doesn't
   cause you to lose life" (Archon of Coronation), "attach any number of target Equipment to it" (Armory Automaton),
   "for each opponent, ... target permanent that player controls" without "up to one": required for each opponent who
   has one (Blatant Thievery, browser test; Frenzied Gorespawn; Sylvan Primordial, banned), "a creature card is put into
   a graveyard from a library" (Dreadhound), "whenever your opponents are dealt combat damage, if any of that damage was
   dealt by a Warrior" (Mindblade Render) and "Spend only black mana on X" for an {X} ability (Crypt Rats, Crimson
   Hellkite).
   Out after round 194 (looked at, not done): Tangled Colony (damage dealt by a creature this turn), Greymond, Avacyn's
   Stalwart (two keywords chosen as it enters), Conspiracy Theorist ("you may exile one of the cards discarded this
   way"), Expand the Sphere, Observed Stasis ("remove enchanted creature from combat"), Captain Howler, Ephara, God of
   the Polis ("if you had another creature enter ... last turn"), Cache Grab, Abundant Harvest, Endless Sands,
   Fumiko the Lowblood (bushido X), Historian's Boon ("the final chapter ability of a Saga you control triggers").
   Round 195 went on from the top: "distribute X +1/+1 counters among any number of target creatures you control, where X
   is the number of +1/+1 counters on ~" (Quirion Beastcaller, Undercity Upheaval), "If they can't, they lose 2 life and
   you draw a card. Then repeat this process for an enchantment and a planeswalker" (Invoke Despair), "you may copy ~ and
   may choose a new target for the copy" (Malicious Affliction), "copy this spell twice" (Bygone Marvels), a named
   legendary Equipment token (Mabel), "put an instant, sorcery, or Faerie card from among the milled cards into your
   hand" (Free the Fae, Speak Secrets, Silvan Rally), "move a loyalty counter from ~ onto that planeswalker" (Gatewatch
   Beacon), bounty counters (Chevill, Termination Facilitator), "an instant or sorcery spell with mana value less than
   or equal to ~'s power" from among the top seven (Velomachus Lorehold), "Whenever you scry, if ~ is tapped" (Legolas),
   "Tap two other untapped Halflings you control" (Saradoc, Bladewheel Chariot), "mana value equal to the number of
   charge counters on ~" (Chalice of the Void), "the next instant or sorcery spell you cast this turn has storm"
   (Crackling Spellslinger, Storm, Force of Nature), Sage of the Skies (fix: "if you've cast another spell this turn"
   counted itself), "spells you've cast from anywhere other than your hand this turn" (Impending Flux), "put it on the
   bottom of its owner's library" (The Cauldron of Eternity), "for each legendary creature and planeswalker you control"
   (Mobilized District) and "you may exile this card from your graveyard. If you do / When you do" as a spell is cast
   (Kozilek's Return, Ugin's Binding).
   Out after round 195 (looked at, not done): Tablet of the Guilds (two colors chosen), Puca's Covenant, Call of the
   Death-Dweller ("put a deathtouch counter on either of them"), Myth Unbound (a trigger in the command zone), Siona,
   Captain of the Pyleas ("becomes attached"), Soul Diviner (a chosen counter kind), Icingdeath, Frost Tyrant (its token
   is named like part of it), Toggo, Goblin Weaponsmith (a quoted ability inside a quoted ability), Domineering Will,
   Immerwolf, Frenzied Saddlebrute.
   Round 196 went on from the top: "amass Orcs 5, mill five cards, then" (Sauron, Lord of the Rings), "Add X {G} or X
   {W}" (Brigid, Clachan's Heart), "target opponent reveals cards ... until they reveal a land card. Put that card onto
   the battlefield tapped under your control and the rest into their graveyard" (Sméagol, Helpful Guide), "choose target
   ... card in your graveyard. You may sacrifice an artifact" (Daretti, Rocketeer Engineer), "a creature you control
   with power 2 or less deals combat damage" (Subira, Tulzidi Caravanner), "flip a coin for each creature that isn't a
   Demon, Devil, or Imp. Destroy each creature whose coin comes up tails" (Rakdos, the Showstopper), "the total number of
   rad counters among players" (Vault 12), "Any number of target lands you control become 0/0 Elemental creatures"
   (Nissa, Sage Animist), "Exchange your hand and library" (Mordenkainen), "creatures that player controls without
   flying can't block this turn" (The Motherlode, Excavator), "If you search your library this way, put ~ on the bottom"
   (Unlucky Cabbage Merchant), "They don't untap during their controllers' next untap steps" (Dragon Turtle), "Until end
   of turn, you may have ~ become an X/X ..." (Ebony Fly), "that's still a planeswalker" (Gideon, Ally of Zendikar and
   Gideon, Martial Paragon) and Equipment tokens named Stoneforged Blade / "Return it to your hand at the beginning of the
   next end step" (Nahiri, the Lithomancer and Nahiri, the Harbinger).
   Out after round 196 (looked at, not done): Tamiyo, the Moon Sage (emblem returns each card put into your graveyard),
   Tamiyo, Compleated Sage (a token named after her short name), Proteus Staff ("the rest on the bottom in any order"),
   Sidisi, Regent of the Mire (sacrifice a creature with mana value X as a cost), Umbris, Fear Manifest, Unidentified
   Hovership ("the exiled card's owner manifests dread"), Geth's Summons, Sphinx of Foresight (opening-hand reveal),
   Gideon Jura (+2: creatures attack him if able), Eruth, Tranquil Frillback, Yusri, Blitzball Stadium, Underdark Rift,
   Colfenor's Urn, Dragon's Fire, Leonin Arbiter, Sigurd, Protection Racket, Sin Prodder, Osgir, Nine-Fingers Keene,
   Phyrexian Processor. Smaller gap: Rakdos, the Showstopper with Krark's Thumb keeps heads for your own creatures and
   tails for the others without asking.
   Round 197 went on from the top: blight N as a cost (CR 701.68: Gristle Glutton, Sting-Slinger, Spiral into
   Solitude, Evershrike's Gift, Champion of the Weird), "As an additional cost to cast this spell, blight 1 or pay {3}"
   (Bogslither's Embrace, Wild Unraveling), optional additional costs "you may blight N" (Burning Curiosity, Cinder
   Strike, Pyrrhic Strike, Requiting Hex) and "you may behold a Dragon" (Dispelling Exhale, Osseous Exhale, Piercing
   Exhale, Hyperion's Atomic Vision, Hulk's Thunderclap, Dose of Dawnglow's "it isn't your main phase"); browser
   tests click through each prompt. An optional additional cost isn't kicker (CR 601.2b): "kicked spell" triggers and
   Ertai's Trickery ignore it.
   Out after round 197 (looked at, not done): Dawnhand Dissident (casting from exile by removing counters), Auntie Ool
   (ward—blight and a "one or more -1/-1 counters are put on" trigger). Smaller gaps: bots blight only a creature that
   survives the counters, and never their commander.
   Round 198 went on from the top: targets "of the chosen type" on a permanent's abilities, bound to the creature type
   chosen as it entered (Dawn-Blessed Pennant, Kindred Boon, From the Rubble; never on a spell or with nothing chosen),
   "unless its controller has ~ deal damage to them equal to ~'s power" (Combustion Man), "card not named ~" targets and
   "permanents you control but don't own" (Staff of Eden, Vault's Key, Edea, Possessed Sorceress), "can't be blocked
   as long as its power is 3 or less" (Thieves' Tools), "As ~ enters, roll X d6" (Neverwinter Hydra), "sacrifices it
   unless they pay X life" for each creature (Killing Wave, a new keep prompt), collection counters (Charitable Levy),
   behold as an effect (CR 701.4a: Sarkhan, Dragon Ascendant, Elven Passage; a card from your hand or a permanent you
   control in one picker), a mana ability that returns its source to hand, only as a sorcery (Grinning Ignus; never
   used by automatic payment), "Choose creature or land" before a reveal (Winding Way), "whenever your commander
   attacks" from the graveyard (Vivi's Persistence, Endless Ranks of HYDRA), "up to twice X target cards" (Erebos's
   Intervention), cheaper cycling (Fluctuator), "a color of a permanent you control" (Meteor Crater), "any number of
   creature cards milled this way" (Vivien on the Hunt).
   Out after round 198 (looked at, not done): Mirror of the Forebears (a copy keeps the type chosen for its source:
   copiable values don't include the choice, so its "of the chosen type" would need the copy's own), Font of Agonies
   (no "whenever you pay life" event: life is paid in many places), Callous Oppressor (an opponent chooses the type),
   Caustic Bronco (no "saddled" condition on a trigger's life loss), Squandered Resources (mana of a type the
   sacrificed land could produce), Sigarda's Splendor ("note your life total"), Back for Seconds (bargained: one of the
   returned cards onto the battlefield instead), Rowan's Grim Search, Essence Sliver ("a Sliver deals damage": any
   damage, not only combat), Phyrexian Soulgorger (cumulative upkeep that sacrifices creatures), Mariposa Military Base
   (rad counters as it enters tapped). Smaller gaps: bots never activate Grinning Ignus; Celestial Reunion, Countersculpt,
   Kindle the Inner Flame, Molten Exhale and Theorist's Sanctum (behold as a cost or a replacement) are still out.
   Round 199 went on from the top: "as long as you control an artifact creature or a Plan" (Doctor Doom; Plan is now a
   subtype, so The Masters of Evil's search works), "each creature you control that's a Food or a Golem" (Brenard,
   Ginger Sculptor), "each creature that didn't enter this turn" (Let the Galaxy Burn), "prevent all combat damage that
   other creatures would deal this turn" (Haze Frog: its own damage isn't prevented), "choose a creature at random,
   then destroy the rest" (Last One Standing), "choose X cards in your hand and discard the rest" (Breakthrough), "both
   on top of your library or both on the bottom" (Dream Cache), "you may have your life total become the number of
   charge counters on ~" (Eternity Vessel), "as long as you control another Elf, you may play an additional land"
   (Thranduil's Company), "a noncreature spell or a Dragon spell" (Runescale Stormbrood), "deals combat damage to a
   planeswalker" (Zagras), "you may pay life equal to its power. If you do, put that many counters" (Madame Null),
   "as though it had flash if X is 3 or less" (Silver Scrutiny), "scry that many cards plus one instead" (Kenessos),
   "as long as enchanted permanent is a creature, it gets +1/+1 for each" (Born to Drive), "creatures you control
   that are enchanted by Auras you control have base power and toughness 4/4" (Archon of the Wild Rose), "attach any
   number of Auras and Equipment you control to it" (Heavenly Blademaster, the Ardenn picker on itself), "spells your
   opponents cast that target ~ cost {1} less" and "spells you cast that target enchanted player cost {1} less"
   (Accursed Witch // Infectious Curse), "Equipment named A, B, and C have indestructible" (Shield of Kaldra), "a
   tenth of the creatures they control, rounded up" (Legate Lanius), "a spell with the same name as a card in their
   graveyard" (Dragonlord Kolaghan: not a copy, not face down), "a creature you control with flash or haste is dealt
   damage" (Sonic the Hedgehog). Browser tests click through the Blademaster's attach picker and Dream Cache's
   top-or-bottom choice.
   Out after round 199 (looked at, not done): Jaws, Relentless Predator (no "is sacrificed or destroyed" event),
   Iron Monger (no "whenever you connive" trigger). Bots answer Eternity Vessel's "you may" only when it raises their
   life.
   Round 200 went on from the top: legendary instants and sorceries now need a legendary creature or planeswalker
   (CR 205.4e; before, they could be cast without one), "the highest life total among all players" (Sorin, Grim
   Nemesis), "if cards with at least six different mana values are revealed this way, that player loses the game"
   (Atemsis), "they exile cards from their hand equal to the difference" (Isildur's Fateful Strike), "counter that spell
   instead if its controller has three or more poison counters" (Bring the Ending), "can't reduce the amount of mana ~
   costs by more than {5}" (Valiant Changeling), a Vehicle that's a Phyrexian creature with four or more phyresis
   counters and "then draw a card if it has seven or more ... If it doesn't, scry 1" (Weatherlight Compleated), "exile
   cards from the top of your library until you exile a land card" (Venture Forth), "if X is 4 or more" with X the mana
   spent (Shantotto), "when your commander deals combat damage to a player" and "at the beginning of the monarch's end
   step" (Archivist of Gondor), "whenever ... while ~ has a -1/-1 counter on it" (Bristlebane Battler, Moonshadow,
   Reluctant Dounguard), "choose one or more instead" with delirium (Let's Play a Game, a new mode-menu range),
   "target creature you control deals damage equal to its power to any other target. Then sacrifice it" (Special
   Move, Burn Together; a modal mode's "deals damage" source now follows its target), "put it onto the battlefield if
   its mana value is 2 or less" (Guidelight Pathmaker), "if a land was destroyed this way ... Otherwise" (Dire-Strain
   Rampage), "the base power and toughness of other creatures you control become equal to ~'s" (Tanazir Quandrix; bots
   say yes only when it makes their creatures bigger), "the rest on the bottom in a random order" (Planar Atlas), "you
   may put ~ from your graveyard on top of your library" (Gate Colossus), "then if that creature has toughness 6 or
   greater" (Dormant Grove), "instant and sorcery spells you control have lifelink / deathtouch" (Heartflame Duelist,
   Pestilent Spirit). A browser test clicks through Let's Play a Game's mode menu with and without delirium.
   Out after round 200 (looked at, not done): Thrasta (trample over planeswalkers isn't modeled), Enchanter's Bane (a
   punisher whose option sacrifices the target), Faerie Slumber Party (no record of who controlled the creatures
   returned this way), You Cannot Pass! (no record of which creatures blocked or were blocked by a legendary creature),
   Candlekeep Inspiration (cards in exile and graveyard that "have an Adventure"), Convert to Slime (total mana value of
   the permanents destroyed this way), Canoptek Wraith, Mishra's Command, Furygale Flocking, Sentinel Tower, Fishing
   Gear, Phyrexian Dreadnought. Soulfire Grand Master, Radiant Scrollwielder and Lo and Li still miss another line;
   Firesong and Sunspeaker's "red instant and sorcery spells" isn't read yet.
   Round 201 went on from the top: "is put into a graveyard from the battlefield or is put into exile from the
   battlefield" (Psychomancer, Shard of the Void Dragon, Slagstone Refinery), "you may put any number of them into your
   hand ... You lose 3 life for each card you put into your hand this way" (Search for Blex; the dig picker shows the
   life it will cost), "you may play lands and cast Insect spells from your graveyard" (Zask), a spell's "Whenever ...
   this turn" paragraph followed by another (First Day of Class, Beck // Call fused), "when that creature dies this
   turn, return it ... tapped" (Cryptek), "When you discard a card this way" (Talion's Messenger, Serum-Core Chimera),
   "Activate only as a sorcery and only once" (In the Trenches), "Whenever a player loses life" and "for each graveyard
   with seven or more cards in it" (The Master of Lake-town, Master's Councillors), "... at the beginning of the next
   end step if ~ is still on the battlefield" (Shirei), four types in "a Cleric card, a Rogue card, a Warrior card,
   and/or a Wizard card" (Harper Recruiter), "Whenever ~ deals 4 or more damage" (Spinneret and Spiderling), "if the
   number of attacking creatures is greater than the number of quest counters on ~" (ED-E), "put it onto the
   battlefield tapped under target player's control" (Yavimaya Dryad), "cost {1} less to cast for each target"
   (Hinata), "each color among monocolored permanents you control" (Tarnation Vista), "for each card type among those
   cards" (Polluted Cistern), "phase out at the beginning of the next end step" (Vronos). Rules fixes: a player who
   leaves the game now has the permanents they control but don't own exiled (CR 800.4a), and four regex guards that
   held backspace characters instead of `\b` now work (no card changed). A browser test clicks through Search for
   Blex's picker.
   Out after round 201 (looked at, not done): Dauntless Bodyguard ("choose another creature you control" as it
   enters), Lord of the Forsaken and Mm'menon (mana that can only be spent on spells cast from a given zone), Choco,
   Seeker of Paradise (two different picks from one look), Doomsday Confluence ("choose X" modes tied to X), Scrap
   Welder (targets "with mana value less than X", X set by a sacrifice cost), The Ancient One ("its mana value" about
   the card discarded, in a reflexive trigger), Savage Summoning (flash and "can't be countered" for the next creature
   spell), Rocco, Street Chef, Grolnok, Golden Guardian. Still missing from CR 800.4a: a spell someone else owns on the
   stack under a leaving player's control is removed rather than exiled.
   Round 202 went on from the top (ranks 6,000 to 12,000 not looked at before): "Whenever a creature you control
   connives" (Iron Monger, Ultron; once the conniving is done, gone or not, CR 701.50f), "you may have it connive. Do this
   only once each turn" (Baron Strucker), "Whenever ~ or another Dwarf you control enters and whenever an Equipment you
   control enters" (Giott: one trigger for a permanent that's both, CR 603.2c), "copy the next spell you cast this turn
   when you cast it" (Flamehold Grappler, Tzaangor Shaman), "copy it for each other instant and sorcery spell you've cast
   this turn", counted as the trigger resolves (Show of Confidence), "a noncreature spell with one or more blue mana
   symbols in its mana cost, create that many" (Namor), "a colorless artifact token named Scrap" (Farid), "create The
   Blackjack, a legendary 3/3 colorless Vehicle artifact token with flying and crew 2" (Setzer), "one or more goaded
   creatures deal combat damage to one of your opponents" (Puppet Master), "Whenever you activate an ability of a
   creature", mana abilities too (Elrond), "Vehicles you control become artifact creatures ... Creatures you control get
   +2/+0" (Start Your Engines), "When this token deals damage, sacrifice it" (Vrondiss), "each creature that entered the
   battlefield under your control this turn" (Shaile), "Whenever you turn a permanent face up" (Growing Dread: the player
   who turned it, by the special action or an effect), "can't cast instant or sorcery spells during that player's next
   turn" (Azor, Sphinx's Decree), "Whenever an opponent becomes the monarch, if you were the monarch as the turn began"
   (Knights of the Black Rose), "Whenever another player loses the game ... that player's life total as the turn began"
   (Sengir). No new prompts.
   Out after round 202 (looked at, not done): Masako the Humorless (tapped creatures blocking: every blocker check reads
   untapped), Sea Gate Stormcaller ("copy that spell twice instead" if kicked, inside the delayed trigger), Ramses,
   Assassin Lord (attacked this turn by an Assassin you controlled), Kros, Defense Contractor (no record of who put
   counters on a creature), Visions of Phyrexia (no record of playing a card from exile), Glorious Purpose (the sixth
   plan counter), Loot Dispute (attacking the player who has the initiative), Rhys, the Evermore (remove any number of
   counters), Bladegriff Prototype (a target the damaged player chooses), Bronze Bombshell, Zidane, Tantalus Thief ("an
   opponent gains control of a permanent from you"), Tameshi, Reality Architect (noncreature permanents returned to
   hand), Obeka, Splitter of Seconds (extra upkeep steps after this phase).
   Round 203 went on from the top: storied and the enduring story (CR 702.195: Balin, Bifur, Bombur, Dáin, Fíli, Kíli,
   Óin, Ori, Thorin), "artifacts and creatures you control" as one group (Thorin), time travel (CR 701.56a, a prompt
   for each permanent with a time counter and each suspended card, then all the changes at once: Wibbly-wobbly,
   Timey-wimey, All of History, All at Once, Time Beetle, Rotating Fireplace, The Tenth Doctor, The Girl in the
   Fireplace, The Parting of the Ways), "you may exile an artifact or creature card from your hand. If you do, create a
   token that's a copy of the exiled card" (Nexus of Becoming), no activated abilities of cards in graveyards (Ashes of
   the Abhorrent), cards in graveyards can't be targeted (Ground Seal, Underworld Cerberus), "target player other than
   ~'s owner" (Crown of Doom), an X the ability's text sets (CR 107.3c: Prototype Portal, Soul Foundry; the app doesn't
   ask for it). New prompt: time travel.
   Out after round 203 (looked at, not done): Coward // Killer (the face named Coward, and "each other creature that
   shares a creature type with it"), The Wedding of River Song, The Aesir Escape Valhalla ("the exiled card" across
   chapters), Overgrown Zealot (mana only to turn permanents face up), Yuna's Decision, Hylda of the Icy Crown
   ("whenever you tap an untapped creature an opponent controls"), Admiral Beckett Brass (combat damage by three or
   more Pirates to one player), Fatespinner (skipping a chosen step or phase), Pramikon, Sky Rampart (attack only the
   nearest opponent), Bargaining Table and Elite Arcanist (an X the text sets: an opponent's hand, a copy to cast),
   Summary Dismissal, Bioshift, Public Enemy, Bladegraft Aspirant, Archon of Valor's Reach.
   Round 204 went on from the top: "target creature becomes prepared / unprepared" on any creature (CR 722.3a-b:
   Skycoach Waypoint, Hexhaven Dueling Arena, Biblioplex Tomekeeper, Infinite Coursework; the bot aims it at its own
   creature with a prepare spell), "you may exile N cards from your graveyard. If you do" with N above one (CR 609.3:
   Emeritus of Ideation, Skywarp Skaab, Aegis Sculptor), "N or more artifact and/or creature cards in your graveyard"
   (Lorehold Archivist, Mortal Combat, Scouring Swarm), "your third spell each turn / in a turn" (Emeritus of Conflict,
   Captain Ripley Vance, Vance's Blasting Cannons), "whenever a creature attacks this turn" as a floating trigger
   (CR 603.7b: The Revelations of Ezio, Origin of the Hidden Ones, Basri, Devoted Paladin, The Bloodsky Massacre, Ondu
   Rising), "if it was cast from your graveyard" (Rocket-Powered Goblin Glider), renown triggers and "is renowned"
   (CR 702.112b: Relic Seeker, Valeron Wardens, Scab-Clan Berserker, Honored Hierarch, Goblin Glory Chaser, Consul's
   Lieutenant), "if it had N or more counters on it" as it last existed (CR 608.2h: Lost Isle Calling), "tap two other
   untapped creatures you control" as a may (Tidal Terror, Gravelgill Scoundrel, Redcap Raiders, Civil Servant,
   Meanders Guide, Saheeli, Filigree Master), "if you didn't cast it from your hand" (Epochrasite), Razzle-Dazzler,
   Wicked Wolf, Triceraton Commander, Hope-Ender Coatl, Fall of the Thran, Rust Harvester. Kappa Cannoneer's "It can't
   be blocked this turn" now means Kappa Cannoneer, not the artifact that entered. No new prompts.
   Out after round 204 (looked at, not done): Codie, Ravenous Codex ("prepared spell" isn't defined yet), Glissa's
   Retriever (a mandatory "exile it. When you do"), Leaves from the Vine (a type-or-subtype filter), Behold the
   Unspeakable (a pausing scry inside "Otherwise"), Song of Blood, Indulge // Excess, Harald Unites the Elves, Rent Is
   Due, Search Elemental, Estinien Varlineau.
   Next most played: the unsupported ones from the top of `npm run popular` (most played first; Lane B takes them from
   the bottom); the harder ones
   from ranks 10,640 to 13,222 (above); the harder ones from ranks 10,060 to
   10,640: Emerald Dragon, Portent of Calamity, Keen-Eyed Curator, Dwarven Scorcher, Smoke Spirits'
   Aid, The Foretold Soldier, Radiant Scrollwielder, Become Anonymous, Night Soil, Overabundance, Avalanche of Sector
   7, Obosh, Grappling Hook, Otrimi, Zhao, Donal, Iroh, Garth One-Eye, Angrath, the Flame-Chained, Identity
   Thief, Mishra, Eminent One, Spell Queller, Goblin Charbelcher, Lucky Clover, Mistbind Clique; and the harder ones above it: Conqueror's Galleon, Grub, Storied Matriarch,
   Taskmaster, Mercenary Mimic, Gideon Blackblade, Kolvori, God of Kinship, Fisher's Talent, Niko, Light of Hope,
   Stick Together, Activated Sleeper, Taii Wakeen, Perfect Shot, Angel's Trumpet, Summoner's Sending, Urianger
   Augurelt, Quintorius, Loremaster, Quantum Riddler, Model of Unity, The Flood of Mars, Sigarda's Vanguard, Master of
   the Wild Hunt, Audacious Reshapers, Guidelight Matrix, Mists of Lórien, Kiora, Sovereign of the Deep, Quest for
   Ula's Temple; the ones skipped in rounds 182, 181, 180, 179, 178, 177 and 176 (above); the ones skipped in round 175: Detention Sphere, Tangle Wire,
   Steward of the Harvest, Solitary Sanctuary, Werewolf Pack Leader, Agent's Toolkit, Heroes in a Half Shell, Ran and
   Shaw, Rampaging Aetherhood, Unstable Glyphbridge, Flitterwing Nuisance, Curious Forager, From the Catacombs, Loki,
   God of Mischief, Katsumasa, the Animator, Slagstone Refinery, Inalla, Archmage Ritualist, Threats Undetected,
   Leader, Super-Genius; the ones skipped since round 173: Radagast the Brown, Quicksilver Elemental, Secret of
   Bloodbending, Chiss-Goria, Forge Tyrant, Molecule Man, Confiscation Coup, Zoyowa Lava-Tongue, Role Reversal, Scriv,
   the Obligator, Craig Boone, Novac Guard, Spelltwine, Ultimate Magic: Meteor, Spectral Searchlight, Rat King,
   Verminister, Valgavoth's Onslaught, Motivated Pony; and from before round 172: Grindstone, Halo Forager, Moritte of the
   Frost, Reyhan, Last of the Abzan, Herigast, Erupting Nullkite, Mazemind Tome, Asmodeus the Archfiend, Temporal
   Extortion, Hot Pursuit, Reidane, God of the Worthy, Long River Lurker, Zariel, Archduke of Avernus, Psychic Paper,
   Jolted Awake, Dream-Thief's Bandana, Drana, the Last Bloodchief, Chandra, Legacy of Fire, Theoretical Duplication,
   Calamity, Galloping Inferno, Vivien, Monsters' Advocate, Sam, Loyal Attendant, Wrenn and Six, Crystalline Giant,
   Kaervek, the Punisher, Obsessive Pursuit, Gemcutter Buccaneer, Nissa of Shadowed Boughs, Chandra, Flameshaper,
   Iron Man, Titan of Innovation, Gornog, the Red Reaper, Fire Lord Zuko, Realm of Koh,
   Mercurial Spelldancer, Vraska, the Silencer, Vren, the Relentless, Hauntwoods Shrieker, The Mycotyrant, Lifecraft
   Engine, Agatha of the Vile Cauldron, The Ancient One, Whisperwood Elemental, Erdwal Illuminator, Sigarda, Host of
   Herons, Shelob, Dread Weaver, Price of Glory, Roar of Resistance, Heartless Conscription, Bloatfly Swarm, War's
   Toll, Quintorius Kand, Aminatou, Veil Piercer, Arcbond, Rot Hulk, Thieving Amalgam.
   `npm run popular` reads every ranked card (31,917), so it doesn't run dry at rank 5,000.
   Smaller gaps from round 174: Howlpack Piper's and Tlincalli Hunter's tests use their front face alone (and Retrieve
   Prey on its own); bots activate "remove all counters" abilities in their second main phase only (Sage of Hours with
   five or more); bots take Risk Factor's 4 damage while it leaves them above 10 life; "the number of counters removed
   this way" is read only after "Remove all ... counters from ~" as a cost.
   Smaller gaps from round 173: bots never activate Obeka, Brute Chronologist and say no when it asks them to end
   their turn; bots aim Modify Memory like Switcheroo (their least useful creature for an opponent's best), never at
   two opponents' creatures to draw three; bots aim Shifting Grift's exchanges with the usual target picks, not the
   exchange logic; Modify Memory's "if you control neither creature" checks only the targets still legal (CR 608.2b).
   Smaller gaps from round 172: bots don't avoid gaining life under an opponent's Tainted Remedy or Plague Drone;
   Kellan, Daring Traveler's test uses its creature face alone; "a card left your graveyard this turn" counts cards,
   not tokens, by their owner.
   Smaller gaps from round 170: "if that creature was a Cleric" (Taborax) reads the dead creature's last known
   subtypes only when the condition is about types alone; Stranglehold stops searches that pick from the library
   (search and name-a-card effects), not "look at the top N" effects (those aren't searches, CR 701.23); Curator
   Beastie's "Colorless creatures you control enter with additional counters" supports one color word or colorless.
   Smaller gaps from round 169: Bonecrusher Giant's test uses its creature face alone (the card data has both faces).
   Smaller gaps from round 168: bots activate The Wandering Emperor's loyalty abilities only on their own turn; bots
   don't activate Vexing Shusher; Glen Elendra Guardian's counter picker is the one for "remove counters from among",
   which asks even when the Guardian has one kind of counter.
   Smaller gaps from round 167: Grishnákh's "power less than or equal to the amassed Army's power" is the Army's power
   as the target is chosen; bots don't activate Progenitor's Icon; Trinisphere counts a hybrid {2/W} symbol as its
   mana value (2) whichever half is paid; Elspeth Resplendent's +1 puts its two counters on one after the other (the
   rulings say at the same time, which matters only to "whenever counters are put" triggers); bots play Lake of the
   Dead and its kin only when they control a land to sacrifice.
   Smaller gaps from round 166: Glorious Gale's "if it was a legendary spell" doesn't see a countered copy of a spell
   (it ceased to exist); bots don't activate Timestream Navigator (they skip abilities that move their source); Wash
   Out's color is the bot's usual color pick, not the color that hurts opponents most.
   Smaller gaps from round 165: bots don't plan around Angelic Arbiter (they may cast first and lose their attack, or
   attack and lose their spells); Cloud's Limit Break's "with different controllers" is one target per player, so a
   target whose controller changes before it resolves counts as that player's; Gruff Triplets' "named ~" uses the
   card's printed name; "the amount of mana spent to cast it" reads only on a spell or in its own enters or cast
   trigger.
   Smaller gaps from round 164: with Krark's Thumb, bots always keep the won coin; "flip a coin until you lose a flip"
   keeps a won coin of each pair (a player could keep the lost one to end the run early), and a second Thumb counts as
   one. Evercoat Ursine's "play one of them" picks in the card picker, then casts or plays the card as usual.
   Smaller gaps from round 162: bots discard their hand to Perplex only when it's one card or none; Rhet-Tomb Mystic's
   and Jo Grant's granted cycling are cycling abilities of the cards (CR 702.29a), but the hand-grant reads only
   "ninjutsu" and "cycling" so far; Instill Energy's "can attack as though it had haste" covers attacking only, not {T}
   abilities (CR 302.6).
   Smaller gaps from round 161: craft takes one kind of material only ("craft with a creature", "with two creatures",
   "with an Island", "with artifact"); "one or more", "creatures that share a creature type" and the like stay out
   (Jade Seedstones also needs the mana value of the card used to craft it, Master's Guide-Mural an "activate only if"
   condition, Dire Flail, Spring-Loaded Sawblades and Braided Net their other lines). Bots craft only in their second
   main phase, with graveyard cards they have no use for or tokens worth 3 or less. "Tokens created with ~" (Faerie
   Artisans) are the tokens its own abilities created as they resolved, as that object (rulings).
   Smaller gaps from round 160: when Nemata, Primeval Warden and another "exile it instead" replacement both apply to a
   dying creature, the engine applies the first one it finds rather than letting the affected creature's controller
   choose (CR 616.1); Dream Devourer's granted foretell on a card with {X} in its cost is untested (X is 0 when cast for
   the foretell cost, CR 107.3); bots facing Star Athlete sacrifice a permanent only when it's cheap (worth 2 or less)
   or at 10 life or less.
   Smaller gaps from round 158: "you control a creature with the greatest power among creatures on the battlefield" works
   in triggers and as a resolution check (High Score, Éomer of the Riddermark), but as the condition of a static ability
   it would read power before the layers finish; bots using Garnet, Princess of Alexandria remove a lore counter from
   every Saga of theirs that has one, even when that only delays a chapter they want; bots choosing which tied creature
   Olórin's Searing Light exiles use the usual scoring.
   Smaller gaps from round 157: Angel of Suffering's prevention is always applied first, ahead of other prevention
   shields, rather than being the player's choice of order (CR 616.1); bots choosing which Equipment Gilgamesh,
   Master-at-Arms attaches take the one with the highest mana value.
   Smaller gaps from round 156: bots never cast a card for warp that Tannuk, Steadfast Second gives it; bots casting
   Everything Comes to Dust convoke with whatever autopay picks, not to spare their own creature types.
   Smaller gaps from round 155: bots activate Mechtitan Core only in a main phase with an empty stack, and only when the
   four permanents exiled have total power under 10; bots roll The Deck of Many Things only with three or fewer cards
   in hand; Mechtitan Core's "Exile ... four other" cost button reads "Exile and activate" now (the cost picker said
   "Sacrifice and activate" for every exile-instead cost, Food Chain's too).
   Smaller gaps from round 154: "Create a token. When you do, ..." triggers once for each of those tokens created (CR
   603.12a), except when the reflexive ability is about "that token" (Forum Filibuster, Ratonhnhaké:ton, Dáin
   Ironfoot), which still triggers once; Ob Nixilis, Captive Kingpin triggers when at least one opponent lost exactly 1
   life in the event, even if another opponent lost more at the same time; bots say yes to Descendants' Fury only with a
   token among the creatures that dealt damage, and use Kaya, Geist Hunter's −2 like any other ability; Yorion is a
   normal card, not a companion (as all companions).
   Smaller gaps from round 153: Urabrask's "the next time they would draw a card this turn, instead they exile the top
   card" applies before that player's other replacement effects for the draw, without asking them the order (CR 616.1);
   bots pick Teferi, Who Slows the Sunset's +1 targets by the usual scoring; bots sacrifice Swashbuckler Extraordinaire's
   Treasures by a simple rule (token Treasures only, one for each attacker with power 2 or more and no double strike);
   bots send Senu, Keen-Eyed Protector at the first player offered; Agility, Endurance and Perception Bobblehead are
   still out (a line each); Vance's Blasting Cannons still lacks its "third spell" transform line.
   Smaller gaps from round 152: bots never use Luxior's "Equip planeswalker"; bots get Tato Farmer's rad counters only
   with 20 or more cards in the library and 12 or more life; bots discard their hand to draw (Knollspine Dragon, Clive)
   only when it draws more cards than they hold; Phyrexian Vindicator's reflexive trigger still doesn't happen for
   damage that can't be prevented (Anti-Venom's counters do, CR 615.12).
   Smaller gaps from round 151: bots always put Dina's Guidance's card into their hand; bots pick Kitesail Larcenist's
   targets among opponents' permanents by the usual removal scoring, never their own.
   Smaller gaps from round 150: bots pay life for Necrodominance by a simple rule (up to five cards in hand, keeping 15
   life and two cards in the library); the payment is asked as one number from 0 to the player's life, with no "don't
   pay" button (paying 0 is the same, CR 119.4).
   Smaller gaps from round 148: bots sacrifice for offering only when they couldn't cast the spell otherwise (the
   cheapest token or low-value permanent, never a commander); bots aim Turnabout at the opponent with the most to tap
   (or untap their own) by a simple count, keep exiling for Dance with Calamity while 4 or more remain under its limit,
   and copy the strongest creature for Benthic Anomaly; Patron of the Nezumi and Patron of the Orochi still miss one
   other line each (offering itself plays). Smaller gaps from round 147: Alms
   Collector's first card is drawn without offering dredge or Scion of Halaster's look; with Collectors controlled by
   two opponents, the first in turn order applies (the drawing player doesn't choose, CR 616.1); Joust, Malamet Battle
   Glyph and Hog-Monkey Rampage miss their middle line ("if it's a Knight", "if the creature you control entered this
   turn", "if it has power 4 or greater"). Smaller gaps from round 146: bots cast
   Cosmic Intervention like any other instant (not in answer to a board wipe), cast Invoke Calamity's spells in the
   order offered and use Scroll of Fate only like any other ability. Smaller gaps from round 145: a Doubling Cube activated first doesn't get Tezzeret's reduction; Nicol Bolas,
   Dragon-God shares one set of exiled cards among the abilities he borrows (no supported planeswalker has linked loyalty
   abilities yet) and doesn't follow abilities another Bolas borrowed; Ajani's Chosen asks about attaching even when the
   Aura can't enchant the Cat (nothing moves); bots transform Tarrian's Journal only with one card or none in hand; a
   copy's quoted "except it has" ability isn't checked for support when the card compiles (it's compiled on the copy);
   bots use Shay Cormac's {1} like any other ability. Smaller gaps from round 144: behold works for
   one creature type only, not a planeswalker type (Countersculpt's "behold a Jace"); bots behold a card from their hand first when it's exiled, a permanent first when it isn't, and never
   a token or a commander; the log reads "You beholds" (like "You votes"); Champions of
   the Shoal ("enters or becomes tapped"), Lys Alana Dignitary, Froghemoth, Rysorian Badger and Suffer the Past still
   miss a line each. Smaller gaps from round 143: bots sacrifice to Scavenger's Talent only when the best creature
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
   waterbend {X} costs, "whenever you waterbend" (Avatar Aang), Watery Grasp
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
   Suit, Brass Herald, Alrund, Vigean Intuition, Sages of the Anima and Serra's Emissary (kindred) are
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
   Researcher, Horn of the Mark and Landroval ("two or more creatures attack a player") and We Ride at Dawn (its convoke line) are still out; Multiversal Passage's menu
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
   Leonardo (another "if the discarded card" variant), Interdict, Bruenor's {0}
   equip. Smaller gaps from round 102: Hithlain Rope (seating left and right); "can't be sacrificed"
   granted to another permanent (Garland, Assault Suit, Jon Irenicus, Stilt-Man, Zurgo); Kindle the Carnage, Forbidden
   Ritual; Agatha's Soul Cauldron lends abilities after every ability-removing effect (no timestamp order against
   "loses all abilities"); a permanent that can't be sacrificed still reads "sacrifices" in some log lines of the effect
   that tried. Smaller gaps from round 101: counter costs on spells (Quilled Greatwurm, Dawnhand); Ancient Imperiosaur, Everything Comes
   to Dust and Knight-Errant of Eos (what convoked them); Nissa's two-sentence "Nth time" branches; Rose Room
   Treasurer, Soulbright Flamekin; Eivor and Sludge Titan ("and/or" after a mill); Brightflame,
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
   - Transform: craft (702.167) beyond one kind of material, "As ~ transforms into ~" (712.20: Curse of Leeches, Ludevic, Sephiroth, Zenos each
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
   - Punishers still out: "sacrifices a permanent unless they discard" (Possessed Portal), "another nonland permanent" (Torment of Venom),
     "that many permanents" (Archfiend of Spite), "any number of times" (Forbidden Ritual). Rottenmouth Viper's
     trigger works; its "sacrifice any number of nonland permanents, costs {1} less for each" additional cost doesn't
     (it needs a picker when casting). The same "sacrifice any number of X, then that many" shape blocks Pitiless
     Carnage, Renounce, Reprocess, Scapeshift, Malevolent Witchkite, Mana Seism and Lich-Knights' Conquest.
   - Classes (CR 716) still out on other lines: Cleric Class's level 3 ("you gain life equal to that creature's
     toughness"), Warlock Class ("the life they lost this turn"),
     Fighter Class ("blocks it this combat if able"), Leader's Talent ("if it had a counter on it"), Gourmand's Talent
     ("for the first time each turn"), the Stormchaser Otter token ("blue and red ... with prowess").
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
     Owlbear Cub), "where X is" in the look (Ajani Outland Chaperone, Famished Worldsire, Emergent Woodwurm), the X
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
     battlefield, that creature is also goaded" (Hot Pursuit).
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
     Pixie Guide's Wyll-style rerolls of others), Iron Mastiff, Chaos Dragon, Ancient Brass Dragon, Farideh, Thunderwave ("not chosen"), planar die.
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
   - "Exile / reveal until a nonland card" works for casting it now or this turn, for Treasure Hunt and (round B23) for
     damage or +X/±X by its mana value; still out: several targets (Kaboom!), a reflexive trigger after (Calibrated
     Blast), Undying Flames' epic, "if the spell's mana value is ..." (Bre, Breaching Dragonstorm, Ryan Sinclair,
     Solstice Revelations), paying life or energy instead (Bismuth Mindrender, Amped Raptor), each opponent / each player (Fevered Suspicion, Etali, Plargg and Nassari),
     suspend and time counters (Kang Prime), Neera, Demonlord Belzenlok ("repeat this process").
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
     trigger shapes (Broodcaller Scourge), Old Man of the Sea, Sphere of Annihilation, Quag Feast
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
     Urabrask's Forge (X/X tokens); "any number of target ... return each of them" (Semester's End, Brago); Flickerform
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
     into the trigger), Goblin Plate Mail ("attach
     ~ to the amassed Army"), Espers to Magicite, Edgar's Awakening, Ugin's Binding, Plumb the Forbidden.
   - "Triggers an additional time" still out: Clara Oswald, Cloud, Dr. Beverly Crusher, Dungeon Delver, Echoes
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
     Tide, Bubbling Muck), attacks, blocks, life gain, other damage, Spiritualize and the rest of the 11 unsupported ones.
   - "Whenever you cast a spell that targets ..." still out: "that targets only ..." (Loki,
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

## Lane B (bottom up)

A second lane works up the list from the least played end while the main rounds go down from the top, until the two
meet (Ken, Oct 26 2026). `npm run popular -- --least` lists the unsupported Commander-legal cards least played first:
unranked ones, then ranks from the bottom. Lane B keeps its own notes here and leaves the list above to the main rounds.

- Meld results (Brisela, Voice of Nightmares and the like) are left out of `--least`: they only exist melded and are
  never in a deck (CR 712.4b); their halves are what's supported.
- Round B1 (ranks 32,272 up to about 31,700, the bottom ~150 unsupported cards): Conspiracy's draft-matters cards with
  no draft before the game (CR 905.2), prevention shields on ~, you or a player, combat activation conditions,
  snow landwalk and desertwalk, "can block creatures with landwalk/shadow as though", the most common color, color
  groups, "can't block black creatures", hybrid cumulative upkeep ("{R} or {G}"), "until end of combat", "sacrifice ~
  unless you pay {1} for each ...", "When ~ becomes blocked", "more cards in hand than each opponent", targets
  "blocking ~" / "blocking or blocked by ~", "can't attack if defending player controls ...". +108 (24,930 with round 172).
- Skipped there, with reasons: Bone Shaman (which creatures a source damaged this turn); Sea Troll and Lurker (whether
  it blocked or was blocked by something this turn); Lifelace and Purelace (a color change on a spell); Ronom Hulk
  (protection from snow); Wandering Mage, Samite Censer-Bearer, Pearl Shard, Elvish Healer, Orim's Touch (prevention
  forms not parsed yet: per-target amounts, "if it's a green creature, 2 instead"); Desert Nomads (prevent damage
  from Deserts); Balduvian Fallen (mana spent on a cumulative upkeep payment); Viashino Bey (an attack requirement
  that depends on the declaration itself); Heroism (per-attacker pay-or-prevent); Ogre Enforcer (lethal damage from a
  single source); Groffskithur ("target card named ~" in a graveyard: a target filter by the source's name); Urborg
  Panther (a cost that sacrifices creatures by name); Sworn Defender and Lesser Werewolf (power-dependent combat
  tricks).
- Round B2 (ranks 32,230 up to about 31,000, plus some more played cards the same templates cover): prevention of
  damage a creature deals to, or is dealt by, creatures of a color, snow creatures, Walls, enchanted creatures or
  creatures with first strike (Indentured Oaf, Goblin Furrier, Enchanted Being, Tresserhorn Skyknight, Marble Priest,
  Wall of Putrid Flesh); "All Walls able to block ~ do so" (CR 509.1c); "can't attack/block unless you control more
  lands/creatures than defending/attacking player", "unless a black or green creature also attacks", "if an
  enchantment is on the battlefield", "unless there is a Mountain on the battlefield", "can't block if you control an
  untapped land"; "as long as no opponent controls ..."; "Creatures named ~ get +1/+1"; threshold "is black, and has"
  (Possessed); the Volvers ("if ~ was kicked with its {B} kicker, it enters with ... and with ..."); Plow Under,
  Rebuking Ceremony and Harmonic Convergence, whose owners order the cards on top (CR 401.4: Gravepurge now asks too);
  "reveals their hand and discards all X cards"; "exiles all land cards / cards with flashback from their graveyard";
  blocked, unblocked (only once blockers are declared, CR 509.1h) and "nonattacking, nonblocking" creatures; "each
  creature blocking or blocked by ~"; "sacrifice it unless you sacrifice two Swamps"; "defending player may draw a
  card"; "deals 2 damage to any target and 3 damage to itself"; "Destroy target creature. If that creature was green
  or white / a Human / wasn't attacking, ..." checked as it last existed (CR 608.2h). +61.
- Round B3 (ranks about 31,000 up to about 29,500, plus more played cards the same templates cover: Fry, Noxious
  Grasp, Chittering Rats, Gravity Sphere, Necrite, Volrath's Dungeon, Rashel, Fist of Torm and others): Aura bonuses
  "as long as it's black / a Zombie / an enchantment. Otherwise, ..." (CR 611.3a) and "as long as it's untapped";
  "has defender as long as it's a Wall"; "as long as it isn't attacking or blocking"; "loses flying"; "gets +3/-1 and
  is black"; "+1/+1 for each other creature you control named ~" (counted with the layers so far); "can't attack or
  block unless it's equipped"; "can't block creatures with power greater than ~'s power" (CR 509.1b); "can't be blocked
  by enchanted creatures or enchantment creatures"; "Creatures that are enchanted can't attack or block"; "Destroy all
  Auras"; "green creatures and white creatures"; "nonartifact creatures"; targets "artifact creature or black
  creature", "black or red creature that's attacking or blocking", "creature or planeswalker that's blue or red",
  "spell cast from a graveyard"; "Counter target spell if it was kicked"; Imperial Edict ("target opponent chooses a
  creature they control. Destroy that creature."); "sacrifices a creature of their choice with mana value 3 or less";
  "If that player does, they lose 2 life"; "you lose 3 life if you don't control a Demon"; "If that creature had a
  +1/+1 counter on it" and "If that creature is an enchantment" (CR 608.2h); "Tap ~. It gains indestructible";
  two targets with counters each; "up to two target creatures" prevention; "sacrifice ~ unless you remove a +1/+1
  counter from it"; "When you're dealt combat damage"; "When ~ deals combat damage"; "that opponent discards a card";
  punishers "Unless target player pays {3}", "unless any player pays {2}" and "unless its controller pays 2 life"
  (CR 118.12); "target opponent / each player puts a card from their hand on top of their library", "chooses three
  cards from their hand and puts them on top in any order"; "That player shuffles that card into their library";
  "look at the top two (five) cards of target player's library. Put one of them into their graveyard (and the rest
  on top in any order)"; "return two target lands you control". Bots now aim "target player sacrifices" edicts
  (Diabolic Edict too), punishers, hand-to-library and Wu Spy's mill at an opponent, not themselves. +69, two of
  them (Training Drone, Temple Thief) also done by round 175: +67 (25,215 with rounds 174 and 175).
- Skipped there, with reasons: Kaervek's Hex and Tropical Storm (two amounts to one creature must be one damage
  event, CR 120.2); Mammoth Harness (a block trigger about "the other creature"); Telekinesis (two effects tied to
  one target's untap steps); Nulltread Gargantuan ("put a creature you control on top of its owner's library", a
  pick that moves to the library); Eunuchs' Intrigues ("other creatures they control can't block": the chosen one
  apart).
- Round B4 (ranks about 29,700 up to about 26,300, template clusters, plus more played cards the same templates cover:
  Wren's Run Hydra, Saheeli, Radiant Creator, Trystan, Lys Alana Dignitary, Dawnhand Eulogist, Ramunap Hydra and
  others): "you control a Desert or there is a Desert card in your graveyard", "there is a land / an artifact / a
  Warrior card in your graveyard", "an instant card and a sorcery card are in your graveyard", "ten or more cards in a
  single graveyard"; "Spirit or enchantment" (also "Human or artifact"); "creatures with no counters on
  them"; threshold "instead" with "the damage can't be prevented", "destroy that creature. It can't be regenerated" and
  "deals 5 damage to each creature without flying"; "If that land was a snow land"; "If that creature is white or blue
  / is an enchantment / has infect" (CR 608.2h); "if you've cast another black (blue, green, white) spell this turn",
  never counting the spell or the permanent itself (Soul Reap, Dream Thief, Talara's Battalion, Patrician's Scorn);
  Recover (CR 702.59a, a may-pay from the graveyard, exile otherwise); Reinforce X; "If ~ was kicked, it enters with
  N +1/+1 counters on it and with haste" (a single kicker); the Mana Batteries ({G}, plus one more for each charge
  counter removed); the Zubera ("for each Zubera that died this turn", any player's, changelings included); the Leeches
  ("Red spells you cast cost {R} more"); the Opal, Hidden, Veiled and Lurking enchantments ("When an opponent casts a
  creature spell, if ~ is an enchantment, it becomes a 2/2 Soldier creature", CR 603.4, 205.1a). +80 (25,295 with
  round 175).
- Skipped there, with reasons: Burning Wish, Living Wish, Death Wish, Cunning Wish, Glittering Wish and Ring
  of Ma'rûf (nothing outside the game in Commander here: they'd only exile themselves); Thraben Exorcism ("creature
  with disturb"); Public Execution ("each other creature that player controls" after a target creature); Feast of
  Worms ("another land" of that player's); Burning-Eye and Rushing-Tide Zubera (all damage dealt this turn would need
  tracking); Garza's Assassin (recover by paying half your life); Opal Titan (protection from that spell's colors),
  Veiled Sentry (P/T equal to that spell's mana value), Hidden Herd ("plays a nonbasic land"), Hidden Predators,
  Lurking Jackals, Opal Avenger and Veiled Crocodile (state triggers on an enchantment).
- Round B5 (ranks about 26,400 up to about 25,250, template clusters, plus more played cards the same templates cover:
  Realm of Koh, The Legend of Kuruk, Questing Druid, Lavinia of the Tenth, Gimli's Fury, Banishing Slash and others):
  "During turns other than yours" (Mesa Lynx, Glory of Warfare, Oak Street Innkeeper, Vibrating Sphere); "~ is a 2/3
  Gargoyle artifact creature with flying" as a conditional self static (CR 205.1b: it keeps its other types); "your
  opponents control no creatures", "you control exactly one creature" (and "that creature gets ... and has ..."),
  "there are no Zombies on the battlefield", "an opponent has been dealt damage this turn", "you didn't play a land
  this turn", "you control an artifact and an enchantment", "(don't) control a permanent named X (or a permanent named
  Y)"; "attacks each combat if able unless you control ..."; "can't block or be blocked by creatures with power 2 or
  greater / non-Spirit creatures"; pump riders "If it's legendary / a Goblin or Orc / a token, it also gains ...",
  "Colorless (White, Kithkin) creatures you control also gain ..."; "If that creature is a Human, put two +1/+1
  counters on it instead"; "If that creature has toxic, ~ deals 4 damage to that creature instead"; "Destroy target
  ... If that permanent (land) was blue or black / nonbasic / a Liliana planeswalker, ..." (CR 608.2h, as it last
  existed); punishers "Destroy (Tap, Exile) target creature unless its controller pays {X}"; "Destroy target blocking
  creature at end of combat" (a delayed trigger with its own target; bots aim it at an opponent's blocker); "When ~
  enters or is turned face up" (a face-down permanent entering has no such trigger, CR 708.8); detain "up to two
  target" and "each ..."; "nonattacking" targets; "Exile all cards from target player's hand and graveyard";
  "Monocolored creatures can't block this turn"; "discards two cards, then draws as many cards as they discarded this
  way"; "You gain 3 life for each land card discarded this way"; "each creature each opponent controls"; "cards in
  your opponents' hands"; affinity for Plains; "attacks or blocks while you control a Dinosaur"; "When ~ is put into
  a graveyard from the battlefield, if it was a creature". +79, two of them (Questing Druid, Quirion Dryad) also done
  by round 176: +77 (25,437 with round 176).
- Skipped there, with reasons: Mystic Decree ("lose flying and islandwalk" isn't parsed); Hei Bai (reveal until a
  Shrine); Avatar of Discord ("unless you discard two cards" with one card in hand: a partial payment question);
  Polar Kraken and Phyrexian Soulgorger (cumulative upkeep paid by sacrificing); Stand United (an "if" effect that
  pauses for a scry); Nissa's Defeat (its target phrase); Wargling (an ability word before "until end of turn,");
  Phoenix Fleet Airship ("permanents named ~"); Galactus (a name with ~ in it); Festering Newt, Ruin in
  Their Wake, Rix Maadi Guildmage, Dragon Hunter, Will of the All-Hunter, Foe-liage, Inflame and Executioner's Swing
  (each needs a check not modeled: which creatures were dealt damage this turn, "if it's blocking", Dragons as
  though reach, lands entering during your turn).
- Round B6 (ranks about 25,250 up to about 23,800, template clusters, plus more played cards the same templates cover:
  Smash to Smithereens, Detonate, Vanguard Seraph, Attended Healer, Séance, Jem Lightfoote and others): riders checked
  as the spell resolves ("If it's an artifact creature / that creature is a Zombie, ... instead", "also deals 2 damage
  to that permanent's controller", "If that creature is white, it gets -4/-4 instead", "another Hero", "If it has a
  counter on it", "If it was a Jace planeswalker spell", "If it was a Gideon planeswalker" as it last existed, CR
  608.2h); targets "creature, Vehicle, or nonbasic land" and "that artifact's controller"; "target creature and all
  Auras attached to it", "Destroy all Equipment attached to that creature"; protection lists ("from blue, from black,
  and from red", from Vampires/Werewolves/Zombies), "protection from legendary creatures / non-Spirit creatures";
  granted flanking and artifact landwalk; "Zombies you control get ... Other creatures you control get ...";
  "Until end of turn, target creature gets ... and other creatures you control get ..."; "They each get"; a pump with
  no duration (CR 611.2a); "That spell's controller may draw a card"; "Counter target spell and ~ deals 3 damage";
  "Counter target spell that targets a player"; "the first time each turn" you gain or lose life; end-step checks "if
  that player didn't cast a (creature) spell this turn" (the active player's) and "if you haven't cast a spell from
  your hand this turn"; "If ~ wasn't cast from your hand, ... instead" (true of a copy); "you may exile target creature
  card from a graveyard. If you do, ..."; "cards in that player's hand minus the number of cards in your hand";
  "for each creature (land) card put into their graveyard this way"; "sacrifices a creature of their choice with
  flying"; "If that card is a Goblin card"; "if its power was 3 or greater" on dying; "doesn't untap ... if it has a
  +1/+1 counter on it / if you control a Reflection"; "remove a -1/-1 counter from each creature you control";
  oil counters; "investigate four times"; "If you control a Fish, Octopus, Otter, Seal, Serpent, or Whale";
  "Cowards (creatures with defender) can't block this turn"; "attacking Warriors get +1/+1". +74 (25,572 with round 177).
- Skipped there, with reasons: Silence the Believers ("any number of target creatures and all Auras attached to
  them"); Mark of Eviction and Deathless Knight (triggers from the battlefield back to the hand or the graveyard);
  Prairie Dog (a counter replacement until end of turn); Kazandu Stomper ("up to two lands you control": a pick with
  "up to"); Vicious Offering (a kicker cost that isn't mana); Nissa's Defeat (its target phrase); Chandra's Defeat
  ("if that permanent is a Chandra planeswalker, you may discard a card. If you do, ..."); Prohibit, Expel the
  Unworthy and Agonizing Demise (kicked riders not parsed yet); Morgue Burst ("the power of the card returned this
  way"); Sudden Insight ("each different mana value among nonland cards in your graveyard"); Doomsday Specter ("The
  player discards that card"); Alaborn Zealot ("destroy both creatures"); Crown-Hunter Hireling ("unless defending
  player is the monarch"); Landscaper Colos, Draugr Thought-Thief, Reveka, Hellhole Rats, Unyaro Griffin, Liability,
  Sunken Hope, Mage Hunters' Onslaught, Lure of Prey, Light of Sanction, Enshrouding Mist, Arcades Sabboth, High Seas
  and Aether Storm (each a template not parsed yet).
- Round B7 (ranks about 23,800 up to about 21,900, template clusters, plus more played cards the same templates cover:
  Foresight, Relic Crush, Hellion Eruption, Ensoul Artifact, the Zendikons, the Genjus and others): "skips all
  combat phases of their next turn" (every combat that turn, CR 614.10); "Lands (Creatures and lands) you control /
  target player controls don't untap during their next untap step", for whatever they control when that step comes;
  "Target player shuffles their library"; "Search your library for three cards, exile them, then shuffle" (the bot
  exiles the cards it wants least) and "Search target player's library for (up to) N / X cards and exile them";
  "Destroy target ... If its (that permanent's) mana value was (is) N or less, ..." on its last known mana value
  (CR 608.2h); "Destroy target X and up to one other target X"; "Each player returns all creature cards from their
  graveyard to their hand"; prevention of damage "by creatures it's blocking / blocking it"; "Enchanted land is a 4/2
  red Beast creature with trample. It's still a land" and "... creature that's still a land" (its color replaced,
  CR 105.3), "Enchanted artifact is a creature with base power and toughness 5/5"; "Enchant Island ... enchanted
  Island becomes ..." and "When enchanted Island (land) is put into a graveyard" (the Genjus, Viridian Harvest);
  "has defender and loses flying"; "Enchanted land is a Mountain, Forest, and Plains"; attack costs on one creature
  ("can't attack unless its controller pays {3}", "unless you pay {1} for each +1/+1 counter on it", CR 508.1g);
  "When you discard ~", "When ~ dies and when you discard ~"; "if you've discarded a card this turn"; "Whenever an
  opponent is dealt noncombat damage"; "Whenever ~ attacks, if it (doesn't) have first strike"; statics that read a
  keyword now depend on the effects that add or remove it (Manor Gargoyle, CR 613.8a); "another Merfolk or an
  Island"; "if you were dealt 4 or more damage this turn"; "if enchanted creature's power is 4 or greater"; "as long
  as there are no cards in your graveyard"; "as long as an opponent is poisoned"; "Sacrifice all creatures you
  control, then create that many ..."; "Your life total becomes equal to your starting life total"; targets "cards
  with cycling (mutate) from your graveyard". +73, four of them also done by round 177: +69 (25,641 with round 177).
- Skipped there, with reasons: Sadistic Sacrament (a kicked search "instead"); Dark Matter Manipulator and Master's
  Councillors ("for every seven": a divided amount); Ichor Shade (a typed "put into a graveyard this turn" count);
  Crackling Emergence and Harmonious Emergence (a destroy replacement on the enchanted land); Genju of the Fields (a
  damage trigger granted until end of turn); Oppressive Rays, Qal Sisma Behemoth, Myr Prototype and Cowed by Wisdom
  (block costs on one creature: only global ones are modeled); Weight of Spires, Skull Raid, Gremlin Infestation
  (each a template not parsed yet); Wall of Shadows ("can't be the target of spells that can target only Walls");
  Chained Throatseeker ("can't attack unless defending player is poisoned").
- Round B8 (ranks about 21,900 up to about 19,500, template clusters, plus more played cards the same templates cover:
  Cruel Reality, Wasitora, Vicious Battlerager, Nessian Boar, Glorious Enforcer and others): mass pumps split by
  controller ("creatures you control get +1/+1 and creatures your opponents control get -1/-1", Skulduggery's two
  targets); "if you have less life / control fewer creatures than an opponent" and "more life than an opponent";
  "an opponent has no cards in hand"; "a Lesson card in your graveyard"; "cards with cycling in your graveyard"; "in
  its controller's graveyard" for an Aura; "as long as you haven't cast a spell this turn"; "During your turn, you
  and ~ have hexproof"; intervening "if ~ was dealt damage this turn" and "if ~ wasn't kicked"; "Whenever you cast a
  kicked spell" and "if that spell was kicked"; cast triggers for "an instant, sorcery, or Wizard spell" and "a white
  or blue instant or sorcery spell"; "Then if it wasn't kicked"; "If the player can't, ..." after a sacrifice;
  "that creature's controller" for the creature blocking or blocked; "put that creature on top of its owner's
  library"; "Destroy all Plains"; "and all Equipment attached to that creature"; "Counter up to two target spells";
  "Regenerate it" after a target; "Exile it (sacrifice ~) unless you sacrifice ...", "return ~ to its owner's hand
  unless you remove two oil counters"; "unless they control two or more basic lands" (the trigger's player); "attach
  all Equipment on the battlefield to it"; domain for a target player and "Each player creates ... for each untapped
  Forest they control"; "Sacrifice any number of lands, then add that much {C}"; "if ~ is untapped. Otherwise, ..."
  (as it last existed, the rulings: tapped is now kept in last-known information); "Put a +1/+1 counter on it if it's
  a creature. Put a loyalty counter on it if it's a planeswalker"; "Whenever equipped creature dies, if it was a
  Human"; "create ... if there are two or more creature cards in your graveyard. Otherwise, ..."; "Look at target
  player's hand and choose a card from it. That player discards that card"; "Destroy all creatures except for ~".
  +86, three of them also done by round 179: +83 (25,870 with round 179).
- Skipped there, with reasons: Devour Flesh and Doomgape (the sacrificed creature's toughness, as an effect's
  sacrifice); Laquatus's Creativity ("that many" counted after the draw); Voidpouncer (two kinds of counters);
  Ravaging Riftwurm (more time counters as it's kicked); Loyal Sentry and Abu Ja'far (destroying the creatures in a
  block); Orcish Spy (looking at the top cards without reordering); Gandalf, Wandering Wizard ("~'s owner ... and
  draws"); Parasitic Implant ("enchanted creature's controller sacrifices it"); Jaded Response ("shares a color with a
  creature you control"); Cruel Calculations (cards put into a graveyard from a library this turn); Chainflail
  Centipede ("~ or equipped creature attacks, it ..."); Spike Cannibal (moving every +1/+1 counter); Driftgloom Coyote
  ("if that creature had power 2 or less" after an exile until).
- Round B9 (ranks about 19,600 up to about 17,100, the easier templates, plus more played cards the same templates
  cover: Goblin Shrine, Kjeldoran Pride, Ancient Runes, Pippin's Bravery, Giant Opportunity, Regenerate and others):
  "~ can't have counters put on it"; "enchanted creature is tapped/untapped", "enchanted land is a basic Mountain",
  "you control another creature named ~", "your opponents control three or more creatures", "you discarded a card this
  turn", "you lost life last turn" (kept for one turn), "~ doesn't have a +1/+1 counter on it", "~ didn't enter the
  battlefield this turn", "any player controls a white permanent", "is a Human or an Angel"; "can only attack alone";
  "can't attack, block, or transform" (CR 701.28f); "as long as it's a Human. Otherwise, it can't attack or block";
  threshold "an additional +1/+1"; "can't be blocked if ~'s power is 1 or less" (a static condition); cost reductions
  for each creature you attacked with this turn; "N plus the number of other spells you've cast this turn"; targets
  "without a +1/+1 counter on it", "other than enchanted creature", "attacking red creatures"; "if that creature is
  1/1" on entering; "Whenever one or more creatures attack you"; "Whenever a creature attacks or blocks" (two
  triggers); "if he's equipped"; "Sacrifice those tokens at the beginning of your next upkeep" and "At the beginning
  of your next upkeep, discard three cards at random"; "Shuffle enchanted creature into its owner's library";
  "Counter target spell if you control more creatures than that spell's controller"; "Exile a card from your hand";
  "Return target permanent to its owner's hand. Then that player discards a card (if you control a Zombie)"; damage
  "except for creatures you control with flying"; "It deals 5 damage instead if that target is white and/or blue";
  "If that creature is a Demon, exile it instead"; "If an opponent controls that creature, put a stun counter on it";
  "If target player has exactly 10 life"; "you may reveal a Dinosaur card from your hand. If you do" (a reveal picker
  of at most one card); "If that creature has toxic, instead it gets ..."; "Then if that creature's power is 0 or
  less, destroy it"; "If it had mana value 3 or less" after an exile; "If it was a Soldier" after a bounce; "You may
  sacrifice a Food. If you do, ... Otherwise, ..."; Doomgape's "You gain life equal to that creature's toughness";
  "the total life lost by your opponents this turn"; "You gain X life and scry X"; "each player draws two cards, then
  discards a card at random" after a trigger (this also fixes Vile Mutilator, whose second sacrifice was yours instead
  of each opponent's). +68 (25,938 with round 179).
- Skipped there, with reasons: Sokenzan Smelter ("pay {1} and sacrifice an artifact" as one optional cost); Lethal
  Sting (an additional cost that puts a -1/-1 counter); Heaven's Gate and Touch of Darkness ("one or more target
  creatures"); Urgoros ("discards a card at random. If the player can't"); Searing Blood, Burn Away and A Good Day to
  Die ("When that creature dies this turn" from a spell); Enslave (enchanted creature as the damage source); Rupture
  (the sacrificed creature's power to each creature and player); Trade Route Envoy ("If you don't draw a card this
  way"); Sanctuary Wall ("You may put a stun counter on it. If you do"); Gilt-Leaf Winnower ("whose power and toughness
  aren't equal"); Graceful Reprieve (a dies trigger from a spell); Firemane Angel (a trigger in the graveyard or on the
  battlefield); Deepway Navigator ("attacked with three or more Merfolk"); Patron of the Nezumi (a permanent put into
  an opponent's graveyard).
- Round B10 (ranks about 17,100 up to about 15,000, the easier templates, plus more played cards the same templates
  cover: Creeping Chill, Gaea's Blessing, Knight of New
  Alara, Blessing of the Nephilim, Aysen Crusader, Rakdos's Return, Runebound Wolf): "Creatures you control are
  Slivers in addition to their other creature types" and "is a Pirate in addition to its other creature types" (layer
  4); "All creatures are black" (layer 5); "Each land gets +2/+2 as long as it's a creature"; "+1/+1 for each of its
  colors" (the affected creature's own colors), "for each color among Allies you control", "for each land you control
  named Wastes", "the number of Mounts and Vehicles / Soldiers and Warriors / Wolves and Werewolves you control";
  Precipitous Drop's "-5/-5 instead as long as you've completed a dungeon" (a second static for the difference);
  conditions "it's your turn and you control an Army / four or more Mountains", "you have 30 or more life and an
  opponent has 10 or less life", "you have exactly 1 life", "200 or more cards in your library", "no creatures died
  this turn", "fewer than six creature cards in your graveyard"; "Goblins you control and Elementals you control";
  "can't block creatures you control"; "can block an additional ninety-nine creatures"; Noble Quarry's lure for
  itself or the creature it enchants; "you may cast spells as though they had flash" while tapped; "Your opponents
  can't cast blue creature spells"; "When ~ is put into your graveyard from your library" (Narcomoeba, Creeping Chill,
  Gaea's Blessing); "Whenever this creature crews a Vehicle" (CR 702.122);
  "Whenever a player discards
  one or more cards" (once per player); "tap ~ unless you sacrifice another creature"; "target player or
  planeswalker. That player or that planeswalker's controller discards"; "Then exile that player's graveyard"; "you
  and another target player each draw a card"; "destroy all Curses attached to you"; "If an artifact is destroyed this
  way"; "If it was dealt damage this turn"; "Surveil 3 if you have no cards in hand"; "Incubate X twice"; "8/8 Beast
  that's red, green, and white". +50 (26,098 with rounds 180 and 181, which also did Plague Wight, Battle-Scarred
  Goblin, Fire Juggler, Wall of Souls, Pious Warrior and Wall of Essence; the merge adds Valentina Allegra de Fontaine).
- Skipped there, with reasons: Gorm the Great ("must be blocked by two or more" with a partner), Lo and Li (Lesson
  spells and lifelink), Dennick (graveyard cards that can't be targeted), Captain Mar-Vell ("an opponent cast a
  spell" condition), Centaur Omenreader (a conditional cost reduction), Hercules (the first damage each turn), Ginger,
  Queen of Sweets (a token copy of the card Gingerbrute), Light of Judgment ("up to one Equipment attached to it"),
  Scrib Nibblers (a condition on the exiled top card), Stream of Thought (shuffle up to four cards from graveyards),
  Mindshrieker (the milled card's mana value), Take Out the Trash ("if you do" after a conditional may), Zenith Flare
  (cards with cycling), Truce, Nova Flame, Mutiny, Credit Voucher, Crypsis, Mana Short, Spreading Plague, Nullmage and
  Spurnmage Advocate (not parsed yet).
- Round B11 (ranks about 15,100 up to about 13,200, the easier templates, plus more played cards the same templates
  cover: Crater Elemental, Island of Wak-Wak, Symmetry Sage, Pieces of the Puzzle, Customs Depot, Dromar, the three
  Shadowhearts, Sparkshaper Visionary): "other creatures get -2/-2" (every creature but the source); "its
  power plus its toughness"; "2 or the greatest power among Dinosaurs you control, whichever is greater"; "the number
  of different powers among creatures you control"; "has base power 4" (layer 7b); "put any number of / up to three
  ... cards from among them into your hand and the rest into your graveyard"; "Put ~ from your graveyard on top of your
  library" as a cost; "If it's a Dragon, put two +1/+1 counters on it"; "Vehicles you control become artifact
  creatures"; "mill X, draw Y, then discard Z"; "If you discarded a card this way" after each player discards; "reveal
  the top card ... draw cards / gain life equal to that card's mana value"; Kirtar's Wrath's "instead" with "can't be
  regenerated"; "Other creatures can't attack this turn" (a rule for the turn, later arrivals too, all but the target);
  "just beneath the top X cards of that library"; "if that spell's controller has a poison counter"; "that player
  untaps a land they control"; "Enchanted permanent is legendary", "All nonland permanents are legendary"; "can't
  become untapped"; an Equipment's "can't be blocked by more than one creature"; Slivers with provoke; "attacking,
  blocking, or tapped creature"; "tap all lands its controller controls"; Spacecraft; "attacking creatures with
  flying" and "nontoken attacking creature" counts; "If an artifact is destroyed this way, its controller draws a
  card"; Savage Punch's ferocious +2/+2 before the fight; "return a land card or Elf card from your graveyard to your hand. If you can't,
  draw a card"; "Untap all Forests and all green creatures"; "Whenever you gain / lose life during your turn"; "if
  another Human died under your control this turn"; "destroy all permanents at the beginning of the next end step";
  "Exchange your graveyard and library"; "the highest life total among all players"; "destroy all artifacts and
  creatures other than ~"; "3/3 blue Bird creatures"; "you may pay {1}. If you do, scry 1, then draw a card" (choices
  after a payment). Round 182 also did See Beyond, Living Lands, Living Plane, Kormus Bell, Nature's Revolt and
  Invincible Hymn; main's version is kept. +50 (26,197 with round 182; the three Shadowhearts aren't Commander-legal).
- Skipped there, with reasons: Leitmotif Composer (a named creature's "can't be blocked" should hold for later
  arrivals too), Blossombind (counters can't be put on it, and wither rulings), Skyblade's Boon (an ability that works
  from two zones), Cut Short (a planeswalker that activated an ability this turn), Cleansing Meditation (returning the
  cards destroyed this way), Fall from Favor (the monarch condition), Pestilent Spirit (deathtouch on instants and
  sorceries), Storyteller Pixie (Adventure spells), Wildgrowth Walker (explore triggers), Highcliff Felidar (the
  greatest power per opponent), Long Feng (a creature or a land put into a graveyard), Kraken of the Straits (blockers'
  power against a count), Uphill Battle ("played" creatures), End Hostilities (permanents attached to creatures),
  Eiganjo Uprising ("X minus one" tokens), Consume Spirit ("Spend only black mana on X"), Energy Field, Ill-Gotten
  Gains, Recall, Pyretic Rebirth, Viashino Heretic and Suffer the Past (not parsed yet).
- Round B12 (the lanes have met; the harder templates earlier rounds skipped, least played first): kicker costs that
  aren't mana ("Kicker—Sacrifice two lands", "Pay 3 life", "Return a creature you control to its owner's hand",
  "{2}{R}, Sacrifice a land"; CR 702.33a, 118.8), echo that isn't mana ("Echo—Sacrifice two lands", "Discard a card"),
  eternalize with "Discard a card", morph costs that aren't mana (pay life, discard, reveal a colored card, sacrifice
  or return permanents; CR 702.37e) with a picker in the UI and bot support; the Mimics ("a spell that's both blue and
  red", base power and toughness plus an ability until end of turn); "Whenever ~ deals damage to a Vampire / a Goblin
  or Orc, destroy that creature"; "sacrifice it unless you sacrifice three Forests / four creatures / five lands",
  "unless you return two Forests / three basic lands you control to their owner's hand" (all or none, Hecatomb's
  rulings), "unless you return a basic land card from your graveyard to your hand"; "Whenever you play an Island";
  "Exile the top ten cards of your library" as a cost. +48 (26,245 with round B11).
- Skipped there, with reasons: Drake Familiar (returns any player's enchantment), Storm Elemental (a condition on the
  exiled card), Gift of Doom, Dralnu's Pet, Pollen Remedy, Chocobo Kick, Blood Tribute, Thought Lash and Phyrexian
  Devourer (their other lines aren't parsed yet).
- Round B13 (harder skipped cards, least played first): state triggers (CR 603.8) are checked between the instructions
  of a resolving spell or ability too ("even if only for a brief moment", rulings on Emperor Crocodile and Veiled
  Crocodile), with an intervening if checked as they trigger (CR 603.4): "When an opponent has 10 or less life / you have
  10 or less life / a player has no cards in hand / an opponent controls a creature with power 4 or greater, if ~ is an
  enchantment, it becomes ..." (Lurking Jackals, Opal Avenger, Veiled Crocodile, Hidden Predators), Hidden Herd's "When
  an opponent plays a nonbasic land", Opal Guardian's "~ becomes"; "When you control a creature with toughness 2 or less
  / no other artifacts / no other creatures / a Dwarf, sacrifice ~"; "the player who controls the most Wizards / with
  the most life / who has the most cards in hand gains control of ~", nobody on a tie (Thoughtbound Primoc, Wild
  Mammoth, Ghazbán Ogre, Wild Dogs, Sokenzan Renegade); "~ phases out / ~ deals 8 damage to you / tap ~ unless you pay
  ..." (Vaporous Djinn, Force of Nature, Minion of Tevesh Szat, Heavyweight Demolisher, Hasran Ogress); "Whenever ~
  phases in / out" (Teferi's Imp, Shimmering Efreet; phasing out looks back in time, CR 603.10b); "blocks or becomes
  blocked by one or more black creatures / Orcs", "blocks one or more black creatures", once per combat (Serra
  Inquisitors, Amphibious Kavu, Dwarven Soldier, Rashka the Slayer); "that creature becomes green" (Aisling
  Leprechaun); "if it attacked during your last turn" (Giant Turtle, Goblin Rock Sled, Tangle Kelp, Halls of Mist;
  GameObject.attackedTurns); the Apocalypse Sanctuaries ("If you control a green permanent and a white permanent, ...
  instead", one permanent of both colors counts, rulings); Keeper of Tresserhorn and Lim-Dûl's Paladin; Zealots en-Dal
  ("all nonland permanents you control are white"), Warden of the Beyond ("an opponent owns a card in exile"), Walking
  Dream, Lone Revenant. +42 (26,287 with round B12).
- Skipped there, with reasons: Warping Wurm (its "phases in" counter and its upkeep "phases out unless you pay" go on the
  stack together in the order its controller chooses, CR 603.3b; the engine has no such choice, and its order loses the
  counter); Floral Spuzzem, Kukemssa Pirates, Goblin Vandal and Rysorian Badger ("If you do" after destroying, gaining
  control of or exiling a target); Cosmic Horror ("if ~ is destroyed this way"); Electrozoa (energy at the first main
  phase).
- Round B14 (harder skipped cards, least played first): "destroy target creature if it has the least power" checked as
  it resolves (Wretched Banquet); Unforge's damage to the creature the Equipment was attached to as it was destroyed
  (rulings); "Remove a -1/-1 counter ... If you do" (Woeleecher); "in excess of" counts (Superior Numbers); "that
  Wall's mana value to the Wall's controller" (Word of Blasting); "Whenever a creature blocks a black or red creature",
  once for each one it blocks (Righteous Indignation, CR 509.3b); "blocks two or more creatures" (Lairwatch Giant);
  "Whenever a creature blocks this turn" in a spell (Battle Cry, Mage Hunters' Onslaught); each player's upkeep with
  "if that player controls" (Spiritual Sanctuary) or "four or more basic land types among lands that player controls"
  (Mask of Intolerance), snow lands (Cold Snap); "the upkeep of enchanted land's / enchantment's / artifact's /
  permanent's controller" and "enchanted artifact's controller" (Cursed Land, Feedback, Warp Artifact, Numbing Dose,
  Power Taint, Gremlin Infestation); "target player who attacked this turn" (Fire and Brimstone); "all Equipment
  attached to it" on an attacking creature (Soul Nova); "All creatures with flying able to block ~ do so" (Talruum
  Piper); "can't be blocked if you've cast a historic spell this turn" (Relic Runner); "attacks alone, it can't be
  blocked this combat" (Yuan Shao's Infantry, Ma Chao); "deals combat damage to defending player" (Electryte);
  "Whenever ~ and at least one other Warrior attack" (Paired Tactician); "if it had a +1/+1 counter on it" (Promising
  Duskmage); "you may untap target tapped creature an opponent controls. If you do, untap ~" (Soldevi Golem); "has base
  toughness" (Chariot of the Sun), "becomes blue in addition to its other colors" (Indigo Faerie), "becomes black, gets
  ..., and gains" (Defiling Tears), "an additional +2/+2" (Strength of Night); Burning Palm Efreet, Thoughtcutter
  Agent, Rookie Mistake, Stinging Vitriol, Ral's Staticaster, Saprazzan Outrigger, Duskworker, Sawtooth Thresher, Mist
  Dragon, Psychic Allergy, Paragon of the Amesha, Dragonsoul Knight, Jump Scare, Wings of Velis Vel, Sash and
  Waistcoat. +46 (26,398 with round 184).
- Skipped there, with reasons: Icy Prison ("unless any player pays {3}": the bots would pay to keep an opponent's
  creature exiled); Hail Storm (its damage to attackers and to you and your creatures is one event, not two); Urborg
  Stalker (a "nonblack, nonland permanent" in an intervening if); Fyndhorn Druid ("if it was blocked this turn" needs
  blocked-this-turn tracking); Lingering Death, Aggression and Insubordination ("that creature" for the enchanted
  creature in a trigger on its controller's step).
- Round B15 (harder skipped cards, least played first): "Look at target player's hand and choose (up to) two / X cards
  from it" (Extortion, Mind Warp, Abandon Hope; X cards or as many as there are, CR 609.3), "choose up to X cards,
  where X is the number of verse counters" (Discordant Dirge, counted as it was sacrificed), "Put that card on top of
  that player's library" (Painful Memories), "a nonland card with mana value X or less" (Venarian Glimmer); the
  Keepers' "Choose target opponent who has more life / controls more creatures / has at least two more cards in hand
  / at least two fewer creature cards in their graveyard than you do as you activate this ability", checked only as
  the target is chosen (rulings); "target nonblack creature that player controls" and "target land that player
  controls", checked again as it resolves (Keeper of the Dead, The Fall of Kroog, Yosei); "Counter target spell that
  targets ~" (Mistfolk); "that spell or ability's controller" (Retromancer, Lava Runner); "becomes the target of an
  Aura spell / of a spell" (Fugitive Druid, Spectral Prison); "if 4 or more damage was dealt to it this turn" on a dies
  trigger (the Zuberas); "it loses defender" (Elder Land Wurm, Ageless Sentinels), "if ~ has defender, it loses
  defender and gains trample" (Guardian of the Ages); protection from snow and from Arcane (Ronom Hulk, Kitsune
  Riftwalker); "an additional 1 damage to each green creature", dealt at once (Kaervek's Hex; a black-green creature is
  dealt 1, rulings); "if that player has 5 or less life" (Razor Pendulum); "target creature token, player, or
  planeswalker" (Coalborn Entity); "Creatures without defender can't block ~ this turn" (Sabertooth Alley Cat); "Tap
  target untapped creature you control. If you do, it deals damage equal to its power" (Spirit Flare); "Sacrifice two
  lands and ~" and "Exile two cards from your graveyard and ~" costs (Sandstone Deadfall, Zombie Assassin); "Return ~
  and another target creature" (Coastal Wizard, Lady Sun); "all Auras attached to target land", "target Aura attached
  to a land" (Street Sweeper, Savaen Elves); Topple's "greatest power" checked again as it resolves (rulings); Orim's
  Touch's kicked "prevent the next 4 ... instead"; Elvish Healer's "If it's a green creature, prevent the next 2 damage
  instead" (checked as it resolves, rulings). +39 (26,469 with round 185, which did the Shards too).
- Skipped there, with reasons: Lifelace and Purelace still (a color change on a spell); Brine Comber (its back face); Browse
  (exiling the rest of the cards looked at); Gremlin Mine ("up to four" charge counters removed); Agonizing Memories
  (the two cards' order on the library); Purging Scythe, Pyramids and Dragon Hunter (not looked at in depth yet).
- Round B16 (harder skipped cards, least played first): "Return this card from your graveyard to the battlefield with a
  finality counter on it" activations (Grim Repriser, Proctor of Potential, Resurrected Cultist, Balustrade Wurm, CR
  122.1h) with "an opponent has been dealt noncombat damage this turn" and "you've scried or surveilled this turn";
  "When a spell or ability an opponent controls causes you to discard this card" (Sand Golem, Mangara's Blessing,
  Quagnoth, Metrognome, Psychic Purge, Guerrilla Tactics, Ajani's Last Stand; not for a discard paid as a cost, rulings),
  Dodecapod's replacement, Spiritual Focus; "Whenever a permanent is turned face up" (Bonethorn Valesk, Aven Farseer,
  Aphetto Runecaster, Unblinking Bleb, True Identity, Mastery of the Unseen, Pine Walker and others, CR 708.8); a card
  revealed at random from a hand and its mana value (the Planeswalker's enchantments, Hired Torturer, Singe-Mind Ogre,
  Merfolk Spy, Ignite Memories); Radiance's "target creature and each other creature that shares a color with it"
  (Cleansing Beam, Wojek Siren, Brightflame, Rally the Righteous, Leave No Trace and five more; colorless shares none,
  rulings); "target creature that blocked this turn" (Sizzling Barrage); "can't attack, block, or crew Vehicles"
  (Revoke Privileges, Bound in Gold, Intercessor's Arrest; the crew picker skips the creature, browser test); "can't be
  equipped" (Goblin Brawler, CR 701.3b, 704.5n); Misstep, Disarm, Strip Bare, Twisted Justice, Tyrannize, Flunk, Eye
  Spy, Lurking Informant and Draugr Thought-Thief (browser test), Wizard Mentor, Snow Hound, Kitsune Palliator,
  Tahngarth's Rage, Even the Odds, Time of Heroes, Make a Wish, Rats' Feast, Vitalizing Cascade, An-Havva Inn and
  others. +76 (26,545 with round 185).
- Skipped there, with reasons: Dragon Whelp, Farrelite Priest, Initiates of the Ebon Hand and Nalathni Dragon (how
  many times it was activated this turn, counted as the delayed trigger resolves); Pure Intentions' first line; Cryptid Inspector ("a face-down permanent enters"); Friendly
  Fire (damage to two recipients from a revealed card); Toil to Renown (whether an artifact creature counts once or
  twice: no ruling); Gideon's Triumph and Inferno Hellion ("attacked or blocked this turn", and Gideon's "two of
  those creatures instead"); Heat Stroke ("was blocked this turn"); Perilous Predicament (two sacrifices of different
  kinds); Pendrell Flux (pay its mana cost); Experiment Twelve, Printlifter Ooze, Deathmist Raptor, Roshan,
  Planeswalker's Mischief, Dementia Sliver and Wand of Ith (not looked at in depth).
- Round B17 (harder skipped cards, least played first): the Licids (Calming, Convulsing, Corrupting, Dominating,
  Enraging, Gliding, Leeching, Nurturing, Quickening, Stinging, Tempting and Transmogrifying Licid): "loses this ability
  and becomes an Aura enchantment with enchant creature" as a layer 4 and 6 effect, "You may pay {W} to end this
  effect" as a special action (CR 116.2c, the `endEffect` action, a menu button with a browser test; bots activate
  them but never pay to end them); "the color or colors of your choice" (Prismatic Lace, Prismwake Merrow, Quickchange,
  Scuttlemutt, Swirling Spriggan, Shyft, Dream Coat; a picker with a browser test), "the color of your choice" with no
  duration (Alchor's Tomb) and "hexproof from that color" (Mondo Gecko); "one or more target creatures become red"
  (Dwarven Song, Heaven's Gate, Sea Kings' Blessing, Sylvan Paradise, Touch of Darkness) and Incite; "scry N, then
  reveal the top card of your library" with its mana value (Riddle of Lightning, Judge Unworthy, Putrid Cyclops,
  Stormchaser Chimera); "When that creature leaves the battlefield this turn, sacrifice ~" (Kjeldoran Elite Guard,
  Heart Wolf); a land becomes a basic land type with no duration or until ~ leaves (Cyclopean Giant, Thelonite Monk,
  Graceful Antelope) and "a Plains or an Island" (Tundra Kavu); Lobotomy and Shimian Specter (a card chosen from a
  revealed hand names the cards exiled). +39 (26,617 with round 186).
- Skipped there, with reasons: Flanking Licid (old wording, "Summon Licid"); Phantasmal Mount (a delayed trigger of ~
  that must also find its target); Kjeldoran Guard ("defending player" in multiplayer); Lifelace and the other Laces (a
  color change on a spell); Govern the Guildless (forecast and "monocolored"); Gaea's Liege (a conditional
  characteristic-defining P/T); Orcish Farmer ("until its controller's next untap step"); Hatchet Bully and Wandering
  Mage (a -1/-1 counter as a cost); Hint of Insanity, Haunting Echoes, Reap Intellect, Pick the Brain and Thought
  Hemorrhage (not looked at in depth).
- Round B18 (harder skipped cards, least played first): "sacrifice it unless you ..." and other punishers as a may with
  an otherwise: exile a card from your graveyard (Rotting Giant, Treacherous Vampire), "pay its mana cost" (Pendrell
  Flux, Disruption Aura, Essence Leak; {X} is 0 and no mana cost can't be paid, CR 118.6, 107.3), pay 2 life
  (Morgul-Knife Wound), "you lose 1 life unless you sacrifice" (Withercrown, with "base power 0"), "~ deals N damage to
  you unless you discard a card / sacrifice another creature. If it deals damage to you this way, tap it" (Mishra's War
  Machine, Minion of Leshrac), Elder Spawn, "discard a card unless you return a land / exile a historic card" (Tragic
  Lesson, Urza's Tome), "target opponent gains control of ~ unless you sacrifice a land" (Custody Battle); "enters with
  two -1/-1 counters unless you've cast another red spell this turn" (Hotheaded Giant, not counting itself only when it
  was cast, rulings); an Aura's "when enchanted creature is turned face up" (Fatal Mutation); "if it's an opponent's
  turn" and "for each 1 damage dealt to you this turn" (Discordant Spirit, Simulacrum); "if it was blocked this turn"
  in a dies trigger (Fyndhorn Druid, CR 603.10a); "Whenever two or more creatures your opponents control attack, ~
  can't block this combat" (Flummoxed Cyclops); "Players can't cycle cards" (Stabilizer, CR 702.29f); "activated
  abilities with {T} in their costs can't be activated", mana abilities too (Serra Bestiary, Katabatic Winds, rulings);
  Ironclaw Curse; Flaring Flame-Kin; Hint of Insanity; "prevent all damage that would be dealt (to ~) by target
  creature this turn" (Stonewise Fortifier, Kry Shield); Ana Battlemage's "tap target untapped creature and that
  creature deals damage equal to its power to its controller". No new prompt: the "you may" question and the existing
  pickers ask. +28 (26,671 with round 187).
- Skipped there, with reasons: Drake Familiar (returns an enchantment of any player: the pick is among one player's
  permanents); Chisei, Heart of Oceans ("remove a counter from a permanent": a counter of any kind, chosen as it resolves); Demonic Hordes ("of an
  opponent's choice" in multiplayer); Rapid Fire (rampage is a trigger, not a keyword a creature can gain);
  Parallax Inhibitor (fading counters as a keyword); Matopi Golem, Skeleton Scavengers, Soldevi Sentry and Spiny
  Starfish ("when it regenerates this way": a shield with a rider, and choosing among shields, CR 616.1).
- Round B19 (harder skipped cards, least played first): clash (CR 701.30) as an event: "Whenever you clash", even
  when an opponent's spell started it and won it (Entangling Trap, Rebellion of the Flamekin, rulings), "Whenever you
  clash and win" / "Whenever you win a clash" (Sylvan Echoes, Marvo, Deep Operative with "clash with defending
  player"); "If you win" riders that name the opponent clashed with or the creature of the spell (Fistful of Force's
  "an additional +2/+2", Gilt-Leaf Ambush's tokens, Pollen Lullaby, Whirlpool Whelm's "instead", Captivating Glance's
  "Otherwise, that player gains control"), and "If you win, repeat this process" (Hoarder's Greed); "if ~ dealt damage
  to an opponent this turn" (Whirling Dervish, Dunerider Outlaw); "hexproof as long as it hasn't dealt damage yet"
  (Karakyk Guardian, Palladia-Mors, as this object); "Exile/Destroy ~ and target ..." (Wall of Vipers, Hunting Kavu,
  Giant Trap Door Spider, Mangara of Corondor: the target alone if ~ is gone, rulings) and "target creature without
  flying that's attacking you" (Snow Fortress, Ice Floe); "If a creature would die this turn, exile it instead", later
  ones too (Flaying Tendrils, Malicious Malfunction); "Draw a card and reveal it. If it isn't a land card, discard it"
  (Sindbad, Fa'adiyah Seer); "may draw up to two cards ... gains 2 life for each card less" (Truce, Temporary Truce);
  "Other creatures they control can't block this turn" after the opponent's choice (Eunuchs' Intrigues, Goblin War
  Cry); Yawgmoth Demon and Archdemon of Greed ("tap ~ and it deals N damage to you"); Inventive Wingsmith; Touch of the
  Eternal; Budding Insurgent; Skullknocker Ogre; Charnel Troll ("exile a creature card from your graveyard. If you do
  ... Otherwise, sacrifice it"); Ether Well; Gore Vassal; "if ~ attacked or blocked this combat" (Kjeldoran Home
  Guard, that combat only). No new prompt: the clash, "you may" and existing pickers ask. +38 (26,709 with round 187).
- Skipped there, with reasons: Recross the Paths (its reveal-until-a-land line); Scattering Stroke (mana at your next
  main phase); Wormfang Newt and Wormfang Turtle ("exile a land you control" and its linked return); Curse Artifact,
  Mind Whip, Soul Charmer and Nakaya Shade (punishers another player answers); Glittering Lion and Glittering Lynx
  (losing one static ability until end of turn); Wall of Tombstones and Descendant of Masumaro (upkeep counts set as
  base toughness or added then removed); Lava Storm (old "X or Y" wording with no mode choice); Eternal Flame and
  Banshee ("half X, rounded up/down" to two recipients); Homarid and Tidal Influence (tide counters and the "four or
  more" state trigger); Clockwork Beast, Avian and Swarm ("up to X counters", capped in total).
- Round B20 (harder skipped cards, least played first): forecast (CR 702.57: from your hand, only during your upkeep and
  once each turn, the card stays revealed in hand; the bot uses it in its upkeep and the page stops there for it):
  Govern the Guildless, Piercing Rays, Plumes of Peace, Pride of the Clouds, Proclamation of Rebirth, Sky Hussar
  ("tap two untapped white and/or blue creatures"), Skyscribing, Spirit en-Dal, Steeling Stance, Writ of Passage;
  "becomes that type" after "choose a creature type (other than Wall)" replaces its creature types (Imagecrafter,
  Mistform Mutant, Mistform Wakecaster, Standardize, Unnatural Selection) and after "choose a basic land type" its land
  types (Terraformer, Elsewhere Flask); "creatures/creature cards of that type" (Tsabo's Decree, Elvish Soultiller);
  old "destroy all X creatures or all Y creatures" / "deals N damage to each X creature or ... each Y creature" as a
  choice on resolution (Reign of Terror, with "for each creature that died this way", CR 700.4; Lava Storm); "can't
  attack/block unless at least two other creatures attack/block" (Orcish Conscripts, CR 508.1c, 509.1b; the Block
  button says so); "for each other attacking Aurochs" (a creature type, not the card's name, CR 205.3m); "attacking
  creatures with flanking" (Telim'Tor) and "Other creatures you control with flanking" (Cavalry Master); "~ and each
  other creature with the same name as it" (Cylian Sunsinger); Chaos Harlequin; Harsh Deceiver; Homarid Warrior;
  Disappear; Domineer; Fulgent Distraction; Songstitcher; Viscerid Drone ("sacrifice a creature and a (snow) Swamp").
  New browser tests: forecast from the hand menu in your upkeep, and Orcish Conscripts' block button. +34 (26,784 with
  rounds 188 and 189).
- Skipped there, with reasons: Paladin of Prahv (forecast making a delayed "whenever target creature deals damage this
  turn" trigger); Peer Pressure ("controls more creatures of the chosen type than each other player"); Illusionary
  Presence and Talara's Bane (a landwalk / a creature card's toughness chosen from a revealed hand); Flay and Venarian
  Gold (old "discard a card at random. If you can't" / "X sleep counters" wordings); the Clockwork creatures (as in
  B19).
- Round B21 (harder skipped cards, least played first): "As ~ enters, choose a player/an opponent" read later as "the
  chosen player" (CR 614.12): counts of the chosen player's hand, graveyard and permanents (Sewer Nemesis, Nyxathid,
  Entropic Specter, Skyshroud War Beast, Lost Order of Jarkeld, Pallimud, Haunting Apparition; nothing once that player
  has left the game, per Sewer Nemesis's ruling), "At the beginning of the chosen player's upkeep" (Black Vise, The
  Rack, Energy Vortex) and "Whenever the chosen player casts a spell"; the bot picks the opponent that makes the
  permanent biggest or hurts most. Block triggers per creature (CR 509.3c-d) on ~, enchanted or equipped creature,
  with "that creature" / "the other creature" / "both creatures" and filters ("a Vampire", "a non-Wall creature", "a
  creature that has been dealt damage this turn"): Sawtooth Ogre (delayed damage at end of combat, even if it's gone),
  Mammoth Harness, Treefolk Mystic ("all Auras attached to that creature"), Dream Fighter, Dead-Iron Sledge,
  Barrow-Blade, Shape Stealer (base P/T locked as it resolves, CR 608.2h), Giant Shark, Wooden Stake, Venom. "Tap
  enchanted creature/land" as a cost, which a summoning-sick creature can pay (CR 302.6; Nature's Chosen, Veteran's
  Voice, Earthlore, Krovikan Plague, Tourach's Gate). Snow as a supertype changed in layer 4 (Melting, Arcum's
  Weathervane, Thermal Flux). Tek and Tribal Golem's "has X as long as you control a Y, ..." lists. "Look at target
  face-down creature" (Smoke Teller, Aven Soulgazer; only the looking player's log names it, CR 708.5). +32 (26,816 with rounds 188 and 189).
- Skipped there, with reasons: Goblin Flotilla (a block trigger set up only for this combat by a pay-or-not); Infinite
  Authority (a delayed end step check on "if that creature was destroyed this way").
- Round B22 (harder skipped cards, least played first): a color change on a spell (CR 112.4): "Target spell or
  permanent becomes <color> / the color of your choice (until end of turn)" and "Target instant or sorcery spell
  becomes ..." (Lifelace, Purelace, Chaoslace, Deathlace, Thoughtlace, Eight-and-a-Half-Tails, Blind Seer, Illusion //
  Reality, Vodalian Mystic); the change rides the spell onto the battlefield as the permanent it becomes, with no end
  for the Laces (CR 611.2a). Redirection shields (CR 614.9, 615.8): "The next 1/X damage that would be dealt to
  enchanted creature / target legendary creature you control / target creature, planeswalker, or player ... is dealt
  to any target / you / its owner / another target ... instead" (Ward of Piety, Vassal's Duty, Personal Incarnation,
  Captain's Maneuver), "The next time damage would be dealt to ~ (and/or you) this turn, that damage is dealt to any
  target instead" (Mirrorwood Treefolk, Glarecaster), "All (combat) damage that would be dealt to you this turn by
  target attacking/unblocked creature / by unblocked creatures is dealt to ~ / its controller instead" (Shimian Night
  Stalker, Mirror Strike, Kjeldoran Royal Guard) and "all damage that would be dealt to it this turn is dealt to target
  creature instead" (Karona's Zealot). "Only ~'s owner may activate this ability" (CR 602.2; Personal Incarnation from
  the owner's side while someone else controls it). Costs to block (CR 509.1c-e): "can't attack or block unless you
  pay {2} / {1} for each +1/+1 counter on it / its controller pays {1} for each card in your hand" (Qal Sisma Behemoth,
  Myr Prototype, Cowed by Wisdom); a block requirement never obliges paying (Lure), and the bot drops a block it can't
  pay for. "Gains protection from the color of its controller's choice" (Pale Wayfarer, Wishmonger); "Another / Up to
  one other target creature blocks it this turn if able" (Feral Contest, Monstrous Step); "until your next upkeep"
  (Erhnam Djinn); "defending player chooses an untapped creature they control. That creature blocks ~ this turn if
  able" (Crashing Boars); "that player reveals the top two cards of their library. You choose one of those cards and
  put it into their graveyard" (Balshan Beguiler); "they lose 5 life and you sacrifice this enchantment" (Pillar Tombs
  of Aku), with the world rule (CR 704.5k), which wasn't in the engine before. New browser tests: Qal Sisma Behemoth's
  Block button, Personal Incarnation's owner-only ability on Ana's side, Pillar Tombs' choice. +30 (26,846 with rounds 188 and 189).
- Skipped there, with reasons: Oppressive Rays and Gloom (an activation tax that also applies to mana abilities);
  Gabriel Angelfire (rampage as a chosen ability); Goblin Sappers (one delayed trigger destroying two creatures);
  Nissa's Defeat (its Nissa rider); Martyrdom (a granted ability with "Only you may activate"); Exalted Dragon,
  Leviathan, Floodtide Serpent and Hollow Warrior (attack costs that aren't mana, which need a picker at declare
  attackers); Premature Burial ("a creature that entered since your last turn ended"); Whipgrass Entangler and War
  Cadence (not attempted yet). Known limit: the world rule can't see a tie, since two World permanents that enter at
  once still get different timestamps (CR 704.5k puts both into the graveyard).
- Round B23 (harder skipped cards, least played first): "~ enters (escapes) with your choice of a flying counter or a
  first strike counter on it", asked as it enters (CR 614.1c, 614.12; escape only for Tizerus Charger, CR 702.138c;
  Flycatcher Giraffid, Helica Glider, Wingfold Pteron, Boot Nipper, Ferocious Tigorilla; bots rank the keywords).
  "If this ability has been activated four or more times this turn, sacrifice ~ at the beginning of the next end
  step" on an activated ability (Dragon Whelp, Nalathni Dragon; counted as the ability resolves, CR 608.2c, so the
  fourth and later activations each set up the sacrifice) and on a mana ability (Farrelite Priest, Initiates of the
  Ebon Hand, set up as the ability is activated since it doesn't use the stack, CR 605.3b); bots and autopay stop at
  three. The discarded card's mana value and colors: "deals damage equal to the mana value of the discarded card"
  (Pyromancy, Blast of Genius), "if the discarded card was multicolored/a land" (Stormscale Anarch, Land's Edge, whose
  target is chosen before the discard, CR 602.2b), "Counter target spell if it has the same mana value as the
  discarded card" (Hisoka, Minamo Sensei). "Reveal cards from the top of your library until you reveal a nonland card"
  then damage, +X/-X or +X/+0 by that card's mana value, and "put the revealed cards on the bottom of your library in
  any order" (Erratic Explosion, Erratic Mutation, Goblin Machinist; Explosive Revelation keeps the nonland card),
  with the owner ordering the bottom (CR 401.4); only lands deals nothing. "Reveal X <color> cards from your hand"
  as a cost (CR 107.3a; Martyr of Ashes, Spores, Sands and Frost), with the X picker and a reveal pick in the browser.
  New browser tests: Helica Glider's counter choice, Martyr of Ashes's X and reveal pick. +23 (26,869 with rounds 188
  and 189).
- Skipped there, with reasons: Martyr of Bones ("up to X target cards" with an X that isn't the spell's own); Kaboom!
  (any number of target players); Calibrated Blast (a reflexive trigger after the cards go to the bottom); Mount Velus
  Manticore and Argentum Masticore (a reflexive "when you discard a card this way" about the discarded card's types or
  colors); Wolf of Devil's Breach (pay and discard in an attack trigger); Dralnu's Pet (a kicker that discards a
  creature card, counters by its mana value); Bribe Taker (a counter for each kind of counter). Known bot gap: bots
  don't activate the Martyrs.
- Round B24 (harder skipped cards, least played first): "As ~ enters, sacrifice any number of untapped Forests /
  permanents / creatures" as devour's choice before it's on the battlefield (CR 614.1c, 614.12; rulings on Shimatsu and
  Wood Elemental): Wood Elemental's P/T is how many were sacrificed (a CDA, CR 604.3), Shimatsu enters with that many
  +1/+1 counters, Dracoplasm's power and toughness become their totals as they last existed (a layer 7b effect from
  then on); bots keep four lands and sacrifice cheap tokens. "As ~ enters, pay any amount of life" (CR 119.4; Minion
  of the Wastes, Phyrexian Processor's X/X Minions, Nameless Race with its cap of white nontoken permanents opponents
  control plus white cards in their graveyards), the number picker at once, nothing asked when only 0 can be paid;
  bots pay up to 7 and keep 12 life. Tokens "Its power is equal to that creature's power and its toughness is equal to
  that creature's toughness", fixed as created, from the creature as it last existed on the battlefield or the card in
  the graveyard (Broken Visage, Kalitas, Bloodchief of Ghet, Ritual of the Returned). "Target player/opponent reveals
  the top card of their library" (Aven Windreader; Cerebral Eruption, whose "return ~ to its owner's hand" puts the
  spell there as it finishes resolving, rulings); "Target player chooses a card name, then reveals the top card of
  their library" (Petra Sphinx, Vexing Arcanix: an empty library does nothing, rulings; bots name their most common
  card). "~ / Enchanted land is the chosen color" (Alloy Golem, Shimmerwilds Growth; layer 5); Winnow's "if another
  permanent with the same name is on the battlefield", checked as it resolves; Premature Burial's "that entered since
  your last turn ended"; Arsenal Thresher's "reveal any number of other artifact cards from your hand" (amplify's
  choice). New browser tests: Minion of the Wastes's life, Wood Elemental's Forests, Arsenal Thresher's reveal. +18 (26,959 of 31,936 with Lane A rounds 190 to 193).
- Skipped there, with reasons: Angelic Aberration ("each with base power or toughness 1 or less": no base P/T filter);
  Vizkopa Confessor (the opponent reveals that many cards of their choice); Plague of Vermin (paying life in turns
  until no one pays); Kamahl's Summons (each player reveals from their own hand); Gate to the Aether (a "may" the
  upkeep's player answers); Game Preserve and Dakra Mystic (each player's revealed card acted on together); Naya
  Soulbeast (a cast trigger setting how it enters); Paroxysm ("that creature" in an upkeep trigger of enchanted
  creature's controller, as Lingering Death); Conundrum Sphinx and Sphinx Ambassador (each player or another player
  naming a card about their own reveal or your search). Known bot gap: bots may cast Winnow on a permanent with no
  namesake (it still draws).
- Round B25 (harder skipped cards, least played first): punishers another player answers, as it resolves (rulings):
  "Target player discards two cards at random unless that player has ~ deal 4 damage to them" (Skullscorch), "Then
  that player discards another card at random unless they pay {1}" (Flay), "~ gets +2/+2 until end of turn unless a
  player has ~ deal 4 damage to them" (Barbarian Bully) and "unless any player pays {2}" (Nakaya Shade), each player
  asked in APNAP order; "you gain 2 life unless that creature's controller pays {2}" (Soul Charmer). Tide counters:
  "As long as there is exactly one / are exactly three tide counters on ~" and the "Whenever there are four or more"
  state trigger (CR 603.8; Homarid, Tidal Influence with "Cast this spell only if no permanents named ~ are on the
  battlefield"). "Nonartifact creatures get +2/+2 as long as they all share a color" (Common Cause, every creature on
  the battlefield, CR 105.4); Dead Ringers' "unless either one is a color the other isn't", checked as it resolves
  (rulings); Eternal Flame's "and half X damage, rounded up, to you"; "an additional +2/+2 ... for each card named ~"
  (Growth Cycle, Compound Fracture, Desert's Due); "return all cards named ~ from your graveyard to the battlefield"
  (Demigod of Revenge's cast trigger); intervening ifs with "nonblack, nonland permanent" (Urborg Stalker) and "two or
  more nonland, nontoken permanents with the same name as one another" (Chrome Replicator, one token only); Instill
  Furor's "sacrifice this creature unless it attacked this turn"; "you may pay {U}. If you don't, destroy target
  Knight and it can't be regenerated" (Knight of the Mists; bots pay only to save their own) and "If you don't,
  blight 2" (Chaos Spewer; bots pay); Descendant of Masumaro's counters added then removed (rulings: no state check in
  between); Shower of Coals' threshold "to each of those permanents and/or players instead"; "put one of them into your
  hand and exile the rest" (Browse, Eye of Yawgmoth's "a number of cards equal to the sacrificed creature's power");
  Ransack's "any number of them on the bottom ... and the rest on top"; Sealed Fate's "exile one of those cards and put
  the rest back on top in any order" (you order them, rulings); Recursive Recruitment's "for every three cards in your
  graveyard". "Put a -1/-1 counter on a creature you control" as a cost (CR 602.2b; Hatchet Bully, Wandering Mage):
  click the creature in the browser; bots pick their least valuable creature that survives it, never the commander.
  New browser test: Hatchet Bully's counter pick. +28, 27 of them legal (26,986 of 31,936 with Lane A rounds 190 to 193).
- Skipped there, with reasons: Tanglewalker (each creature's own defending player controlling an artifact land;
  granting landwalk isn't the same); Baki's Curse (damage by each creature's own Aura count); Rikala, Homarid King
  ("Then if there are four or more tide counters on ~, remove them" and an Island mana trigger); Taste of Paradise
  ("pay {1}{G} any number of times" as an additional cost). Known bot gaps: bots target Dead Ringers
  without matching colors, and Ransack's target is chosen as for any library effect.
- Round B26 (harder skipped cards, least played first): the Shrines' "X is the number of cards in all graveyards
  with the same name as that spell" (Aven, Nantuko, Dwarven, Cabal and Cephalid Shrine; the name the spell had as it
  was cast, CR 709.3b; a face-down spell has none, CR 708.2a). "Whenever ~ attacks and isn't blocked, you may ... If
  you do, ~ assigns no combat damage this turn" (CR 510.1; Floral Spuzzem, where "if you do" means the artifact was
  destroyed, so an indestructible one doesn't stop the damage, CR 702.12b; Kukemssa Pirates, Orcish Squatters with
  "for as long as you control ~", Goblin Vandal's "pay {R}. If you do, destroy ... and", Rysorian Badger's "gain 1 life
  for each card exiled this way and", Cloak of Confusion's "you may have it assign no combat damage"). Costs to attack
  that aren't mana, "~ can't attack unless you sacrifice a land / two Islands / return an enchantment you control to
  its owner's hand" (CR 508.1g-i; Exalted Dragon, Leviathan, Floodtide Serpent): attacks are refused unless every
  cost can be paid at once, each permanent paying only one cost; you click what to pay as attackers are declared
  (browser test); bots attack with Exalted Dragon only with seven or more lands left, sacrificing the least useful.
  "Destroy the creature with the least power. It can't be regenerated. If two or more creatures are tied for least
  power, you choose one of them" (Drop of Honey, Porphyry Nodes; not targeted, anyone's, never an indestructible one
  when one of those tied can be destroyed, rulings) and "~ deals 2 damage to the creature with the least toughness"
  (Purging Scythe): click one of those tied (browser test); bots pick an opponent's, the most valuable. "When there are
  no creatures on the battlefield, sacrifice ~" (CR 603.8; also Task Mage Assembly). Fixed: a discard of 0 cards no
  longer asks for one. +18 (27,025 of 31,936 with Lane A round 194).
- Known limit there: the "no creatures" state trigger is checked when a player would get priority, so a creature
  flickered in the middle of a resolution (rulings on Drop of Honey with Momentary Blink) doesn't make it trigger.
- Round B27 (harder skipped cards, least played first): negative printed power and toughness (Char-Rumbler, Spinal
  Parasite, Loot, the Anomaly; a creature with power 0 or less assigns no combat damage, CR 510.1a) and Loot's "assigns
  combat damage as though his power were positive" (only combat damage, rulings; a toughness rule still comes first).
  Chroma, counting mana symbols of a color like devotion, a hybrid symbol once for each of its colors (CR 700.5,
  rulings on Sanity Grinding): in the mana costs of permanents you control (Heartlash Cinder, Outrage Shaman,
  Primalcrux, Springjack Shepherd), cards in your graveyard (Umbra Stalker), each creature's own (Light from Within),
  the sacrificed creature's (Fiery Bombardment), the revealed cards' (Phosphorescent Feast, Sanity Grinding with "Then
  put the cards you revealed this way on the bottom in any order"). Grandeur, "Discard another card named ~" (Baru,
  Korlash, Linessa with her one-at-a-time creature, artifact, enchantment and land, Oriss's "can't cast spells, and
  creatures that player controls can't attack this turn" as a rule for the turn, Page, Skoa, Tarox; browser test).
  "If a card named ~ was revealed this way" (Stomping Slabs), Lammastide Weave's "gain life equal to its mana value",
  Vigean Intuition's "Choose a card type ... Put all cards of the chosen type", Thought Hemorrhage's damage for each
  card with the chosen name revealed. "Exile a creature card from your graveyard" as a cost read back as "the exiled
  card's power / mana value", a "*" by its characteristic-defining ability (CR 604.3; Corpse Lunge, Corpse Explosion,
  Draconic Intervention, Dread Defiler, Necropolis), and "Exile another creature card from your graveyard" (Gallia,
  Scrapheap Scrounger, Helbrute's Sarcophagus). Linked leaves-the-battlefield returns (CR 607.2a): "that player gains
  N life" (Soul Scourge, Laquatus's Champion: the target of the enters trigger, rulings), Wormfang Behemoth's "exile all
  cards from your hand ... return the exiled cards", Saprazzan Bailiff. Also "named" tokens and creatures as costs
  (Jungle Patrol's Wood, Bubbling Cauldron's Festering Newt, Kyscu Drake) and Kookus ("Keeper of Kookus" keeps its
  name; "deals 3 damage to you and attacks this turn if able"). +39 (27,089 of 31,936 with Lane A round 195).
- Skipped there: Hypnox and Realm Razer (an enters exile and a leaves return, close to Wormfang Behemoth's, left for a
  round that checks "if you cast it from your hand" and "under their owners' control"), Gravegouger, Wormfang Newt and
  Wormfang Turtle (one exile ability the return can't be linked to), Goblin Ski Patrol, Phyrexian Devourer (a power
  state trigger), Detention Sphere (left to Lane A, near the top). Known limit: a "*" creature card's power outside the
  battlefield is read from its characteristic-defining ability only where a rule asks for it (cost payments, spells on
  the stack); characteristics() still shows it as 0 there.
- Round B28 (harder skipped cards, least played first): "Remove X [kind] counters from ~" as a cost, X announced up
  to how many it has (CR 107.3a, 602.2b; the Bakus with Blademane's "for each counter removed", Infused Arrows,
  Mercadian Lift's "a creature card with mana value X from your hand", Talon of Pain and Night Dealings with "a source
  you control (other than ~) deals damage to an opponent / another player", Arcbound Javelineer, Auntie Blyte, Chamber
  Sentry, Cruel Sadist; the X picker names the counters, browser test; bots use it in main 2; a mana ability with this
  cost stays unsupported). Sacrificing "a white creature, a blue creature, and a black creature" (the Heralds, three
  different creatures, one for each) and Urborg Panther's named creatures and itself. Essence Filter's "all
  enchantments or all nonwhite enchantments"; Hooded Horror's "defending player controls the most creatures or is tied";
  Cosmic Horror's "If ~ is destroyed this way" (not when indestructible, rulings); Toil to Renown's "each tapped
  artifact, creature, and land"; Obelisk of Undoing's "you both own and control"; Tetsuo's "tapped or blocking" and
  "can't be the target of Aura spells"; Doorman's "power 2 or less and/or Walls"; Valakut Fireboar's switch; Riptide
  Mangler's base power, locked in as it resolves (CR 608.2h); Impetuous Protege's "tapped creatures your opponents
  control"; Tenacious Hunter's "a creature has a -1/-1 counter on it"; Spellbane Centaur and Dense Foliage; Sanguine
  Praetor's "the same mana value as the sacrificed creature" and Endemic Plague's "share a creature type with the
  sacrificed creature"; Icy Prison's "unless any player pays {3}" (its controller's bot pays, the others don't). +34
  (27,140 of 31,936 with rounds 194-196).
- Known limits there: bots never use Urborg Panther's search (it sacrifices itself), Sanguine Praetor or Endemic Plague
  (no value for "the sacrificed creature's" group), and may use Riptide Mangler or Obelisk of Undoing without a good
  reason. Skipped there: Crucible of the Spirit Dragon, Haruspex and Petalmane Baku (mana abilities with an X counter
  cost); Insubordination, Erosion, Curse Artifact, Wicked Guardian, Mausoleum Turnkey, Desecrator Hag, Cinder Cloud,
  Cragganwick Cremator, Lumengrid Augur, Mind Maggots, Gravebane Zombie, Lichenthrope, Territorial Dispute (each needs
  a template of its own).
- Round B29 (harder skipped cards, least played first): the Crowns' "Enchanted creature and other creatures that share
  a creature type with it" after sacrificing the Aura (Crown of Suspicion, Vigor, Ascension, Fury, Awe: the creature's
  types as it last existed if it's gone, CR 608.2h; changelings share every type). "The power of the creature tapped
  this way" / "the tapped creature's power" for a "Tap an untapped creature you control" cost, as the ability resolves
  or as that creature last existed (rulings; Keldon Battlewagon, Impelled Giant with "other than ~", Unerring Sling).
  The Clockworks' "Put up to X +1/+0 counters ... can't cause the total number ... to be greater than four" and their
  end of combat removal (Clockwork Swarm, Avian, Beast, Steed). Prevention with "for each 1 damage prevented this way"
  as part of the shield (CR 615.5): +1/+1 counters at once, before state-based actions (Temper, Test of Faith, Brace for
  Impact), +0/+1 counters at the next end step by a delayed trigger (Sacred Boon, Scars of the Veteran), life (Candles'
  Glow, splice too), and Vengeful Archon's "deals that much damage to target player or planeswalker". "Any number ...
  this way": Landslide's Mountains sacrificed as it resolves, the Sweep spells' "return any number of Plains you
  control" (Plow Through Reito, Charge Across the Araba, Sink into Takenuma, Barrel Down Sokenzan; browser test),
  "Discard any number of cards. ... for each card discarded this way" (Sacred Rites, Rites of Refusal, Tamiyo Meets the
  Story Circle), and Devouring Rage's optional "sacrifice any number of Spirits" cost counted as X (browser test).
  +28 (27,186 of 31,936 with main and Lane A round 197).
- Known limits there: a replacement effect that adds counters (Hardened Scales) can take a Clockwork past its cap;
  Scars of the Veteran's "If it's a creature" is checked at the end step; bots return or sacrifice only lands already
  tapped for the Sweep spells and Landslide. Skipped there: Thelon's Chant, Tourach's Chant, Nature's Wrath and
  Overburden ("the player who put it onto the battlefield", which the engine doesn't track and the rulings say isn't
  always its controller).
- Round B30 (harder skipped cards, least played first): "a card with the same name as ..." (CR 201.2), with the name
  read as the effect resolves or as the object last existed (CR 608.2h; a Clone's copied name counts, a face-down one
  has none, CR 708.2). Searches for the name of a target creature or card (Bifurcate, Mask of the Mimic, Pack Hunt,
  Secret Salvage), of a creature that died (Remembrance, Verdant Succession: its controller searches), of another
  creature you control (Pattern Matcher), of a card in your graveyard (Frostpyre Arcanist), of a card revealed from your
  hand (Assembly Hall must reveal a creature card if there is one; Infernal Tutor, with hellbent's "instead"), one card
  for each creature you control or each tapped nonland permanent target opponent controls (Doubling Chant, Dichotomancy:
  one search, a card for each name). Exiling the cards with that name: Haunting Echoes (all of them from the library,
  for each nonbasic card exiled from the graveyard), Deicide (the exiled card is a God card in exile, so a God that
  wasn't a creature counts, CR 205.1b), Pick the Brain and Invasive Surgery with delirium (checked after the exile or
  the counter, rulings), Hour of Glory (the God's controller exiles those cards from their hand). A search for a card
  with a stated quality may find nothing (CR 701.23b). Bots pick the target whose name their library still has (and
  don't cast Bifurcate without one) and reveal a card with a copy left. Browser tests for Assembly Hall's reveal and
  Doubling Chant's search. +17 (27,223 of 31,936 with main and round 198).
- Out after round B30: March of Burgeoning Life ("with mana value less than X": a target bound to X), Mishra,
  Artificer Prodigy ("graveyard, hand, and/or library": one card looked for in several zones), Clarion Ultimatum
  ("Choose five permanents you control"), Retraced Image and Mitotic Manipulation ("the same name as a permanent":
  any controller's, chosen as it resolves), Moratorium Stone ("and all permanents with that name" with the graveyard
  cards), Candles of Leng ("if it has the same name as a card in your graveyard ... Otherwise").
- Round B31 (harder skipped cards, least played first): "defending player may pay ... If that player does/doesn't"
  and "that player may pay ... If they don't" (Mtenda Lion, Shrouded Serpent, Mind Whip; a bot defending pays to stop
  the Lion, and pays for the Serpent only with a creature that could block it), targets "chosen at random" for
  triggered abilities, picked among the legal ones as the ability is put on the stack (Scab-Clan Giant, Knight
  Rampager, Witch Hunt; rulings), "doesn't untap during its controller's next two untap steps" (Telekinesis), damage
  "for each Aura attached to that creature" to each creature (Baki's Curse), "X damage to each creature with flying and
  1 additional damage to each blue creature" (Tropical Storm), the Defeat cycle's "If that permanent was a Nissa/is a
  Chandra planeswalker" (Nissa's Defeat, Chandra's Defeat: the walker is still on the battlefield until state-based
  actions, CR 704.3), Talara's Bane (life equal to the chosen card's toughness, then the discard), "put a creature you
  control on top of its owner's library" (Nulltread Gargantuan; browser test), Fold into Aether's "If that spell is
  countered this way", Painbringer's "Exile any number of cards from your graveyard" cost counted as X (X can be 0; browser
  test), Threshold's "is black/white and has ..." (Wayward Angel, Repentant Vampire), Infernal Caretaker's "return all
  Zombie cards from all graveyards", Durkwood Tracker's bite of an attacking creature. +19 (27,265 of 31,936 with main and Lane A round 199).
- Known limits there: bots don't activate Painbringer (an X cost they skip) and may value Baki's Curse at 0.
- Out after round B31: Ekundu Cyclops (an attack requirement that depends on the declaration itself, like Viashino
  Bey), Taste of Paradise (optional additional costs, Lane A's round 197 template; left to it), Liquid Fire (a number
  chosen as a cost), Goblin Test Pilot (a random target for an activated ability), Emberwilde Djinn ("pay {R}{R} or 2
  life"), Carrion Wurm ("any player may exile three"), Matopi Golem (a regeneration shield's rider), Taunt (a rule
  bound to a target player), Goblin Sappers ("destroy it and ~ at end of combat"), Curtain of Light, Dazzling Beauty and
  Trap Runner ("becomes blocked" by an effect), Kill-Suit Cultist (a destroy-instead damage shield), Rock Jockey,
  Explosion of Riches, Power Pack, Cinderheart Giant (chosen at random as it resolves, not targeted), Juju Bubble ("play
  a card"), Curse Artifact, Erithizon (a target chosen by the defending player), Selfless Exorcist, Cut the Tethers.
- Round B32 (harder skipped cards, least played first): "you may pay ... If you do ... Otherwise, ..." (Spitting
  Slug), "each permanent with fading you control" (Parallax Inhibitor), "a land with a trap counter on it" as a
  sacrifice cost (Trap Digger), "If it doesn't have rampage, that creature gains rampage 2" (Rapid Fire; rampage as a
  granted keyword, CR 702.23), "that player reveals the top card of their library. If that card is a land card ...
  Otherwise" (Paroxysm), sleep and pupa counters that keep the enchanted creature tapped (Venarian Gold, Cocoon: "remove
  a pupa counter from ~. If you can't, sacrifice it, ..."), "Activate only during combat and only if defending player
  controls ..." (Kjeldoran Guard, Arcum's Sleigh: with several defending players the controller picks one, CR 802.2a),
  "You may put a creature card with mana value X from your hand onto the battlefield. If you do, return ~"
  (Metathran Aerostat), "Basic lands each player controls have shroud as long as that player controls three or fewer
  lands" (Sheltering Prayers), "can't be blocked unless defending player controls three or more creatures that share a
  creature type" (Graxiplon; changelings count with every type), "All morph costs cost {2} more" (Exiled Doomsayer, also
  megamorph, CR 702.37b), "If an instant or sorcery source would deal 3 or more damage to you, it deals 2 damage to you
  instead" (Forethought Amulet), "the number of times that spell was kicked" (Rumbling Aftershocks), "If that creature
  has three or more +1/+0 counters on it, it deals damage equal to its power to its controller, then destroy that
  creature and it can't be regenerated" (Consuming Ferocity), "When that creature becomes blocked this turn, it gets
  +1/+1 until end of turn for each creature blocking it" (Barreling Attack). +17 (27,305 of 31,936 with main and Lane A round 200).
- Known limits there: Paroxysm with an empty library takes the "Otherwise" branch (nothing is revealed).
- Out after round B32: Ceaseless Searblades (activating a mana ability of an Elemental must trigger it; mana
  activations don't report their source), Yare ("target creature defending player controls" on a spell, with several
  defending players), Mercenaries ("Any player may activate this ability"), Heroism (a pay-or-prevent per creature).
- Round B33 (harder skipped cards, least played first): a card's own name in an ability it grants is a name, not the
  object with the ability (CR 201.4b: Sound the Call, Deathpact Angel, Rekindling Phoenix, Food Fight), "If the exiled
  card is a snow land" after an exile-the-top-card cost (Storm Elemental), "tap two untapped artifacts, creatures,
  and/or lands you control" as an additional cost to cast (Warlord's Elite, Fear of Exposure, Guardian of the Great
  Door; the lands tapped for it aren't also tapped for mana, and bots tap the ones they don't need), "When you do, ~
  deals X damage ..., where X is the number of card types the discarded card has" (Mount Velus Manticore), "Put a
  +1/+1 counter on ~ or ~ gains flying, first strike, or trample" for good (Flowstone Sculpture, CR 611.2a; browser
  test), "Remove up to four charge counters" (Gremlin Mine) and "remove up to three counters from another target"
  (Mabel, Bitter Recluse), "put all of them with that name into your hand. Exile the rest" (Desperate Research), "X
  target lands become Forests" (Deepwood Elder), "Until the beginning of your next upkeep, you may play that card"
  (Elkin Bottle), "can't be blocked by creatures that don't have a name" (Pompous Gadabout: face-down creatures),
  "target opponent chooses a creature they control. Destroy that creature" in a trigger (Wei Assassins), "loses your
  choice of flying, first strike, or trample" (Walking Sponge; browser test), Hail Storm's two amounts at once (an
  attacking creature of yours is dealt 3), "Target Assembly-Worker creature" (the type, not the card's name). +20
  (27,347 of 31,936 with B32 and rounds 199-201).
- Out after round B33: Mangara's Equity (damage to "you or a white creature" grouped per event), Thick-Skinned Goblin
  (echo paid as {0} inside the upkeep's may-pay), Grim Reminder (a search that reveals and leaves the card in the
  library, then a check against the names of spells each opponent cast this turn), Cycle of Life (a target "creature
  you cast this turn", "has base power and toughness 0/1 until your next upkeep", and a delayed counter at that
  upkeep), Soldevi Sage ("draw three cards, then discard one of them": only the cards just drawn).
- Round B34 (harder skipped cards, least played first): "each other spell cast this turn", every player's, the one
  cast while it was on the stack too (Storm Entity: only its own cast isn't counted), "as long as its controller
  controls no other creatures" on an Aura (Predator's Gambit), "that player sacrifices enchanted creature" at its
  controller's end step (Lingering Death), "that creature deals damage equal to its power to you" (Form of the
  Dinosaur), cumulative upkeep that is -1/-1 counters (Aboroth; bots keep it while it would survive with 2 toughness),
  "creature you control that's attacking alone" (Crowd of True Believers, Viper), "those creatures" in an "attacks
  you" trigger (Sabotage Strategist), "Prevent all combat damage blue creatures and black creatures would deal"
  (Radiant Kavu), "an enchantment or an enchanted permanent" (Godhunter Octopus), "Green ... spells and white ...
  spells cost" (Irini Sengir, High Seas), "If ~ would die, put it on top of its owner's library instead" (Gravebane
  Zombie), "sacrifice ~ unless you mill two cards" (Deep Spawn, CR 701.13b: not with fewer in the library), "Activate
  only once and only if you control a snow Mountain" (Goblin Ski Patrol), "If you sacrifice an Island this way"
  (Serendib Djinn), X damage to itself "where X is" (Sunflare Shaman), "the next 1 combat damage that would be dealt to
  you this turn" (Decorated Griffin; two attackers at once ask which one, CR 615.7), half X rounded down and up
  (Banshee), a base toughness locked in each upkeep (Wall of Tombstones, CR 608.2h), "a creature spell that has an
  Adventure" (Garenbrig Squire, Edgewall Innkeeper, Wandermare). +23 (27,370 of 31,936 with B33 and rounds 199-201).
- Out after round B34: Wicked Guardian ("you may have it deal 2 damage to another creature you control. If you do"),
  Desecrator Hag (the card with the greatest power, a tie chosen), Dralnu's Pet (X from the card discarded for
  kicker), Illusionary Presence (a land type chosen each upkeep), Elephant Resurgence (each player's own token
  counting its controller's graveyard), Volcanic Eruption ("the number of Mountains put into a graveyard this way"),
  Horn of Plenty (the casting player's may-pay and their delayed draw), Lavabrink Venturer (protection from odd or
  even mana values), Reviving Vapors (life equal to the chosen card's mana value), Mind Maggots (counters per card
  discarded this way), Empty-Shrine Kannushi (protection from colors among your permanents), Dance of the Skywise
  (becomes a Dragon Illusion that loses all abilities), Chlorophant (threshold granting a second upkeep trigger),
  Thrasta (trample over planeswalkers; its cost reduction compiles now).
- Round B35 (harder skipped cards, least played first): "That creature gets -4/-4 instead if you control a creature
  named ..." (Festering Newt), "if a creature named ... is on the battlefield" (Pious Kitsune),
  "remove a -1/-1 counter from another target creature" (Defiant Greatmaw), "has K as long as it has N or fewer ...
  counters on it. Otherwise, it has K2" (Evolved Spinoderm), "Remove two counters from ~" of any kinds as a cost
  (Gnarlbark Elm, Loch Mare, Reaping Willow, Gwen Stacy), "Counter target black spell unless that spell's controller
  pays {B} or {3}" (Thrull Wizard; the punisher prompt with two payments), "Enchanted Wall can attack as though it
  didn't have defender" (Animate Wall), "That creature can't block this combat" (Forgestoker Dragon), "If you return a
  nonland card to your hand this way" (Vengeful Rebirth), "you may put three +1/+1 counters on target land you
  control. If you do, that land becomes ..." (Wall of Resurgence, Cyclone Sire, Noyan Dar, Waker of the Wilds,
  Rootwise Survivor), "You may put a stun counter on it. If you do" (Sanctuary Wall), "that's no longer an Equipment"
  (Haunted Plate Mail; equipping it while it isn't one does nothing, per its rulings), "reveal a creature or land card
  from among them and put it on top of your library" (Silhana Wayfinder), "you may pay {2}{R}. If you do, reveal the top
  card of your library. If it's a Goblin permanent card" (Skirk Drill Sergeant), land cards from the top into the
  graveyard until a nonland card (Countryside Crusher), damage "equal to the number of cards revealed this way", the
  one found included (Madcap Experiment, Audacious Reshapers), "When that creature dies this turn, exile its
  controller's graveyard" (Burn Away), "two target permanents that share a card type", checked again as it resolves
  (Shifting Loyalties, The Trickster-God's Heist, Bilbo's Burglar's Plot; CR 205.2a). +28 (27,480 of 31,936 with rounds 202 to 204).
- Out after round B35: Aegis Sculptor and Skywarp Skaab (done in Lane A's round 204, left to it), Carrion Rats ("any
  player may exile a card from their graveyard. If a player does"), Flameskull (rejuvenation: "play one of those
  cards" until the end of your next turn), Mindreaver (a counter by name among the cards it exiled), Lethal Exploit
  and Flame Discharge ("modified creature you controlled as you cast ~"), Ardent Dustspeaker (an instant or sorcery
  card to the bottom as a may-cost), Break Out (a revealed card's mana value deciding a second may), Turf War
  (contested counters), Capricious Efreet (destroy one of three targets at random), Touch of Moonglove (a creature
  dealt damage by that creature dying this turn), Thelon's Curse (each player's upkeep may-pay per tapped blue
  creature), Pick Up the Pace ("a creature you control that entered this turn attacks" and play "as long as you
  attacked this turn").
- Next for Lane B, least played first: North Star, Silhouette, Suffocation.
  Then up from about 25,300: Goblins of the Flarg (a state trigger), Tiger-Tribe Hunter (pack tactics), Oracle of
  Dust (a card an opponent owns from exile as a cost), Haphazard Bombardment (aim counters), Bladecoil Serpent.
  Then up from about 21,900 (rounds B8 and B35 took the easier ones; these are left): Wall of Shadows, Fickle Efreet,
  Bill Ferny, Enkira, Bullseye, Rayami, Library of Lat-Nam, Resolute Strike, Boom Scholar, Splitting the Powerstone,
  Storm the Citadel, Undergrowth, Time to Feed, Blessed Reincarnation, Hypnox, Hankyu, Foster, Gigapede, The Abyss,
  Boros Battleshaper, Aura Graft, Alex Wilder, Treva, Vivien's Invocation, Withering Wisps, Scrapbasket, Dralnu's
  Crusade.
  Then up from about 19,600 (round B9 took the easier ones up to about 17,100; these are left, besides its skips):
  Sacred Ground, Outlaw Stitcher, Spider-Woman (tapped "for as long as you control ~"), Nivix, Mana Cache (any player,
  before the end step), Warchanter Skald, Colfenor's Plans, Deus of Calamity (6 or more damage to an opponent), Pentarch
  Paladin, Dragon's Disciple, Dream Salvage, Misinformation, Obscura Interceptor, Rewrite History, Wight, Frenzy Sliver,
  Mondo Gecko, Liliana's Indignation, Nissa's Chosen, Cloaked Cadet, Favored Hoplite, Scouting Trek, Tokka &
  Rahzar, Serene Master, Shifting Sky, Ruin Processor, Enslaved Horror, Lo and Li, Chisei,
  Withercrown, Throne of Makindi, Stormwild Capridor, Sentinel's Mark, Mindlock Orb, Murasa Sproutling,
  Lamplight Phoenix, Awesome Presence, Spoils of Evil, and in the 18,000s Kav Landseeker,
  Gomazoa, Mine Worker, Woolly Razorback, Information Dealer, Fractalize, Loxodon Lifechanter,
  Incremental Growth, Mind Bomb, Tragic Lesson and Volatile Rig.
  Then up from about 17,100 (round B10 took the easier ones up to about 15,000; about 490 are still unsupported
  there, its skips included, mostly multi-line cards and new mechanics): Mirror Match, Trickster's Talisman,
  Revenge of the Hunted, Reweave, Kheru Mind-Eater, Day of the Dragons, Sparring Dummy, Bloodbond
  March, Skeletal Swarming, Spinal Embrace, Song of Inspiration, Countersculpt, Order of Succession, Spelljack, All
  Suns' Dawn, Psychotic Episode, False Cure, Midnight Oil, The Rack, Xander's Pact, Debt of Loyalty, Fiery Encore,
  Devouring Greed, Savage Swipe, Infernal Tutor, Sadistic Sacrament, Kalitas, Heroic Return, Punishing Fire,
  Drain Power, Purity, Cloudkill, Magus of the Abyss, Cuombajj Witches, Volcano Hellion, Bridge from
  Below, Demonfire, Drain Life, Desolation, War Tax, Blood Clock, Urza's Sylex,
  Hollow One, Diabolic Servitude, Murktide Regent, Shared Fate, Pelt Collector, Infernal Genesis, Soul Exchange.
  Then up from about 15,100 to 13,200 (round B11 took the easier ones; about 470 are still unsupported there, its skips
  included): Sandman's Quicksand (mayhem), Aeon Engine, Workshop Elders, Turtle Van, Haunting Imitation, The Fugitive
  Doctor, Shifting Shadow, Abuelo's Awakening, Prince of Thralls, Eriette, Gastal Thrillroller, Manifold Insights, Take
  Out the Trash, Glorfindel, Renegade Krasis, Discerning Taste, Fortune's Favor, Curse of Inertia, Trial of Agony,
  Dreamshaper Shaman, Nefarious Lich, Cavernous Maw, Triarch Stalker, Fishing Pole, Chandra's Phoenix, Infernal
  Vessel, Regna's Sanction, Nullstone Gargoyle, Faith's Shield, Kathril, Lochmere Serpent, Words of Wilding,
  Grimdancer, Breath of the Sleepless, Jump Scare, Feral Encounter, Majestic Myriarch, Gimli, Break the Spell,
  Midnight Arsonist; then on up from 13,200.

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
- Blocking: "can't block creatures with power equal to or greater than the enchanted creature's toughness" (Ironclaw
  Curse), "unless you pay" (Hipparion), affected groups like "creatures your opponents control without flying or reach"
  (Sidar Kondo); lures with a filter (Talruum Piper's fliers) or a condition (Seton's Desire).
- Untapping during other players' untap steps with color pairs ("green and/or blue", Murkfiend Liege), a condition
  (Quest for Renewal) or granted to a land (Urban Burgeoning).
- Top or bottom of a library for spells and graveyard cards (Aether Gust, Endless Detour) and for several
  objects at once (Aetherspouts).
- "Whenever a creature is dealt damage" (Death Pits of Rath, Shriveling Rot), "becomes tapped or is dealt damage"
  (Cryoshatter). Old-Growth Troll and Harold and Bob (they return as Auras). Mayhem without a cost (a land, CR
  702.187c). "You recruit" after a cast trigger (The Queen of Dale), "if that spell's mana value was 2 or less, recruit".
- Mana: "add N mana in any combination of colors" from a spell or trigger; mana that stays ("until end of turn, you don't lose this mana");
  Rite of Flame's count. Bots cast rituals only when the mana lets them cast a card they couldn't otherwise.
- Other "cast this spell only ..." restrictions (only "if you've cast another spell this turn" is supported).
- Land types (CR 305.7): copy effects of lands under a land-type effect; Winter Orb ("players can't untap more than one land").
- Granted flashback is only "until end of turn" with the card's mana cost (Snapcaster Mage, Past in Flames); a
  static grant (Lier, Disciple of the Drowned) is not modeled.

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
