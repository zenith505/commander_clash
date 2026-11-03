# Roadmap

29,563 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Most played (EDHREC rank): top
1,000: 992 of 992 (100%), top 2,000: 1,989 of 1,989 (100%), top 5,000: 4,955 of 4,988 (99%), top 10,000: 9,491 of
9,979 (95%).

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
   Deeproot Pilgrimage (done in round 265); Syr Vondam, Sunstar Exemplar ("when ~ dies or is put into exile while its power is 4 or greater": its
   last known power on a leaves trigger of its own); Tasha, the Witch Queen (page counters, "a spell you don't own"); Mirrormind Crown and Moonlit
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
   Toralf, God of Fury // Toralf's Hammer (done in round 266). Out after round 162, each with a
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
   Nahiri's Resolve (done in round 266),
   Omo, Queen of Vesuva (done in round 265), Shelob, Child of Ungoliant
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
   (named tokens plus entering under an opponent's control), Wurmquake (corrupted, then "another one of those tokens"). Out after round 166:
   The Everflowing Well (a permanent becomes a copy of a spell), Summon: Esper Valigarmanda (cast a card exiled with ~
   with mana of any type), Zurzoth, Chaos Rider (done in round 266), Ashling, Rekindled (mana spendable only on spells with mana value 4 or greater), Gideon's Sacrifice (all
   damage redirected to one permanent), Expand the Sphere (proliferate "the difference" times), Kellan, the Kid ("from
   anywhere other than your hand"), Everlasting Torment (all damage as
   though it had wither), Kotis, the Fangkeeper (cast any number of the exiled spells), Vial Smasher the Fierce (an
   opponent at random, then that player or their planeswalker), Ragost, Deft Gastronaut (artifacts become Foods with a
   granted ability), Observed Stasis ("remove enchanted creature from combat"), Eshki, Temur's Roar ("that spell's
   power"), Mariposa Military Base ("you may have ~ enter tapped. If you do, ...").
   Out after round 167: Dinosaurs on a Spaceship and Deep-Sea Kraken (abilities that work while the card is exiled,
   triggered by a time counter coming off or by "if ~ is suspended"; the many ways counters are removed don't send such
   events yet), The Infamous Cruelclaw ("cast that card by discarding a card rather than paying its mana cost", a new
   alternative cost with its own prompt and bot), Greymond, Avacyn's
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
   ("spend only black mana on X": a spend rule for part of a cost). Round 168 went down the list to Glen Elendra Guardian (rank 5,741), skipping over the cards still listed by
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
   Out after round 170: Scorched Ruins and Lotus
   Vale (sacrifice two untapped lands as they enter), Hooded Blightfang (its second ability needs a "deals damage to a
   planeswalker" trigger; the first parses now), Cosmic Rebirth ("if you don't put it onto the battlefield" after a may), Bane's Contingency ("if that
   spell targets a commander you control ... instead"), Killer Service (pay mana and sacrifice as one "may" cost),
   Sapling of Colfenor (gain toughness and lose power from the revealed card). Round 170 went down the list to Cloud,
   Planet's Champion (rank 7,020), skipping over the cards still listed by `npm run popular`.
   Out after round 171, each needing a piece of its own: Averna, the Chaos Bloom (a land among the cards cascade exiles), Anax, Hardened
   in the Forge ("if the creature had power 4 or greater, create two ... instead"), Armory Automaton
   ("attach any number of target Equipment"),
   Chandra, Spark Hunter (+2: "sacrifice an artifact or discard a card. If you do"), Phyrexian Unlife and Lich's Tomb
   and Transcendence (life at 0 or less with damage as infect, a sacrifice per life lost, life gained per life lost),
   Cult
   Conscript ("a non-Skeleton creature died this turn": the deaths this turn keep no creature types), Mandate of Peace ("end the combat phase"), Spectra Ward ("this effect
   doesn't remove Auras", done in round B71), Chain Assassination ("if another creature died this turn"), Knight of New Alara (+1/+1 for
   each of its colors), Benefactor's Draught ("whenever a creature an opponent controls blocks" for the turn), Blood for
   Bones (a battlefield return then "another" to the hand), Urdnan, Dromoka Warrior (double strike
   "if that creature has two or more +1/+1 counters ... instead"), Admiral Brass, Unsinkable (a Pirate returned with
   base power and toughness 4/4). Round 171 went down the list to Hunter's Blowgun (rank
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
   Reverberation (a delayed copy of the next instant, sorcery or loyalty ability), Scuttlemutt ("the color or colors of your choice" needs a multi-color
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
   Osseous Sticktwister (a punisher read back with "didn't"), Craig
   Boone, Novac Guard (a reflexive damage trigger with "unless that creature's controller"), Spelltwine (casting copies
   of exiled cards), Ultimate Magic: Meteor ("if ~ was cast from exile" with a choice for each opponent), Spectral
   Searchlight (another player adds the mana), Rat King, Verminister ("all other cards with the same name"),
   Valentin, Dean of the Vein (a reflexive trigger from a replacement), Spider-Verse ("from anywhere other than your
   hand"), Captain America, First Avenger (unattaching an Equipment as a cost), Desert Warfare, Soulfire Eruption,
   Círdan the Shipwright (secret council for players), Dragonlord
   Kolaghan, Back for Seconds (bargain's "instead"), Sanctuary Warden (removing a counter from a chosen permanent as a
   cost), Kamiz, Obscura Oculus, Commander Liara Portyr, Bre of Clan Stoutarm, Lich's Mastery, Thunderwave,
   Contamination, Amzu, Swarm's Hunger, Ravenous Rotbelly, Luxurious Locomotive and Subterranean Schooner ("crewed it"), Gwen Stacy ("for as long as you control ~"),
   Relic Amulet ("that much"), Hankyu (a granted ability with its own counters), Topography Tracker (an explore
   replacement). Round 174 went down the list from Myojin of Cryptic Dreams to Detention Sphere (rank 8,455), then took
   the easy cards from there to about rank 8,880 (Risk Factor, What Must Be Done, Necklace of Girion, Savor the
   Moment, Uglúk, Midnight Tilling, Tax Collector, Over the Edge), plus Jadelight Ranger and Defossilize ("explores,
   then it explores again"); `npm run popular` from Detention Sphere on is still to go through.
   Out after round 175: Detention Sphere (exiles every permanent with the same name, and returns them all: one exile
   linked to several cards), Tangle Wire (the upkeep player taps one permanent of their choice for each fade counter),
   Steward of the Harvest (gaining the activated abilities of exiled land cards), Agent's Toolkit (moving one counter of a chosen kind), Heroes in a Half Shell ("one or more
   ... deal combat damage" with "each of those creatures"), Ran and Shaw ("if you cast them and" a graveyard count),
   Unstable Glyphbridge (a creature chosen for each player, then destroy the rest), From the Catacombs (a corpse counter, the initiative and an exile
   replacement together), Loki, God of Mischief ("becomes the target of an ability you control"), Katsumasa, the
   Animator ("if it's not a Vehicle"), Slagstone Refinery (put into a graveyard or exile from the battlefield, one
   trigger), Inalla, Archmage Ritualist (an eminence copy with haste, exiled at end step), Threats Undetected (four
   creature cards with different powers, an opponent chooses two), Leader, Super-Genius (a connive replacement), This
   Is How It Ends (villainous choice after a shuffle), Azor's Gateway (counting mana values among cards exiled with
   it), Tamiyo, Collector of Tales, Anchor to Reality (the sacrificed permanent's mana value after a search), Detective's
   Phoenix (bestow with collect evidence, cast from the graveyard), Visions of Ruin (flashback cheaper by a
   commander's mana value), Strata Scythe (imprint a land from the library), Printlifter Ooze (turned face up), Adrestia ("if an Assassin crewed it"),
   Sorcerous Squall (casting from an opponent's graveyard), Narset, Enlightened Master (free noncreature casts from
   among exiled cards), Azra Oddsmaker ("choose a creature" with a this-turn trigger), Capricopian (reselecting the
   attacked player, activated by that player), Aggressive Mining ("you can't play
   lands"), Hunting Wilds (Forests put onto the battlefield this way become
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
   Out after round 176: Extract Brain (an opponent chooses X cards from their hand for you to look at), Divergent Transformations and Chaos Mutation (each player's replacement
   in APNAP order), Black Panther, Wakandan King ("move all +1/+1 counters ... if one or more are moved this way, that
   much"), Grell Philosopher (Horrors gain an opponent's artifact's activated abilities), Pulmonic Sliver (a granted
   replacement), Etrata, Deadly Fugitive (a granted turn-face-up ability and cloak), The Creation of Avacyn (turning
   the exiled card face up), Pawpatch Recruit ("target creature other than that
   creature" needs the trigger's subject at target choice), Jhoira's Timebug and Greater Gargadon (suspended cards),
   Huntmaster of the Fells (two targets, one about the other's controller), Archelos, Lagoon Mystic (enters tapped or
   untapped by its own state), Venerable Warsinger (a target's X from the trigger's damage, unknown at targeting),
   Rushed Rebirth (a this-turn dies trigger with "lesser mana value" than that creature), Omarthis (manifest a counted number), Pull from Eternity (no targets in
   exile yet), Wall of Shards (cumulative upkeep "an opponent gains 1 life"), Rampaging War Mammoth (cycling {X}), Pizza Face (an optional target that becomes a
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
   Darksteel Angel (-1/-1 counters can't be put), Hammerheim (landwalk). Round 177
   went down from rank 9,240 to about rank 10,060 (Frost Titan, Seasoned Pyromancer, Devil's Play, Mind Funeral,
   Custodi Lich, Resolute Archangel, Jadelight Spelunker, Smaug, Tatyova, Gaddock Teeg, Aether Storm, Taigam, Lord of
   the Pit, Biorhythm, Flux, Awaken the Erstwhile, Martha Jones, Phoenix Fleet Airship, Bloodspore Thrinax, Yorvo,
   Prismari Pianist, Baru, Sokka, Arcbound Tracker, Gold Rush, Tainted Treats and others), taking the easy ones.
   Out after round 178: Giott, Colossal Rattlewurm, Dregscape Sliver, Foe-Razer Regent, Mathas, Ozox and Arcbound
   Javelineer (their other lines), Yosei, the Morning Star (targets limited by the other target, a player), Zameck Guildmage ("this turn" extra counters as creatures enter), Cunning
   Nightbonder (spells "cast", copies left out), Flesh Reaver (damage to several recipients at once), Quest for the
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
   Sequence, The Seventh Doctor, Lucy MacLean, Treacherous Greed ("a creature that dealt damage this
   turn"), Foggy Swamp Visions, Gate to the Afterlife (done in round B71), Galloping
   Lizrog, Dimir Machinations (exiling some of target player's top cards), Read the Runes, Liege of the Tangle, Sunder
   the Gateway (transform an Incubator you control), Myriad Construct, Zaffai, Thunder Conductor (an opponent chosen at
   random), All-Seeing Arbiter, Life's Finale (an opponent's library into their graveyard), Aerith Rescue Mission (a
   stun counter on one of them), Stunning Reversal, Manabond, Glowcap Lantern (granting "look at
   the top card of your library any time"), Jinxed Choker, Eligeth (scry replaced by draw), The Astonishing Ant-Man ("remove any number of
   counters" as a cost), Power Surge (untapped lands at the start of the turn), Jace, Cunning Castaway, Curse of
   Vengeance, Shaile ("entered under your control this turn"). Round 180
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
   Vitu-Ghazi, Quiet Speculation, Breaking of the Fellowship, Stoic Farmer, See the Unwritten, Razorlash
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
   Unites the Elves, Exquisite Archangel, Kellan, Planar
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
   Trail of Mystery ("whenever a permanent you control is turned face up"), Sarkhan
   the Masterless (each Dragon deals damage to the attacker), Ephara, God of the Polis (another creature entered under
   your control last turn), Mindblade Render (combat damage dealt by a Warrior), Dreadhound (a creature card put into a graveyard from a library), Indoraptor (bloodthirst
   X).
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
   Out after round 185 (looked at, not done): Font of
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
   Out after round 186 (looked at, not done): Barrow-Blade ("that creature loses all abilities" for a blocker or
   blocked creature), Ironsoul Enforcer ("~ or a commander you control attacks alone"), Koll, the Forgemaster ("if it was enchanted or equipped" as it died), Sorceress's
   Schemes ("an exiled card with flashback you own" as a target), Archon of Coronation (damage that doesn't cause life loss).
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
   (no "saddled" condition), Jared Carthalion, Garland, Royal Kidnapper, Lavabrink Venturer, Earthshape, Sigarda's Splendor ("note your life total"),
   Ochre Jelly, Green Sun's Twilight, Industrial Advancement, Froghemoth.
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
   Mage ("draw a card and reveal it", now in Lane B's round B19, to reuse), Faerie Fencing, Flame
   Discharge, Steer Clear ("if you controlled a ... as you cast this spell"), Depth Defiler, Pyrrhic Strike and Surge
   of Acclaim (spells with "choose both instead": only triggers do it so far), Symmetry Matrix, Mass
   Diminish, Display of Power, Jason Bright, Blood for Bones, Quakebringer,
   Lorthos, Zidane, Discerning Financier, Eight-and-a-Half-Tails.
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
   Uneaten Feast, Cait Sith, Scouring Swarm, Brigid's back face, Bring to
   Light (colors of mana spent), Fractured Powerstone (planar die), The Lost and the Damned, Oft-Nabbed Goat (only your
   opponents may activate, and control changes), Radiant Lotus, Brotherhood Headquarters, Maralen, Abstruse
   Appropriation, Ixhel, Cybership, Intrepid Paleontologist, Ravenloft Adventurer, Kagha, Obeka, Tale of
   Katara and Toph, Ramses, Shuri, Wall of Stolen Identity, Scion of the Ur-Dragon, Hourglass of the Lost, Kaya the
   Inexorable, Summon: Kujata, Soul Immolation, Ruxa, Omenpath Journey, Havengul Lich, Out of Time, Breath of
   Fury, Firkraag, Tam, Ivy, Disorienting Choice, Endless Sands, Tyvar the Bellicose, Sidisi, Pir's Whim, Eruth,
   Command the Dreadhorde.
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
   Out after round 192 (looked at, not done): Red Sun's Twilight (copies of the destroyed artifacts),
   Oath of Nissa, Sigurd, Dog Umbra, Call for Aid, Narset
   of the Ancient Way, Razorfield Ripper (reconfigure cost), Silverquill the Disputant (granted casualty), Lorehold the Historian (granted
   miracle), Coram, Brimaz, Mindleech Mass, Requiem Monolith, Behemoth of
   Vault 0, Abigale (loses all abilities, keyword counters), Once Upon a Time, Tasigur, Hazezon, Corrupted
   Shapeshifter, Balor (its modes), Unbreathing Horde ("for each other Zombie you control and each Zombie card in your
   graveyard"), Undead Alchemist, Auntie Ool (done in round 266),
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
   Historian's Boon ("the final chapter ability of a Saga you control triggers").
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
   Out after round 196 (looked at, not done): Proteus Staff ("the rest on the bottom in any order"),
   Sidisi, Regent of the Mire (done in round 266), Unidentified
   Hovership ("the exiled card's owner manifests dread"), Geth's Summons, Sphinx of Foresight (opening-hand reveal),
   Eruth, Tranquil Frillback, Yusri, Blitzball Stadium, Underdark Rift,
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
   (done in round 266). Smaller gaps: bots blight only a creature that
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
   Caustic Bronco (no "saddled" condition on a trigger's life loss), Sigarda's Splendor ("note your life total"), Back for Seconds (bargained: one of the
   returned cards onto the battlefield instead), Phyrexian Soulgorger (cumulative upkeep that sacrifices creatures), Mariposa Military Base
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
   Out after round 200 (looked at, not done): Enchanter's Bane (a
   punisher whose option sacrifices the target), You Cannot Pass! (no record of which creatures blocked or were blocked by a legendary creature),
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
   Assassin Lord (done in round 265), Kros, Defense Contractor (no record of who put
   counters on a creature), Glorious Purpose (the sixth
   plan counter), Loot Dispute (attacking the player who has the initiative), Rhys, the Evermore (remove any number of
   counters), Bladegriff Prototype (a target the damaged player chooses), Zidane, Tantalus Thief ("an
   opponent gains control of a permanent from you"), Tameshi, Reality Architect (noncreature permanents returned to
   hand), Obeka, Splitter of Seconds (done in round 265).
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
   chapters), Overgrown Zealot (mana only to turn permanents face up), Yuna's Decision, Admiral Beckett Brass (done in round
   266), Fatespinner (skipping a chosen step or phase), Pramikon, Sky Rampart (attack only the
   nearest opponent), Bargaining Table and Elite Arcanist (an X the text sets: an opponent's hand, a copy to cast),
   Bioshift, Public Enemy, Bladegraft Aspirant, Archon of Valor's Reach.
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
   Round 205 went on from the top: "if it's the first time that creature has become tapped this turn" (CR 603.4: Captain
   America, Living Legend), "an opponent attacks one or more planeswalkers you control" (Mila, Crafty Companion) and Lukka,
   Wayward Bonder ("draw two cards instead", "Exile it at the beginning of your next upkeep"), "whenever you copy an
   instant spell" (CR 707.10: Kalamax, the Stormsire), "two cards that share all their card types" (Demonic Covenant),
   "that player exiles the top card of their library" played from exile (CR 607.2a: Nightveil Specter), "Return this
   card and target land card" (Sandman, Shifting Scoundrel), "that artifact enters tapped" (Edgar, Master Machinist), "if
   its power was different from its base power" as it last existed (CR 608.2h: Jason Bright, Glowing Prophet), "a nonland
   card of an opponent's choice" (Tasigur, the Golden Fang), "~ or a legendary creature" and "sacrifice X Foods"
   (Campsite Cuisine), "If the sacrificed permanent was a Treasure / Vehicle" (Evereth, Viceroy of Plunder, Hellish
   Sideswipe), "up to eight target permanents" (Lorthos, the Tidemaker), "Desert lands from your graveyard" (Hazezon,
   Shaper of Sand), "attacking modified creatures" (Iron Man, Armored Avenger), "any number of legendary and/or enchantment
   cards" (Nashi, Searcher in the Dark), "Scouts, Pirates, and/or Rogues" and "You may cast it. If you don't" (Vaan, Street
   Thief, Boss Uramon, Mordor Trebuchet), granted renown and "a renowned creature" (CR 702.112: Aragorn, Hornburg Hero),
   "creatures you control with base power 0 ... equal to the damage dealt" (Primo, the Unbounded). Fixed: Fire Navy
   Trebuchet's token got "Ballistic Boulder that's tapped and attacking" as its name and entered untapped. No new prompts.
   +21, 20 of them legal (27,472 of 31,936 with rounds 202 to 204 and Lane B rounds B27 to B34).
   Out after round 205 (looked at, not done): Brimaz, Blight of Oreskos (which spells it means), Osgir, the Reconstructor
   (an X exile cost and copies of that card), Eivor, The Twelfth Doctor (granting demonstrate), Sigurd, Jarl of Ravensthorpe ("whenever you put a
   lore counter on a Saga"), Ruxa, Patient Professor ("creatures with no abilities"), The Ruinous Powers ("When you cast
   a spell this way"), Curse of Hospitality ("creatures attacking enchanted player").
   Round 206 went on from the top: "the next spell you cast this turn costs {1} less to cast" (Hardened Berserker,
   Peerless Samurai) and "{X} less, where X is ... as this ability resolves" (Maelstrom Muse, Kaza, Roil Chaser), one
   reduction used up by the next spell of that kind; "for each kind of counter on target permanent or player, give that
   permanent or player another counter of that kind" (Maulfist Revolutionary, Powerful Broker, Skyship Plunderer);
   "activate an ability of a card in your graveyard" (Neerdiv, Devious Diver); "a spell other than the first spell they
   cast each turn or copies a spell" (Curse of Shaken Faith, Ichneumon Druid's "other than the first instant spell");
   "tap enchanted creature and remove all counters from it" (Enchanted River's Grasp); "until your next turn, creatures
   target player controls have base power and toughness 1/1" (Mass Diminish); "until your next turn, creatures can't
   attack you" (Chronomantic Escape); "as ~ enters, it becomes your choice of a 3/3 creature, ..." as part of its
   copiable values (CR 707.2: Primal Clay, Primal Plasma, Corrupted Shapeshifter), a new prompt with a browser test;
   "you may cast target artifact / enchantment card from your graveyard this turn" as a trigger (Heiko and Norika
   Yamazaki); "switch the power and toughness of each of up to two / any number of target creatures" (Invert // Invent
   with "an instant card and/or a sorcery card", Inversion Behemoth); "each creature you control that didn't attack or
   enter this turn" (The Fifth Doctor). +21 (27,521 of 31,936 with round 205 and Lane B round B35).
   Out after round 206 (looked at, not done): Havengul Laboratory (its back face's "the creature put onto the
   battlefield with ~"), Briarbridge Patrol ("deals damage to one or more creatures"), Mutated Cultist ("remove all
   counters from target permanent or opponent"), Elminster ("the number of cards looked at while scrying"), Sivitri, Dragon Master (an attack tax paid in life), Obsidian Charmaw ("lands that could produce
   {C}"), Dramatist's Puppet and Quarry Hauler (put or remove a counter of each kind, a choice per kind), Aquamorph
   Entity (its "is turned face up" path).
   Round 207 went on from the top: "each creature card in your graveyard has unearth {2}{B}" and the same for artifact
   cards or "that's a Cleric, Rogue, Warrior, and/or Wizard" (Sedris, the Traitor King, Mishra, Tamer of Mak Fawa, Solemn
   Doomguide) and "each outlaw creature card in your graveyard has encore {X}, where X is its mana value" (Graywater's
   Fixer), abilities granted to cards in a graveyard while the permanent is on the battlefield; "ward—discard a card at
   random" (Alpharael, Stonechosen) and "ward—get five poison counters" (The Serpent Society), with a browser test of
   both prompts; "return X cards at random from your graveyard to your hand" (Reap the Past); "if it was a token, draw
   a card" (Sunpearl Kirin); "it loses all abilities for as long as ~ remains on the battlefield" (The Wondrous Wasp);
   "creatures enchanted player controls enter tapped" (Radiant Grace // Radiant Restraints); "choose a creature or
   planeswalker, then destroy all other creatures and planeswalkers" (Selfless Glyphweaver // Deadly Vanity); "you may
   mill three cards", which can't be chosen with fewer than three in the library (CR 701.17b), "then return up to one
   creature card and up to one land card" (Druidic Ritual); "target player and each creature and planeswalker they
   control" (Chandra, Bold Pyromancer); "populate. The token enters tapped and attacking", attacking the player you
   choose (Ghired, Conclave Exile); "you may pay that much life. If you do, draw that many cards" (Niv-Mizzet, Ghost
   Counsel); "unless any player pays {2}, search your library" (Rhystic Tutor); "target artifact, enchantment, or
   legendary card from your graveyard" (Crystal Dragon // Rob the Hoard); "whenever a creature with skulk deals combat
   damage to one of your opponents" (The Master, Mesmerist); "if this spell's sneak cost was paid, they enter tapped and
   attacking" (The Last Ronin's Technique); "add one mana of that color for each different power among creatures you
   control" (Selvala, Eager Trailblazer, Loot, the Nexus). +21 (27,596 of 31,936 with round 206 and Lane B rounds B35 to B37).
   Out after round 207 (looked at, not done): Varolz, the Scar-Striped and Young Deathclaws (scavenge for a */*
   creature card needs its characteristic-defining power in the graveyard, and the layers only work it out on the
   battlefield and in exile).
   Round 208 went on from the top: "draw four cards. When you do, ..." only if all four were drawn (The Royal Scions);
   "you may cast it from your graveyard as an Adventure until the end of your next turn" (Mosswood Dreadknight,
   Hildibrand Manderville), a permission for the Adventure face only, with a browser test; "up to one other target creature loses all
   abilities", then keyword counters on it (Abigale, Eloquent First-Year); "equip {2} or {B}", two equip abilities
   (Transmogrant's Crown, CR 702.6d); "if it wasn't an Aura, create a token that's a copy of it, except it's a 1/1 white
   Spirit creature with flying in addition to its other types" (Kaya, Intangible Slayer; the copy's "with flying" no
   longer becomes subtypes); "it becomes a legendary Spider Hero in addition to its other types" (Origin of
   Spider-Man); "as long as ~ has a shield counter on him, you and other Heroes you control have hexproof" (Captain
   America, Super-Soldier); "becomes saddled until end of turn" (Kolodin, Triumph Caster, Guidelight Matrix); "a creature
   card at random from target opponent's graveyard" (Tariel, Reckoner of Souls); "return ~ and up to one other target
   creature card" (Slimefoot and Squee); "can't attack or block unless you have max speed" (Hazoret, Godseeker);
   bloodthirst X (Indoraptor, Petrified Wood-Kin) and a spell that "gains bloodthirst 3" (Bloodlord of Vaasgoth);
   "manifest a number of cards equal to the number of counters on it" (Omarthis, Ghostfire Initiate); "for each
   permanent sacrificed this turn", by any player (The Balrog, Durin's Bane); "the first spell you cast with {X} in its
   mana cost each turn costs {1} less for each +1/+1 counter" (Zimone, Infinite Analyst); "where X is equipped
   creature's power" and "put all instant and sorcery cards from among them into your hand" (Glamdring, Foe-hammer //
   Gleam of Death, Cantankerous Keepers); "if no life is lost this way, convert ~" and "choose flying or indestructible
   at random" (Blitzwing). +23 (27,642 of 31,936 with round 207 and Lane B round B38).
   Out after round 208 (looked at, not done): Michelangelo, Improviser ("a creature card and/or a land card from your
   hand" onto the battlefield at once needs a picker for one of each); Silverquill, the Disputant and Lorehold, the
   Historian (casualty and miracle granted to other spells and cards: both are read from the card's own text only);
   Dyadrine, Synthesis Amalgam ("remove a +1/+1 counter from each of two creatures you control. If you do").
   Round 209 went on from the top: "exile the top card ... When you exile a (nonland) card this way, ... where X is that
   card's mana value", a reflexive trigger (Cait Sith, Fortune Teller, Hidetsugu, Devouring Chaos); "reveal until a Shrine
   card. You may put that card onto the battlefield. Then shuffle" (Hei Bai, Forest Guardian); "you may draw X cards ...
   If you do, you lose X life" (Bebop, Skull & Crossbones); "... if you've completed a dungeon" and "... if you're the
   monarch. Otherwise, ..." read as intervening conditions as it resolves (Barrowin of Clan Undurr, Regal Sliver); "exile
   those tokens when ~ leaves the battlefield" (Mysterio, Master of Illusion); "reveal until a nonland card with mana
   value 3 or less. You may cast that card without paying its mana cost" (Treasure Keeper); "its controller amasses
   Goblins X" (Azog, Moria's Ruin); "you may pay {1}{W} any number of times. When you pay this cost one or more times,
   ... that many", a new "how many times" prompt with a browser test (Intrepid, Primal, Spectral and Tainted Adversary);
   "when you do" after putting counters on a target (Dimension X Pizzasaur); "the greatest mana value among instant and
   sorcery spells you've cast this turn" (Rootha, Mastering the Moment); "costs {1} less if it has mutate" and its cast
   trigger (Pollywog Symbiote); "enchanted artifact's activated abilities cost {2} less" (Power Artifact); a named
   legendary token with two quoted abilities (Ozox, the Clattering King), and other tokens with two (Pursued Whale, Relic Robber);
   "sacrifice it. If you do, reveal until a creature card. Put that card onto the battlefield, then shuffle ... If that
   creature is a Demon, ..." (Aspiring Champion). +21 (27,692 of 31,936 with round 208 and Lane B rounds B38 and B39).
   Out after round 209 (looked at, not done): Bloodthirsty Adversary (cast copies of several cards from the graveyard:
   casting from among graveyard cards takes one target only); From Under the Floorboards, Avacyn's Judgment and Welcome
   to the Fold (madness {X}: X in an alternative cost from exile); Citizen's Crowbar (a granted ability that sacrifices
   the Aura's own source); Gluttonous Hellkite (counters for each creature sacrificed by its cast trigger); Insatiable
   Frugivore ("repeat this process" after an optional exile); Broodguard Elite (warp {X}); Mog, Moogle Warrior (what each
   player discarded decides two effects).
   Round 210 went on from the top: "spells you cast have delve" (Teval, Arbiter of Virtue); "you can't spend mana to cast
   this spell", paid only by convoke and delve (Hogaak, Arisen Necropolis); "the next spell you cast this turn has affinity
   for artifacts" (Saheeli, the Gifted); "deals combat damage to a player for the first time each turn" (Raphael, Tag Team
   Tough); "the greatest power among them" for the attacking artifact creatures (Aloy, Savior of Meridian); "you may
   remove all of them. If you do, ... the number of counters removed this way" (Sarulf, Realm Eater); "mills a card for
   each 1 damage ... If the player mills at least one creature card this way" (Anowon, the Ruin Thief); "if that artifact
   is put into a graveyard this way" (Tuktuk Scrapper); "each opponent sacrifices a permanent of their choice that shares
   a card type with it" (Martyr's Bond); "each opponent chooses a creature card in their graveyard. Put those cards onto
   the battlefield under your control" (Dredge the Mire); "until your next turn, prevent all damage target permanent would
   deal" and a can't-lose emblem that works only while you control a Gideon (Gideon of the Trials); "reveal the top card
   ... cast it free if its mana value is odd. If you don't cast it, draw a card" (Yennett, Cryptic Sovereign); "untap up to
   four target Forests" and "those lands become 4/4 Elemental creatures" after a search (Nissa, Worldwaker); "gain control
   of that creature for as long as it has a shield counter on it" (Shield Broker); "put an Aura card from your hand onto
   the battlefield attached to it" (Holy Avenger); "then you may attach an Equipment you control to ~", a one-Equipment
   picker with a browser test (Yuffie, Materia Hunter); devotion increased by one and "if you control a God, a Demigod, or
   a legendary enchantment" (Altar of the Pantheon); "that player or that planeswalker's controller discards seven cards,
   then sacrifices seven permanents" (Nicol Bolas, Planeswalker); "cast target instant or sorcery card with mana value 3 or
   less from your graveyard" as it resolves, paying for it (Chandra, Acolyte of Flame); "put five cards from your
   graveyard on top of your library in any order" (Stillness in Motion). +24 (27,766 of 31,936 with round 209 and Lane B rounds B39 to B41); the same text also covers Winter Soldier, Icy Assassin, Fendeep
   Summoner, In the Eye of Chaos and Afflicted Deserter // Werewolf Ransacker.
   Out after round 210 (looked at, not done): Eivor, Battle-Ready ("a Saga card and/or a land card from among them" needs
   a one-of-each picker); Puca's Mischief (a second target's mana value bound by the first one's, chosen as a set);
   Hand of Vecna ("equipped creature or a creature you control named Vecna" and a life-per-card equip cost); Grave Sifter
   (each player's own creature type); Overseer of Vault 76 ("remove three quest counters from among permanents you
   control"); Dragon's Approach (exiling four named cards as an optional cost); Signal the Clans (a random pick if the
   three names differ); Fblthp, the Lost (entered or cast from the library; "becomes the target of a spell");
   Dack Fayden ("gain control of those permanents" a spell targets); Ashiok, Nightmare Muse ("then that player exiles a
   card from their hand", cast face-up exiled cards).
   Round 211 went on from the top: "you may pay any amount of {E}" with "destroy each ... with mana value less than or
   equal to the amount of {E} paid this way" (Wrath of the Skies) and "counter that spell unless its controller pays {1}
   for each {E} paid this way" (Aether Spike; "Choose target spell" now targets spells only, not abilities); "you may pay
   one or more {E}. If you do, each creature you control with power equal to the amount ..." (Localized Destruction);
   "costs {1} less to cast for each {E} you've paid or lost this turn", energy paid or lost now counted per turn (Blaster
   Hulk); "you may get {E}{E}. If you don't, you may play that card this turn" (Synth Eradicator); "put all enchantment
   cards from among them into your hand" and "lock or unlock a door of target Room you control", a new lock-or-unlock
   choice with a browser test (Marina Vendrell, Keys to the House); "defending player reveals cards until they reveal a
   land card ... +1/+0 for each card revealed this way" (Trepanation Blade); "roll a d20 and add the number of creature
   cards put into your graveyard from the battlefield this turn" (Revivify); "for as long as ~ remains on the
   battlefield, gain control of that permanent, it loses all abilities, and it can't attack or block" (Opportunistic
   Dragon); "a creature spell that doesn't share a creature type with a creature you control or a creature card in your
   graveyard" (Volo, Guide to Monsters); "if that player had another land enter the battlefield under their control this
   turn" (Confounding Conundrum); "mill a card and choose an opponent at random" (Ursine Monstrosity); "you may discard
   one or more land cards. When you do, return up to that many ..." (Loamcrafter Faun); "If you put a card into your
   hand this way" (Sidequest: Catch a Fish); "exile a card from your graveyard at random. You may play the exiled card
   this turn" (Advanced Reconstruction); "starting with the next opponent in turn order, each opponent chooses a creature
   card in your graveyard that hasn't been chosen" (Rejoin the Fight); "if that spell is countered this way, exile it
   ..., then you may cast it without paying its mana cost" (Transcendent Dragon), "you may play it without paying its
   mana cost for as long as it remains exiled" (Spelljack, Kheru Spellsnatcher); "cast target instant or sorcery card
   from a graveyard, and mana of any type can be spent" (Quistis Trepe). +21 (27,813 of 31,936 with round 210 and Lane B rounds B40 to B42).
   Out after round 211 (looked at, not done): Tegwyll's Scouring (flash by tapping three flyers as an additional cost);
   The Kenriths' Royal Funeral (a cost cut counted from linked exiled cards); Suppression Ray ("choose up to that many
   creatures tapped this way"); Baba Lysaga, Night Witch ("sacrifice up to three permanents" as a cost, then card types
   among them); Dargo, the Shipwrecker (optional sacrifices as a cost that cut it); Curse of Misfortunes (a Curse not
   sharing a name with one attached to that player); Archmage Ascension (a "would draw" replacement by a search);
   Eumidian Wastewaker ("discard a card or sacrifice a permanent", then counting lands put into graveyards this way);
   Plasma Caster ("target creature that's blocking equipped creature"); Curie, Emergent Intelligence (base power and a
   copy with an extra ability); Spry and Mighty (the difference between two chosen creatures' powers); Eventide's Shadow
   (remove any number of counters from among permanents).
   Round 212 took fresh cards from ranks 5,600 to 13,300: "manifest dread, then put ... counters on that creature"
   (Underwater Tunnel // Slimy Aquarium, Moldering Gym // Weight Room, Experimental Lab) and "turn that creature face up
   or put a +1/+1 counter on it" (Staff Room); "each player with exactly 13 life loses the game" (Triskaidekaphobia);
   "enchanted by exactly one Aura ... base power and toughness 3/3" (Timber Paladin); "as long as ~'s power is even /
   odd, you may cast noncreature / creature spells as though they had flash" (Kianne); "if you would scry, draw that
   many cards instead" (Eligeth); "your opponents can't ... activate planeswalkers' loyalty abilities this turn" (Revel
   in Silence); "counter up to four target spells and/or abilities" (Katara's Reversal); "equip Knight {0}" granted (Syr
   Gwyn; a granted "Equip Knight" ability used to compile as nothing); Jaya Ballard's emblem; "sacrifices a creature
   unless they discard a card" (The Long Reach of Night) and "creature cards in defending player's graveyard"; "you may
   put a permanent card from among them onto the battlefield" (Mole Module); "Blitz—{2}{B}{B}, Pay 2 life" / "Discard a
   card" and casting from the graveyard with its blitz ability, with browser tests (Tenacious Underdog, Sabin);
   "Blood tokens / Clues / noncreature, non-Equipment artifacts you control are Equipment ... and equip {2}" (Arterial
   Alchemy, Armed with Proof, Dan Lewis) and "artifacts you control are Clues / Foods in addition to their other types"
   (Senator Peacock, Ragost, Gourmand's Talent); "{B}, Reveal this card from your hand" with prey counters, with a
   browser test (Tetzimoc); "you may exile it. You may play that card from exile this turn" (Norin); "each opponent's
   maximum hand size is equal to seven minus the number of those card types" (Winter, Misanthropic Guide). +24 (27,867
   of 31,936 with rounds 210, 211 and B40 to B43).
   Out after round 212 (looked at, not done): Sheltering Ancient (cumulative upkeep putting a counter on an opponent's
   creature); Power Sink ("tap all lands with mana abilities"); Zilortha (lethal damage by power everywhere); Ravenous
   Slime (a die replacement); Astral Drift and Paranormal Analyst ("whenever you manifest dread" and cycling triggers);
   Rowan, Scion of War; Aven Courier; Galactus. Eligeth with Kenessos: Kenessos's "scry one more" applies first (draws
   n+1), not the controller's choice of order (CR 616.1).
   Round 213 took fresh cards from ranks 11,900 to 13,500: "each opponent chooses a permanent they control that shares a
   card type with the sacrificed permanent" (Fatal Grudge; the sacrifice cost now remembers card types); "costs {1}{U}
   less to cast if it targets" with colored mana (Brush Off); "if an opponent has eight or more cards in their
   graveyard, instead counter that spell, then scry 2" (Anticognition); spell mastery's "also regenerate each other
   creature you control" (Dark Dabbling); "then repeat this process for instant cards with mana values 2 and 1"
   (Firemind's Foresight); "choose up to two" with "return those cards" bullets (Call Damage Control); "flashback costs
   you pay cost {2} less / your opponents pay cost {2} more" (Catalyst Stone); "activated abilities of creature cards in
   your graveyard cost {1} less" (Embalmer's Tools); granted mentor (Nyxborn Unicorn; Aegis of the Legion's first line
   too); "protection from creatures of the chosen type" (Riders of Gavony); "another artifact is put into your graveyard
   from the battlefield or an artifact card ... from anywhere other than the battlefield" (Ultron, Ultron's Auxiliary);
   "1 damage to each of up to one target creature, up to one target player, and/or up to one target planeswalker"
   (Volatile Arsonist); "look at the top card ... cast it without paying its mana cost if it's an instant or sorcery
   spell" (Galvanoth); "copy it" for Pegasus/Unicorn/Horse spells and "Pegasi" (Thurid); "when you cast this spell,
   create a token that's a copy of it, except it isn't legendary" (Osgood); "you may cast this card from your
   graveyard [if ...]. If you do, it enters with ... counter(s)" and "by paying {W}{U}{B}{R}{G} rather than paying its
   mana cost" (Undead Sprinter, Worldheart Phoenix, Hundred-Battle Veteran with "three or more different kinds of
   counters among creatures you control", Raffine's Guidance); "enters with two +1/+1 counters and a lifelink counter"
   (Dust Animus); "the number of opponents who control more lands than you" (Priest of the Blessed Graf); "three times
   this creature's power" (Rootwire Amalgam); "when the tenth +1/+1 counter is put on" (Shang-Chi); "~ and target Frog
   you control" (Tatsunari); "permanent cards with cycling abilities" (Herald of the Forgotten). +26 (27,893 of 31,936
   with rounds 211 and 212 and B40-B43).
   Out after round 213: Aegis of the Legion still needs "whenever equipped creature mentors a creature".
   Round 214 took fresh cards from ranks 11,000 to 14,200: "exile the top card of each player's library. You may play
   those cards" this turn or until the end of your next turn (Mezzio Mugger, Lidless Gaze); "exile that many cards from
   the top of your library. Until end of turn, you may cast spells from among those exiled cards" (Dream Pillager);
   "then exile that player's graveyard" for a card target (Nurgle's Conscription; Carrion Locust's "that player" too);
   "chooses a permanent they control at random and sacrifices it. If a nonland permanent is sacrificed this way, repeat
   this process" (Tyrant of Discord, new effect sacrificeRandom); "exile target ... from your graveyard. Copy it, then
   you may cast the copy" (Shiko); the plural "Mice" (Flowerfoot Swordmaster); "whenever you attack a player or
   planeswalker with one or more ...", once for each player and planeswalker attacked (Rigo); "put a +1/+1 counter on
   each of them" after "whenever you attack with one or more Insects" (Vrestin); "the next creature card you play this
   turn can be played as though it had flash" (Scout's Warning); "that player can't activate abilities that aren't mana
   abilities" this turn (Abeyance, new turn rule noActivations); "cards in your graveyard [and you own in exile] that are
   instant cards, sorcery cards, and/or have an Adventure" (Frantic Firebolt, Hearth Elemental, Candlekeep Inspiration,
   Sailors' Bane); creature-type-only card targets returned to the battlefield and "its mana value" of that card (Queen's
   Bay Paladin, Orah, Rot Hulk; Sister Hospitaller's life gain used its own mana value before); "target token you
   control not named ~" in a reflexive trigger (Dutiful Replicator); "you may remove a counter from her. When you do"
   (Leatherhead, Slumbering Walker); "choose a color, then that player reveals their hand and discards all cards of that
   color" (Crosis, the Purger); "you may have Allies you control gain lifelink ..., and you may put a +1/+1 counter"
   (Talus Paladin); "you may discard any number of land cards. Put that many +1/+1 counters on ~ and draw that many cards"
   (Nantuko Cultivator); "that permanent's controller or that player creates" (Acorn Catapult); "you may exile it.
   If you do, reveal cards ... until you reveal a creature card" (Gamekeeper); "until end of turn, whenever a creature
   [an opponent controls] is dealt damage, destroy it" (Green Dragon, Shriveling Rot). +29 (27,947 of 31,936 with
   rounds 211 to 213 and B40 to B44).
   Out after round 214: Scout's Warning doesn't yet let a creature card be suspended at instant speed (its rulings say
   it does).
   Round 215 took fresh cards from EDHREC rank 14,200 on: "Other Caves you control have "..."" (Forgotten Monument); "as
   long as enchanted permanent is a land, it has "..."" (Nature's Embrace); "protection from God creatures" (Sigrid,
   God-Favored); "destroy up to one other target creature. If that creature wasn't dealt damage this turn, its controller
   draws two cards" (Faller's Faithful); "you may return another target creature you control to its owner's hand. If you
   do, ..." (Niambi, Stockpiling Celebrant); "target creature you control and all Auras you control attached to it" and
   "destroy target creature and you lose life equal to its toughness" (Orzhov Charm); "another Villain and/or artifact
   you control enters" (HYDRA Assault Robot); "whenever you give a gift" (Jolly Gerbils, new effect gaveGift at the end of
   every gift, CR 702.174c); "the total power of the creatures sacrificed this way" (Reign of the Pit); "if that
   creature's power is 2 or less or if you control another Lizard, gain control of that creature until end of turn, untap
   it, and it gains haste" (Reptilian Recruiter); spend restrictions "an Elemental spell or a Chandra planeswalker spell"
   (Chandra's Embercat) and "an instant or sorcery spell or a kicked spell" (Volshe Tideturner); "when ~ dies, if it was
   enchanted/equipped" (Gunner Conscript) and "if it wasn't a Demon, return it ... with two +1/+1 counters on it"
   (Infernal Vessel); "if one or more cards were put into exile this turn" (Ennis, TurnLog.cardExiled); "If you didn't put
   a card into your hand this way, draw a card" (Adventure Awaits); "exile the top thirteen cards ..., then search your
   library for a card" (Demonic Bargain); "the number of permanents you sacrificed this turn" (Sawblade Skinripper,
   Pyre-Sledge Arsonist); "If it was an artifact, ..." after returning it (Rescue, Pepper Potts); "you may exile N cards
   from your graveyard. When you do, ..." (Kroxa and Kunoros, Young Necromancer, Kishla Trawlers); "target opponent mills
   five cards. You may cast an instant or sorcery spell from among them" (Jace's Mindseeker, castFromHand milled);
   "If you control a Nissa planeswalker, instead search ..." (Nissa's Triumph). +26 (28,001 of 31,936 with B45).
   Out after round 215 (looked at, not done): Trusty Boomerang (an ability granted to the equipped creature that returns
   the Equipment: granted abilities can't name their source yet); Curse of Chaos ("that attacking player may discard a
   card"); Bebop & Rocksteady ("sacrifice a permanent unless you discard a card" as a trigger); Sarevok ("if no permanents
   left the battlefield this turn"); Fight for the Throne (a delayed "when the creature an opponent controls dies this
   turn" with a monarch condition); Battlefield Thaumaturge (cost cut per creature targeted); Bucolic Ranch; Rosheen,
   Roaring Prophet; Aurification; Creeping Dread; Gavi, Nest Warden; Tezzeret, Agent of Bolas (−1 base 5/5); Jared
   Carthalion; Frodo, Determined Hero; Syr Carah; Shadow Urchin; Head Games; Seeker of Slaanesh; Drizzt Do'Urden;
   Soul-Shackled Zombie ("from a single graveyard ... if at least one creature card was exiled this way"); Ambitious
   Augmenter; Isareth the Awakener; Maeve, Insidious Singer. Next fresh candidates, looked at briefly or not at all: Renegade Bull ("up to one target" exile-and-copy),
   Duel for Dominance, Startled Awake, Borrowed Knowledge, Thought-Stalker Warlock, Embermouth Sentinel,
   Contagious Vorrac, Zaffai, The Eighth Doctor, Arcade Gannon, Mortarion, Wail of the Forgotten, Multiple Choice, Gor
   Muldrak.
   Round 216 took fresh cards from EDHREC rank 14,000 on: "costs {G} less to cast for each green creature you control"
   (Khalni Hydra, CompiledCard.costLessEachColored); "costs {3} more to cast if it targets a creature" (Vanish into
   Eternity); "{1} less ... if you control an artifact and {1} less ... if you control an enchantment" (Assassin's Ink);
   "for each spell your opponents have cast this turn" (Delightful Discovery); "If a permanent was returned this way"
   (Nurturing Pixie); "another target permanent you control and all Auras you control attached to it" (Essence
   Reliquary); "When you draw your third card in a turn" (Sneaky Snacker); "mill three cards for each time it was kicked"
   as it enters (Urborg Lhurgoyf, entersMillPerKick); "Whenever a player loses the game" and "a counter for each 1 life
   lost this way" (Blood Tyrant); "Whenever an opponent attacks a planeswalker you control with one or more creatures",
   once for each planeswalker attacked (Oath of Kaya); "Its controller gains control of ~" (Act of Authority); "When this
   ability resolves for the third time this turn" (Gimli, Mournful Avenger); "by sources of the color of your choice" to
   one target (Avacyn, Guardian Angel); "Whenever equipped creature attacks the player with the most life" (Seraphic
   Greatsword); "you may attach ~ to target creature" (Magitek Scythe); "If it's a Spacecraft, put N charge counters on
   it. If you do, remove them at the beginning of the next end step" (Systems Override); a Sculpture Treasure artifact
   creature token (Vraska, Soul of Stone); "If it's your turn ... Otherwise" (Stolen Vitality); "sacrifices it, then
   creates X 1/1 tokens" (Mercy Killing); "if there are three or more basic land types among lands you control" (Path to
   the Festival); "permanents you control that are creatures and/or Vehicles" (Collision Course); "enchanted creature is
   a Wolf or Werewolf" (Howl of the Hunt); "you may put a charge counter on ~. If you do" (Sphinx-Bone Wand); "draw cards
   equal to that creature's power and you lose life equal to that creature's toughness" (Greven, Predator Captain); "If a
   player is dealt damage this way, they discard a card" (Sonic Shrieker). +25 (28,026 of 31,936).
   Out after round 216 (looked at, not done): Thelon of Havenwood ("Exile a Fungus card from a graveyard" as a cost from
   any graveyard needs a cost picker); Wicked Slumber ("either of them" needs a new choice); Mercadia's Downfall (the
   defending player differs per attacker); Surestrike Trident (a granted ability that names its source); Tamiyo,
   Inquisitive Student; Demilich (casting from the graveyard by exiling four instants and sorceries). Next fresh
   candidates are still the ones listed after round 215.
   Round 217 took the fresh candidates listed after round 215: "If you didn't put a card into your hand this way,
   proliferate" (Contagious Vorrac); "Discard your hand, then draw cards equal to the number of cards discarded this way"
   (Borrowed Knowledge); "Each of your opponents discards" (Everything Pizza); "Put that card onto the battlefield tapped
   if you control a Dragon. Otherwise, put that card on top" (Embermouth Sentinel); "If they lost life this turn, they
   reveal their hand, you choose a nonland card" (Thought-Stalker Warlock, SpellCondition targetPlayerLostLife); "the
   chosen creature you control ... Then the chosen creatures fight" (Duel for Dominance); "you may pay {X} ... X can't be
   greater than the amount of life you lost this turn" (Mortarion, Daemon Primarch); "~ deals 10 damage to an opponent
   chosen at random" (Zaffai, Thunder Conductor); "You and permanents you control have protection from Salamanders" and
   "each player who controls the fewest creatures" (Gor Muldrak, CompiledCard.youProtectionFrom); "Descend 8 — If there
   are eight or more permanent cards in your graveyard as you cast this spell, choose one or more instead" (Wail of the
   Forgotten); "each player discards their hand, then returns up to three cards from their graveyard to their hand"
   (Ill-Gotten Gains, a new "return up to N cards to your hand" picker, e2e round217.spec.ts); "Mounts and/or Vehicles"
   (Lagorin, Soul of Alacria); "Whenever ~ or equipped creature deals combat damage to a player, you may sacrifice it"
   with "it" the creature that dealt the damage (Ogre-Head Helm); "If any of those results was 10 or higher" (Farideh,
   rollIn eventMax); "If that creature was cast for its warp cost, it also gains" (Full Bore, SpellCondition
   targetWarped); "the number of lands you control in excess of the number of lands target opponent controls" (Waking
   the Trolls); "choose one and ~ gets +1/+1 until end of turn" (Glorfindel, Dauntless Rescuer); "Equip costs you pay
   cost {1} less" (Auriok Steelshaper); "Put a +1/+1 counter on it" for a Vehicle that crewed (Voyager Glidecar); "up to
   one target" exile-and-copy (Renegade Bull); "Put ~ from your graveyard onto the battlefield transformed" (Startled
   Awake). +21 (28,104 of 31,936 with B46 and B47).
   Out after round 217 (looked at, not done): Barbed Wire (needs a "prevent the next damage dealt by a source"
   shield); Decoy Gambit (a per-target "unless its controller has you draw a card"); Multiple Choice; Laboratory Drudge
   (needs tracking of cards cast and abilities activated from graveyards); Kraven the Hunter (greatest power as it
   died); The Eighth Doctor; Arcade Gannon. Next fresh candidates, not looked at
   closely: Seize the Storm, Aberrant Mind Sorcerer, Key to the Side-Door, Prized Amalgam, Kathril, Aspect Warper,
   Super-Adaptoid, Zimone's Experiment, Bane, Lord of Darkness, Weftwalking, Last Laugh, Sanctuary Blade.
   Round 218 took those fresh candidates and more: "creatures you control gain flying until end of turn if a creature
   card in your graveyard has flying. The same is true for ..." (Bleeding Effect, addKeywords sharedAmongYours
   "graveyard"); "If that creature has haste and ~ doesn't, put a haste counter on ~. Do the same for ..."
   (Super-Adaptoid); a d20 table on a card target (Aberrant Mind Sorcerer); "You may reveal up to two creature and/or
   land cards from among them ... Put all land cards revealed this way onto the battlefield tapped" (Zimone's
   Experiment, dig landsOnto); "When no creatures are on the battlefield, sacrifice ~" and "a permanent other than ~"
   (Last Laugh); "The first spell each player casts during each of their turns may be cast without paying its mana
   cost" (Weftwalking, payZero eachPlayerFirst); "a creature card with equal or lesser toughness from your hand" (Bane,
   Lord of Darkness); "cards with flashback you own in exile" (Seize the Storm); "Whenever a creature enters, if it
   entered from your graveyard or you cast it from your graveyard, return this card from your graveyard" (Prized
   Amalgam, StaticCondition subjectFromYourGraveyard); "If you don't put it onto the battlefield, put it into your hand"
   (N'Yami-Class Mother Ship); "Once during each of your turns, you may cast an instant or sorcery spell from your hand
   without paying its mana cost" (Zaffai and the Tempests); "cloak two of them" (Hide in Plain Sight); "You may cast a
   ... spell from your graveyard with mana value less than or equal to that spell's mana value" without exiling it
   (Counterpoint, castFromHand yardNoExile); "They gain control of ~" after "target opponent" (Pumpkin Bombs); "For
   each player, choose friend or foe" (Pir's Whim, Virtus's Maneuver, Khorvath's Fury: eachChooses byYou, a new
   friend-or-foe prompt for each player, e2e round218.spec.ts); "Whenever a permanent you control transforms into a
   Phyrexian" (Norn's Inquisitor, trigger permanentTransformsInto, CR 701.27e). +18 (28,122 of 31,936 with Lane B rounds B46 and B47).
   Out after round 218 (looked at, not done): Kathril, Aspect Warper (a counter per keyword, onto any creature,
   including the hexproof-from variants per its rulings); Key to the Side-Door (a discard cost "with the same name as a
   legendary permanent you control"); Sivriss, Nightmare Speaker (a per-opponent loop binding "that player"); Sanctuary
   Blade (a color chosen each time it becomes attached); Eater of Virtue (keywords of the cards exiled with it); Life and
   Limb (Forests that are Saprolings and Saprolings that are Forests, a layer 4 dependency); Tombstone Stairwell (tokens
   "created with this enchantment" destroyed at each end step); Inferno of the Star Mounts ("when its power becomes 20
   this way"); Anzrag's Rampage (put a creature card from among the exiled ones onto the battlefield, return it at end
   step); Regna's Sanction and Zndrsplt's Judgment (friend or foe with "chooses one ..., then taps the rest" and "a
   token that's a copy of a creature they control"; Lane B's range); Swooping Pteranodon (a delayed trigger in which a
   target land deals the damage); Hellish Rebuke; Osteomancer Adept; Hostile Negotiations; Unexplained Absence.
   Round 219: the Will of the Planeswalkers paths (Path of the Enigma, Animist, Ghosthunter, Pyromancer, Schemer: a
   planeswalk-or-chaos vote, both no-ops outside Planechase, CR 701.31a, 311.7); "Players can't draw cards" (Maralen of
   the Mornsong, Mornsong Aria: draw() stops, CR 121); "Lethal damage dealt to creatures you control is determined by
   their power rather than their toughness" (Zilortha, cards.ts lethalLeft, CR 120.6, 704.5g); "skip their next X
   turns, where X is the number of coins that came up heads" (Ral Zarek, Guest Lecturer); "Any player may cast
   creature spells with mana value 3 or less without paying their mana costs and as though they had flash" (Aluren,
   payZero anyPlayer flash; the app now holds priority for it, e2e round219.spec.ts); "if that player controls Kain,
   ..." after giving it away (Kain, Traitorous Dragoon); "attacks an opponent with the most life among your opponents
   each combat if able" (Galactus, mustAttackMostLife, CR 508.1d); a choice of three counters as it enters and "put the
   same number of each kind of counter" (Denry Klin, e2e round219.spec.ts); "exile ... and put a hit counter on that
   card" and "loses the game if they own three or more exiled cards with hit counters" (Etrata). +14 (28,136 of
   31,936 with Lane B B46 and B47).
   Out after round 219 (looked at, not done): Omen Machine (a mandatory "casts it without paying its mana cost if
   able"); Rebbec, Architect of Ascension (protection from each mana value of artifacts you control); Nissa, Worldsoul
   Speaker (paying {E} for each mana of a permanent spell's cost); Yusri, Fortune's Flame (choose a number, flips lost,
   "if you won five flips", free casts for the turn); Party Dude ("Whenever one or more of your opponents are
   attacked"); Feather, the Redeemed; Maralen, Fae Ascendant.
   Round 220: "each Vehicle you control gets +1/+1 as long as it's a creature" and a paid "reveal the top X cards, put
   all Dwarf and Vehicle cards into your hand" (Depala, Pilot Exemplar); "If it's an Equipment, attach it to ~" after
   a put from hand (The Invincible Iron Man, CR 701.3); "When you do, return target Equipment card ... then attach it
   to that token" (Ratonhnhaké꞉ton, CR 603.12); "up to one other target creature loses all abilities and becomes a
   green Lizard" (Lizard, Connors's Curse); "for as long as that creature has a bounty counter on it, it has ..."
   (Mathas, Fiend Seeker); "enchanted creature or another modified creature you control dies" (One with the Kami, CR
   700.9); "choose up to X, where X is ..." (Bumi, King of Three Trials: the most modes counted as it triggers, CR
   603.3c); "remove up to three stun counters from among all permanents. Draw cards equal to the number removed" (Sensational
   Spider-Man: the distribute picker's remove mode, e2e round220.spec.ts); "if you control eight or more lands, repeat
   this process once" (Zimone and Dina); a fight "with the same mana value" and "a creature that fought this turn"
   (Boxing Ring); "if her sneak cost was paid this turn, instead return that card to the battlefield" (Karai, Future of
   the Foot); "If you don't, scry 1" after a free cast from hand (In Search of Greatness); "if ~ attacked this combat,
   target creature an opponent controls blocks that Wolf this combat if able" (Tolsimir, Midnight's Light); "if that
   player attacked you during their last turn" (O-Kagachi, Vengeful Kami); "cloak a card from your hand" (Vannifar,
   Evolved Enigma, e2e round220.spec.ts); trample over planeswalkers (Thrasta, Tempest's Roar, CR 702.19c-e, in
   dealCombatDamage); "reveal ... until you reveal a card that shares a card type with that permanent" (Reality
   Scramble). +17 (28,153 of 31,936).
   Smaller gaps from round 220: Ratonhnhaké꞉ton's reflexive return is about the first token only when a token doubler
   makes more; Karai's "her sneak cost was paid this turn" needs Karai still on the battlefield as the same object; the
   Iron Man test runs its back face as a card of its own; bots choose Vannifar's mode like any modal trigger.
   Out after round 220 (looked at, not done): Ghost of Ramirez DePietro (no record yet of a card discarded this turn,
   only of cards put into a graveyard from a library); Reservoir Kraken ("any opponent may tap an untapped creature they
   control": each opponent's choice in turn); Marshland Bloodcaster (paying life equal to the next spell's mana value
   instead of its mana cost); Watcher of Hours (a trigger of a card in exile, "whenever you remove a time counter from
   this card while it's exiled"); Tarmogoyf Nest and Disa the Restless (a Tarmogoyf token isn't a predefined token);
   Kethek, Crucible Goliath (reveal until a nonlegendary creature card with lesser mana value than the sacrificed
   creature); Yidris, Maelstrom Wielder (cascade on spells cast from hand for the turn); Animal Friend (a quoted
   ability that refers to its source); Hive Mind.
   Round 221: "put a +1/+1 counter on target creature and goad it" (Bhaal, Lord of Murder); "the number of cards you
   own in exile" (Cosmogoyf); "{C} for each artifact you control named ~" (Powerstone Shard); "enters or becomes the
   target of a spell or ability an opponent controls" (Shield Mare); "counter that spell unless you sacrifice a
   creature" (Blood Funnel); "are artifacts in addition to their other types" (The Flesh Is Weak); "creatures with no
   +1/+1 counters on them" (Hindervines); "put its counters on this creature" (Buzzard-Wasp Colony, and with it Host
   of the Hereafter); hellbent "skip your upkeep step if you have no cards in hand" (Gibbering Descent, CR 614.10);
   cards a search exiled "with ~" (Endless Horizons, CR 607.2a); cast from your graveyard for {1} more per other
   creature card (Risen Executioner, CR 601.2f); hexproof from card types (Nevinyrral, Urborg Tyrant, CR 702.11d);
   "remove an eon counter ... and return it to its owner's hand" as costs (Magosi, the Waterveil: with both abilities
   in one turn the skipped turn is the extra one, rulings); "one mana of any color among cards in your graveyard"
   (Corrupted Grafstone); "sacrifice a creature or sacrifice a modified creature ... If the modified creature was
   sacrificed" (Lethal Throwdown: the way chosen to pay, SpellCondition costOrPaid); convoke or improvise for the next
   spell or the first spell of a kind each turn (Flockchaser Phantom, Peri Brown, The Fifteenth Doctor); "put all cards
   exiled with it onto the battlefield" (Underworld Sentinel); "spells that target ~ cost {2} less" (Spellwild Ouphe);
   two "costs {1} less" conditions (Geistlight Snare); "power or toughness 6 or greater" (Rootless Yew); "it deals 2
   damage to each creature without flying that player controls" (Siege Dragon); "If it's an Equipment, unattach it"
   (Tamiyo's Compleation); "If an outlaw was sacrificed this way" (Boneyard Desecrator, CR 700.12); "sacrifice another
   creature or token" (Ice Cream Kitty); "Put a land card from among the milled cards into your hand. If you can't,
   create a Treasure token" (Patient Naturalist). +28 (28,181 of 31,936).
   Smaller gaps from round 221: Endless Horizons' search is played by bots as an "away" search, so they may exile few
   Plains; Peri Brown and The Fifteenth Doctor count spells of that kind cast this turn, so a spell cast before either
   arrived uses up the turn's first one (as the rules say).
   Out after round 221 (looked at, not done): New Perspectives ({0} instead of every cycling cost, non-mana ones
   included); Clay Golem (a die roll as a cost); Ian the Reckless (damage to you and any target at once);
   Stumpsquall Hydra (distribute counters among it and commanders); Cursecloth
   Wrappings (granted embalm with the card's own mana cost); Rift Elemental (remove a time counter from a permanent or
   suspended card); Ashcloud Phoenix (return face down); Nightshade Assassin (reveal X black cards); Silverquill
   Lecturer (granted demonstrate); Cosi's Trickster (whenever an opponent shuffles, done in round B71); Ib Halfheart, Goblin Tactician
   ("becomes blocked, sacrifice it. If you do, it deals 4 damage to each creature blocking it"); Vivien's Stampede
   (each player dealt combat damage this turn); Armored Kincaller ("If you do or if you control another Dinosaur");
   Tunnel Tipster and Veiled Ascension (face-down creatures entering); Embodiment of Agonies (different mana costs
   among cards).
   Round 222 (fresh cards from rank 16,000 on): "It gains ..."/"It gets ..." in an activated ability means the source
   (Migloz, Maze Crusher); "for each attacking creature other than ~" (Márton Stromgald); "deals X plus 2 damage
   instead" (Crater's Claws, CR 614.1a); "Activate only if ... and only once" (Thought Shucker, CR 602.5b); Cultivate
   then scry (Peregrination); "whenever you activate a loyalty ability (of a Chandra planeswalker)" with "if you
   removed two or more loyalty counters to activate it" and "copy that ability" (Way of the Paradox, Way of the Mind
   Sculptor, Keral Keep Disciples, Chandra's Regulator, CR 606.4); "creature that crewed it this turn" as a target
   and as an "each" group (Getaway Car, Golden Argosy, CR 702.122); "loses life equal to the number of creatures they
   control unless they sacrifice a creature" (Tomb Blade); "at the beginning of the next end step, you lose 1 life
   and return this card to your hand" (Brood of Cockroaches, CR 603.7); "put a +1/+1 counter on ~ and it gains"
   (Mukotai Soulripper); "whenever you become the target of a spell or ability an opponent controls" (Amulet of
   Safekeeping); "whenever you attack while you control" (The Chief Warg, checked only as you attack, rulings);
   "costs {1} more to activate for each" (Loreseeker's Stone, CR 601.2f); "into your library second from the top"
   (Screaming Swarm); damage equal to its +1/+1 counters (Goblin Razerunners); "you may discard a card at random. If
   you do" (Gallia of the Endless Dance); "whenever you surveil for the first time each turn" (Whispering Snitch,
   counting surveils before it arrived, rulings); "Bird and/or Cleric permanent cards" (Celestial Gatekeeper);
   "unless they control a commander" (Crimson Honor Guard); granted battle cry (Reckless Pyrosurfer, CR 702.91b).
   +24 (28,347 of 31,936 with Lane B B48-B52).
   Smaller gaps from round 222: if Brood of Cockroaches leaves your graveyard before its trigger resolves, no delayed
   trigger is made, so the 1 life isn't lost; the delayed trigger should probably still be made (CR 603.7a) and only
   the return fail.
   Out after round 222 (looked at, not done): Deconstruction Hammer and its kind (a granted ability that sacrifices
   the Equipment granting it); Subterranean Schooner (explore by the creature that crewed it); Turtle Van; Trove of
   Temptation (an attack requirement on opponents); Hedron Matrix (a per-object amount in a static); Voracious Dragon
   (types of the devoured creatures); Jurin, Leading the Charge; Incite Rebellion; Ajani Unrelenting. Sosuke, Dragon's
   Prey, Dire Downdraft and Nullmage Advocate were left to Lane B, whose templates cover them.
   Round 223 (fresh cards from rank 15,000 on): "You may reveal this card from your opening hand. If you do, at the
   beginning of the first upkeep / your first upkeep / your first main phase of the game, ..." as a delayed trigger
   (CR 103.6b, 603.7; a new opening-hand reveal prompt after the Leyline one; each card revealed triggers on its own;
   the bot reveals all but a Providence that would lower its life): the Chancellors of the Dross, Forge, Spires and
   Tangle, Sphinx of Foresight, Providence, Devourer of Destiny ("Exile the rest"); "begin the game with ~ on the
   battlefield" (Quicksilver, Brash Blur); "Then if that creature has power 4 or greater, it gains" (Strider, Ranger
   of the North); "deals 2 damage to target player and gains indestructible" (Ellie, Vengeful Hunter); "is dealt
   damage for the first time each turn" (Hercules, Olympian Hero); "a creature other than ~ is exiled from the
   battlefield" (Captain Marvel, Shooting Star); "whenever you attack with one or more Gods and whenever a God dies"
   (Kratos, Stoic Father); "X can't be greater than the amount of life you gained this turn" (Shanna, Purifying
   Blade); "choose a color, then create ... for each permanent of that color" (Rith, the Awakener); "planeswalker
   types among planeswalkers you control" (Tam, the Possibility); "up to two target creatures and up to two target
   lands" (Nissa, Genesis Mage); "a Warrior you control deals combat damage to a creature" (Sosuke, Son of Seshiro);
   "assign his combat damage as though he weren't blocked" (Wolverine, Claws Out); "as long as an opponent has cast a
   spell this turn" (Captain Mar-Vell, Space-Born, CR 102.3); "Remove ten oil counters from among permanents you
   control and sacrifice ~" (The Filigree Sylex); "X can't be 0" in every mode (Marath, Will of the Wild); "Whenever ~
   enters or another nontoken Human you control dies" (Jerren, Corrupted Bishop); "Whenever one or more players
   sacrifice one or more creatures ... only once each turn" (Evin, Waterdeep Opportunist). +24 (28,558 of 31,936 with Lane B B60 and B61).
   Out after round 223 (looked at, not done): Contested War Zone ("that creature's controller gains control of ~" after
   a creature deals combat damage to you); Chandra, the Firebrand ("each of up to six targets"); Ooze Flux (remove one
   or more +1/+1 counters as a variable cost); Chancellor of the Annex (the first spell each opponent casts); Kaima,
   the Fractured Calm (a count of creatures goaded this way); Namor the Sub-Mariner; Words of Worship and Words of Wind
   (replacing the next draw this turn); Become the Pilot (can't be blocked unless attacking its owner); Nemesis Phoenix
   (returned tapped and attacking from the graveyard); Battletide Alchemist ("you may prevent X of that damage" for any
   player).
   Round 224 (fresh cards from the top): a floating "whenever one or more Gorgons and/or Snakes you control deal combat
   damage to a player" (Aphelia, Viper Whisperer); "spend this mana only to cast a spell that's one or more colors
   without {X} in its mana cost" (Titans' Nest); "whenever you and/or at least one permanent you control becomes the
   target of a spell or ability an opponent controls" once per spell or ability (Leyline of Combustion, CR 115.10);
   "whenever a creature deals combat damage to its owner" (The Beast, Deathless Prince); "the number of colors of mana
   spent to cast it" in a cast trigger (Wildgrowth Archaic, CR 601.2h); "remove all +1/+1 counters from ~, and it deals
   that much damage" (Ashling the Pilgrim); "defending player sacrifices a creature of their choice that's blocking it"
   (Labyrinth Raptor, CR 509.1h); "it deals damage equal to its power to each other creature" (Showstopping Surprise,
   Nova Flame); "If no counters were removed this way, ... Otherwise, ..." (Bounty of the Luxa); "creatures dealt
   damage this way can't block this turn" (Huatli, Warrior Poet); "cast Elf spells and activate abilities of Elf
   sources" (Woodland Weavemaster); "entered from a graveyard or you cast it from a graveyard" (Breathless Knight);
   "the first time counters have been put on that creature this turn" (Stalwart Successor); "a card in your graveyard
   that wasn't put there this combat" (Storrev, Devkarin Lich, CR 506.1); "that player may put a +1/+1 counter on ~. If
   they do, they add {C} for each counter on it" (Cheering Crowd). +16 (28,590 of 31,936 with Lane B B62).
   Out after round 224 (looked at, not done): Heaven Sent (exile it and cast it this turn); Open the Omenpaths (mana of
   two different colors); Spark of Creativity ("you may have ~ deal damage ... If you don't, you may play that card");
   Fires of Mount Doom ("when you play a card this way"); Festival of Embers (cast from the graveyard by paying 1 life
   more); Myr Superion (spend only mana produced by creatures). (Karn's Sylex and Strength of the Tajuru, also looked at
   here, went in with Lane B round B63.)
   Round 225 (fresh cards from the top): "If you've committed a crime this turn, ... Otherwise, ..." (Oko, the
   Ringleader); "When ~ has two or fewer loyalty counters on him, transform him" (Garruk Relentless); transforming back
   faces with no loyalty box keep their counters (Garruk, the Veil-Cursed, Arlinn, Embraced by the Moon; CR 712.18);
   "if ~ and at least two other creatures attacked this combat" (Kytheon, Hero of Akros); requirements to attack a
   planeswalker, "attacks ~ during its controller's next turn if able" (Gideon, Battle-Forged) and "during target
   opponent's next turn, creatures that player controls attack ~ if able" (Gideon Jura), weighed against goad and
   encore (CR 508.1d), with the bot and a hint in the attack bar; "all cards from all hands" (Decree of Annihilation);
   "its controller creates a token that's a copy of that creature" (Parallel Evolution); "Return two of them at random"
   (Sinister Waltz); "under your control tapped and attacking" from the defending player's graveyard (Chorale of the
   Void); "When you do, ... where X is the exiled card's toughness" (Venom, Deadly Devourer); "If the {2}{U} cost was
   paid, ... an opponent ..." (Ingenious Mastery, Devastating Mastery); "a player drawing a card causes a triggered
   ability ... to trigger an additional time" (Krang, the All-Powerful); "put an additional +1/+1 counter on it" (Cursed
   Wombat). UI fix: clicking an opponent's planeswalker to attack it attacked the player instead. +14 (28,615 of 31,936 with Lane B B63).
   Tadeas, Juniper Ascendant was left to Lane B's B63.
   Out after round 225 (looked at, not done): Wayta, Trainer Prodigy (damage triggers doubled across many events);
   Auntie Ool (done in round 266); Fell Beast's Shriek (splice onto instant or sorcery); Jasmine Boreal of the Seven
   (mana for creature spells with no abilities); Kethis, the Hidden Hand (graveyard cards gain "you may play"); Cult of
   the Waxing Moon (transforms into a non-Human creature); Zinnia, Valley's Voice (creature spells gain offspring);
   Elsha of the Infinite (cast noncreature spells from the top as though they had flash); Najal, the Storm Runner (copy
   the next instant or sorcery); Garland, Knight of Cornelia (return transformed from the graveyard).
   Round 226 (fresh cards from the top): "once during each of your turns, you may play a land or cast a permanent spell
   from among cards in your graveyard that were put there from your library this turn" (Kagha, Shadow Archdruid) and
   "... from anywhere other than the battlefield this turn" (Banon, the Returners' Leader); "a second target artifact"
   (Shuri, Wakandan Inventor); "Otherwise, you may turn a permanent you control face up" (Zimone, Mystery Unraveler);
   "target attacking legendary creature you control other than ~" (Shaun, Father of Synths); "becomes crewed for the
   first time each turn, if it was crewed by exactly two creatures" (Mighty Servant of Leuk-o; Mindlink Mech too, whose
   "except it's 4/3" now sets nothing on a copy of a permanent that isn't normally a creature or Vehicle, rulings);
   "copy target spell you control that wasn't cast" (Errant, Street Artist); "copy it, except the copy is an artifact in
   addition to its other types" (Tawnos, the Toymaker); "Until end of combat, you don't lose this mana as steps end" and
   "play one of those cards without paying its mana cost" from each opponent's library (Fire Lord Ozai); "sacrifice that
   token unless you pay an amount of {E} equal to its mana value" at the next end step (Satya, Aetherflux Genius); "mill
   four cards, then return up to two permanent cards from among them" (Greenhouse // Rickety Gazebo); "whenever you play
   a card with two or more card types" (Rendmaw, Creaking Nest); "you may copy that spell. The copy targets ~" (Ivy,
   Gleeful Spellthief); "Return that creature to its owner's hand at end of combat" after a creature put onto the
   battlefield from the top six (Arthur, Marigold Knight); "that doesn't have the same name as a token you control" (The
   Apprentice's Folly). +16 (28,647 of 31,936 with B64).
   Out after round 226 (looked at, not done): Ixhel, Scion of Atraxa (each poisoned opponent's face-down exiled card,
   playable with mana of any color); Firkraag, Cunning Instigator ("if that creature had to attack this combat");
   Waterbender's Restoration (waterbend {X} as an additional cost); Eruth, Tormented Prophet and Uba Mask (every draw
   replaced, alongside dredge and the other draw replacements, CR 616.1); Hofri Ghostforge and Timothar, Baron of Bats
   (a token's granted ability linked to the card the trigger exiled, rulings); Anrakyr the Traveller (cast an artifact
   spell from hand or graveyard for life during a trigger's resolution); Crabomination (a card at random from the
   graveyard and from the hand, then cast one of the three); Winnowing (each player's sacrifice by the creature types of
   a creature you chose for them); Grolnok, the Omnivore (a card trigger for each permanent card milled, croak counters,
   playing them from exile); Coram, the Undertaker (lands and spells from every graveyard, cards you don't own);
   Territorial Hellkite (done in round 266); Boreas Charger (an opponent who controls
   more lands, a search for the difference); Eivor, Wolf-Kissed ("a Saga card and/or a land card" from among the milled
   ones).
   Round 227 (fresh cards from the top): "Other creatures you control are Assassins ... The same is true for creature
   spells you control and creature cards you own that aren't on the battlefield" (Roshan, Hidden Magister); "becomes
   tapped for the first time during each of your turns" (Tale of Katara and Toph); "you may pay an amount of {E} equal to
   target nonland permanent's mana value. When you do, destroy that permanent" (Behemoth of Vault 0); "Whenever an Aura
   you control becomes attached to a creature you control" (Siona, Captain of the Pyleas); "exile it. When you do, return
   up to X target cards ..., where X is the number of opponents who have three or more poison counters" (Glissa's
   Retriever); "It's a Skeleton in addition to its other types and has no abilities" (Xu-Ifit, Osteoharmonist); "Put a
   deathtouch counter on either of them. Then put a menace counter on either of them" (Call of the Death-Dweller);
   "choose two abilities from among first strike, vigilance, and lifelink" as it enters, and "have each of the chosen
   abilities" (Greymond, Avacyn's Stalwart; e2e test); "The first time you flip one or more coins each turn, those coins
   come up heads and you win those flips" (Edgar, King of Figaro); Mana Clash's repeated flips (with Krark's Thumb its
   coins are flipped twice and a heads is kept without asking: a known gap); Kaito, Bane of Nightmares (a 3/4 Ninja
   creature with hexproof during your turn while he has loyalty); "Add {U}, {R}, or {W}" (Narset of the Ancient Way);
   "its starting loyalty is 1" on a token copy and "Remove a number of loyalty counters equal to that card's mana value"
   (Jace, Mirror Mage); "Each instant and sorcery card in your hand has miracle {2}" (Lorehold, the Historian: a card
   with its own miracle triggers twice); "Lands you control and land cards you own that aren't on the battlefield are
   Deserts" (Dune Chanter). +15 (28,688 of 31,936 with B64-B66).
   Out after round 227 (looked at, not done): Sigarda, Host of Herons ("Spells and abilities your opponents control
   can't cause you to sacrifice permanents": every effect sacrifice, edict, "may sacrifice" and "unless you sacrifice"
   option would need to know who controls the source, while costs, mana abilities and the legend rule stay allowed,
   rulings; about thirty sacrifice sites).
   Round 228 (fresh cards from the top): "During your turn, you may play cards from your graveyard" (Emet-Selch //
   Hades, Sorcerer of Eld: lands and spells, all costs paid, the timing rules followed); "Once during each of your turns,
   you may cast a spell from your hand by paying life equal to its mana value" (Cramped Vents // Access Maze); "Assassin
   spells you cast have freerunning {B}{B}" and "you may pay {W}{U}{B}{R}{G} if that player has 10 or less life. When you
   do, that player loses the game" (Ezio Auditore da Firenze); "Each legendary spell you cast that's one or more colors
   has web-slinging {G}{W}{U}" (Peter Parker // Amazing Spider-Man); "You may cast artifact spells from your graveyard by
   paying 3 life in addition to paying their other costs. If you cast a spell this way, that artifact enters with a
   finality counter on it" (Noctis, Prince of Lucis; with a free permission too, the one that asks nothing more is used);
   "each Spider and legendary creature you control" (Miles Morales // Ultimate Spider-Man); "Each creature spell you cast
   with mana value 4 or greater has blitz. The blitz cost is equal to its mana cost" and "Blitz costs you pay cost {1}
   less for each time you've cast your commander from the command zone" (Henzie "Toolbox" Torre); "Reveal the first card
   you draw on each of your turns" (Keranos, God of Storms); "Copy target activated or triggered ability you control from
   another legendary source that's not a commander" (The Peregrine Dynamo); "When you do, exile that card" after
   entering as a copy of a creature card in a graveyard (Superior Spider-Man). The granted Blitz, Web-slinging and
   Freerunning cast-menu entries have an e2e test; `npm run e2e:cards` now also reads single-quoted names. +10 (28,698
   of 31,936 with round 227 and B66).
   Out after round 228 (looked at, not done): Bilbo, Thief in the Night (a paid cast from a graveyard during
   resolution); Lazav, Dimir Mastermind and Valki, God of Lies (becoming a copy of a card outside the battlefield, "that
   card" in a graveyard trigger); Ixidron and Illithid Harvester (turning permanents face down); Brazen Cannonade ("until
   end of combat on your next turn"); Auntie Ool, Cursewretch (done in round 266); Arlinn's back face (a temporary "enters with
   an additional counter"); River Song's Diary, Knowledge Pool, Black Cat, Cunning Thief, Ninja Teen (granted sneak from
   the graveyard), Grothama, All-Devouring, Tovolar, Dire Overlord, God-Eternal Kefnet, Hierophant Bio-Titan, Falco
   Spara, Pactweaver, Baral and Kari Zev, Xanathar, Guild Kingpin, Painter's Servant and Warp World (each a new
   mechanism).
   Round 229 (fresh cards from the top): "Cumulative upkeep—Add {R}" (Braid of Fire; the bot keeps it); "Auras
   attached to permanents you control have umbra armor" (Umbra Mystic); "Other nonblack creatures you control" and
   "Players can't pay life or sacrifice creatures to cast spells or activate abilities", mana abilities included (Angel
   of Jubilation; Yasharn, Implacable Earth with nonland permanents; CR 119.4, 701.21); "You may put any number of land
   cards from among them onto the battlefield" after exiling the top N (Xenagos, the Reveler); "If you control a Squirrel
   or returned a Squirrel card to your hand this way" (Cache Grab); "Whenever an opponent attacks another one of your
   opponents, you and the attacking player each draw a card and lose 1 life" and "goad target creature defending player
   controls" (Karazikar, the Eye Tyrant); "exile target creature or enchantment you don't control until target enchantment
   you control leaves the battlefield" (Calix, Destiny's Hand); "Whenever one or more cards are discarded, ... for each
   card discarded this way" (Captain Howler, Sea Scourge); "you may exile one of them from your graveyard. If you do,
   you may cast it this turn" (Conspiracy Theorist); "ward {X}, where X is the number of experience counters you have"
   (Minthara, Merciless Soul); "All damage is dealt as though its source had wither" (Everlasting Torment). +12 (28,710
   of 31,936).
   Out after round 229 (looked at, not done): Filigree Vector (two "any number of target" sets in one ability, only one
   is supported); Mariposa Military Base (an opt-in "enter tapped with rad counters" choice when the land is played;
   "rad counters you have" now counts); Font of Agonies (no "whenever you pay life" event yet); Tromokratis ("can't be
   blocked unless all creatures defending player controls block it": a block legality rule and bot blocking).
   Round 230 (skipped cards from the top, now done): "~ has all activated abilities of all cards exiled with it", mana
   abilities too, linked to its one exile ability (Myr Welder; "creature cards" for Dark Impostor and Patchwork Crawler;
   CR 607.2a); "choose a card type other than creature or land" (Stenn, Paranoid Partisan); converge, then "exile that
   card, then shuffle. You may cast that card without paying its mana cost", the card staying exiled if it isn't cast
   (Bring to Light); the planeswalker Talents: "Enchanted planeswalker has "[+1]: ..."" (a loyalty ability, once a turn
   with the planeswalker's own, CR 606.3), "Whenever you activate a loyalty ability of enchanted planeswalker" (Elspeth's
   Talent; Rowan's Talent copies it), "put a loyalty counter on enchanted planeswalker" (Vivien's and Teferi's Talents;
   Teferi's emblem, an apostrophe inside its single-quoted text now read right), "Whenever a creature deals damage to
   enchanted planeswalker, destroy that creature", combat or not (Liliana's Talent); "you may convert ~. When you do,
   ..." (Ratchet, Field Medic) and "you may transform it. If you do, ..." (Soul Seizer): only if it can turn over and
   hasn't transformed since the ability went on the stack (CR 701.27f, rulings). Browser tests for Stenn's choice and a
   Talent's granted loyalty ability. +12 (28,748 of 31,936 with B67 and B68).
   Out after round 230 (looked at, not done): Abstruse Appropriation ("spend colorless mana as though it were mana of
   any color": a payment rule for colored symbols); War's Toll ("If a creature an opponent controls attacks, all
   creatures that opponent controls attack if able": a requirement that depends on the declaration); Kaito, Dancing
   Shadow ("activate loyalty abilities of ~ twice this turn", a one-turn grant); Saheeli's Lattice, Altar of the
   Wretched, Paleontologist's Pick-Axe and Sunbird Standard ("Craft with one or more ...", and what their back faces
   read from the exiled cards used to craft them); Teyo, Geometric Tactician (attack only the nearest opponent in a
   direction); Ramses, Assassin Lord (done in round 265).
   Round 232 (unexamined cards from ranks 6,400 to 13,000, now done): a search's exile linked to a dies ability (Hoarding
   Dragon: each Dragon its own hoard, CR 607.2a); "Choose a card name. Whenever a creature with the chosen name deals
   combat damage to a player this turn" (The Clone Saga: the name bound into the delayed trigger, anyone's creature); "for
   each land destroyed/sacrificed this way, its controller may search ... for a basic land card" (From the Ashes, Wave of
   Vitriol: one search per player, up to one card for each of their lands, as they last existed, CR 608.2h); "for each
   player, destroy up to one nonbasic land that player controls" (Krenko's Buzzcrusher: you choose for each player in
   APNAP order, not targeted; picker and browser test); "If that card is legendary, create a Treasure token. Then
   shuffle." between a search and its shuffle (Instrument of the Bards); "if a creature died under an opponent's control
   this turn" (Sidequest: Hunt the Mark); "you may pay {4}{U}{U}{B}{B} and exile eight cards from your graveyard. If you
   do" (Ultimecia, Time Sorceress); "the spell's mana value" in a cast trigger, Birds even when the spell can't be
   countered (Dovescape); "Whenever a Werewolf you control enters, you may transform it" (Geier Reach Bandit's back face);
   "exile all creatures you control, then reveal ... until you reveal that many creature cards" (Mass Polymorph, tokens
   counted); a Saga's chapter III returning what its chapter I exiled (The Princess Takes Flight, the same Saga object
   only); "If he's attacking, untap ~ and there is an additional combat phase after this phase" (The Incredible Hulk). +13
   (28,787 of 31,936 with B67-B69).
   Out after round 232 (looked at, not done): Island Sanctuary (skip the draw-step draw for "can't be attacked except by
   creatures with flying and/or islandwalk" until your next turn; Lane B's draw replacements are moving in B68/B69);
   Cairn Wanderer (landwalk and protection as the creature cards in graveyards have them, by kind); Synthetic Destiny
   ("that many" carried into the delayed trigger at the next end step); Lorcan, Warlock Collector (pay life equal to the
   card's mana value from any zone into a graveyard, then a Warlock exile-instead replacement); Wild Pair (a search for the
   same total power and toughness, "if you cast it from your hand"); Vislor Turlough (an opponent gains control and it's
   goaded for as long as they control it); Nephalia Academy (a discard an opponent causes put on top instead); Heirloom
   Epic (tap creatures for an activation cost's mana, like convoke); Kaldring, the Rimestaff (play a snow permanent card
   from your graveyard this turn, entering tapped); Hostile Hostel (soul counters, transform, then untap; Creeping Inn's
   "creature cards exiled with this creature"); Dawnbreak Reclaimer (an opponent chooses a card in your graveyard);
   Cryptic Gateway, Mogg Assassin, Karplusan Minotaur, The Phasing of Zhalfir, Mirror of Life Trapping, Grasping Shadows
   ("transform it" is the enchantment, not the attacker).
   Round 233 (top of the list, now done): "you may pay one or more {E}. If you do, create an X/X ... Vehicle token"
   (Pia Nalaar, Chief Mechanic); "If a Hero enters this way, it enters with an additional +1/+1 counter" (Winter Soldier,
   Reborn Avenger); "you draw a card and that player may draw a card. If they do, that player can't attack you ...
   during their next turn" (Willie Lumpkin, Postman: only the players who drew); "you may exile the top card ... If that
   card is a Hero card, you may play it this turn" (Daredevil, Man Without Fear, from the B68 list); "If it's a green
   card, add one mana of any color" (Tamiyo, Seasoned Scholar); a look's "exile a card from among them. If you do, it
   becomes plotted" (Make Your Own Luck, CR 702.170); "cast this card from your graveyard by paying {B}{B} and sacrificing
   two creatures" (Scourge of Nel Toth); "each creature card in your graveyard gains escape" until end of turn (The Grim
   Captain's Locker, CR 702.138; offered only while no permanent already grants escape); madness for Vampire cards you
   own (Falkenrath Gorger, CR 702.35); "Whenever a creature you control dealt damage this way dies this turn, add {R}"
   (Reckless Blaze); "then transform an Incubator token you control" (Sunder the Gateway; picker and browser test);
   "During any turn you attacked with a commander, you may play those cards" (Neriv, Crackling Vanguard); "It becomes
   foretold. Its foretell cost is its mana cost reduced by {2}" (Ethereal Valkyrie, CR 702.143; hand picker and browser
   test; a card with its own foretell uses the cheaper cost). Pick prompts now show the effect's own prompt text. +13
   (28,812 of 31,936 with B67 to B70).
   Round 234 (top of the list, now done): "copy that spell if it targets a permanent or player ... If you don't copy a
   spell this way, draw a card" (Shiko and Narset, Unified, checked as the trigger resolves); "Draw a card for each
   creature you control but don't own" and "Starting with you, each player chooses a creature. Destroy each creature
   chosen this way" (The Horus Heresy: anyone's creature, picker and browser test); "exile cards equal to its power from
   the top of its owner's library ... mana of any type can be spent" (Dead Man's Chest, CR 609.4b); "Choose any number
   of artifact tokens and/or creature tokens you control with different names. For each of them, create a token that's
   a copy of it" (Battle for Bretagard; the picker refuses two of one name, browser test); "Exile any number of historic
   cards from your graveyard with total mana value 30 or greater" as a cost, not collecting evidence, and the emblem's
   "base power and toughness 9/9" (The Capitoline Triad; picker and browser test); "If you've cycled a card named ~ four
   or more times this game" (Yidaro, Wandering Monster: Player.cycledNames; the library is shuffled even if it left the
   graveyard); "then puts each Goblin card milled this way into their hand" (Grub's Command); "becomes a Human Soldier
   creature with power and toughness each equal to the number of loyalty counters on him" (Gideon, Champion of Justice,
   locked in as it resolves, rulings); "target player or planeswalker and ... up to one target creature that player or
   that planeswalker's controller controls" and "Choose an instant or sorcery card exiled this way and copy it three
   times" (Chandra, Pyromaster; also Soul of Shandalar and Huntmaster of the Fells's Ravager); "Whenever you attack this
   turn, ~ deals damage ... to that creature" and "a red instant or sorcery spell" (Jaya, Fiery Negotiator; also
   Unyaro Griffin); "exile all creatures blocked by this creature" (Wall of Nets, returned when it leaves). +14
   (28,826 of 31,936 with B69 and B70).
   Round 235 (top of the list, now done): "Whenever you pay life" (Font of Agonies: a lifePaid event from every life
   payment, CR 119.4, game.ts payLife); "You may have this land enter tapped. If you do, you get two rad counters"
   (Mariposa Military Base; land menu buttons and browser test); "remove enchanted creature from combat. Then draw a
   card for each tapped creature its controller controls" (Observed Stasis); "If you put fewer than two lands onto the
   battlefield this way, proliferate a number of times equal to the difference" (Expand the Sphere); "hexproof unless
   it's attacking or blocking" and "can't be blocked unless all creatures defending player controls block it"
   (Tromokratis); "If a land is tapped for two or more mana, it produces {C} instead" (after other mana replacements,
   CR 106.12b, 616.1) and "costs {1} more ... for each other spell that player has cast this turn" (Damping Sphere);
   "you get that many plus one {E}" / "twice that many {E}" and "Activate only if you've paid or lost four or more {E}
   this turn" (Izzet Generatorium, Aether Refinery); "Spend this mana only to cast spells you don't own" (Thieving
   Varmint); "where X is the number of permanents you've sacrificed this turn. If X is three or more" (Obsessive
   Pursuit); "by paying {3}{R} and exiling four other cards from your graveyard" (Squee, Dubious Monarch); "can't be
   blocked this turn except by creatures with haste" (Agility Bobblehead); "to cast an Assassin spell or a spell that
   has freerunning, or to activate an ability of an Assassin source" (Brotherhood Headquarters); "creatures you control
   that are Fungi and/or Saprolings" and "the number of times you descended this turn" (The Mycotyrant, TurnLog.descended);
   "the number of creatures that were exiled under your opponents' control this turn" (Vren, the Relentless,
   TurnLog.creaturesExiled); "target creature that player controls becomes a Coward" (Gornog, the Red Reaper). +16
   (28,842 of 31,936 with B69 and B70).
   Round 236 (top of the list, now done): "if you had another creature enter the battlefield under your control last
   turn" (Ephara, God of the Polis, GameState.lastTurn.creaturesEntered); "where X is the amount of damage dealt to it
   this turn" in a dies trigger (Tangled Colony: the permanent it was, TurnLog.damageDealtTo); "Spells and abilities
   your opponents control can't cause you to sacrifice permanents" (Sigarda, Host of Herons and Tajuru Preserver:
   cards.ts opponentForbidsSacrifice, no option to sacrifice either; costs of your own spells and abilities, mana
   abilities included, are moveObject `cost`); "hexproof from each of its colors" (Tam, Mindful First-Year: filled in
   from its colors in layer 6); "Remove X time counters from ~ and exile it: Return each nonland permanent card with
   mana value X" (Hourglass of the Lost: an activated ability's own X); "and whenever a permanent you control enters
   from exile" (Fire Lord Zuko) and "Whenever a land you control enters from anywhere other than your hand or you cast a
   spell from anywhere other than your hand" (The Lost and the Damned); "Whenever the final chapter ability of a Saga
   you control triggers" (Historian's Boon); "Activated abilities of Foods you control cost {1} less" (Sam, Loyal
   Attendant); "If two cards that share a color were milled this way, repeat this process" (Grindstone); "choose a
   kind of counter at random that ~ doesn't have on it" (Crystalline Giant); "note your life total" (Sigarda's
   Splendor, GameObject.notedLife); "Whenever a nontoken creature an opponent controls enters this turn" (Theoretical
   Duplication); "instead it explores, then it explores again" (Topography Tracker; two of them: four times,
   cumulative as Alhammarret's Archive's rulings say); "Cumulative upkeep—Sacrifice a creature" (Phyrexian Soulgorger:
   a different creature for each age counter, itself allowed; browser test). +16 (28,858 of 31,936 with B69 and B70).
   Round 237 (top of the list, now done): "If a creature you control would explore, instead you scry 1, then that
   creature explores" (Twists and Turns, CompiledCard.scryBeforeExplore, one scry for each); "If a modular triggered
   ability would put one or more +1/+1 counters" (Zabaz, the Glimmerwasp: counters.ts withModular); "a source you
   control with an odd mana value" (Obosh, the Preypiercer); "you control a prime number of lands" and "that many"
   counters (Zimone, All-Questioning); "As long as you've discarded a card this turn, you may pay {B/R} to cast this
   spell" and "Target creature deals 6 damage to itself" (Asmoranomardicadaistinaculdacar); "up to two Forest cards
   ... Put one of them onto the battlefield tapped and the other into your hand" (Flourishing Bloom-Kin); "a creature
   card that shares a creature type with enchanted creature" (Call to the Kindred); "the number of different color
   pairs among permanents you control that are exactly two colors", X counted once (Niv-Mizzet, Guildpact, Count
   colorPairs, Effect noteAmount); "each opponent may investigate ... one plus the number of opponents who investigated
   this way" (Wernog, Rider's Chaplain); "creatures they control can't attack you / Jaces you control this turn" (Web of
   Inertia, Jace, Multiverse Architect: Effect attackBanThisTurn, Player.attackBansThisTurn); "each foretold card you
   own in exile" and "the rest on the bottom of your library in any order" after a chosen card type (Alrund, God of the
   Cosmos); "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack
   you this combat" (Champions of Minas Tirith: that combat phase only, not their planeswalkers, per the rulings). +13
   (28,938 of 31,936 with B71-B74).
   Round 238 (top of the list, now done): "the Ring tempts you, then you put a +1/+1 counter on your Ring-bearer" after
   a will of the council vote (Galadriel, Elven-Queen: ObjRef ringBearer); "If you attacked this turn, you may have ~
   enter as a copy" (Protean Raider, entersAsCopy ifAttacked); "~ has dealt 3 or more damage this turn" and the −7's
   "Each player dealt damage this way gets an emblem" (Chandra, Fire of Kaladesh: StaticCondition
   selfDealtDamageThisTurn from TurnLog.sourceDamage); "you and defending player each draw a card, then discard a card
   ... if you discarded the card with the greatest mana value among those cards or tied for greatest" (Cait, Cage
   Brawler); "each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put
   that many +1/+1 counters" (Augusta, Order Returned: Count yardChosenThisWay, reflexive CR 603.12); "sacrifice any
   number of artifacts. When you sacrifice one or more artifacts this way, tap up to that many target creatures and
   draw that many cards" (Nyssa of Traken); "At the beginning of combat on each player's turn ... target creature that
   player controls" (Kitt Kanto, Mayhem Diva: trigger eachBeginCombat with the event player); "choose a creature you
   control, then draw cards equal to its total toxic value" (Goliath Hatchery: Count toxicValue, CR 702.164b); "As ~
   enters, discard any number of creature cards. It enters with a flying counter on it if a card discarded this way has
   flying. The same is true for ..." (Indominus Rex, Alpha: enters choice discardKeywords, a pickPermanents "discard"
   prompt with a browser test, CR 614.12 and 122.1b); "Reveal up to five nonland cards from your hand. For each of
   those cards that has the same mana value as another card revealed this way, create a Treasure" (Vault 21: House
   Gambit, Count revealedSharedMv); "Whenever players finish voting, each opponent who voted for a choice you voted for
   ... the number of opponents who voted for a choice you didn't vote for" (Erestor of the Council: trigger
   playersFinishVoting, PlayerRef votedWithYou, Count opponentsVotedOtherwise). +11 (28,949 of 31,936 with B71-B74).
   Round 239 (top of the list, now done): "If ~ is saddled, each opponent loses that much life instead" (Caustic
   Bronco: revealTopToHand life.instead, saddled read through last known information, CR 702.171b); "When you discard
   a card this way, target player mills cards equal to its mana value" (The Ancient One: a reflexive mill, CR 603.12);
   "Choose land or nonland. Reveal cards ... until you reveal a card of the chosen kind" (Abundant Harvest: choice
   landOrNonland, a Land / Nonland prompt with a browser test); "you may sacrifice a creature. If you do, look at the
   top X cards ..., where X is that creature's mana value" (Industrial Advancement); "At the beginning of your first
   main phase, you may discard two cards. If you do, return ~ from your graveyard" (Old One Eye: yourFirstMain from the
   graveyard); "If a creature an opponent controls attacks, all creatures that opponent controls attack if able" (War's
   Toll: an attack requirement checked at declaration, CR 508.1d, and the bot attacks with everything once it attacks);
   "Spells your opponents cast that target you or a permanent you control cost {2} more" (Monastery Siege's Dragons,
   CR 601.2f); "Equip costs {X} less ..., where X is the power of the creature it targets" (Belt of Giant Strength);
   "cost {X} less to activate, where X is Agatha's power" (Agatha of the Vile Cauldron, CR 602.2b); "Spells you cast
   this turn that are white and/or blue (black and/or red) cost {X} less, where X is the amount of life you gained
   (lost) this turn" (Will and Rowan, Scion of ...: X fixed as the ability resolves, per the rulings); "you may cast
   it without paying its mana cost if the spell's mana value is less than the number of Mountains you control"
   (Solstice Revelations); "Whenever ~ deals combat damage to one or more players, exile up to that many target cards
   from their graveyard" (Froghemoth: eventX); "creatures attacking your opponents and/or planeswalkers they control"
   (Roar of Resistance: combat filter attackingOpponentOrTheirPlaneswalker); "You may spend mana as though it were mana
   of any color to cast planeswalker spells" (Oath of Nissa, CR 609.4b). +15 (28,964 of 31,936 with B71-B74).
   Out after round 239 (looked at, not done): Omnath, Locus of All ("If you would lose unspent mana, that mana becomes
   black instead", and a reveal by the count of colored mana symbols); Benevolent Blessing (protection that doesn't
   remove your own Auras and Equipment already attached, an exception to CR 702.16); Scion of the Ur-Dragon (becomes a copy of a card in
   your graveyard until end of turn); Sidisi, Regent of the Mire (done in round
   266); Undead Alchemist (combat damage replaced by a mill, and a trigger that exiles the milled card).
   Round 240 (top of the list, now done): "Until end of turn, you may look at the top card of your library any time,
   and you may play lands and cast spells from the top of your library" (The Belligerent); "All Forests and all
   Saprolings are 1/1 green Saproling creatures and Forest lands in addition to their other types" (Life and Limb,
   layers 4, 5 and 7b); "You may pay eight {E} rather than pay the mana cost for permanent spells you cast" (Nissa,
   Worldsoul Speaker: alternative cost energyForSpell with additional cost payEnergy, X is 0, CR 118.9 and 107.3g; a
   "Cast it: pay 8 energy" button with a browser test); "Creature cards in your graveyard gain "You may cast this card
   from your graveyard" until end of turn" (Case of the Uneaten Feast: grantFlashback cast, browser test); "enter as a
   copy ..., except it's legendary and snow ... and, if it's a creature, it enters with two additional +1/+1 counters
   on it and has changeling" (Moritte of the Frost: CopyExcept snow, keywordsIfCreature, enterCounters n); "its power
   and toughness are equal to this creature's power and toughness" (Hulking Metamorph: CopyExcept ptOwn, prototyped
   3/3 included; a copy of a prototyped permanent now keeps the copied prototype values, CR 718.3d); "Return target
   creature card from an opponent's graveyard to the battlefield under their control with a duty counter on it. For as
   long as that creature has a duty counter on it, it is goaded, can't attack you ... and can't block creatures you
   control" (Immortal Obligation: alsoModsWhileCounter); "look at that many cards ... You may put one of them into your
   hand. Then put any number of land cards from among them onto the battlefield tapped and the rest into your
   graveyard" (Choco, Seeker of Paradise); "Sacrifice X Zombies, then reveal cards ... until you reveal a number of
   Zombie creature cards equal to the number of Zombies sacrificed this way" (Empty the Laboratory); "When this
   creature is exiled from the battlefield while you're activating a craft ability" (Market Gnome: trigger
   selfExiledCrafting, CR 702.167a). +10 (29,042 of 31,936 with B71-B77).
   Round 241 (top of the list, now done): "unattach ~, then transform it" (Elbrus, the Binding Blade); "target creature
   that crewed it this turn explores" (Subterranean Schooner); "a Treasure token for each creature that crewed it this
   turn" and "Crew 1. Activate only once each turn." (Luxurious Locomotive: Count crewedSource, gone crewers too); "you
   may return any number of creatures that saddled it this turn" (Rambling Possum); "at end of combat, exile it and up to
   one creature that saddled it this turn, then return those cards" (Fortune, Loyal Steed: flicker withSelf); "if an
   Assassin crewed it this turn" (Adrestia: TurnLog.crewedTypes, the crewers' subtypes as they were tapped); "you may have
   target opponent gain control of target permanent you control. When you do, ..." (Iroh, Tea Master; bots give only a
   noncreature token); a ninjutsu-shaped hand ability for an unblocked Rogue, attacking whom you choose (Zareth San, the
   Trickster: ninjutsu chooseDefender, CR 508.4; browser test); "must be blocked by an Eldrazi / a Dalek if able"
   (Slayer's Cleaver, Ace's Baseball Bat: mustBeBlocked by, CR 509.1c, in blockRequirementProblem and the bot's blocks);
   "attach any number of target Equipment you control to target creature you control. When one or more Equipment become
   attached to that creature this way, ..." (Thorin, Mountain-king: reflexive about.attachedThisWay; expandMany no
   longer rewrites a reflexive trigger's own target references). +11 (29,053 of 31,936 with B71-B77).
   Round 242 (top of the list, now done): "you may pay {X}. When you do, put any number of target creature cards with
   total mana value X or less from that player's graveyard onto the battlefield under your control" (Fire Lord Sozin:
   the reflexive body's own X); "return any number of artifact creature cards with total mana value 6 or less"
   (Technomancer) and "up to three target creature cards with total mana value 8 or less ... They're artifacts" (The
   War in Heaven III); "Whenever you discover, discover again for the same value" (Curator of Sun's Creation: trigger
   youDiscover, event discovered); "Whenever you activate an ability that targets a creature or player, copy that
   ability" (Ertha Jo, Frontier Mentor: activates targetsCreatureOrPlayer); "that player copies that spell for each other
   creature they control" (Mirrorwing Dragon: copySpell eachOther casterControls, the caster's creatures and copies,
   rulings); a Room "that doesn't have the same name as a Room you control" (Central Elevator: unlocked doors' names
   only, rulings), "eight or more different names among unlocked doors" (Promising Stairs: Count unlockedDoors names),
   "Spend this mana only to cast Room spells and unlock doors" (Smoky Lounge: ManaSpend unlockDoors, ManaUse unlock);
   The Hunger Tide Rises IV (sacrifice any number of creatures, then a creature card with mana value up to that many
   from the library and/or graveyard); "For each color pair, choose a card that's exactly those colors from among them"
   (Niv-Mizzet Reborn: a dig with oneOfEach, as many as there are pairs among the ten); "Suspend X—{X}{3}{U}. X can't be
   0." (Aeon Chronicler, Benalish Commander, Detritivore, Fungal Behemoth: suspend x, the X picker in the hand menu,
   browser test; the bot tries X from 4 down) and "Whenever a time counter is removed from this card while it's exiled"
   (also Dinosaurs on a Spaceship: trigger selfTimeCounterRemovedExiled, from suspend's upkeep trigger and time travel),
   "When the last time counter is removed from this card while it's exiled" (Veiling Oddity). +16 (29,069 of 31,936 with
   B71-B77).
   Round 244 (top of the list, now done): Aura tokens with abilities of their own (CR 111.4, 303.7), "create a red Aura
   enchantment token named Mark of the Rani attached to another target creature. That token has enchant creature and
   "..."" (The Rani, Scriv, the Obligator, Preston Garvey, Minuteman, Estrid, the Masked's −1 with umbra armor, Smoke
   Spirits' Aid "for each of up to X target creatures"; not created if it can't be attached, rulings; bots aim the
   harmful ones at opponents' creatures); Estrid's −7 (non-Aura enchantments, then Auras, which may enchant them);
   "Whenever a goaded creature deals combat damage to one of your opponents" (The Rani); "if it's attacking one of your
   opponents. Otherwise, ..." (Scriv's Contract); "effects from spells named Flame Burst count it as a card named Flame
   Burst" (Pardic Firecat, Diligent Farmhand: CompiledCard.countsAsNamed); "Creatures that share a color / a creature
   type with equipped creature get +1/+1" (Konda's Banner: Affects sharesWithAttached, compared in layer 7c); Primal
   Prayers (creature spells with mana value 3 or less for {E}, with flash only that way; browser test); Summoner's
   Grimoire ("If that card is an enchantment card, it enters tapped and attacking": putFromHand onlyIf); Avatar Destiny
   (the Aura back to hand and up to one milled creature card); Lifeline (another creature on the battlefield, the card
   back at the next end step). +12 (29,128 of 31,936 with B78+B79).
   Round 245 (top of the list, now done): "When ~ enters, search your library for up to X basic land cards, where X is
   the number of Shrines you control" (Kyoshi Island Plaza: the Traverse the Outlands rewrite in a triggered ability);
   "~ costs {1} less to cast for each creature card you own in exile and in your graveyard" (Huskburster Swarm: face-up
   ones in exile); "Spells you cast cost {1} less to cast for each card with the same name as that spell in your
   graveyard" (Locket of Yesterdays: CostMod perSameNameInGraveyard, the spell not counting itself, rulings); "return two
   creature cards at random from your graveyard to the battlefield" (Moldgraf Monstrosity: together); "choose one at
   random. Create a red and white creature token with those characteristics. • 3/1 Human Warrior ..." (Outlaws'
   Merriment: each mode creates that token); "Manifest dread X times, then put X +1/+1 counters on each of those
   creatures" (Valgavoth's Onslaught: repeat `gather`); "untap those creatures and they get an additional +2/+2" (Motivated
   Pony); "You may play up to two of those cards until the end of your next turn" (March of Reckless Joy: impulse
   oneOfMax); "the greatest power among creatures you control that entered this turn" (Alena, Kessig Trapper); "You may
   cast the first creature spell you cast each turn as though it had flash" and "Whenever a nontoken creature you control
   enters during combat" (The Blue Spirit); "for each card your opponents own in exile" and "target opponent exiles cards
   from the top of their library until they exile a land card" (Umbris, Fear Manifest); "Whenever one or more nontoken
   creatures attack this turn, create that many ... tapped and attacking" (Basri Ket's −2); "If an artifact or creature
   spell is countered this way, put that card onto the battlefield under your control instead" (Desertion); "Choose
   target creature you don't control. Each creature you control deals damage equal to its power to that creature"
   (Kamahl's Will). +14 (29,142 of 31,936 with B78+B79; 29,176 with B80+B81).
   Round 246 (earlier rounds' skip lists, from the top: everything near the top of the list had been looked at): "~
   costs {U}{U}{U} less to cast if an opponent has drawn four or more cards this turn" (Even the Score); "~ has flash as
   long as you control a Desert" on a permanent (Colossal Rattlewurm: flashIf for the spell plus the keyword on the
   battlefield); "You can't play lands" (Aggressive Mining: CompiledCard.youCantPlayLands); "for each other Zombie you
   control and each Zombie card in your graveyard" (Unbreathing Horde); "target permanent not named ~" (Clever Conjurer);
   "loses all landwalk abilities" (Hammerheim: removeKeywords "Landwalk"); "When ~ dies, if it dealt combat damage to a
   player this turn" (Wave of Rats: TriggeredAbility.ifDealtCombatDamage); "End the combat phase" (Mandate of Peace:
   Effect endCombatPhase, game.ts endTheCombatPhase, CR 724.2; bots cast it only against an attack on them); "if you
   controlled a Faerie / a modified creature / a Mount as you cast this spell" (Faerie Fencing, Flame Discharge, Steer
   Clear: SpellCondition amountNow on an asCast count); "Destroy all creatures and all permanents attached to creatures"
   (End Hostilities); "Prevent all combat damage that would be dealt by creatures other than target creature this turn"
   (Terrifying Presence: DamageRule by.notTarget); "the artifact's mana value" (Viashino Heretic); "Sacrifice any number of
   creatures. ~ deals that much damage to any target" (Last-Ditch Effort) and "Sacrifice any number of artifacts,
   creatures, and/or lands. Draw a card for each permanent sacrificed this way" (Reprocess); "a creature of their choice
   other than enchanted creature" (Sporogenic Infection: pickOptions honors notSourceHost); "That Vehicle" in a mode of
   an attack trigger (Kitsune Ace). +18 (29,194 of 31,936 with B80+B81).
   Round 247 (earlier rounds' skip lists, from the top): "All permanents are enchantments in addition to their other
   types" (Enchanted Evening, CR 205.1b); the untap symbol {Q} in a mana ability (Pili-Pala: ManaAbility.untapSelf) and an
   activated ability (Puresight Merrow, "You may exile that card" after looking at the top card), not while untapped or
   summoning sick (CR 107.6, 302.6); "target card that has an Adventure" (Edgewall Inn); a target creature card plus "up
   to one target Cleric, Rogue, Warrior, or Wizard creature card" (Thwart the Grave); "and each other nonland permanent
   with the same mana value as that permanent" (Mists of Lórien: ObjRef target sameMv); "You win the game if you control a
   land of each basic land type and a creature of each color" (Coalition Victory); "return it ... under its owner's
   control at the beginning of their next upkeep" (Phytotitan: delayed when ownersNextUpkeep); "When this Aura leaves the
   battlefield, enchanted permanent's controller sacrifices it" (Reality Acid; also Parasitic Implant's "enchanted
   creature's controller sacrifices it"; a leaves-the-battlefield trigger now finds what its source was attached to as it
   left, CR 603.10a); Ravener's "target creature attacks target opponent this turn if able"; "if a permanent was put into
   your hand from the battlefield this turn" (Barrin, Tolarian Archmage: TurnLog.permanentToHand); "Whenever one or more
   -1/-1 counters are put on a creature" (Wickersmith's Tools); "all cards in your graveyard that you cycled or discarded
   this turn" (Shadow of the Grave: TargetSpec.discardedThisTurn); "Creatures that were blocked by that creature this
   combat" (Ride Down: blockHistory thisCombat); "... named Humble Merchant" (Honest Work); "Exile all other spells and
   counter all abilities" (Summary Dismissal: Effect dismissStack; bots only cast it when none of the stack is theirs);
   "When a player other than this creature's owner controls it, that player sacrifices it" (Bronze Bombshell, a state
   trigger, CR 603.8). +18 (29,227 of 31,936 with B82; 29,244 with B83).
   Round 248 (the top of the list and earlier skip lists): "Whenever you tap an untapped creature an opponent controls"
   (Hylda of the Icy Crown, Solitary Sanctuary, Icewrought Sentry; Sharae of Numbing Depths' "one or more ... This ability
   triggers only once each turn"): TriggeredAbility.tappedByYou, only a tap a spell or ability had its controller do
   (tapPermanent's `by`; rulings: not an opponent tapping their own creature, not a cost); "Counter all spells your
   opponents control and all abilities your opponents control. Create a ... token for each spell and ability countered
   this way" (Glen Elendra's Answer: Effect counterOpponentsStack, Count stackCounteredThisWay; bots cast it only in
   response to an opponent's spell); "that player flips a coin. If they lose the flip, counter that spell" (Planar Chaos:
   flipCoin `who`); "Whenever a Sliver deals damage, its controller gains that much life" (Essence Sliver: event
   permanentDealsDamage, anyone's Sliver); forage as an instruction, "you may forage. If you do / When you do" (Bushy
   Bodyguard, Treetop Sentries, Curious Forager; Effect either `forage`, the way chosen as it resolves among those that can
   be done fully) and "Whenever you forage" (Corpseberry Cultivator: event youForage, from forage costs too); "Whenever a
   creature you control deals combat damage to a player or planeswalker this turn" (Flitterwing Nuisance); "Then you may
   pay one or more {E}. If you do, put that many +1/+1 counters on ~" (Rampaging Aetherhood); "... and isn't a Human"
   (Werewolf Pack Leader: loseTypes of a creature type). +14 (29,241 of 31,936; 29,277 with B83 and B84).
   Round 249 (the top of the list and earlier skip lists): "a third of their life/cards/creatures/lands, rounded up"
   (Pox: loseLife, discard and sacrifice `third`); "that attacking player creates a tapped ... token named ... that's
   attacking that opponent" (Ellie, Brick Master); "for each player who discarded a card this turn" (Azula, Ruthless
   Firebender: Count players discardedThisTurn); "reveal cards from the top of your library until you reveal a nonland card
   with mana value 3 or greater. Exile that card with three time counters on it. If it doesn't have suspend, it gains
   suspend" (Sibylline Soothsayer: exileUntilNonland untilMvAtLeast); "Put that card onto the battlefield and the rest on the bottom" after revealing until (Nissa, Leyline
   Tamer); "each player who controls fewer lands than the player who controls the most lands searches their library for a
   number of basic land cards less than or equal to the difference" (Scholarship Sponsor: Count behindMost, search
   perPlayerN; one who isn't behind doesn't search or shuffle); "You may attach
   an Equipment you control to that creature. If you do, unattach it at the beginning of the next end step" (Unexpected
   Request: delayed unattach for each attachedThisWay); "you and target opponent each secretly choose a creature that
   player controls" (Malik, Grim Manipulator: Effect secretChoose, a pickPermanents `secret` prompt, then both revealed
   and sacrificed); "If you would draw a card while your library has no cards in it, instead put five +1/+1 counters on
   ~" and "Discard three cards with different names" as a cost (Ormos, Archive Keeper: CompiledCard.drawEmptyCounters,
   discard cost differentNames, checked in the UI's cost picker); "that player chooses a permanent card in your graveyard,
   then you put it onto the battlefield under your control" (Neyam Shai Murad: chooseFromGraveyard `chooser`). +10
   (29,268 of 31,936 with B83; 29,303 with B84 and B85).
   Round 250 (the top of the list and earlier skip lists): "You may cast it without paying its mana cost" for a card
   cast from "a graveyard" with "If that spell would be put into a graveyard, exile it instead" only as the rider says
   (Impulsivity); "Exile target card with mana value X from a graveyard" in a reflexive "When you do" after paying X
   (Halo Forager); "target opponent chooses ... You return that card to the battlefield with an additional +1/+1 counter
   on it. The creature is a Vampire in addition to its other types" (Drana, the Last Bloodchief: chooseFromGraveyard with
   counters and alsoMods); "you may pay an amount of {E} equal to that card's mana value. If you do, return it" (Jolted
   Awake); "a spell with equal or lesser mana value from your hand" (Reinterpret); "Create Tamiyo's Notebook, a legendary
   colorless Book artifact token with ..." (Tamiyo, Compleated Sage: a token named with the card's own name stays a name);
   "Each player may discard a card. Each player who doesn't loses N life" (The Death of Gwen Stacy); "if you didn't play
   a card from exile this turn" (Visions of Phyrexia: StaticCondition playedFromExile, TurnLog.playedFromExile); damage
   "equal to the number of counters on ~ to target player and that much damage to up to one target creature" (Dragonspark
   Reactor); "you may have ~'s base power become equal to that creature's power" (Belligerent Yearling; the bot only does
   it when that's bigger); "Each player with fewer cards in hand than the player with the most cards in hand draws cards
   equal to the difference" (Tales of the Ancestors: Count behindMost hand, counted before anyone draws); "you may pay
   one or more {E}. When you do, ~ deals that much damage to each other creature" (Territorial Aetherkite); "Exile a
   creature with the greatest power among creatures target opponent controls" (Fall of the Impostor). +13
   (29,281 of 31,936; 29,332 with B84 to B86).
   Round 251 (the top of the list and earlier skip lists): "Until end of turn, that creature gets +2/+0, gains trample if
   it's red, and gains vigilance if it's white" (Aurelia, Exemplar of Justice: the colors checked once as it resolves);
   "look at the top four cards of your library, then put up to two of them back on top of your library in any order and
   the rest into your graveyard" gated on "If this spell was bargained" (Rowan's Grim Search: dig into libraryTop, then
   an order-the-top prompt, with a browser test); "When you cast this spell, if {C} was spent to cast it" (Drowner of
   Truth: ifSpent on cast triggers, {C} as colorless); "exile the top card of your library. Target opponent loses life
   equal to its mana value. If it's an instant or sorcery card, you may cast it without paying its mana cost" (Hidetsugu
   and Kairi); "cast an instant or sorcery spell with mana value X or less from among them" after milling (Summons of
   Saruman); "For each opponent who controlled a creature returned this way, you create two ..." (Faerie Slumber Party:
   Count opponentsReturnedFrom, tokens included); "exile cards ... until you exile a nonland card, then put that card into
   your hand. If the card's mana value is 4 or greater, repeat this process. ~ deals 1 damage to you for each card put
   into your hand this way" (Demonlord Belzenlok: exileUntilNonland hitToHand with repeatMvAtLeast, the damage dealt once
   at the end, per the rulings); "land and/or legendary permanent cards with mana value X or less" (Kamahl's Druidic
   Vow); "If this spell was kicked, instead search your library for a basic land card and a Shrine card" (Aang's
   Journey); a target "with mana value X or less ... where X is the amount of mana spent to cast this creature" (Astelli
   Reclaimer: X is the mana actually spent, so 3 with warp and 0 if it wasn't cast). +10
   (29,342 of 31,936 with B84 to B86).
   Round 252 (the top of the list and earlier skip lists): "mill X cards. Put up to X creature cards milled this way onto
   the battlefield face down under your control as 2/2 Cyberman artifact creatures" (The Cyber-Controller: a face-down
   Cyberman kind); "each opponent exiles their graveyard ... put all creature cards exiled with ~ onto the battlefield
   under your control as face-down 2/2 Cyberman artifact creatures" (Death in Heaven: exiles from two chapters linked);
   "if defending player has more cards in hand than you, exile the top card of their library. During any turn you
   attacked with a Rogue, you may cast that card and you may spend mana as though it were mana of any color" (Robber of
   the Rich); "you may cast it until the end of your next turn ... if you put a lore counter on a Saga you control this
   turn" (Summon: Brynhildr: TurnLog.lorePut); "During your turn, you may cast cards exiled with ~ and you may cast them
   as though they had flash. Mana of any type can be spent to cast those spells" (Azula, Cunning Usurper: the nontoken
   permanent and the graveyard card both linked); "copy up to one target Assassin card or card with freerunning from your
   graveyard. You may cast the copy by paying its mana cost" (Jacob Frye: a paid castFromAmong); "exile the top card of
   that player's library. Then you may sacrifice another creature or artifact. If you do, until end of turn you may play
   that card ... any type" (Reno and Rude); "exile all cards from all opponents' graveyards. You may cast a nonland card
   exiled this way for as long as it remains exiled" (Author of Shadows: a choose-one prompt, with browser tests for it
   and Jacob Frye). +8 (29,350 of 31,936 with B84 to B86).
   Round 253 (the top of the list): "You may cast this card from your graveyard using its mutate ability" (Brokkos, Apex of
   Forever: only for its mutate cost, rulings); "exile cards ... until you exile a nonland permanent card. Put that card
   onto the battlefield or into your hand" (Illuna, Apex of Wishes: an artifact land doesn't stop it, the choice made after
   seeing the card, with a browser test); "until you reveal a nonlegendary, nonland card with mana value 3 or less" and
   "untap each creature you control, then tap any number of creatures you control" (Plargg, Dean of Chaos // Augusta, Dean
   of Order; bots tap only their attackers); "you may put it on the bottom of its owner's library. If you do, reveal cards
   ... until you reveal a nonland card. You may cast that card without paying its mana cost" (Neera, Wild Mage: the spell
   that triggered it, not countered, with a browser test); "that player loses the game if the Ring has tempted you four or
   more times this game. Otherwise, the Ring tempts you." granted by Frodo, Sauron's Bane; "As long as an artifact creature
   you control is attacking, prevent all damage that would be dealt to ~" and "You may cast a Vehicle or artifact creature
   spell from among them" paying its costs (Sanwell, Avenger Ace); "return ~ to the battlefield tapped under your control.
   She's a land named Moon" (Princess Yue: a legendary land with its other abilities); "for each card you've discarded this
   turn, create a token that's a copy of ~, except the token isn't legendary" (Living Laser); "For each mana from a Desert
   spent to cast this spell" (Cataclysmic Prospecting: mana from a Desert is tracked like mana from a Treasure). +9 (29,359
   of 31,936 with B84 to B86).
   Round 254 (the top of the list and earlier skip lists): "During your turn, you may cast a spell from among cards in
   your graveyard that were milled this turn. Do this only once each turn" (Raul, Trouble Shooter: a card put there
   without a mill doesn't count, rulings); "put target creature card in a graveyard that was milled this turn onto the
   battlefield under your control. It's a green Mutant with base power and toughness 3/3" (The Master, Transcendent);
   "rather than pay {2} for each previous time you've cast it from the command zone this game, pay 2 life that many
   times" (Liesa, Shroud of Dusk: the command zone and the cast prompt show the tax in life, with a browser test; CR
   903.8); "Choose one of them. You may play that card this turn" (Chandra, Flameshaper's +2); "put a creature card
   with mana value less than or equal to the number of lands you control onto the battlefield from your hand or
   graveyard with two +1/+1 counters on it" (Nissa of Shadowed Boughs); "Instant and sorcery cards in your graveyard
   have retrace" as an emblem (Wrenn and Six); "Treasures you control are Equipment in addition to their other types
   and have 'Equipped creature gets +2/+0,' 'Equip Pirate {1},' and 'Equip {3}'" (Gemcutter Buccaneer: equip with a
   creature type, with a browser test); "You may cast ~ from your graveyard, but not from anywhere else" and Knight
   spells from your graveyard (Haakon, Stromgald Scourge: not from the command zone either, rulings); "exile target
   spell an opponent controls ... you may cast the exiled card without paying its mana cost" (Smirking Spelljacker:
   the exiled card is linked to the enters ability, CR 607.2a). +9 (29,407 of 31,936 with B84 to B89).
   Round 255 (the top of the list and earlier skip lists): "+1: Add {R}. ~ deals 1 damage to up to one target player or
   planeswalker", "If it's red, you may cast it this turn", "You may cast red spells from among them this turn" and an
   emblem dealing the mana spent on a red spell (Chandra, Dressed to Kill: either face of a red card, rulings); an emblem
   with "Whenever a card is put into your graveyard from anywhere, you may return it to your hand" (Tamiyo, the Moon Sage:
   emblems watch "each card" batch triggers now); "At the end of the first combat phase on your turn, untap target
   creature you control. After this phase, there is an additional combat phase" as an emblem (Zariel, Archduke of
   Avernus); "When you next cast a creature spell this turn, search your library for a creature card with lesser mana
   value" (Vivien, Monsters' Advocate: less than the spell's mana value as cast); "Reveal target face-down permanent. If
   it's a creature card, you may turn it face up" (Hauntwoods Shrieker, with a browser test); "face-up nontoken creatures
   you control" (Whisperwood Elemental); "Sacrifice a land: Add one mana of any type the sacrificed land could produce"
   (Squandered Resources: the sacrificed land's mana abilities as it last existed, {C} included, a choice when there are
   two or more types, with a browser test); "Spend this mana only to cast spells from exile" (Interdimensional Web Watch);
   "You may play target Elemental card from your graveyard without paying its mana cost" (Horde of Notions: no land card
   is an Elemental, so it's always a cast as it resolves); "Whenever ~ enters or a planeswalker you control dies" and
   "Planeswalkers' loyalty abilities you activate cost an additional [+1] to activate" (Carth the Lion: a [−2] costs [−1],
   so it can be activated with one loyalty, rulings; CR 606.6). +10 (29,417 of 31,936 with B84 to B89; 29,427 with B90).
   Round 256 (the top of the list): a legendary card's two-word name with an accented letter, "Dáin" for "Dáin Ironfoot"
   (CR 201.5c), and "create a colorless Equipment artifact token named Axe ... When you do, attach it to target creature
   you control" (the token made, attached as the reflexive ability resolves); "exile the top card of that player's
   library. If it's a permanent card, you may put it onto the battlefield under your control. If you don't, create a 1/1
   blue Fish creature token" (Fishing Gear, with a browser test); "That land becomes a 0/0 green and blue Fractal creature
   that's still a land. Put a +1/+1 counter on it for each land you had enter the battlefield under your control this
   turn" (Emergent Sequence: the land found counts, rulings); "Until end of turn, you may cast spells from your hand
   without paying their mana costs" (Chandra, Flame's Catalyst: Omniscience's alternative cost as a rule for the turn,
   with a browser test); "Until end of turn, creatures you control gain 'You may have this creature assign its combat
   damage as though it weren't blocked'" (Garruk, Savage Herald: those you control as it resolves); "Cast any number of
   red instant and/or sorcery cards from your graveyard without paying their mana costs" (Chandra Ablaze, with a browser
   test); "When this creature dies or is put into exile" granted by Kaya the Inexorable's +1, and her emblem's "you may
   cast a legendary spell from your hand, from your graveyard, or from among cards you own in exile without paying its
   mana cost" (legendary as the spell cast; a face-down card only if you may look at it, rulings; with a browser test);
   "up to two land cards that each have a basic land type" (Slimefoot's Survey); "target opponent takes an extra turn
   after this one. Until your next turn, you and planeswalkers you control gain protection from that player" (Eon
   Frolicker); "Counters remain on ~ as it moves to any zone other than a player's hand or library" (Skullbriar, the
   Walking Grave and Me, the Immortal: only with the ability in the zone it leaves, rulings). +11 (29,428 of 31,936 with
   B84 to B89; 29,438 with B90).
   Round 257 (the top of the list): "Target opponent reveals the top five cards of their library. You may cast an instant
   or sorcery spell from among them without paying its mana cost. Then that player puts the rest into their graveyard"
   with mastery's "cast up to two" (Talent of the Telepath: the count of instants and sorceries in your graveyard as it
   resolves); "For each nonland permanent, choose a player at random. Then each player gains control of each permanent
   for which they were chosen. Untap those permanents" (Scrambleverse); "any number of creature and/or Vehicle cards with
   different powers" (Rip, Spawn Hunter, with a browser test); "Each player may exile their hand and draw a number of
   cards equal to the amount of {E} paid this way. If seven or more {E} was paid this way, you may play cards you own
   exiled this way until the end of your next turn" (Wheel of Potential);
   "Choose a player at random. That player exiles an instant or sorcery card from their graveyard. Copy that card. You may
   cast the copy without paying its mana cost" (Wildfire Devils: the chosen player picks, with a browser test); "For each
   permanent destroyed this way, its controller reveals cards ... until an artifact or creature card is revealed and
   exiles that card. Those players put the exiled cards onto the battlefield, then shuffle" (Indomitable Creativity: the
   hits enter at the same time, APNAP reveals, CR 101.4); "Reveal the cards in your library. An opponent chooses from
   among them a creature card, a land card, and a noncreature, nonland card" (Guided Passage: that opponent picks, with a
   browser test); "choose a card in your hand. That player guesses whether the card's mana value is greater than 4. If
   the player guessed wrong, you may cast the card without paying its mana cost" (Master of Predicaments, with two browser
   tests); "Reveal the top five cards of your library. Put one of them into your hand. Then choose an opponent. They put one
   on the bottom of your library. Then you put one into your hand ..." (Memories Returning, with a browser test). +9 (29,447 of 31,936); 29,461 with B91).
   Round 258 (skipped cards from the top of the list): "Roll a d10. Put target artifact, creature, or planeswalker into
   its owner's library just beneath the top X cards of that library, where X is the result" (Underdark Rift); "for each
   opponent, choose a nonland permanent that player controls. Destroy one of them chosen at random" (Chaos Defiler: you
   choose, none targeted, one without indestructible if any, with a browser test); "Choose any number of target creature
   and/or planeswalker cards in graveyards. ~ deals damage to you equal to the total mana value of those cards. Put them
   onto the battlefield under your control" (Command the Dreadhorde: the damage first; bots keep the total well below
   their life); "For each player, you choose a creature that player controls. Then each player sacrifices all other
   creatures they control that don't share a creature type with the chosen creature they control" (Winnowing: changelings
   share every type, with a browser test); "search your library for up to five land cards that have different names,
   exile them" and "choose a card at random exiled with ~ and put it onto the battlefield tapped" (Omenpath Journey);
   "Return a creature card from your graveyard to the battlefield, then return another creature card from your graveyard
   to your hand" (Blood for Bones); "Flip a coin until you lose a flip or choose to stop flipping. If you lose a flip, ~
   has no effect. If you win one or more flips, ..." (Fiery Gambit: asked after each flip won, with a browser test). +7
   (29,468 of 31,936 with B91).
   Round 259 (skipped cards from the top of the list): "As long as another player controls enchanted creature, it can't
   attack or block. Otherwise, ~ has umbra armor" (Dog Umbra: checked continuously); "if three or more cards have been
   exiled with ~, sacrifice it. If you do, return those cards to the battlefield under their owner's control" (Colfenor's
   Urn: every card it ever exiled counts, only those still in exile return, with a browser test); "Earthbend 3. Then each
   creature you control with power less than or equal to that land's power gains ..." (Earthshape); "any player may pay
   half their life, rounded up. If a player does, counter ~" (Temporal Extortion: a punisher option, bots keep their
   life, with two browser tests); "Creatures can't attack planeswalkers you control unless their controller pays {1} for
   each creature they control that's attacking a planeswalker you control" (Onakke Oathkeeper); "roll a d20 for each
   player being attacked and ignore all but the highest roll" (Iron Mastiff); "If ~ was cast from exile, for each
   opponent, choose an artifact or land that player controls. Destroy the chosen permanents" (Ultimate Magic: Meteor,
   with a browser test); "Return target creature card and all other cards with the same name as that card from your
   graveyard to the battlefield tapped" (Rat King, Verminister); "When ~ dies this turn, return it to the battlefield
   transformed under your control" (Golden Guardian; bots don't use it yet). +9 (29,477 of 31,936; 29,491 with B92).
   Round 260 (cards from the top of the list not looked at before): "Reveal cards ... until you reveal a nonland permanent
   card. You may put that card onto the battlefield. Then put all cards revealed this way that weren't put onto the
   battlefield on the bottom of your library in a random order" (Genesis Storm: declined, or an Aura with nothing to
   enchant, it goes to the bottom too, with a browser test); "If its mana value is less than or equal to the number of
   lands you control, put it onto the battlefield. Otherwise, put it into your hand" after revealing until a creature card
   (Part in Friendship, X as 0); "you may exile another target attacking creature you control. If you do, reveal cards
   ... Put that card onto the battlefield tapped and attacking ..." (Fireflux Squad); "If ~ was bargained, put the
   revealed cards onto the battlefield. Otherwise, put the revealed cards into your hand" (Thunderous Debut); "Exile an
   instant or sorcery card with mana value 3 or less from your graveyard at random. You may cast it without paying its
   mana cost. If that spell would be put into a graveyard, exile it instead" (Storm of Memories); "exile three cards at
   random from your graveyard. Choose a noncreature, nonland card from among them and copy it. You may cast the copy"
   (Capricious Hellraiser); "you may cast an instant or sorcery spell with mana value less than or equal to the number of
   Spirits you control from a graveyard without paying its mana cost" (Spectral Arcanist: any graveyard, with a browser
   test); "When that creature dies this turn, exile a number of cards from the top of your library equal to its power,
   then choose a card exiled this way. Until the end of your next turn, you may play that card" (End-Blaze Epiphany: its
   power as it last existed); "Put up to two noncreature artifact cards with total mana value less than or equal to the
   sacrificed artifact's mana value from among them onto the battlefield" (Smelting Vat, with a browser test). +9 (29,486
   of 31,936; 29,500 with B92). Round 261 fixed the rules gap it saw: a dies trigger's "its power" (Stalking Vengeance,
   End-Blaze Epiphany's delayed trigger) is the creature's last known power on the battlefield also once the card has left
   the graveyard before the trigger resolves (CR 603.10a, 608.2h, 113.7a), not the card's printed power.
   Round 261 (top of the list): "you may return one of them to its owner's hand. If you do, you may activate loyalty
   abilities of ~ twice this turn rather than only once" (Kaito, Dancing Shadow: TurnRule loyaltyTwice about the object,
   twice at most, with a browser test); "As ~ enters, you may exile two creature cards from graveyards. If you do, it enters
   as a copy of one of those cards with ... +1/+1 counters ... equal to the power of the other card" (The Mimeoplasm:
   entersAsCopy exileTwo, the second pick a new "copyOther" prompt, with a browser test); "~'s owner shuffles it into their
   library. If that player does, they reveal cards ... until a card named ~ is revealed ..." (Mirror-Mad Phantasm:
   PlayerRef sourceOwner, SpellCondition shuffledInThisWay, the card's printed name for a granted copy of the ability;
   bots never activate it). +3 (29,503 of 31,936; 29,515 with B93).
   Round 262 (top of the list, from the "Out" lists): "When its power becomes 20 this way, it deals 20 damage to any
   target" (Inferno of the Star Mounts: the pump notes ~'s power first, SpellCondition powerBecame, a reflexive trigger
   whose target is chosen only then); "if it had two or more +1/+1 counters on it, create a token that's a copy of it at
   the beginning of the next end step. The token enters with half that many +1/+1 counters on it, rounded down" (Ochre
   Jelly: TriggeredAbility.ifHadCounterMin, createTokenCopy lkiCopy, the copy and the counters taken from last known
   information as the delayed trigger is made); "As long as ~ is attached to a creature, you don't lose the game for
   having 0 or less life" and "draw a card and reveal it. The creature gets +X/+X ... and you lose X life" (Pact Weapon:
   noZeroLifeLossAttached, X 0 if the draw was replaced); "Whenever that creature deals combat damage this turn, you may
   exile it. If you do, return it to the battlefield under its owner's control" (Long River Lurker: a floating trigger
   about the target, the creature its subject). +4 (29,507 of 31,936; 29,519 with B93).
   Round 263 fixed the two rules gaps round 262 saw (delayed triggers work on their own once made, CR 603.7): a token's
   "When ~ dies, ... at the beginning of the next end step" makes its delayed trigger though the token has ceased to
   exist (CR 704.5d, 111.7; run-spells "delayed", the ability's card definition its source), and a floating trigger whose
   token source is gone still triggers (triggers.ts fromFloating stands in the object it was, a new object, so none of its
   own "self" events match). Then from the top: "Look at the top X cards of your library, where X is ... You may cast a
   spell with mana value 3 or less (less than X) from among them without paying its mana cost" (Perception Bobblehead,
   Kiora, Sovereign of the Deep; CAST_TRIGGER now takes "a Kraken, Leviathan, Octopus, or Serpent spell from your hand");
   "As long as you have 0 or less life, all damage is dealt to you as though its source had infect" (Phyrexian Unlife:
   CompiledCard.damageAsInfectAtZero, damage dealt at the same time all as the player was before any of it, rulings);
   "Whenever ~ attacks a player who controls eight or more lands, ... onto the battlefield tapped and attacking that
   player" (Owlbear Cub: TriggeredAbility.attacksPlayerLands, dig attackingEvent); "you may cast a permanent spell with
   equal or lesser mana value from your hand without paying its mana cost" in a cast trigger (Kellan, the Kid: the
   triggering spell's mana value with its X, rulings). +5 (29,524 of 31,936 with B93; 29,539 with B94).
   Round 264 added the event round 263 lacked: counters removed from a permanent, for any reason, as one event per kind
   (counters.ts countersRemoved, fired by every removal: effects, costs, loyalty costs, damage to planeswalkers and
   battles, the damage shields, stun and shield counters, +1/+1 and -1/-1 counters cancelling out, CR 704.5q, counters
   moved off it, CR 122.5; leaving the battlefield removes none, CR 122.2; damage dealt at the same time removes them in
   one event, batchCountersRemoved). With it: "Whenever a +1/+1 counter is removed from ~" (Protean Hydra, once for each
   counter, rulings; its "If damage would be dealt to ~, prevent that damage and remove that many +1/+1 counters from it"
   is counterShield "always", all of it prevented even with none on it) and "Whenever one or more loyalty counters are
   removed from ~, she deals that much damage to target opponent or planeswalker" (Chandra, Fire Artisan: combat damage
   from several creatures at once triggers her once, rulings). Then from the top: "Whenever an opponent casts a spell, if
   ~ is suspended, remove a time counter from it" (Deep-Sea Kraken: StaticCondition selfSuspended, CR 702.62b, cast
   triggers of cards in exile, CR 113.6); "..., then give each player a rad counter for each +1/+1 counter removed this
   way" (Bloatfly Swarm: counterShieldRad, unpreventable damage too, rulings); "Whenever a creature you control dies or is
   put into the command zone, if it had one or more +1/+1 counters on it, you may put that many +1/+1 counters on target
   creature" (Reyhan, Last of the Abzan: a commander put into the command zone instead of its library, CR 903.9b; one
   that died and then went there, CR 903.9a, triggers it once); "For each spell and ability your opponents control,
   counter it unless its controller pays {4}" (Whirlwind Denial: each opponent asked in turn order from the active player,
   then all not paid for countered at once, rulings; bots cast it only when the caster can't pay); "Remove any number of
   counters from among permanents on the battlefield. You draw cards and lose life equal to the number of counters removed
   this way" (Eventide's Shadow: gatherCounters without `onto`, one counter at a time, with a browser test). +7 (29,546 of
   31,936).
   Out after round 264 (looked at, not done): Regenerations Restored (its trigger now parses, but "Then if ~ has no time
   counters on it, exile it. When you do, take an extra turn" needs a reflexive trigger after a mandatory exile, and its
   order against vanishing's own trigger on the last counter matters); Magma Pummeler ("When one or more counters are
   removed from ~ this way": a reflexive trigger from inside the damage shield); Pardic Dragon ("that player may put a
   time counter on ~": another player's "may" about a card in exile), Nihilith and Curse of the Cabal (other "if ~ is
   suspended" triggers: a card put into a graveyard, each player's upkeep); Greater Gargadon (an activated ability of a
   card in exile: none can be activated there yet, for the engine, bots or the UI).
   Round 265 made permanents tapped at the same time one event (game.ts batchTaps: the attackers declared together, CR
   508.1f; one cost's taps, CR 601.2h, 602.2b; one instruction's, CR 608.2c; a mana ability's its own, CR 605.3a), for
   "Whenever one or more nontoken Merfolk you control become tapped" (Deeproot Pilgrimage, once for creatures tapped
   together, rulings) and "Whenever one or more creatures you control become tapped" (Rewrite History). Then from the
   top: "Choose target creature. Whenever that creature is dealt damage this turn, it deals that much damage to each other
   creature and each player" (Arcbond: a delayed trigger about that creature, lethal damage too, the creature the source
   as it last existed, rulings); "you get that many additional upkeep steps after this phase" (Obeka, Splitter of Seconds:
   added beginning phases with only an upkeep step, GameState.upkeepPhase, untap and draw skipped, rulings); "Whenever ~
   becomes untapped during your untap step, you get an additional upkeep step after this step" (The Ninth Doctor: after
   the upkeep its trigger resolves in, rulings); everything counters (Omo, Queen of Vesuva: every land type with the
   basic types' mana abilities, CR 205.3i, 305.6; nonland creatures every creature type); "Whenever a player loses the
   game, if they were attacked this turn by an Assassin you controlled, you win the game" (Ramses, Assassin Lord:
   Player.attackedWith.to, players only, the attacker's types as it was declared, rulings). +7 (29,553 of 31,936; 29,563 with B95).
   Round 266 went back over earlier skips from the top. "~ deals damage equal to the excess to any target other than that
   permanent" (Toralf, God of Fury: excess noncombat damage, CR 120.4a, 120.10, rulings) and "Equipped creature ... it's
   legendary" (Toralf's Hammer; its granted ability was already modeled); "Whenever one or more Devils you control attack
   one or more players, you and those players each draw a card, then discard a card at random" (Zurzoth, Chaos Rider:
   attacks on planeswalkers and battles don't count, CR 508.3e, players in APNAP order); Ward—Blight 2 (Auntie Ool,
   Cursewretch: pay by putting two -1/-1 counters on a creature you control, CR 701.68a-b, unpayable with no creature,
   with a browser test) and "put a -1/-1 counter on it if you control it. If you don't control it, ..."; "target nonland
   permanent controlled by a player who was dealt combat damage by three or more Pirates this turn" (Admiral Beckett
   Brass: TurnLog.combatDamagedByTypes, the source's types as it dealt the damage); "attacks a player chosen at random
   it didn't attack during your last combat" (Territorial Hellkite: Player.combatsBegun, GameObject.attackedInCombat,
   tapped when no player can be chosen, rulings); "exile any number of nontoken artifacts and/or creatures you control.
   Return those cards ... at the beginning of your next upkeep" (Nahiri's Resolve, with a browser test); "Sacrifice a
   creature you control with mana value X other than ~: Return target creature card with mana value X plus 1" (Sidisi,
   Regent of the Mire: X announced and bound by the sacrifice, CR 107.3a, 602.2b; bots trade their least useful creature
   for a bigger card; with a browser test). +7 (29,560 of 31,936; 29,570 with B95).
   Out after round 266 (looked at, not done): Moxite Refinery ("Remove X counters from an artifact or creature you
   control": X counters of any kinds from one permanent, a cost the counter picker can't limit to one permanent yet).
   Out after round 265 (looked at, not done): Undead Alchemist and Szadek, Lord of Secrets ("If a Zombie you control
   would deal combat damage to a player, instead that player mills that many cards": a replacement, not a prevention,
   so it applies to damage that can't be prevented and the player orders it with the damage shields, CR 616.1; the
   damage rules only prevent or redirect yet); The Ninth Doctor's trigger resolving outside an upkeep (an upkeep skipped
   by Eon Hub) adds nothing.
   Out after round 263 (looked at, not done): Protean Hydra (done in round 264).
   Out after round 262 (looked at, not done): Dragon's Fire ("reveal a Dragon card from your hand or choose a Dragon you
   control" as an additional cost, the damage that card's or creature's power: a new cast-time choice for the UI and bots,
   and the chosen Dragon's last known power); Soul Immolation (blight X as an additional cost, X capped by the greatest
   toughness among your creatures: putCounter costs have no X yet).
   Out after round 261 (looked at, not done): Doors of Durin (a "may reveal the top card" whose creature card enters tapped
   and attacking, then trample and hexproof by the Dwarves and Elves you control as it resolves: putOntoBattlefield has no
   attacking option and no conditional keyword grant yet); Falco Spara, Pactweaver (casting from the top of your library
   with "remove a counter from a creature you control" as an additional cost: a cost choice for the cast, the autopay and
   bots); Master of the Wild Hunt (each tapped Wolf deals damage, then the target's controller divides its damage among those
   Wolves as it resolves); Secret of Bloodbending (controlling another player); Harold and Bob, First Numens (returns as an
   Aura with a granted mana ability). Burning-Rune Demon and Moonlit Meditation still out, as before.
   Out after round 260 (looked at, not done): Mirror-Mad Phantasm (done in round 261); Over
   the Top (each player reveals cards equal to their nonland permanents and all permanent cards revealed enter at once);
   Terminal Velocity (a permanent put from your hand gains a leaves-the-battlefield trigger and an end-step sacrifice);
   Hurkyl, Master Wizard (one revealed card for each card type among noncreature spells you cast this turn); Hew the
   Entwood (sacrifice any number of lands as it resolves, then reveal that many and pick artifact and land cards, nonland
   ones entering first); Coin of Fate (an opponent chooses which of the two cards exiled as a cost goes to the bottom).
   Out after round 259 (looked at, not done): Requiem Monolith (a granted "whenever this creature is dealt damage" trigger
   and "that creature's controller may have ~ deal 1 damage to it"); Sorceress's Schemes (a target that is either a card
   in your graveyard or an exiled card with flashback: exile targets aren't supported); Reyhan, Last of the Abzan ("or is
   put into the command zone", with "if it had one or more +1/+1 counters on it"); Red Sun's Twilight (token copies of
   the artifacts destroyed this way, as they last existed); Hellish Rebuke (a trigger granted to every opponent's
   permanent about the player who cast it); Whirlwind Denial (one payment prompt per spell and ability) still out.
   Out after round 258 (looked at, not done): Green Sun's Twilight ("Choose a creature card and/or a land card from among
   them": at least one if there is one, and with X 5 or more both onto the battlefield or both into your hand; the dig
   has no "at least one" pick yet); Canoptek Wraith ("you may pay {3} and sacrifice it. If you do, choose a land you
   control. Then search ... basic land cards which have the same name as the chosen land"); Stiltzkin, Moogle Merchant and
   Discerning Financier still out (giving a permanent away: no bot sense for it).
   Out after round 257 (looked at, not done): Vaevictis Asmadi, the Dire and Guff Rewrites History (one target for each
   player: no per-player target spec yet); Thieves' Auction (players draft exiled cards one by one until all are chosen);
   Deceiver of Form (your other creatures become copies of the revealed card until end of turn); Monk Class (level 3 grants
   an exiled card a cast-from-exile ability tied to another spell this turn); Sen Triplets (you play from an opponent's
   hand, which is revealed, while they can't cast or activate); Breath of Fury (the Aura moves after its creature is
   sacrificed, then an extra combat); Gollum, Scheming Guide (an opponent guesses land or nonland about your top card, then
   Gollum is removed from combat); Elrond of the White Council (secret council votes, then you gain control of the creatures
   chosen); Reverse the Sands (redistribute life totals).
   Out after round 256 (looked at, not done): Scrap Welder ("Sacrifice an artifact with mana value X" as a cost, X set by
   the artifact sacrificed and the target's mana value less than it: no sacrifice cost with a mana value X yet, in the
   engine, the bot or the app); Lynde, Cheerful Tormentor (a Curse returned "attached to you", then moved to an opponent);
   Supper for Spiders (cards that become Food artifacts losing their other card types and subtypes but keeping their
   abilities); Nahiri, the Unforgiving ("attacks a player each combat if able" until your next turn); Cherished Hatchling
   (Dinosaur spells cast this turn gain an enters-and-fight ability); Heirloom Epic and Crashing Wave (tap creatures, or
   artifacts and creatures, to pay generic mana of an ability's or a waterbend cost).
   Out after round 255 (looked at, not done): Benevolent Blessing (protection that doesn't remove Auras and Equipment
   already attached when the effect began: no record of what was attached then); Overgrown Zealot (mana spendable only to
   turn permanents face up: no ManaUse for a turn-face-up cost).
   Out after round 253 (looked at, not done): Altaïr Ibn-La'Ahad (tokens entering attacking that copy each exiled card with
   a memory counter); Arna Kennerüd, Skycaptain (token copies of the Auras and Equipment attached to a creature, entering
   attached to it); Imodane, the Pyrohammer ("an instant or sorcery spell you control that targets only a single creature
   deals damage to that creature": no damage event tells a spell's single target yet); Ziatora's Envoy ("You may play a
   land from the top of your library" as the trigger resolves, a land play of its own, or a free spell with mana value up
   to the damage dealt); Mizzix, Replica Rider (a copy of a permanent spell that gains haste and an end-step sacrifice);
   Donal, Herald of Wings (a copy of a creature spell "except the copy is a 1/1 Spirit", once each turn); Leonardo da Vinci
   (a token copy of the discarded card "except it's a 0/2 Thopter artifact creature with flying"); Optimus Prime, Hero //
   Autobot Leader ("The chosen creature" after bolster, and a delayed convert when it deals combat damage).
   Out after round 252 (looked at, not done): Cybership (the top two cards of a library, lands included, put onto the
   battlefield face down as Cybermen: needs a library-top face-down put); Kaervek, the Punisher ("You may cast the copy.
   If you do, you lose 2 life": the paid copy is there now, the "if you do" after casting a copy isn't; Nashi, Moon's
   Legacy would follow); Ob Nixilis, the Adversary (casualty X: the copy's starting loyalty from the chosen X);
   Mysterious Stranger and Zethi, Arcane Blademaster (a variable number of targets per graveyard / per kick).
   Out after round 251 (looked at, not done): Ill-Timed Explosion ("you may discard two cards. When you do": no ruling on
   whether you can do it with fewer than two cards in hand, as with Thrilling Discovery).
   Out after round 250 (looked at, not done): Owlbear Cub ("attacks a player who controls eight or more lands" and a
   look-at put "tapped and attacking that player"); Pact Weapon ("draw a card and reveal it", the X lost if the draw is
   replaced, rulings); Long River Lurker (a floating "whenever that creature deals combat damage this turn" on the
   target); Olivia, Crimson Bride (the returned creature gains a leaves condition on legendary Vampires, as before);
   Horrid Shadowspinner (discard "that many", its power when you chose to draw, rulings); Rampaging War Mammoth (the X
   from the cycling cost, as before); Soul Diviner (a counter of any kind removed as a cost); Ironscale Hydra (a
   prevention that puts a counter for each creature's damage prevented); Professor Hojo (the first activated ability that
   targets a creature you control).
   Out after round 249 (looked at, not done): The Eleventh Hour (a copy with a new name: the copied text's self-references
   and the rulings' loss of non-Alien subtypes); Stitcher Geralf ("exile up to two creature cards put into graveyards
   this way" and their total power); Aragorn, Company Leader ("if you chose a creature other than ~ as your Ring-bearer"
   and "one of each of those kinds of counters"); Fervent Mastery ("If the {2}{R}{R} cost was paid": which alternative
   cost was paid, and an opponent discarding any number then drawing that many); Plunge into Darkness ("Pay any amount of
   life, then look at that many cards" inside an entwined mode); Lukka, Coppercoat Outcast (cards exiled this way gaining
   "You may cast ~ from exile as long as you control a Lukka planeswalker").
   Out after round 248 (looked at, not done): Unidentified Hovership ("the exiled card's owner manifests dread": each
   owner of the linked exiled cards, rulings, and manifest dread for a player who isn't its controller); Plague Reaver
   ("Return ~ to the battlefield under that player's control at the beginning of their next upkeep": no instruction yet
   puts a card onto the battlefield under another player's control, and bots have no sense for giving it away);
   Osteomancer Adept (casting creature spells from your graveyard by foraging); Tangle Wire ("that player taps an untapped
   artifact, creature, or land they control for each fade counter": that player's choice of that many).
   Out after round 247 (looked at, not done): Hushbringer (see round 156); Endless Detour ("target spell, nonland
   permanent, or card in a graveyard": one target across three zones); Jaws, Relentless Predator ("Whenever one or more
   ... are sacrificed or destroyed": no event for that pair); Wall of Shards (cumulative upkeep "an opponent gains 1
   life", an opponent chosen for each age counter); Night Soil ("Exile two creature cards
   from a single graveyard": a cost that needs a picker over every graveyard); Pull from Eternity ("target face-up card in
   exile": no exile-card targets yet).
   Out after round 246 (looked at, not done): Dauntless Bodyguard ("As ~ enters, choose another creature you control" and
   "the chosen creature": no choice of a permanent as something enters yet, and it needs a prompt); Urborg ("loses first
   strike or swampwalk", one of the two chosen as it resolves, rulings); Consume Spirit ("Spend only black mana on X":
   autopay has no restriction on the mana for X); Catastrophe ("Destroy all lands or all creatures", chosen as it
   resolves); Muraganda Petroglyphs ("creatures with no abilities", a layer dependency on ability-adding effects).
   Out after round 245 (looked at, not done): Back for Seconds (bargained: one of the returned target cards onto the
   battlefield instead of into the hand, chosen as it resolves); World War Hulk (chapter I's "the next red or green
   creature spell you cast this turn can be cast without paying its mana cost" and chapter III's doubled power and
   toughness); Jace, Architect of Thought (+1 needs an "until your next turn" attack trigger for opponents' creatures,
   −8 a search of every library and casting the cards); Rat King, Verminister ("and all other cards with the same name as
   that card"); Noctis, Heir Apparent (its "enters during combat" line now compiles; Warp-Strike's return at that player's
   next declare attackers step doesn't).
   Out after round 244 (looked at, not done): Reed Richards, Smartest Man ("the first time you would draw a card each
   turn except the first in your draw step, draw four instead": needs a place among the draw replacements the player
   orders, CR 616.1); The First Tyrannic War I ("if its mana cost contains {X}": a copy's cost counts, rulings, and the
   counters must be there as it enters); Daretti, Ingenious Iconoclast's −6 (a target that's an artifact card in a
   graveyard or an artifact on the battlefield); Vault 101: Birthday Party (put an Aura or Equipment from hand or
   graveyard, then may attach the Equipment); Expedited Inheritance ("its controller may exile that many cards ... They may
   play those cards": an impulse for another player, counting the damage); Obscuring Aether (turning a permanent without
   morph face down); Abandoned Sarcophagus (casting cards with cycling from the graveyard, and "it wasn't cycled").
   Out after round 243 (looked at, not done): Discerning Financier and Stiltzkin, Moogle Merchant ("choose another
   player. That player gains control of target Treasure you control": a player chosen, not targeted, and no bot sense
   for giving permanents away yet); Silverquill, the Disputant (granted casualty 1: with a spell's printed casualty that's
   two instances, each paid separately, CR 702.153b, and one payment per spell is all there is); Blood for Bones (a
   battlefield return then "another" to the hand, as before).
   Out after round 242 (looked at, not done): Frontline Heroism (the copy must target the token it created; with a
   token doubler its controller picks which, CR 707.10e); Optimus Prime, Autobot Leader ("the chosen creature" after
   bolster, and a floating "when that creature deals combat damage this turn"); The War Doctor (phasing out and exile
   batch triggers); Saving Grace (redirecting damage to itself); Volcanic Offering (a target an opponent chooses);
   Riftmarked Knight (the token its suspend makes, with flanking and protection from white); Roiling Horror (its
   characteristic-defining P/T counts a life difference); Watcher of Hours ("you remove a time counter", a choice of
   which); Jaya's Phoenix and Repeated Reverberation (copy the next loyalty ability); Coveted Falcon, Shadow Kin, Arna
   Kennerüd, Confusion in the Ranks, Imodane, Mavinda, Manascape Refractor, Cass, Bronzehide Lion, Ria Ivor and
   Fabrication Foundry (looked at, not done this round).
   Out after round 241 (looked at, not done): Nuka-Nuke Launcher ("until the end of defending player's next turn, that
   player gets two rad counters whenever they cast a spell": a floating trigger lasting until another player's turn
   ends); Psionic Ritual, Exterminate! and Reiterating Bolt (replicate with a cost that isn't mana, paid any number of
   times); Nacatl War-Pride and Gorm the Great ("must be blocked by exactly one creature" / "by two or more creatures if
   able": requirements on the number of blockers); Calamity, Galloping Inferno (token copies of the creatures that saddled
   it, chosen one by one).
   Out after round 240 (looked at, not done): Geyadrone Dihada (protection from permanents with corruption counters
   on them: the protection quality would need the source's counters); Altar of the Wretched and The Enigma Jewel (their
   back faces don't parse yet); Huatli, Poet of Unity (chapter II grants a static that works in layer 6, which granted
   statics don't support); Nethergoyf and Winter, Cynical Opportunist (exile any number of cards with four or more card types
   among them: a picker constraint on the cost); Repeated Reverberation (copy the next instant or sorcery spell OR the
   next loyalty ability, as before); Jon Irenicus, Shattered One and Strago and Relm (looked at,
   several new pieces each).
   Out after round 238 (looked at, not done): Storm Cauldron (a land tapped for mana returns to hand mid-payment);
   Tomik, Distinguished Advokist (lands in graveyards can't be targeted by opponents, can't be played from graveyards);
   Monstrous Emergence (an additional cost of choosing a creature or revealing one); Rootweaver Druid (each opponent
   searches, one land under your control); Quest for Ula's Temple (a may-reveal of a looked-at card); Arlinn, the
   Pack's Hope (+1 "until your next turn" flash plus an extra counter on each creature entering); Rootcoil Creeper
   (mana only for spells from your graveyard, a flashback card returned from exile); Whiskervale Forerunner (put it
   onto the battlefield only on your turn); Deification (choose a planeswalker type, loyalty-damage replacement);
   Anafenza, the Foremost (exile instead of an opponent's graveyard, including cards not on the battlefield); Herald
   of Leshrac and Burning-Rune Demon (as before).
   Out after round 237 (looked at, not done): Burning-Rune Demon ("search for exactly two cards ... with different
   names": no ruling on finding just one); Herald of Leshrac, Vault 21, Whiskervale Forerunner, Rootweaver Druid,
   Galadriel, Elven-Queen, Erestor, King of the Oathbreakers, Deification, Indominus Rex, Protean Raider, Anafenza the
   Foremost, Goliath Hatchery (other lines, not started).
   Out after round 236 (looked at, not done): Ochre Jelly (a token copy, at the next end step, that enters with half
   the dead creature's +1/+1 counters).
   Out after round 235 (looked at, not done): Deeproot Pilgrimage (done in round 265); Zurzoth, Chaos Rider (done in
   round 266); Clockspinning (choose a counter kind on a permanent or suspended card);
   Radiant Lotus (sacrifice one or more artifacts, another player adds the
   mana).
   Out after round 234 (looked at, not done): Monument to Perfection (Lane B round B71 has it); Rowan Kenrith (its +2's
   "each creature target player controls attacks you during that player's next turn if able" and the emblem copying
   activated abilities); Brutal Hordechief (you choose how opponents' creatures block); Sudden Substitution (exchange
   control of a spell and a creature); Lobelia, Defender of Bag End (exile the top card of each opponent's library face
   down, play them free); Spinerock Tyrant (copies that gain wither); Curse of Echoes (each other player may copy the
   spell); Sovereigns of Lost Alara (an Aura that could enchant that creature); Durnan of the Yawning Portal (cast it
   with undaunted).
   Out after round 233 (looked at, not done): Invisible Woman, Sue Storm (counters put on several creatures at once as one
   trigger); Sorceress's Schemes (target a card in exile that has flashback); Cursecloth Wrappings (embalm granted to a
   graveyard card); Oblivious Bookworm (a creature that entered face down or was turned face up this turn); Cait, Cage
   Brawler; Augusta, Order Returned; Vault 101: Birthday Party; The First Tyrannic War; Kitt Kanto;
   Daretti, Ingenious Iconoclast (its −6); Expedited Inheritance; Monstrous Emergence; Nyssa of Traken.
   Out after round 231 (looked at, not done): Ecstatic Beauty ("put four time counters on each of those cards that
   has suspend": counters on the impulsed cards that already have suspend, without granting it); Knowledge Vault
   ("{0}: Sacrifice ~. If you do, discard your hand, then ..." and its leaves trigger putting the cards into the
   graveyard); Yurlok of Scorch Thrash (mana burn, "each player adds {B}{R}{G}"); Tomik, Distinguished Advokist; Storm
   Cauldron; Arlinn, the Pack's Hope; The Temporal Anchor; Chandra, Fire of Kaladesh; Panoptic Mirror; Crafty
   Cutpurse; Hydro-Man; Rootcoil Creeper; Zuko, Conflicted; Runo Stromkirk; Rootpath Purifier; Enduring Angel (not
   started; next candidates).
   Next most played: the unsupported ones from the top of `npm run popular` (most played first; Lane B takes them from
   the bottom); the harder ones
   from ranks 10,640 to 13,222 (above); the harder ones from ranks 10,060 to
   10,640: Emerald Dragon, Portent of Calamity, Keen-Eyed Curator, The Foretold Soldier, Radiant Scrollwielder, Become Anonymous, Night Soil, Overabundance, Avalanche of Sector
   7, Grappling Hook, Otrimi, Zhao, Donal, Iroh, Garth One-Eye, Angrath, the Flame-Chained, Identity
   Thief, Mishra, Eminent One, Spell Queller, Goblin Charbelcher, Lucky Clover, Mistbind Clique; and the harder ones above it: Conqueror's Galleon, Grub, Storied Matriarch,
   Taskmaster, Mercenary Mimic, Gideon Blackblade, Kolvori, God of Kinship, Fisher's Talent, Niko, Light of Hope,
   Stick Together, Activated Sleeper, Taii Wakeen, Perfect Shot, Angel's Trumpet, Summoner's Sending, Urianger
   Augurelt, Quintorius, Loremaster, Quantum Riddler, Model of Unity, The Flood of Mars, Sigarda's Vanguard, Master of
   the Wild Hunt, Audacious Reshapers, Kiora, Sovereign of the Deep, Quest for
   Ula's Temple; the ones skipped in rounds 182, 181, 180, 179, 178, 177 and 176 (above); the ones skipped in round 175: Detention Sphere, Tangle Wire,
   Steward of the Harvest, Agent's Toolkit, Heroes in a Half Shell, Ran and
   Shaw, Unstable Glyphbridge, From the Catacombs, Loki,
   God of Mischief, Katsumasa, the Animator, Slagstone Refinery, Inalla, Archmage Ritualist, Threats Undetected,
   Leader, Super-Genius; the ones skipped since round 173: Radagast the Brown, Quicksilver Elemental, Secret of
   Bloodbending, Chiss-Goria, Forge Tyrant, Molecule Man, Confiscation Coup, Zoyowa Lava-Tongue, Role Reversal, Craig Boone, Novac Guard, Spelltwine, Ultimate Magic: Meteor, Spectral Searchlight, Rat King,
   Verminister; and from before round 172: Grindstone, Moritte of the
   Frost, Reyhan, Last of the Abzan, Herigast, Erupting Nullkite, Mazemind Tome, Asmodeus the Archfiend, Temporal
   Extortion, Hot Pursuit, Reidane, God of the Worthy, Long River Lurker, Psychic Paper,
   Dream-Thief's Bandana, Chandra, Legacy of Fire, Theoretical Duplication,
   Calamity, Galloping Inferno, Sam, Loyal Attendant, Crystalline Giant,
   Kaervek, the Punisher, Obsessive Pursuit,
   Iron Man, Titan of Innovation, Gornog, the Red Reaper, Fire Lord Zuko, Realm of Koh,
   Mercurial Spelldancer, Vraska, the Silencer, Vren, the Relentless, The Mycotyrant, Lifecraft
   Engine, Agatha of the Vile Cauldron, The Ancient One, Erdwal Illuminator, Sigarda, Host of
   Herons, Shelob, Dread Weaver, Price of Glory, Roar of Resistance, Heartless Conscription, Bloatfly Swarm, War's
   Toll, Quintorius Kand, Aminatou, Veil Piercer, Arcbond (done in round 265), Rot Hulk, Thieving Amalgam.
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
   choice of a +1/+1 counter or ..." with "up to one" target still asks which when no target was chosen. Smaller gaps from round 132: bots choose Selective Obliteration's color by the worth of their own one-color
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
   never forages for mana (on purpose: what to forage is the player's choice; bots do); forage as an instruction and
   "whenever you forage" came in round 248;
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
   Suit, Brass Herald, Vigean Intuition, Sages of the Anima and Serra's Emissary (kindred) are
   still out.
   Smaller gaps from round 114: "target player adds two mana in any combination
   of colors" (another player adding it) is out; Quicksilver Fountain (each player floods a land of
   their choice) and Eluge (a cost reduction for each flooded land) are out; Cemetery Illuminator and the other "look at the top card, you may cast it if ..." cards are
   out; Lozhan ("any target that isn't a commander") is out; Moxite Refinery (Remove X counters as a cost) and Subversive
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
   Treasurer; Eivor and Sludge Titan ("and/or" after a mill); Brightflame,
   Spiteful Repossession; an exile ability that can't be told apart from the card's other exiles keeps the card out
   ("returns exiled cards it can't link"); bots casting Pitiless Carnage may sacrifice nothing; the bot removing chosen
   counters takes helpful kinds off others' permanents and harmful ones off its own, and never plays around time or
   lore counters. Smaller gaps from round 100: Muck Drubb ("a spell that targets only a single creature"); Forge Anew's free equip only for equip costs that are all mana, and always taken when it
   applies; Kambal copies only the tokens still on the battlefield as its trigger resolves; two grants of "Toxic 1" may
   count once; K'rrik gives no explicit choice to pay life with lands untapped (autopay prefers mana); Notion Thief's
   order against the player's own draw replacements, and several Thieves at once; Trostani Discordant, Not of This
   World; Webstrike Elite and Rampaging War Mammoth (an X from the cycling cost in their targets); the other "you may
   pay {X}. When you do" cards (Isareth, Rose Room Treasurer, Tester of the Tangential); "can't attack
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
   Plans whose other lines are out (Claim the Kingdom, Political Triumph, Robot Domination; Rewrite History done in round 265). Who puts
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
   and Karn, Living Legacy emblems, Karn, Scion of Urza, Toralf (done in round 266), Death Kiss, Burning-Rune Demon, Emergent Ultimatum,
   Ecological Appreciation. Bots never exile a Spirit Guide from their hand for mana (the player can, from the
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
   - Excess damage still out: Vikya ({Q} costs); Toralf done in round 266.
   - "It" in a cast trigger is the spell only as the first instruction ("Whenever you cast an Elf spell, it gains
     haste"); "untap ~. It gains ..." (Pristine Skywise, Bloodsky Berserker) is about the permanent and isn't parsed.
   - Tap any number still out: as an additional cost (Burn at the Stake, Explosive Singularity), "each player may tap"
     (Raiding Party), "If you do, ... each of those Vampires" (Urge to Feed). Bots tap every creature offered except,
     on their own turn before combat, ones that could still attack.
   - "With different names" still out: Emergent Ultimatum and Ecological Appreciation (an opponent chooses cards to
     shuffle back, then casting or putting the rest), Burning-Rune Demon ("exactly two cards ... that have different
     names"). Discard costs with different names came in round 249 (Ormos).
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
     your untap step" (The Ninth Doctor, done in round 265).
   Left from the round after backgrounds (the last five Backgrounds, kinship with last-known types, Leaf-Crowned Elder,
   Adeline's planeswalker choice, tempting offers, airbend and "its owner may cast it" exiles, Nalfeshnee):
   - Granted myriad's tokens still attack the player only, not a planeswalker.
   - Tempting offers: each accepting player's part runs one after the other, not at the same time (it matters only
     with triggers that care about batches). Their choices stay open and in turn order (CR 101.4b, Tempt rulings), not
     hidden like Show and Tell's. Bots always accept: accepting never leaves a bot behind the other opponents, and the
     offerer gets only what the bot also gets. Still out: Tempt with Discovery ("who searches a library this way"),
     Tempt with Mayhem (copies), Braids, Fandaniel, The Second Doctor ("who doesn't"), Step Between Worlds and
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
     name into your hand" (Desperate Research, Wood Sage, Tamiyo), the chosen card
     from a revealed hand (Lobotomy, Shimian Specter, Pick the Brain, Reap Intellect), Deadly Cover-Up, Deicide ("if the
     exiled card is a God card"), Invasive Surgery, Kotose, "look at an opponent's hand, then choose any card name"
     (Sorcerous Spyglass, Anointed Peacekeeper), Alpine Moon, Skyseer's Chariot, Cheering Fanatic, Null Chamber, Booby
     Trap, Petrified Hamlet, names another player chooses (Conundrum Sphinx, Petra Sphinx, Vexing Arcanix), random
     cards from an opponent's hand (Dementia Sliver, Nebuchadnezzar), Mindblaze, Liar's Pendulum, Lammastide
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
   - Punishers still out: Possessed Portal (its punisher parses since round 212; its draw replacement doesn't), "another nonland permanent" (Torment of Venom),
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
     (Squee, the Immortal), "if a creature not named ~ died this turn"
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
   - Dies-return still out: Not Dead After All, Vincent's Limit Break.
   - Several cards from among the top ones: "with total mana value N or less" (Ao, Michelangelo's Technique, Smelting
     Vat), two destinations in one sentence (Bounty of Skemfar, Wakanda Forever!), "tapped and attacking" (Arthur, Jet,
     Owlbear Cub), "where X is" in the look (Ajani Outland Chaperone, Famished Worldsire, Emergent Woodwurm), the X
     of an enters or cast trigger (Knickknack Ouphe, Genesis Hydra), exiled top cards (Xenagos, Tezzeret), "that many
     cards" (Gishath), "If you put fewer than two lands" (Expand the Sphere), "When a creature is put onto the battlefield this way" (Vivien's Invocation, Gilgamesh).
   - "Can't be the target of" still out: "unless it attacked or blocked this turn" (Lurker), "can't be enchanted by other
     Auras" (Anti-Magic Aura), Wall of Shadows.
   Left from the snow-mana rounds (snow mana, mana that remembers its source, "was spent", sacrifice the rest):
   - Autopay doesn't try to spend mana from creatures for Inga and Esika, or a single color for Steel Exemplar.
   - Snow: all 45 legal {S} cards are supported. Mana Reflection and Nyxbloom Ancient multiply mana as a replacement
     effect while a {T} mana ability resolves (CR 106.12b); changes of type (Contamination, Infernal Darkness) since round
     B92; a color of the player's choice instead (Pulse of Llanowar) is still out.
   - "Each player chooses ..., then sacrifices the rest" still out: Natural Balance, Promise of Loyalty's vow counters,
     Stick Together's party, Single Combat's "can't cast creature or planeswalker spells until the end of your next
     turn".
   - "Return a creature card from your graveyard to the battlefield" (chosen, not targeted) works, also for each player
     (Exhume, Crypt Champion); still out: Infernal Offering (its other part), "at random"
     (Tomb Tyrant), "with total mana value N or less" (Lively Dirge), "where X is ..." outside a
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
     (Sapling of Colfenor, Baneful Omen), "repeat this process" (Countryside Crusher), casting it
     (Descendants' Path, Jadzi), several "If it's" lines (Druidic Satchel).
   - "Target X and all other Xs with the same name as that X" works on the battlefield; still out: cards in a graveyard
     (Echoing Return, Rat King), "not named ~" (Detention Sphere), Legion's End's "exiles all cards with that name from
     their hand". (Splinter, Eradicate, Scour, Sowing Salt and Crumble to Dust work since the card names round; The End
     is out on its cost line.)
   Left from the round after suspect (outlaws, conditional flash, discover X, keyword choices):
   - Discover still out: "you may tap two untapped artifacts and/or creatures you control. If you do, discover 3"
     (Caparocti Sunborn), "the mana value of the exiled card" (Ellie and Alan). "If you cast it" works on enters triggers only (The One Ring's protection is out).
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
   - Free casts from hand still out: "mana value 1 or 2", "shares a card type" (Counterlash), "where X is ..." (Gandalf, Party Guest, Epistolary Librarian), "once
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
     suspend and time counters (Kang Prime), Neera.
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
     casting from revealed library cards (Sunbird's Invocation), Eldritch Evolution, Rally the
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
     named B" works for a library search (Alpine Houndmaster); Agency Outfitter ("graveyard, hand and/or library") is done in round B71.
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
     "all but N", "can't be prevented"; the affected player orders them with shields, CR 616.1); still out: Neriv
     (mana value of the source), Bitter Feud, Desperate Gambit and Forcefield (next-time doubling on a chosen or
     unblocked source), Quest for Pure Flame, Taii Wakeen, Goblin Goliath and Jeska (other lines), Rankle and Torbran
     (a "player or battle" trigger), the Ajani emblem, Lightning Surge, Arrow Storm, Banefire and Demonfire
     (conditional "can't be prevented"), Flames of the Blood Hand, Volcano Hellion, and prevention with extra effects
     (Nine Lives, Swans of Bryn Argoll, Mindskinner, Hostility, Weeping Angel, Ironscale Hydra). A replacement applies
     to all of one source's damage to one recipient at once, so one order per recipient. Bots' attacks and blocks count
     doublers, halvers and prevention.
   - Coin flips (CR 705) work for "If you win / lose the flip", "until you lose a flip" and "whenever you win a coin
     flip" (25 cards); still out: Krark's Thumb, Edgar's "come up heads" (705.3), heads or tails (Odds // Ends, Mana
     Clash, Two-Headed Giant, Rakdos the Showstopper, Molten Sentry), a flip for each (Mutalith Vortex Beast, Fighting
     Chance), Fiery Gambit, Game of Chaos, Squee's Revenge, Crooked Scales, Krark the Thumbless, and lines
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
   - Reflexive triggers still out: "pay {X}. When you do" (Isareth, Numa, Rose Room Treasurer); "remove a counter from" any kind (Slumbering
     Walker); "exile N cards from your graveyard. When you do" (Kroxa, Young Necromancer, Kishla Trawlers); Wick's
     Patrol ("the greatest mana value among cards in your graveyard");
     Red Hulk, Ziatora, Tiger-Tribe Hunter, Surtland Flinger, Bolg, Edgar's Awakening, Leyline Tyrant ("any
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
     Henrika, Kargan, Parapet Thrasher, Sol'Kanar, Survivor's Med Kit, Teval's Judgment, Fantastic Four, Zuko.
   Left from the round after Seasons (lists of targets, Vivid, Gates/Deserts/Caves, counts):
   - Lists of targets under one verb work for destroy, exile, tap, untap and return to hand; still out: lists returning
     to the battlefield (they enter at the same time), and "it" or
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
     that made the source leave, not mid-instruction. Still out: Calix, Push the Limit, Mount/Vehicle groups.
   - Auras that transform: Lignify (the Kindred type), Witness Protection (a new name), Frozen in Ice
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
     Rupture, Curse of Surveillance; Will of the Abzan (below).
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
     number of target cards from your graveyard into your library".
   - "Activate only if" mana abilities still out: "~ is a creature" (Flywheel Racer), "three or more lands with the
     same name", counters on ~ (Pyramid of the Pantheon, Tablet of Compleation).
   - An activated mana ability whose body isn't a plain "Add ..." (Leafkin Druid's "add {G}{G} instead") can't be
     activated while a "whenever ~ is tapped for mana, add one mana of any color" trigger would need a color choice
     (Fertile Ground on it): it's refused rather than asked. No supported card hits this yet.
   Left from the for-each-opponent/commander/mana value X round:
   - "Choose up to one target" (Luminate
     Primordial, Shellshock); exchanges of control (Twist
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
     instead" (Farsight Ritual), Beseech the Mirror's free cast, Back for Seconds, Thunderous
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
  draws"); Jaded Response ("shares a color with a
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
  (the sacrificed creature's power to each creature and player); Sanctuary Wall ("You may put a stun counter on it. If you do"); Gilt-Leaf Winnower ("whose power and toughness
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
  power against a count), End Hostilities (permanents attached to creatures),
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
  those creatures instead"); Perilous Predicament (two sacrifices of different
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
  (Shifting Loyalties, The Trickster-God's Heist, Bilbo's Burglar's Plot; CR 205.2a). +28 (27,500 of 31,936 with round 205).
- Out after round B35: Aegis Sculptor and Skywarp Skaab (done in Lane A's round 204, left to it), Carrion Rats ("any
  player may exile a card from their graveyard. If a player does"), Flameskull (rejuvenation: "play one of those
  cards" until the end of your next turn), Mindreaver (a counter by name among the cards it exiled), Lethal Exploit
  and Flame Discharge ("modified creature you controlled as you cast ~"), Ardent Dustspeaker (an instant or sorcery
  card to the bottom as a may-cost), Break Out (a revealed card's mana value deciding a second may), Turf War
  (contested counters), Capricious Efreet (destroy one of three targets at random), Touch of Moonglove (a creature
  dealt damage by that creature dying this turn), Thelon's Curse (each player's upkeep may-pay per tapped blue
  creature), Pick Up the Pace ("a creature you control that entered this turn attacks" and play "as long as you
  attacked this turn").
- Round B36 (harder skipped cards, least played first): "put it on the bottom of its owner's library instead" of
  dying (Nissa's Chosen; Gravebane Zombie's top shares it), "creature card put into your graveyard this way" after a
  mill (Liliana's Indignation), "for each artifact or creature card in target opponent's graveyard" (Spoils of Evil),
  "the number of cards that player discarded this turn" (Dream Salvage), "look at the top X cards ..., where X is"
  (Information Dealer, Descendant of Soramaro), life total becomes "the total toughness of creatures you control"
  (Loxodon Lifechanter), "creatures named A and B" (Mine Worker, Power Plant Worker, Tower Worker; this also fixes the
  old misreading of "a creature named A and a creature named B" as one name), +1/+1 counters one, two and three
  (Incremental Growth), cards from one opponent's graveyard on top of their library in the order its caster chooses
  (Misinformation; the order prompt now names whose library; browser test), "target permanent of the chosen color"
  (Pentarch Paladin), "card with a kicker ability" (Murasa Sproutling, multikicker included, CR 702.33c), "then
  shuffle and put those cards on top in any order" (Scouting Trek, CR 401.4), "~ and each creature it's blocking"
  into their owners' libraries (Gomazoa), "prevent all combat damage it would deal and it has defender" (Woolly
  Razorback), frenzy N (Frenzy Sliver, CR 702.68a), "as long as ~ is enchanted or equipped" (Novice Knight, Warchanter
  Skald), heroic counter plus "prevent all damage ... this turn" (Favored Hoplite), "it deals 4 damage" from a dying
  source (Volatile Rig), X/X plus one with "the colors" (Fractalize), "becomes all colors" (Scrapbasket), "are the
  chosen color" (Shifting Sky), "if you cast it during your main phase" (Sentinel's Mark, addendum, CR 207.2c).
  +26 (27,547 of 31,936 with B35 and rounds 202 to 206).
- Out after round B36: North Star (spend mana as though any type for one spell), Silhouette (prevent damage only
  from sources whose spell or ability targets it), Suffocation (damage history of red spells), Oracle of Dust (a card an
  opponent owns from exile as a cost), Haphazard Bombardment (aim counters), Bladecoil Serpent ("for each {U}{U}
  spent"), Wall of Shadows ("spells that can target only Walls"), Fickle Efreet (a delayed flip at end of combat, then
  an opponent gains control), Tam, Mindful First-Year (hexproof from each of its colors; its "becomes all colors"
  line now parses), Dragon's Disciple (reveal a Dragon as it enters), Lamplight Phoenix (collect evidence as a dies
  may), Enslaved Horror (each other player may return a creature), Outlaw Stitcher (counters per spell other than the
  first), Kav Landseeker (Lander token sacrificed on your next turn), Deus of Calamity ("6 or more damage to an
  opponent"), Chisei (remove a counter from a permanent as an upkeep cost), Throne of Makindi (mana only for kicked
  spells), Mind Bomb (each player discards up to three), Stormwild Capridor (counters per damage prevented).
- Round B37 (harder skipped cards, least played first): the five Shrines ("At the beginning of your upkeep and whenever you
  cast a black spell", two triggers), "You draw a card for each Mountain and red card in it" after a revealed hand
  (Baleful Stare, Withering Gaze; each card once), "If that permanent is red or green, put it on top of its owner's
  library instead" (Consign to Dream) and "If that creature is attacking, you may ..." (Sweep Away), "That player
  discards a card" after a counter-unless (Frightful Delusion, paid or not), "Citizens you control get an additional
  +1/+1 and gain vigilance" (Take to the Streets), "If it's a creature, it can't block this turn" after damage to any
  target (Searing Barb), "if it's night" (CR 731.1: Olivia's Midnight Ambush, Moonrager's Slash, Wolf Strike; neither
  before day/night starts), "unless its controller pays life equal to its toughness" (Essence Vortex, CR 119.4),
  "target creature or legendary spell" (Icy Reception), "gets +1/+0, becomes black, and gains shadow" (Traitor's
  Clutch), "one or two target creatures would deal" (Soul Parry), 1, 2 and 3 damage to three targets (Cone of Flame),
  "Remove two loyalty counters from each planeswalker" (Pestilent Haze), "deals 2 damage to any target and doesn't
  untap" (Reveka), "a +1/+1 counter on ~ and ~ gains flying" (Machine Man), "can't block if it's black" (Hobble), Guan
  Yu's shuffle, "creatures named ~ on the battlefield" (Plague Rats), "discards all cards of that color" (Persecute;
  bots now name the opponents' colors for a discard), "chooses a card in their hand and discards the rest"
  (Monomania). +28 (27,575 of 31,936 with B35, B36 and rounds 202 to 206).
- Out after round B37: Inquisitor's Snare (its prevention must keep working after the creature leaves the battlefield,
  rulings), Arashin Sovereign ("your choice of the top or bottom", the dying creature's controller choosing, not its
  owner).
- Round B38 (harder skipped cards, least played first): "Activate no more times each turn than the number of snow
  Swamps you control" (Withering Wisps), "All Goblins are black and are Zombies in addition to their other creature
  types" (Dralnu's Crusade, layers 4 and 5), battalion-like "~ and at least two Zombies attack" (Enkira), "If the
  sacrificed artifact was legendary" (Splitting the Powerstone), "That player reveals cards ... until a creature card is
  revealed. The player puts that card onto the battlefield" (Blessed Reincarnation), "you may pay {1}. If you do,
  reveal cards ... until you reveal a creature card" (Foster), "if this card is in your graveyard, you may discard a
  card. If you do, return" (Gigapede), "choose a color, then you gain 1 life for each permanent of that color"
  (Treva), "if you cast it from anywhere other than your hand" (Alex Wilder), a granted "combat damage to a player or
  planeswalker" trigger with "defending player controls" (Storm the Citadel), "you may pay {2}{R}" as an optional
  additional cost (Undergrowth: red creatures' combat damage isn't prevented), "When a creature is put onto the
  battlefield this way, it deals damage equal to its power" (Vivien's Invocation; its power as it last existed,
  rulings), "for each spell you've cast this turn other than the first" (Outlaw Stitcher), "can't become untapped for
  as long as you control ~" (Spider-Woman), "deals 6 or more damage to an opponent" (Deus of Calamity), "you may reveal
  a Dragon card from your hand. If you do or if you control a Dragon" (Dragon's Disciple; browser test), "When it
  connives this way" (Obscura Interceptor, Psychic Pickpocket; it always connives, rulings), "one or more Humans you
  control" once each turn (Cloaked Cadet), "each other player may return a creature card from their graveyard"
  (Enslaved Horror), "an opponent discards a card or mills one or more cards" (Lo and Li), "sacrifice ~ unless you
  remove a counter from a permanent you control" (Chisei), "less than its mana value" without a difference (Tokka &
  Rahzar), "Players can't search libraries" (Mindlock Orb). +24 (27,620 of 31,936 with B35 to B37 and rounds 202 to
  207).
- Out after round B38: Wall of Shadows (whether a spell or ability "can target only Walls" needs its whole target
  specs), Library of Lat-Nam (an opponent chooses the mode), Serene Master (exchanging power with values locked in, as
  for "exchange life totals"), Kav Landseeker ("at the beginning of the end step on your next turn": there is only
  "your next end step", which can be this turn's).
- Round B39 (harder skipped cards, least played first): the Eldrazi processors, "put a card an opponent owns from exile
  into that player's graveyard" as a cast or enters trigger's "you may ... If you do" (Ruin Processor, Blight Herder
  with two cards, Murk Strider, Mind Raker, Ulamog's Reclaimer, Wasteland Strangler, Ulamog's Nullifier), as an
  activated ability's cost (Cryptic Cruiser, Oracle of Dust, Void Attendant) and as a spell's additional cost
  (Processor Assault); a face-down card is chosen by its group and taken at random within it, and shows its back in the
  picker (rulings; browser test). Boast triggers and cost cuts (Axgard Braggart, Frenzied Raider, Dragonkin Berserker),
  "Players can't play lands" (Territorial Dispute), "When ~ has no +1/+1 counters on it" (Afiya Grove), "If a white
  creature dies this way" (Cinder Cloud), "the creature's controller" (Creature Bond), "exile a creature you control"
  and "discard a card and sacrifice a creature" as additional costs (Necrotic Fumes, Ruthless Disposal; also Lunar
  Hatchling's escape cost), "draw a card for each spell countered this way" (Swift Silence), "Whenever a spell you've
  cast is countered" (Multani's Presence), "the number of creatures that died this way" (Hellfire), Soulquake, "loses
  all poison counters ... that much damage" (Leeches), "the milled card's mana value" (Heed the Mists), "~ is
  colorless" (Ghostfire), "exile it, then shuffle all creature cards" (Barishi). +29 (27,671 of 31,936 with B35 to B38
  and rounds 202 to 208).
- Out after round B39: Ulamog's Despoiler ("As ~ enters, you may put two cards ... If you do, it enters with four
  +1/+1 counters": an enters-option picker for exile), Arni Brokenbrow ("base power becomes 1 plus the greatest power
  among other creatures you control"), Inquisitor's Snare still (the prevention must follow the creature after it
  leaves the battlefield, rulings), Skulking Killer ("if that opponent controls no other creatures" as it resolves),
  Wicked Guardian ("have it deal 2 damage to another creature you control", chosen as it resolves), Graveyard Shovel,
  Lumengrid Augur and Desecrator Hag (what the chosen or discarded card was), Canker Abomination (counters for the
  chosen opponent's creatures), Drake Familiar ("unless you return an enchantment"), Cabal Slaver ("Whenever a Goblin
  deals combat damage to a player"), Aven Warcraft (threshold choice of a color).
- Round B40 (harder skipped cards, least played first): "draw N cards, then discard one of them" picks only among the
  cards just drawn (Soldevi Sage, Casting of Bones, Krovikan Sorcerer; browser test), "discard any number of creature
  cards ... for each card discarded this way" (Mind Maggots), "if you discard a creature card this way ... that card's
  power" (Cragganwick Cremator), Reviving Vapors ("that card's mana value"), "As ~ enters, discard your hand"
  (Heightened Awareness), "Sacrifice an artifact or another creature" as a cost (Malevolent Noble), "a land card of each
  basic land type" (Gaea's Balance), rhystic payments: "unless ... pays {2}. If they do, ..." (Rhystic Lightning),
  "Then if any player pays {2}" (Rhystic Scrying), "unless any player pays {X}" (Soul Strings); "the number of Islands
  tapped this way" (Monsoon), "each of those creatures with flying" (Winter Blast), "gets an additional" after kicker
  (Tribute to Urborg), morbid "instead that player reveals their hand, you choose two cards" (Gruesome Discovery),
  "Whenever you cast an Aura spell that targets ~" (Druid of Horns), "at end of combat, sacrifice it and it deals 5
  damage to you" (Time Elemental), "return it and ~ to their owners' hands at end of combat" (Contempt), "exile all
  cards from target opponent's hand" (Hypnox). +20 (27,712 of 31,936 with round 209).
- Out after round B40: Erosion, Insubordination and Aggression (the enchanted creature is locked in as the upkeep
  trigger triggers, rulings), Bramble Elemental (no "becomes attached" event), Hipparion (a cost to block), Agonizing
  Memories ("in any order"), Noggin Whack and Pulse of the Dross (the target player chooses which cards to reveal),
  Fickle Efreet ("an opponent gains control of ~" after a lost coin flip), The Abyss (the active player chooses the
  target), Retribution, Barrin's Spite, Vicious Betrayal, Sacred Guide, Scrounge.
- Round B41 (harder skipped cards, least played first): "Whenever you activate an exhaust ability" (Afterburner
  Expert, Adrenaline Jockey, Rangers' Aetherhive, Rangers' Refueler), "Exhaust abilities you activate cost {1} less"
  (Boom Scholar), "Whenever you activate ~'s outlast ability" (Herald of Anafenza), "if it had no time counters on it"
  as it dies (Deadly Grub, Chronozoa, Lost Auramancers), "each player who controls the most lands" (Tectonic Hellion),
  "each player other than target player" (Death by Dragons), "Loyalty abilities ... cost {1} more" (Eidolon of
  Obstruction), graveyard triggers "if ~ is in your graveyard, you may (pay ...) return it / put it on top of your
  library" (Pyrewild Shaman, Moss-Pit Skeleton, Dungeon Crawler, Auntie's Snitch, Blood Operative), "you may have her
  deal 2 damage to you. When you do" (Elektra), "That artifact deals damage equal to its mana value to ~" as it last
  existed (Goblin Tinkerer), "During your turn, ~ is a Bear with base power and toughness 4/2" (Circle of the Moon
  Druid), "can't attack if there's another creature on the battlefield" (Shauku), "put that permanent on the
  bottom of its owner's library instead" after kicker (Rona's Vortex), "If that permanent is black, exile it instead"
  of phasing out (Divine Smite), Heated Argument, Monoist Circuit-Feeder, "return it ... and it loses all abilities"
  (Retched Wretch), Sudden Reclamation, Mind Bomb (each player discards up to three), Renounce ("sacrifice any number
  of permanents"), "If a card is put into exile this way" (Corpse Appraiser). +30 (27,742 of 31,936 with round 209 and B40).
- Out after round B41: Nimble Hobbit ("sacrifice a Food or pay {2}{W}": an either cost with a mana payment), Cadaverous
  Bloom and Rasputin (mana abilities with non-tap costs), Bullseye, Lava Burst, Sivvi's Valor, Treacherous Link,
  Kitesail Skirmisher, Bill Ferny, Rayami, Hankyu, Boros Battleshaper, Aura Graft (each needs a new mechanic).
- Round B42 (harder skipped cards, least played first): the Dragons of Tarkir "you may reveal a Dragon card from your
  hand ... If you revealed a Dragon card or controlled a Dragon as you cast this spell" cycle (Draconic Roar,
  Dragonlord's Prerogative, Foul-Tongue Invocation, Orator of Ojutai, Silumgar's Scorn, Scaleguard Sentinels; control
  is checked as the cast finishes, and a copy keeps the bonus only for a revealed card, rulings; the reveal offer is
  skipped while you control a Dragon; browser test), "you may pay {1}{G} any number of times" (Taste of Paradise;
  browser test), "the second spell cast this turn" (Second Guess), "damage to target spell's controller equal to that
  spell's mana value" (Parallectric Feedback, Refuse // Cooperate), "with an additional -1/-1 counter on it" (Pyrrhic
  Revival), "an artifact creature and a nonartifact creature" (Perilous Predicament), Metallic Mastery, "If a nonred
  permanent is dealt damage this way" (Redcap Melee), Prophecy, False Memories, "a card with disturb" (Shipwreck
  Sifters, Phantom Carriage), "Enchanted creature's controller can't cast creature spells" (Brand of Ill Omen; bots aim
  it at an opponent's creature), "Creatures blocking or blocked by ~ have lifelink" (Alms Beast), "cards in your hand
  minus the number of cards in that player's hand" (Bulwark), "for each Cave you control and each Cave card in your
  graveyard" (Gargantuan Leech; Machinist's Dismissal, not Commander-legal, compiles with it too), Anthroplasm, Rock
  Jockey, "When you play a card" (Juju Bubble), Coral Fighters. +26 (27,792 of 31,936 with rounds 209 and 210 and B40).
- Out after round B42: Visions (looking at another player's library needs a viewer), Primordial Ooze ("you may pay
  {X}, where X is ...; If you don't"), Dragon's Fire (reveal a Dragon card or choose a Dragon you control: the damage
  is that Dragon's power), Lichenthrope and Phytohydra (damage replaced by counters, not prevented), Tobias,
  Whipkeeper, Rag Man, Howling Galefang, Swift Reckoning, Sewer Crocodile, Primitive Justice (each needs a new
  mechanic or a new prompt).
- Round B43 (harder skipped cards, least played first): colored and conditional cost cuts ("costs {2}{U} less if",
  "costs {U} less if an opponent cast two or more spells", "during your end step", "if it targets a creature card with
  mana value 3 or less" from a graveyard: Stormwing Entity, Ertai's Scorn, Closing Statement, Revoke Demise, No One
  Left Behind), "if you cycled two or more cards this turn" and "a card with a cycling ability" (Spellpyre Phoenix,
  Rooting Moloch), "if ~ is in your graveyard or on the battlefield" (Firemane Angel; one trigger per zone, and the
  card that moves between them doesn't count, rulings), "When ~ is put into your hand from your graveyard" (Golgari
  Brownscale, CR 113.6k), "Whenever a permanent is put into an opponent's graveyard" (Patron of the Nezumi), "Players
  can't search libraries this turn" (Shadow of Doubt), "return ... attached to this creature" (Magnetic Snuffler),
  "if the sacrificed creature was red / a Saproling was sacrificed this way" (Lyzolda, Thallid Omnivore), "Sacrifice a
  creature. ... equal to that creature's power" (Rupture), spell mastery returns and digs (Necromantic Summons, Gather
  the Pack), the Empires trio (Throne, Scepter, Crown), Destroy the Evidence, Oathsworn Knight, Relic Amulet, Seeds of
  Innocence, Urgoros, Foul Renewal, Hog-Monkey Rampage, Roiling Terrain, Lictor, Moment of Glory. +30 (27,843 of
  31,936 with rounds 209 to 211 and B40-B42).
- Out after round B43: Cinderheart Giant (damage to a creature chosen at random, not targeted), Torment of Venom and
  Xathrid Demon (new punisher forms), Courier of Comestibles and Inscribed Tablet ("if you didn't put a card into your
  hand this way" after a search or a fixed-count reveal, not parsed yet).
- Round B44 (harder skipped cards, least played first): mana that can only be spent some ways ("only to cast kicked
  spells": Throne of Makindi, Elfhame Druid; "only to pay a disturb cost or cast an instant or sorcery spell":
  Unblinking Observer; "can't be spent to cast spells from your hand": Karolina Dean, Vhal, Heartwood Crafter; autopay
  now keeps an activated mana ability's restriction, and retries with the sources that make the most mana first),
  "put a -1/-1 counter on a creature you control" as an additional cost (Lethal Sting, Scarscale Ritual), linked exile
  returned to hands or under owners' control (Fear of Abduction, its cost's creature too; Safe Haven), "Exchange your
  hand and graveyard" (Harness Infinity), "if you own a card in exile" (Dreadlight Monstrosity), Tomik (planeswalkers
  get "No more than one creature can attack"), Shard Convergence and Gem of Becoming (one card of each basic type),
  Throw from the Saddle, Last Stand, Charging Cinderhorn ("if no creatures attacked this turn"), Futurist Operative
  ("it's a Human Citizen with base power and toughness 1/1"), Dovin's Acuity ("during your main phase"), Rofellos's
  Gift ("for each card revealed this way"), Celestial Convergence (highest life total wins, a tie is a draw), Serene
  Master (exchanging power, CR 701.12g), Lamplight Phoenix ("exile it and collect evidence 4", not counting itself),
  Doomsday Specter. +25 (27,918 of 31,936 with rounds 210-213 and B43). Ultron's Auxiliary was left to round 213, which has it.
- Out after round B44: Mana Cache (a mana ability any player may activate), Torrent Elemental (an ability activated
  from exile needs the UI and the bot), Keldon Twilight ("that player sacrifices a creature they controlled since the
  beginning of the turn"), Leshrac's Sigil ("you may pay {B}{B}. If you do, look at that player's hand and choose a
  card from it": the look sits inside the "if you do"), Rewrite History (done in round 265), Spiny Starfish (counting regenerations), Magmablood Archaic (colors spent on the triggering spell),
  Wanderwine Farewell (Kindred), Archery Training and Heartseeker (a granted ability that names the source),
  Stormwild Capridor (prevented damage turned into counters), Awesome Presence (a block cost for each blocker).
- Round B45 (harder skipped cards, least played first): creatures that dealt damage this turn, as that object
  (Executioner's Swing, Avenging Arrow, Red Guardian, Restore the Peace, Treacherous Greed's sacrifice), creatures dealt
  damage this turn (Inflame, Death-Rattle Oni), "each other creature that player controls" after a target an opponent
  controls (Public Execution, Flames of the Raze-Boar; the target is left out even when it survives, rulings), "If it's
  an Ally, scry 2" (Stand United; the scry pauses inside the "if"), "If it's blocking, instead put two +1/+1 counters
  on it" (Will of the All-Hunter), "Spirit, creature with disturb, or enchantment" (Thraben Exorcism), "can block
  Dragons as though it had reach" (Dragon Hunter), "target player who lost life this turn" (Rix Maadi Guildmage),
  "Whenever a land enters during your turn" (Foe-liage), "lose flying and islandwalk" (Mystic Decree), anyone's Goblin
  making "that player" discard (Cabal Slaver), "Whenever a player kicks a spell" (Saproling Infestation), "Lands you
  control are 2/2 creatures with first strike. They're still lands." (Natural Emergence), "cast spells from your
  graveyard" (Yawgmoth's Agenda), "each creature you control with level up" (Venerated Teacher), "becomes blocked by a
  Wall, destroy that Wall at end of combat" (Battering Ram), untapped artifacts, creatures and lands counted once
  (Maraxus of Keld), "each nontoken creature you controlled that died this turn" (Tobias), "When ~ enters and whenever
  you gain life ... only once each turn" (MACH-1: the two triggers share the once), "~ or equipped creature attacks,
  it gets +2/+0" (Chainflail Centipede: whichever attacked, rulings), "Lands you control are Swamps" (Swampbenders),
  "All Slivers are colorless" (Ghostflame Sliver). +28 (27,975 of 31,936).
- Out after round B45: Tamanoa (a trigger on damage from a noncreature source), Feast of Worms ("another land": a pick
  that leaves out the target), Wall of Dust ("can't attack during its controller's next turn"), Ley Line (a target
  chosen by the upkeep's player), Skulking Killer ("if that opponent controls no other creatures" as it resolves),
  Rivals' Duel (two targets that share no creature type), Culling Scales (a target with the lowest mana value), Loyal
  Sentry ("destroy that creature and ~" at once), Gladewalker Ritualist ("another creature you control named ~"),
  Marvel Boy (power-up activations), Goblin Researcher, Kyren Toy (each needs a new mechanic).
- Round B46 (harder skipped cards, least played first): "a creature dealt damage by ~ / equipped creature this turn
  dies" (Wight, Unscythe, Scythe of the Wretched, which returns it with the Scythe attached) and "if ~ dealt damage to it
  this turn" (Hawkeye), "When target creature dies this turn, return that card" (Graceful Reprieve), "Move a +1/+1
  counter from target creature onto ~" (Cytoplast Root-Kin, Arcbound Fiend), "Exile ~ and all cards from all
  graveyards" (Silent Gravestone), "whose power and toughness aren't equal" (Gilt-Leaf Winnower), "that player
  sacrifices it unless they pay {X}, where X is its mana value" (Soul Tithe), "Whenever a Sliver / Beast becomes
  blocked" (Spined Sliver, Berserk Murlodont), "reveal the top card ... put it into your hand. If you do, you lose life
  equal to its mana value" (Stronghold Arena), keywords counted once among your creatures (Odric, Blood-Cursed), Sarkhan
  the Mad (damage to himself; "sacrifices it, then that player creates"; each Dragon deals damage equal to its power),
  "and each Aura attached to it" (Portal of Sanctuary), "create a token and attach ~ to it" (Auxiliary Boosters), "at
  the beginning of the end step on your next turn" (Kav Landseeker), "Whenever you attack with your commander"
  (W'Kabi), "protection from instant spells and from sorcery spells" (Devoted Caretaker), "if you control exactly
  thirteen permanents, you may sacrifice ~. When you do" (Stensia Uprising), "creatures you control with flying attack"
  (Teo), "put a +1/+1 counter on each of those creatures" after combat damage (Vulture, Heroes in a Half Shell), "total
  power and toughness 5 or less" (Meek Attack), "That permanent's controller gains control of ~" (Starke of Rath),
  "attacked with three or more Merfolk this turn" (Deepway Navigator, attackers' creature types are now remembered),
  "creature with the greatest power ... You gain life equal to its power" (Consecrate // Consume). Fix: the card data
  lists keywords that the text only names (Odric's list, Angelic Skirmisher's "choose first strike, vigilance, or
  lifelink", Zur's "have deathtouch, lifelink"); a card now has such a keyword only from a line of keywords (21 cards).
  +28 (28,054 of 31,936 with rounds 215 and 216).
- Out after round B46 (looked at, not done): Sacred Ground (what caused a land to go to the graveyard), Colfenor's Plans
  (playing cards exiled with it), Nivix ("until your next turn, you may cast it if it's an instant or sorcery"), Szadek
  (combat damage replaced by counters and milling), Rain of Gore (life gain from spells and abilities turned into loss),
  Infernal Darkness (mana from lands changed to {B}), Pako (fetch counters on exiled cards), Goddric (celebration makes
  it a Dragon with a granted ability), Bend or Break (piles chosen by an opponent), Meandering Towershell (returns
  attacking on your next turn), Diaochan (a target chosen by an opponent), Triton Tactics (creatures blocked by those
  creatures), Blood Spatter Analysis ("Then sacrifice it if ... When you do").
- Round B47 (harder skipped cards, least played first): "becomes a blue Dragon Illusion ..., loses all abilities, and
  gains flying" (Dance of the Skywise, and Dragonshift with it), "If that creature is black or red, destroy it"
  (Inquisitor's Snare), "Target player exiles a card from their graveyard. If it's a creature card" (Graveyard Shovel),
  "and all white Auras you own attached to it" (Word of Undoing), "reveals their hand and discards a creature card at
  random" (Rag Man), spell mastery flash counting cards in your graveyard (Swift Reckoning, and Serpent of the Pass),
  "When a creature dealt damage this way dies this turn" (Skeletonize), "you may have it deal 2 damage to another
  creature you control. If you do" (Wicked Guardian; the bot only says yes with a creature that survives it), "Whenever
  an Aura becomes attached to ~" (Brood Keeper, Bramble Elemental: an Aura entering attached or moved onto it), "tap ~
  unless you pay {E}" (Electrozoa), "enters with a -1/-1 counter for each creature that player controls" after choosing
  an opponent (Canker Abomination), "the greatest mana value among cards in your graveyard" (Hapatra, the Desert Fang,
  and Wick's Patrol), "gain control of all Equipment that were attached to it" (Murderous Spoils), "the creature card in
  your graveyard with the greatest power" (Desecrator Hag), "you may tap or untap target permanent" (Telekinetic
  Bonds), "enters or leaves the battlefield" artifacts (Sludge Strider), "If it has the same name as a card in your
  graveyard" (Candles of Leng), "you may sacrifice ~. If you do, return the discarded card" (Pitchstone Wall), the
  enchanted permanent's controller's upkeep punishers "unless that player pays {1} or 1 life" (Erosion) and "unless
  they sacrifice that artifact" (Curse Artifact), "gain control of all creatures blocking ~" (The Wretched), and
  blocks remembered for the turn (TurnLog.blocks): "tap all creatures that blocked ~ this turn" (Joven's Ferrets),
  "At this turn's next end of combat, destroy all creatures that blocked or were blocked by it this turn" (Venomous
  Breath, Glyph of Doom), "unless it attacked or blocked this turn" (Lurker). +29 (28,083 of 31,936 with rounds 215 and 216).
- Out after round B47 (looked at, not done): Aggression and Insubordination (the creature is locked in as the trigger
  goes on the stack, rulings, but "enchanted creature" is read as it resolves), Sea Troll ("blocked or was blocked by a
  blue creature this turn": the other creature's color when it blocked or now is unclear).
- Round B48 (harder skipped cards, least played first): "Look at the top five cards of target player's library. You
  may then have that player shuffle that library" (Visions: looked at only, a new "look" prompt with no arrows), "sacrifice
  it unless you return an enchantment to its owner's hand" (Drake Familiar: anyone's enchantment, not targeted),
  "you may return target Equipment card ... If you do, you may attach it to ~" (Auriok Survivors), "Destroy it and ~ at
  end of combat" (Goblin Sappers), "exile it if it had a death counter on it. Otherwise, return it" (Bogardan Phoenix),
  threshold "choose a color ... protection from the chosen color" (Aven Warcraft) and a granted "put another +1/+1
  counter" upkeep trigger (Chlorophant), "When you sacrifice a Clue" from the graveyard or on the battlefield (Curious
  Cadaver, Daring Sleuth), "Until end of turn, whenever a creature an opponent controls blocks" ending with its paragraph
  (Benefactor's Draught), blockers with "power or toughness 1 or less" an opponent controls (Tetsuko Umezawa, Pursuer),
  "damage ... by colorless sources" prevention (Lithomancer's Focus), "If that player discards an artifact card this
  way" (Lumengrid Augur), "If you don't, sacrifice ~ and it deals damage equal to the number of +1/+1 counters on it"
  (Magmasaur), "just beneath the top X cards ..., where X is the number of Plains you control" (Quarry Colossus), "costs
  {1} less to activate if it targets a creature with power 3 or less" (Raft Security Officer), "exile all other cards
  revealed this way" (Sacred Guide), "Return all Auras attached to target permanent you own" (Scarab of the Unseen),
  "sacrifice any number of creatures" as X (Vicious Betrayal), "the damage already dealt to it this turn" (Whipkeeper),
  "Target player dealt damage by ~ this turn" (Wicked Akuba), "discards a card with that name. If they can't, you draw
  a card" (Brain Pry), "choose two cards from it. Put them on top of that player's library in any order" (Agonizing
  Memories), and "You may put one of those cards on top of your library" (Voda Sea Scavenger). +24 (28,205 of 31,936 with rounds 217 to 221).
- Out after round B48 (looked at, not done): Dwarven Sea Clan (a target "whose controller controls an Island", damage
  at end of combat, "before the end of combat step"), Feint (tap the target's blockers, prevent its and their combat
  damage), Blood Oath ("Choose a card type" as a spell instruction), Specter's Shriek (exile a chosen card, then a
  rider about its color), Noggin Whack (reveal three, you choose two), Hiveheart Shaman (a basic land card that doesn't
  share a land type), Song of Blood (a delayed attack trigger counting milled creature cards), Kemba's Legion, Taunt,
  Battlefield Scrounger, Slayer's Cleaver ("blocked by an Eldrazi if able"), Illuminated Folio (reveal two cards that
  share a color), Nim Devourer, Jabari's Influence (a -1/-0 counter after gaining control), Primordial Ooze, Fathom
  Trawl, Thirsting Axe, Sewer Crocodile, Flying Drone.
- Round B49 (harder skipped cards, least played first): "You choose a nonland card from that player's graveyard or hand
  and exile it" (Never Happened, Memory Leak: one picker for the revealed hand and the graveyard, each card marked with
  its zone), "target nonland permanent with the lowest mana value" (Culling Scales), "two target creatures that share no
  creature types" fighting (Rivals' Duel), "count the number of +1/+1 counters ... Creatures your opponents control with
  power less than or equal to that number can't block this turn" (Rumbling Ruin: counted once, a rule for the turn),
  "that creature can't attack during its controller's next turn" (Wall of Dust), "Hit deals damage to that player equal
  to that permanent's mana value" (Hit // Run), "reveals two cards at random ..., then discards each nonland card
  revealed this way" and two-target Rise (Rise // Fall), "all creatures blocking or blocked by target creature" (Trial //
  Error), "a creature of their choice that they controlled since the beginning of the turn" (Keldon Twilight),
  "Whenever a creature you control deals combat damage to a creature" (Quest for the Gemblades), "and this enchantment
  isn't a creature, it becomes" (Emergent Haunting), "As ~ enters, if it was kicked, mill four cards" (Monstrous
  War-Leech), "Put ~ and target creature on top of their owners' libraries, then those players shuffle" (Void Stalker),
  "put target Aura card from a graveyard onto the battlefield ... attached to ~" (Iridescent Drake), "Target opponent
  chooses an artifact card in their graveyard. Put that card onto the battlefield under your control" (Scrounge), a
  created Equipment token then "Attach it to ~" (U.S.Agent, John Walker), "Except for creatures named ~ and artifact
  creatures, creatures you control can't attack" (Akron Legionnaire), "can't attack alone unless he has a +1/+1 counter
  on him" (Pipsqueak, Rebel Strongarm), "as long as you own a card in exile that has an Adventure" (Howling Galefang),
  "Return this card from your graveyard to the battlefield attached to target creature you control with power 1 or
  less" (Eagle's Rescue), kicked "that creature can't be regenerated this turn and if it would die this turn, exile it
  instead" (Scorching Lava), "Return target card from an opponent's graveyard to their hand" (Forcemage Advocate,
  Shieldmage Advocate), "Sacrifice a Room" (Intruding Soulrager), and "creatures that have -1/-1 counters on them"
  (Grind // Dust). +26 (28,231 of 31,936 with rounds 217 to 221).
- Out after round B49 (looked at, not done): Anthropede ("discard a card or pay {2}" as one cost choice), Retribution
  and Barrin's Spite (the targets' controller chooses one of them), Goblin Test Pilot (a random target as it's
  activated), Ley Line and Mausoleum Turnkey (another player chooses the target), Tamanoa and Molten Lavamancer
  (noncombat or noncreature damage triggers), Venser's Diffusion (a target among suspended cards), Nivmagus Elemental
  (exile an instant or sorcery spell you control as a cost), Warbringer (equip costs less: Lane A round 217 does it),
  Nomad Mythmaker (attach to a creature you choose as it resolves).
- Round B50 (harder skipped cards, least played first): "unless its controller has ~ deal N damage to them" on a
  land, a creature or a spell (Dwarven Driller, Dwarven Scorcher, Blazing Salvo, Molten Influence), "unless they have
  exactly three or exactly four cards in hand" (Skullcage), "Exile all/each ... until ~ leaves the battlefield"
  (Consulate Crackdown, Temporary Lockdown, Aligned Hedron Network), "You may cast that card for as long as it remains
  exiled, and you may spend mana as though it were mana of any color" (Covetous Urge, Psychic Intrusion), "For each
  opponent, choose up to one target creature that player controls ... to each of the chosen creatures" (Mega Flare),
  "you draw cards equal to its power and you gain life equal to its toughness" (Nissa's Revelation), "destroy each
  creature that blocked or was blocked this turn" (Heat Stroke), "Return up to X permanent cards", X by converge
  (Uncle's Musings), "Discard any number of cards. Search your library for up to that many" (Rites of Spring),
  "That player may put a permanent card from their hand onto the battlefield" after a spell's target (Divine Gambit),
  "If you control an outlaw, exile the top card" (Outlaws' Fury), "skip your draw step this turn" after "If you do"
  of a search (Elfhame Sanctuary), "Exile X cards from your graveyard" as a cost (Necropolis Fiend; Taigam, Sidisi's
  Hand), "Remove any number of charge counters" (Geistflame Reservoir), "the greatest power or toughness among"
  (Freelance Muscle), "plus an additional +1/+1 counter on it for each other creature you control" (Sheriff of Safe
  Passage), "Put one into your hand and the other into your graveyard" (Codecracker Hound, Faerie Snoop), "if you
  control no permanents other than ~ and have no cards in hand" (Barren Glory), "Tap three untapped Advisors,
  Artificers, and/or Monks" (The Archimandrite), "Whenever a creature is put into your graveyard from the battlefield,
  you may pay {1}{W}. If you do, return that card" (Sigil of the New Dawn), Clockwork Hydra, Grozoth, Tibalt, the
  Fiend-Blooded, Trade Route Envoy and Witness the Future (rewordings). +33 (28,264 of 31,936 with rounds 217 to 221).
- Out after round B50 (looked at, not done): Decaying Soil (now unsupported on purpose: a threshold-granted "Whenever a
  nontoken creature is put into your graveyard from the battlefield" must look back in time, CR 603.10a, so the
  creature that makes seven doesn't trigger it, but granted abilities are read after the event), Pinnacle Starcage
  ("Put each card exiled with ~ into its owner's graveyard, then create ... Robot"), Not Forgotten and Swat Away (top or
  bottom of the library, owner's choice), Case the Joint and Medomai's Prophecy (the top card of each player's
  library), Kayla's Reconstruction, Treacherous Urge, Rogues' Gallery, Liberated Livestock, Borderland Explorer,
  Cathedral Membrane, Dimensional Infiltrator, Sharp-Eyed Rookie; harder: Grand Master of Flowers, Mana Maze, Eureka,
  Portcullis.
- Round B51 (cards no earlier round wrote down, least played first, EDHREC rank about 24,700 to 23,200):
  "if you have a card in hand" (Imaginary Pet), "if you control no other colorless creatures" (Dust Stalker), "When a
  creature you control attacks, sacrifice ~" (Spiritual Asylum), "Whenever ~ is dealt 3 or more damage" (Innocent
  Bystander), threshold "instead destroy that land and ~ deals 1 damage to each creature and each player" (Rancid
  Earth), "the damage already dealt to that player this turn" (Final Punishment), "Then return another target creature
  ... unless its controller pays {1}" (Withdraw; the pay-or-else prompt now names what happens, also for Crystal Shard,
  Erratic Portal, Excise, Plague Fiend and Rhystic Deluge), "Destroy any of them that are Walls" (Blow Your House Down),
  "put a +1/+1 counter on it for each card in your hand. If you do, discard your hand" (Thought Gorger), "target
  creature an opponent controls deals damage equal to its power to that player" (Dong Zhou, the Tyrant), "you may return
  target creature ... if its power is less than this creature's power" (Sage-Eye Avengers), "if it was the second spell
  you cast this turn" (Codespell Cleric: it must have been cast, and counted among your spells only), "for each color
  among other artifacts you control" (Karn, Gilded Guardian), "destroy target permanent an opponent controls. They
  create a Treasure token" (Vraska, the Cutting Glare), "You may cast that card until the end of your next turn"
  (Scholar of Combustion), "If you do, you gain life equal to its mana value" for a graveyard target (Lagonna-Band
  Storyteller), "~ gets +2/+1 and creatures you control gain haste" after a payment (Moku, Meandering Drummer), delirium
  attack triggers (Hand That Feeds), "can attack as though it didn't have defender and it can't be blocked" (Expedition
  Lookout), "Exile two other creature cards from your graveyard" as a cost (Despoiler of Souls), "if defending player
  has two or fewer cards in hand" on attack (Reaper of Night), "It deals damage to you equal to its power" (Bind the
  Monster), "discards a number of cards equal to the sacrificed creature's power" (Tormented Thoughts), "Choose one. X
  is the number of spells you've cast this turn" (Gnostro, Voice of the Crags), "as long as an Equipment named ... is
  attached to a creature you control" (Bride's Gown, Groom's Finery), "you may have ~'s base power and toughness become
  4/2" (Mirkwood Meditator), "As long as you control enchanted creature ... Otherwise, it can't block" (Mishra's
  Domination), "if enchanted creature is red" (Ray of Frost), "becomes blocked by one or more colorless creatures"
  (Hedron Blade), "As long as you've surveilled this turn" (Darkblade Agent: surveil now tracked apart from scry),
  "When a source an opponent controls deals damage to you, sacrifice ~" (Awaken the Sky Tyrant). +32 (28,296 of 31,936 with rounds 217 to 221).
- Out after round B51 (looked at, not done): Backfire ("that much damage" from damage the enchanted creature dealt to
  you), Equal Treatment and Well-Laid Plans (damage replacement and prevention between sources), Spin into Myth
  (fateseal), Elderwood Scion (spells that target it cost less), Tidal Control and Quicksilver Dragon (any player may
  activate; changing a spell's only target), Necromancer's Magemark (a replacement for enchanted creatures you control),
  Selective Snare (X targets of a chosen type), Roving Keep, Slab Hammer, Leonin Bola, Apathy, Death Match, Display of
  Dominance, Addle, Soul Search, Thought Prison, Spara's Adjudicators and Masked Bandits (until cast from exile), plus
  the many multi-line or new-mechanic cards in the same range.
- Round B52 (cards no earlier round wrote down, least played first, EDHREC rank about 23,250 to 22,000):
  "unless its controller has ~ deal 6 damage to them" on a land (Lava Blister), "Exile all noncreature, nonland cards
  from that player's hand and graveyard" (Thought Distortion), creatures and planeswalkers with mana value 3 or less from
  the battlefield and from graveyards (Shadows' Verdict), "It gains haste until end of turn if it exploited that
  creature" (Silumgar Scavenger: the dying creature remembers what exploited it), "costs {2} less if you've cast another
  instant or sorcery spell this turn" (Mage Duel), "Players skip their upkeep steps" (Eon Hub), "costs {1} more for each
  artifact its controller controls" (Hum of the Radix), "target opponent puts a deathtouch counter on a creature they
  control" (Hunted Nightmare), "the total mana value of instant and sorcery cards in your graveyard" (Inferno Project),
  "Whenever another nonland permanent you control is returned to its owner's hand" (Justice, Vance Astrovik) and
  "Whenever this creature or another creature is returned to your hand from the battlefield" (Stormfront Riders), "you
  may remove an oil counter from it. If you do, untap it and it gets +1/+1" (Lattice-Blade Mantis), "Whenever a
  creature you control with power equal to its toughness attacks/enters" (Master Symmetrist, Symmetry Matrix), "It gets
  +3/+1 instead as long as an opponent has eight or more cards in their graveyard" (Mind Carver), "draw a card if you
  had no cards in hand at the beginning of this turn" (Mindstorm Crown: hand size as each turn began is now kept),
  "becomes blue and isn't an artifact" (Neurok Transmuter), "If a creature is dealt damage this way, it gets +5/+0"
  (Provoke the Trolls), "if that player or that planeswalker's controller has more life than you, return ~ to its
  owner's hand" (Pulse of the Forge), "You lose life equal to the number of cards drawn this way" (Rise of the
  Deathbringer), "Creatures with shadow get +1/+0 ... and creatures without shadow get -1/-0" (Stronghold Overseer),
  delirium "instead that player sacrifices a creature and a planeswalker" (To the Slaughter), "Until end of turn,
  creatures you control gain trample and get +1/+1 for each ..." (Tromp the Domains), "if enchanted permanent is
  tapped, untap it" (Volition Reins), "If you do, each opponent loses 2 life" after returning itself (Bob, Reluctant
  HYDRA Agent), "if it was kicked twice" (Archangel of Wrath), X counters "as this creature enters or is turned face up"
  (Crowd-Control Warden). +27 (28,323 of 31,936 with rounds 217 to 221).
- Out after round B52 (looked at, not done): Gideon the Oathless and Way of the Paradox (Lane A's round 222 adds
  "Whenever you activate a loyalty ability"; once it merges, Gideon only needs "an opponent activates" on that
  template), Dismantle (a choice of counter kind), Price of Betrayal (counters removed divided among objects),
  Watchers of the Dead (each opponent keeps two cards), Mire's Toll (reveal N chosen cards), Dead Reckoning, Victor
  Mancha, Encumbered Reejerey ("while" trigger conditions), Entrails Feaster, Ichorid, Nether Shadow, Cursed Rack,
  Celestial Kirin, Skyfire Kirin, Lumaret's Favor, Definitely Not a Turtle, Advice from the Fae, Petals of Insight,
  Rowdy Crew, Thijarian Witness, Riptide Replicator, Teferi's Response, Dawn Evangel, Earthbind, plus the multi-line
  or new-mechanic cards in the same range (Oath of Scholars, Oath of Ghouls, Soul of Shandalar, Kenku Artificer, Harsh
  Justice, Bill Potts and others).
- Round B53 (cards no earlier round wrote down, least played first, EDHREC rank about 22,000 to 19,700):
  "If this spell was kicked, you gain life equal to that card's mana value. Otherwise, you lose that much life"
  (Sheoldred's Restoration), "if it has greater power or toughness than Hulkling" (Hulkling, Burgeoning Bruiser: evolve's
  check without evolving), "Return each creature card exiled with ~ to the battlefield under your/its owner's control"
  (Cold Storage, Endless Sands), "When this card becomes plotted" (Longhorn Sharpshooter, Aloe Alchemist), "the number
  of players you attacked this combat" (Custodi Soulcaller), "can block creatures with shadow as though they didn't have
  shadow" (Aether Web, Aetherflame Wall), "you may choose a card type. If you do, each player sacrifices a permanent of
  their choice of that type" (World Queller, with a bot pick), "if enchanted creature has toxic" (Maze's Mantle), "If
  target creature has toughness 5 or greater ... Otherwise, +4/-X" (Blood Lust), "Each equipped creature and Equipment
  you control" (Hemlock Vial), ferocious "you may draw a card. If you do, discard a card" (Force Away), "the number of
  counters on that creature" after it's destroyed (Parting Thoughts), "as long as its controller controls another
  creature" (Favorable Destiny), "that player may pay {4}. If the player does, untap the creature" (Paralyze), "creature
  or Food card" (Ragamuffin Raptor, Sugar Coat), "As long as ~ is attacking, defending player can't cast spells"
  (Wardscale Dragon), "a Doctor spell or creature spell with doctor's companion" (Rose Noble), "If you didn't put a
  card into your hand this way, X" for any X (Rosecot Knight, Blossom Prancer, Pulsar Squadron Ace, Inscribed Tablet),
  "Then put two +1/+1 counters on that permanent if you control an artifact and an enchantment" (Okiba Salvage), "If
  you do" after an optional bounce (Mirkwood Nurturer), "dies during combat" (Mongrel Pack), "This ability costs {N}
  less to activate if <condition>" (Esquire of the King, Starport Security, Sewer Crocodile, Razorlash Transmogrant),
  "at least two creatures that share a creature type" (Synchronized Eviction), "as long as it's blocking and you
  control a snow land" (Snow Devil). +34 (28,381 of 31,936 with round 222).
- Out after round B53 (looked at, not done): Clear the Land (each player reveals), Ninja's Kunai and Blazing Torch
  (granted abilities that sacrifice or name the Equipment), Artificer's Hex (the creature the enchanted Equipment is
  attached to), Mana Vortex (counter unless you sacrifice, plus a no-lands state trigger), Encircling Fissure
  (prevention for a target opponent's creatures), Ancient Hellkite (a defending-player target), Alluring Siren
  ("attacks you if able"), Warren Weirding (Kindred), Kami of Jealous Thirst (a colored cost cut), Thaumaton Torpedo
  ("if you attacked with a Spacecraft this turn"), Detention Vortex (only opponents may activate), West Wind Avatar
  ("sacrifice a token or a land"), Guul Draz Overseer ("If that land is a Swamp ... instead"), Unnatural Aggression
  (fight plus an exile replacement), Thunderous Orator (the keyword list), Foundry Helix and Voltage Surge (what the
  sacrificed permanent was, an optional sacrifice cost), Cathedral Membrane, Thieving Sprite, Serene Sunset, plus the
  multi-line or new-mechanic cards in the same range.
- Round B54 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 17,000, the easier
  ones): spell mastery "If there are two or more instant and/or sorcery cards in your graveyard, ~ can't be countered"
  (Exquisite Firecraft), "Draw a card for each creature target player controls, then ... another target player
  controls" (Biomantic Mastery), "Counter target spell unless its controller exiles all cards from their graveyard"
  (Grip of Amnesia: a new pay-or-not option, with an e2e test), "Whenever a land enters under an opponent's control, if
  that player had another land enter" (Tunnel Ignus), "if it has one or more oil counters on it" (Ichorplate Golem),
  "Return all cards exiled with ~ to the battlefield under your control" (Synod Sanctum), "sacrifice any number of
  creatures ... where X is the total power of the sacrificed creatures" (Corpse Cobble), "If a creature an opponent
  controls would die this turn, exile it instead" (Malicious Eclipse), "if ~ has five or more charge counters on it,
  remove all of them from it and create that many" (Lightning Coils), "Pay X life" as an activation cost (Krumar
  Initiate), "Until your next turn, you may cast it if it's an instant or sorcery spell" (Nivix, Aerie of the
  Firemind), "Lands you control are the chosen type in addition to their other types" (Realmwright), "Exile seven other
  cards from your graveyard" (Bone Dragon), "Until your next end step, you may play one of those cards" (Unlucky
  Witness), "As long as there are three or more cards exiled with ~" (Veteran Survivor), "As long as ~ has three or more
  fire counters on it, it's an artifact creature" (War Balloon), the evolve-like check with an oil counter (Evolving
  Adaptive), "costs {1} less to cast if it targets an attacking or tapped creature" (Dire Downdraft), "Enchanted land is
  every basic land type in addition to its other types" (Nylea's Presence). +19 (28,400 of 31,936 with round 222).
- Out after round B54 (looked at, not done): Foraging Wickermaw (a mana ability that changes its color), Tomb of Urami
  ("Sacrifice all lands you control" and a mana ability that deals damage), Ohabi Caleria and Sosuke (group "deals
  damage to a creature" triggers), Gideon, the Oathsworn ("non-Gideon" becomes "non-~" in the normalized text), Garruk,
  Veiled Butcher ("If you sacrificed a creature this way", "who didn't discard two nonland cards"), Blackmail (the
  player reveals three of their choice), Cannibalize (two targets controlled by the same player), Moonlace ("target
  spell or permanent"), Living Conundrum (skip a draw from an empty library), Vhati il-Dal (base power 1 or base
  toughness 1: a new choice), Hedron Matrix ("+X/+X, where X is its mana value" for the equipped creature). Possible
  bug to check: the target phrase "attacking creature or tapped creature" parses to `combat: attacking` plus an anyOf.
- Round B55 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 17,000): "Then discard
  two cards unless you discard an instant or sorcery card or a creature card with flying" (Steamcore Scholar), "Look at
  the top two cards of target opponent's library, then exile one of them" (Thoughtpicker Witch), "pay {E}{E}. If you
  can't, ..." (Greenbelt Rampager: paid when it can be, no choice), "Whenever ~ is dealt combat damage, you gain that much
  life and attacking player loses that much life" (Souls of the Faultless: the attacking player is the active player, CR
  506.2), "target opponent may exile a card from their graveyard. If that player doesn't, you may draw a card"
  (Gravestorm), "mill a card. When you do, if there are four or more creature cards in your graveyard" (Sigil of Myrkul),
  "Each attacking creature and each blocking creature doesn't untap" (Spore Cloud), "Each creature you control deals 1
  damage to that creature" (Case of the Gateway Express), "Another target player creates" (Cybernetica Datasmith), a
  granted "deals 1 damage to target creature that's blocking it" (Arc Spitter), "When the permanent you don't control
  dies this turn" for a creature or a planeswalker (Devouring Tendrils, CR 700.4), "Return any number of target
  permanents you own to your hand" (Leave // Chance), "During your turn, ... and equip abilities you activate cost {1}
  less" (Nahiri, Storm of Stone), "target artifact (or creature) becomes an artifact creature with base power and
  toughness 5/5" for good (Iron Man, Futurist Paragon, Tezzeret, Agent of Bolas, Tezzeret the Schemer's emblem), "target
  creature that player or that planeswalker's controller controls" (Searing Blaze: the planeswalker's last known
  controller if it has left), "if you control three or more creatures that share a creature type" (Littjara
  Kinseekers). +18 (28,418 of 31,936 with round 222).
- Out after round B55 (looked at, not done): Runic Repetition (targets a card in exile), Lymph Sliver (absorb), Mesmeric
  Sliver (fateseal), Namor ("attacks a player who has more life than you"), Asgardian Inspiration (a trigger from the
  graveyard on an event that isn't one yet), Old Fat Spider Can't See Me (a damage rule for as long as ~ remains on the
  battlefield), Isu the Abominable (a choice of payment), Etched Slith ("target permanent or opponent"), Reiterating
  Bolt (an energy additional cost), Dodgy Jalopy (scavenge with a variable power), Chancellor of the Dross (opening-hand
  reveals), Words of Worship, Garruk, Curse Breaker (its −4), Kaima, Infernal Kirin, Celestial Judgment and Ancestral
  Knowledge (new mechanics), Fatal Fissure (a delayed trigger with a target of its own), Mudslide and Dream Tides (pay
  {2} for each of any number of creatures to untap: a new picker), Incriminate (two targets controlled by the same
  player, like Cannibalize).
- Round B56 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 17,000): "distribute two
  +1/+1 counters among one or two other target Vehicles and/or creatures you control" (Cloudspire Skycycle; "other" in a
  distribute now means other than the source, which also made Rhino, Terrible Trampler supported), "~ enters with a
  +1/+1 counter on it for each mana spent to cast it" (Verazol, the Split Current), "each player sacrifices all lands they
  control except for three" (Keldon Firebombers, Cataclysm's keepRest), "Your opponents and permanents your opponents
  control with hexproof can be the targets ..." (Kaya, Bane of the Dead), "~ deals damage to that player equal to their
  total power" after destroying them, an indestructible survivor's power included (Angrath, Minotaur Pirate, rulings),
  "+1/+1 for each point of bushido it has" (Takeno, Samurai General), "land with an activated ability that isn't a mana
  ability" as a static filter and a target (Tsabo's Web, Ravager Wurm), "for each nonland card in that player's graveyard
  that was put there from the battlefield this turn" (Wreck Hunter), a granted "If this creature would die, exile it
  instead" (Can't Stay Away), "{1} less for each card type among permanents you've sacrificed this turn" and "the number
  of permanent types among cards in your graveyard" (Korvold, Gleeful Glutton), "for each card type among spells you've
  cast this turn" (April O'Neil, Hacktivist; castThisTurn now keeps the types as cast), "for each loyalty counter on
  planeswalkers you control" and "Whenever one or more loyalty counters are put on planeswalkers you control" (Bioessence
  Hydra), "Remove twice X loyalty counters" (Confront the Past), "You exile the top ten cards of your library" after
  another subject (Diminishing Returns), "That player puts all noncreature cards revealed this way into their graveyard,
  then you put the creature card onto the battlefield under your control" (Telemin Performance), "The tokens have ..."
  (Return of the Mole Man). +18 (28,436 of 31,936 with round 222).
- Out after round B56 (looked at, not done): Sudden Salvation ("for each opponent who controls one or more of those
  permanents"), Jhoira, Weatherlight Corsair (life loss equal to the mana value of the card put onto the battlefield),
  Djinn of Wishes (playing the revealed card from the library, else exiling it), The Kingpin of Crime (a group "assign
  combat damage equal to their toughness" until end of turn), Yasova Dragonclaw ("gain control of target creature an
  opponent controls with power less than ~'s power ..., untap that creature, and it gains haste"), Tajuru Paragon ("a
  card that shares a creature type with it from among them"), Makeshift Mannequin (a granted ability for as long as it
  has a counter), Phylactery Lich (an "as enters" counter on another permanent and a state trigger), Undiscovered
  Paradise, Hold for Ransom, Mercurial Transformation, Goblin Festival, Trench Gorger, Tatsumasa, Adipose Offspring,
  Fractal Tender, Keldon Flamesage, Sporogenesis, Kentaro, Immard, Feldon, Corruption of Towashi, Donnie & April, Path of
  Mettle, Rise from the Wreck, plus the multi-line and new-mechanic cards in the same range (Bomb Squad, Word of Command,
  Celestial Dawn, Death or Glory, Selective Adaptation and the like).
- Round B57 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 15,300): "if there is an
  Elf card in your graveyard and ~ has a -1/-1 counter on it" (Creakwood Safewright), "If a permanent would be put into a
  graveyard, exile it instead" (Samurai of the Pale Curtain: from the battlefield only, tokens too), "If you put an artifact
  card into your hand this way" after a look at the top of the library (Chrome Courier), "If you discard a land card this
  way, put it from your graveyard onto the battlefield tapped" (Silvan Reveler), "costs {2} more to cast if it targets a
  Dragon" (Dragon's Prey), "Whenever ~ enters or becomes tapped" (Champions of the Shoal), "choose target creature an
  opponent controls. If it's tapped, put a stun counter on it. Otherwise, tap it" (Shackle Slinger), "That creature can't
  be blocked this turn and has base power and toughness 1/1 until end of turn" (Atomic Microsizer), "If it's equipped, you
  may destroy all Equipment attached to that creature" (Awaken the Sleeper), a granted "If ~ is a Wizard, it deals 2 damage
  instead" (Sorcerer's Wand, as it resolves, rulings), "the number of different kinds of counters among permanents you
  control" (Perrie, the Pulverizer), "copy it if you control a planeswalker, Cleric, Druid, Shaman, Warlock, or Wizard"
  (Mentor's Guidance: checked as the trigger resolves, rulings), "Target player draws a card at the beginning of the next
  turn's upkeep" (Sapphire Charm), "Remove a counter from a creature you control. If you do, draw a card" (Mister Hyde,
  Monster Within), "target creature you control with the greatest power" (Triumph of Gerrard, rulings), "you may return
  another creature you control to its owner's hand, then put ... counters equal to that creature's power on ~" (First
  Responder: its power as it last existed), a granted "If a colorless creature is dealt damage this way, tap it" (Pathway
  Arrows). +17 (28,453 of 31,936 with round 222).
- Out after round B57 (looked at, not done): Saw ("a permanent other than that creature or ~": a pick that excludes the
  trigger's subject), Glimpse the Cosmos (a conditional cast from the graveyard for another cost), Traveler's Cloak (any
  land type, nonbasic too), Corrosive Ooze (destroying Equipment at end of combat), Trove of Temptation (an attack
  requirement toward you or your planeswalkers), Viral Spawning (a conditional flashback), Silver Surfer, Galactus's Herald
  ("attacks that player each combat"), Blue Dragon (three targets until your next turn), Satyr Firedancer (a spell's damage
  to an opponent), Thrill-Kill Disciple (squad with a discard), Magnigoth Treefolk and Diligent Zookeeper (counted
  landwalk and creature types), Exotic Pets and Storm of Forms (each kind of counter), Sanctifier en-Vec (a color filter on
  permanents, spells and cards going to graveyards), Greatbow Doyen, Ancestral Communion, The Book of Vile Darkness.
- Round B58 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 15,000): "If that player
  can't, they discard a card, they lose 2 life, you draw a card, ..., then you sacrifice ~" (Doom Foretold: the whole list
  only when nothing was sacrificed), "If it entered under your control, put a +1/+1 counter on it. Otherwise, tap it"
  after a flicker (Hallowed Respite), "Shuffle a card from your hand into your library. If you do, draw two cards at the
  beginning of the next turn's upkeep" (Lat-Nam's Legacy), "Cumulative upkeep—Draw a card" and "sacrifice a land and
  discard your hand" (Psychic Vortex), "exile them, then create that many ... tokens" after a search (Myr Incubator), "Each
  player shuffles their hand, graveyard, and all permanents they own into their library" (Sway of the Stars), "You draw
  cards equal to that creature's power. At the beginning of your next upkeep, return that card ... If you do, discard
  cards equal to that creature's toughness" (Vanish into Memory: the toughness of the creature that returned, rulings),
  three converge clauses with one "where X is" (Together as One), "if its mana value is equal to the amount of unspent mana
  you have" (Glissa Sunseeker), "You choose a nonland card from it or a card from their graveyard" (Agonizing Remorse),
  "Each creature you control is a Vampire in addition to its other creature types and has ..." (Mephidross Vampire), "Each
  opponent chooses a creature they control. You gain control of those creatures" (Rags // Riches), "return a creature card
  with lesser mana value than the creature that died" (Death's Oasis), "You may reveal that card. If an instant or sorcery
  card is revealed this way, transform ~" (Delver of Secrets), "sacrifice ~ and return all cards exiled with it" (Promise
  of Tomorrow), "that player may pay 2 life. If they don't, they return a permanent they control to its owner's hand"
  (Umbilicus, and Blood Clock with the "unless" wording), "each creature that player controls with power greater than the
  number of cards in their hand" (Noetic Scales), "If the creature you control entered this turn, put a +1/+1 counter on
  it" (Malamet Battle Glyph). +19 (28,472 of 31,936).
- Out after round B58 (looked at, not done): Divine Intervention (a trigger on removing counters), Soulgorger Orgg (the
  life it took, returned as it leaves), Blood Sun ("except mana abilities", and lands entering under it), Archangel of
  Strife (a new choice for each player as it enters), Haktos the Unscarred (protection from each mana value but one), plus
  Summoning Trap, Moonlight Bargain, Wild Research, Random Encounter, Mordor on the March, Boneyard Mycodrax, Hibernation's
  End, Jeskai Infiltrator and Flash Foliage.
- Round B59 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 15,000): "Until end of
  turn, if a nontoken creature would enter and it wasn't cast, exile it instead" (Mistcaller), "Double all damage that
  creature sources you control would deal" (Absorbing Man and Titania), "Instant and sorcery spells you control have
  rebound" (Cast Through Time), "target monocolored instant or sorcery card" (Maestros Confluence), "exile the top card
  of your library. If it's a land card, create ... Otherwise, you may cast it until the end of your next turn" (Bruse
  Tarl, Roving Rancher), "you may exile a card from a graveyard. If a creature card was exiled this way" (Deathbonnet
  Sprout // Deathbonnet Hulk; "you may exile a card from a graveyard" no longer forces one), "each creature that doesn't
  have first strike, double strike, vigilance, or haste", "attack with at least two creatures that have ..., and/or
  haste" and "Choose a creature at random that attacked this turn. Destroy that creature" (Path of Mettle // Metzali,
  Tower of Triumph), "gain control of enchanted permanent until end of turn. Untap that permanent" (Frenzied Fugue),
  "each player starting with you may pay any amount of mana" (Mana-Charged Dragon), "Then you may reveal a Giant card
  from your hand. When you do, ..." and "The next Giant spell you cast this turn costs {2} less" (Invasion of the
  Giants), "Whenever you cast a spell with mana value 5 or greater this turn" as a chapter (Battle of Frost and Fire),
  "That creature gains bushido 1 and becomes a Samurai in addition to its other creature types" (Sensei Golden-Tail, for
  good), "It gains defender and becomes a colorless artifact ... Its activated abilities can't be activated" (Xathrid
  Gorgon, for good), "a creature card with no abilities" (Fang-Druid Summoner), "If a card with the chosen name is
  revealed this way" (Isperia the Inscrutable), "a multicolored instant or sorcery spell" (Cloven Casting), and a leading
  "Until your next turn" now covers "..., and its activated abilities can't be activated" too (Academic Probation's
  second mode; Dovin Baan's and Linvala, Shield of Sea Gate's abilities, whose other lines keep them out). A "When ~
  enters, choose a card name" trigger no longer counts as the name a static or ban uses (Petrified Hamlet stays out). +17
  (28,489 of 31,936).
- Out after round B59 (looked at, not done): Djinn Illuminatus and Reiterating Bolt (replicate granted or paid with
  energy), Heliod's Punishment (a granted ability that refers to its source), Creeping Peeper and Karfell Harbinger (mana
  for special actions), Quarantine Field (X targets from its counters), Shivan Sand-Mage and Timebender (suspended cards as
  targets), Emrakul's Evangel (sacrificing any number as a cost), Ancestral Knowledge, Ral and the Implicit Maze (the
  Spellgorger Weird token), plus Awe Strike, Pulsemage Advocate, Aphetto Dredging and text-changing cards.
- Round B60 (cards no earlier round wrote down, least played first, EDHREC rank about 19,800 to 15,000, plus All Suns'
  Dawn from the list below): "have base power and toughness 3/3 and lose all creature types" (Curse of Conformity),
  "then return it to the battlefield under your control tapped and attacking" (The Neutrinos; the attacked player or
  planeswalker is chosen as it returns, during combat only, CR 506.3d), "Whenever you cast your fourth noncreature spell
  each turn" (The Fantasticar), "Choose target creature card in your graveyard that was put there from the battlefield
  this turn. Return it to the battlefield tapped" (Othelm), "Whenever equipped creature attacks the monarch" (The Spear of
  Bashenga) and "Whenever that creature attacks the monarch this turn" (Okoye), "add {R} at the beginning of your next
  main phase this turn" (Conduit of Storms), "doesn't untap during its controller's untap step for as long as ~ remains
  on the battlefield" (Neko-Te, Origin of Iron Man, Somnophore), Book Equipment tokens (Moira Brown; Book, Heartwood and
  Vibranium are artifact types, CR 205.3g), "~ doesn't have defender" and "~ is blue" as activation conditions (Surge
  Engine), "For each color, return up to one target card of that color" (All Suns' Dawn: five targets, never the same
  card twice, CR 115.3), "another target permanent that shares one of those types with it" (Legerdemain), "return a
  nonland permanent you own" (Phenomenon Investigators), "When equipped creature transforms, transform this Equipment"
  (Neglected Heirloom), "Then if there are three or more cards exiled with ~, transform it" (Profane Procession),
  "transform up to one other target double-faced artifact you control" (Tetzin's The Golden-Gear Colossus),
  "enchanted permanent's controller sacrifices ..., then that player loses 1 life" (Strangling Grasp: still that player
  after the enchanted permanent is gone), fateseal N (Mesmeric Sliver, Spin into Myth: the opponent is chosen as it
  resolves, CR 701.29a), "If ~ would be destroyed, regenerate it" and "Only your opponents may activate this ability"
  (Clergy and Knight of the Holy Nimbus; the UI offers the ability on an opponent's permanent only). +23 (28,512 of
  31,936).
- Out after round B60 (looked at, not done): Mossbridge Troll (tapping creatures with total power 10 as a cost), Faces of
  the Past (a group sharing a creature type with the dying creature), Loki Laufeyson (a mana value limit from its power on
  a delayed cast trigger), The Fugitive Doctor and Filigree Racer (flashback or jump-start granted until end of turn),
  Mazzy (an Aura put into a graveyard, cast until your next turn), Saheeli's Lattice, Paleontologist's Pick-Axe and Throne
  of the Grim Captain ("craft with one or more"), Seifer (blocked by two or more), Distended Mindbender (a choice of two
  cards by different rules), plus Shaun & Rebecca, Wild Shape, Bridge from Below, Aetherborn Marauder, Sigardian Zealot,
  Rhuk (done in round B70), Alpha Brawl, Brain in a Jar, Sita Varma, Munda and Hans Eriksson.
- Round B61 (the unlisted ones from EDHREC rank about 19,700 up, and from the B10/B11 lists below): "gets +2/+2 until
  end of turn if its power is 2" (Savage Swipe), "costs {2} less if a creature is attacking you" and "If a Hero enters
  this way, it enters with two additional +1/+1 counters" (Heroic Return; the same condition lets Confront the Assault
  be cast, not Commander-legal), "if that creature's power is greater than ~'s" on an enters-or-dies trigger (Pelt
  Collector: a creature that died is compared as it last existed), "if it's the second creature spell you cast this
  turn" (Vengevine), "Whenever an opponent gains life" from the graveyard (Punishing Fire), "Untap any number of target
  creatures. Prevent all combat damage ... to and dealt by those creatures" (Energy Arc), "You gain 2 life if a Lesson
  card is milled this way" (Sparring Dummy), "When you discard a nonland card this way, ~ deals damage equal to that
  card's mana value" (Fiery Encore, and Summon: Kujata's chapter III to each opponent), "that player mills a card. Then
  they create X ... where X is the milled card's mana value" (Infernal Genesis), "the greatest power among creature
  cards put into your graveyard this way" (Discerning Taste), "Whenever you cast a creature spell during an opponent's
  turn" (Breath of the Sleepless), "If a permanent you controlled or a token was destroyed this way" (Break the Spell),
  "The creature you control deals damage equal to its power to the creature an opponent controls" (Beastie Beatdown, a
  one-sided fight), "you may have target noncreature artifact you control become a 0/0 artifact creature. If you do"
  (Workshop Elders), "that creature's controller gains control of ~" (Contested War Zone), "Until end of turn, target
  creature gets +6/+6 and gains trample, and all creatures able to block it this turn do so" (Revenge of the Hunted),
  "It's still a Cave land" and "the number of other Caves you control plus the number of Cave cards in your graveyard
  is three or greater" (Cavernous Maw), "copy that spell and you may choose new targets for the copy" (Mica, Reader of
  Ruins), "for each player, ~ deals 1 damage to that player unless they pay {B} or {3}" (Lim-Dûl's Hex: each in turn
  order, CR 101.4), "up to X target artifacts without mana abilities" (Midnight Arsonist; triggered mana abilities
  count, CR 605.1b), "If this spell's mayhem cost was paid" (Sandman's Quicksand, CR 702.187b). +23, 22 of them
  Commander-legal (28,534 of 31,936).
- Out after round B61 (looked at, not done): Nullstone Gargoyle (the first noncreature spell each turn by any player),
  Grimdancer (a choice of two counters from three), Cuombajj Witches and Trial of Agony (an opponent chooses a target),
  Magus of the Abyss (a target "of their choice": the upkeep player chooses it), Abuelo's Awakening (a returned
  artifact that's also a 1/1 Spirit creature with X more counters), Faith's Shield (fateful hour: you and your
  permanents gain protection), Chandra's Phoenix (damage dealt by a red instant or sorcery spell or red planeswalker you
  control), Heart-Shaped Herb, Meticulous Excavation (unearth check), Culmination of Studies, Psychotic Episode,
  Lochmere Serpent.
- Round B62 (the unlisted ones from EDHREC rank about 19,700 up): affinity for historic permanents (Banish to Another
  Universe), "Activate only during your turn" on every player's spells and abilities (City of Solitude: you can't cast
  spells or activate abilities during another player's turn), "put a +1/+1 counter on target creature for each 1 life
  you gained" (Cradle of Vitality), "if that player has no cards in hand and ~ has N or more counters on it" (Quest for
  the Nihil Stone), "Spells with flash you cast cost {1} less" and "can't be countered" for the spells you cast only
  (Cunning Nightbonder: not copies, not spells whose control changed), "Permanent spells you cast that have an
  Adventure cost {1} less" and "return all cards with an Adventure milled this way" (Beluna Grandsquall // Seek
  Thrills), transfigure (Fleshwrither, CR 702.71a), a squad cost that isn't mana ("Squad—Exile four cards from your
  graveyard", Ruthless Radrat: four more cards each time, CR 702.157a; the squad picker now shows that cost in words),
  freerunning by returning a creature to hand (Escape Detection), "you may untap all lands you control. If you do, you
  can't cast spells until your next turn" (Innocuous Researcher), "gets +X/+Y, where X is the power and Y is the
  toughness of the exiled card" (Phyrexian Ingester, the card as it is in exile), "When enchanted player loses the game"
  (Curse of Vengeance), "put it onto the battlefield attached to target player" (Bitterheart Witch), "When this
  creature exploits a creature, return ... all creatures your opponents control with toughness less than the exploited
  creature's toughness" (Profaner of the Dead), "If it's a Vehicle, it becomes an artifact creature" (Tune Up),
  "becomes a legendary 0/0 Elemental creature with haste named Vitu-Ghazi. It's still a land" (Awakening of
  Vitu-Ghazi). +16 (28,574 of 31,936 with round 223).
- Out after round B62 (looked at, not done): Arcus Acolyte (outlast granted to creatures without a +1/+1 counter),
  Skyclave Shade (a landfall trigger from the graveyard that lets it be cast this turn), Jocasta, Automaton Avenger
  (returns tapped and attacking when you attack with your commander, from the graveyard), Undiscovered Paradise
  (returned to hand during your next untap step), Archangel of Strife (each player chooses war or peace), Lumbering
  Battlement (exile any number until it leaves, +2/+2 for each), Forbidden Crypt (draws replaced, losing if you
  can't), Induced Amnesia (exiled face down, returned when it leaves), Heart of Kiran (a loyalty counter instead of
  crewing).
- Round B63 (the unlisted ones from EDHREC rank about 19,700 up): "If damage is prevented this way, ~ deals that much
  damage to any target" (Acolyte's Reward: the damage is still prevented when only that second target is gone,
  rulings), "Whenever you pay ~'s cumulative upkeep" (Hibernation's End), "put this creature's counters on that
  token" (Ambitious Augmenter), "If a permanent spell is countered this way, exile it instead ... You may cast that
  card without paying its mana cost for as long as it remains exiled" (Thranduil's Decree), "Put a random creature
  card from among them onto the battlefield" (Getaway Barrel: no choice, picked by the seeded rng), "Whenever combat
  damage is dealt to you or a planeswalker you control, if this card is in your graveyard" (Vengeful Pharaoh: one
  trigger for you and one per planeswalker, per combat damage step, rulings), "has hexproof unless it's attacking"
  and "untap it and it can't be blocked by creatures with greater power this combat" (Tadeas, Juniper Ascendant),
  "~'s power is equal to" a characteristic-defining token (Consuming Blob), "choose another target creature for each
  time ~ was kicked. Put X +1/+1 counters on each of them" (Strength of the Tajuru), "you may pay 2 life and exile
  it. If you do, create a token that's a copy of that creature, except it's 1/1 and has toxic 1" (Kinzu of the Bleak
  Coven), "Players can't pay life to cast spells or to activate abilities that aren't mana abilities" (Karn's Sylex:
  Phyrexian mana and life costs; 0 life can still be paid, CR 119.4b; not turning a face-down permanent face up, a
  special action). Breathless Knight, Bounty of the Luxa, Woodland Weavemaster and Cheering Crowd were dropped from
  this round: Lane A's round 224 does them. +11 (28,601 of 31,936 with round 224).
- Out after round B63 (looked at, not done): Divine Deflection (prevention shared by you and your permanents),
  Refraction Trap (trap cost and a chosen source), Intermediate Chirography (a modified creature that died this
  turn), Churning Reservoir (oil counters put this turn), Dutiful Knowledge Seeker (cards put into a library from
  anywhere), Simic Manipulator and Arcee (remove one or more counters as a variable cost), Benalish Commander and
  Detritivore (suspend X), Darigaaz Reincarnated, Sekki, Seasons' Guide, Fugitive Codebreaker, Reroute, Serum Powder,
  Delaying Shield, Immortal Coil, Fires of Mount Doom.
- Round B64 (the unlisted ones from EDHREC rank about 19,700 up to 15,000): "return to the battlefield target creature
  card in your graveyard that was put there from the battlefield this turn" (Moira, Urborg Haunt), "Whenever you put a
  +1/+1 counter on a creature, ... This ability triggers only once each turn" (Ant-Man, Colony Commander), a Gingerbrute
  token, a copy of the card Gingerbrute with its mana cost {1} (Ginger, Queen of Sweets, rulings; TokenSpec.manaCost),
  "Whenever ~ attacks a player who has more life than you, other creatures you control attacking that player get
  +2/+0" (Namor, Atlantean King: life compared as it attacks), "goad each creature your opponents control that's
  enchanted by an Aura you control. Put a +1/+1 counter on ~ for each creature goaded this way" (Kaima, the Fractured
  Calm), "Whenever one or more creature cards are put into graveyards from anywhere" (Dennick, Pious Apparition: anyone's
  cards, not tokens), "Activate only if you have exactly zero or seven cards in hand" (The Biblioplex), "up to two
  Cleric, Rogue, Warrior, Wizard, and/or Ally cards" (Tazri, Beacon of Unity), "Noble creatures you control and Lesson
  spells you control have lifelink" (Lo and Li, Twin Tutors), "if no permanents left the battlefield this turn"
  (Sarevok, Deathbringer), "You can't become the monarch this turn" (Jared Carthalion, True Heir: the monarch stays the
  monarch, rulings) and "If damage would be dealt to ~ while you're the monarch, prevent that damage and put that many
  +1/+1 counters on it", "you may pay {X}{X}. When you do, distribute X +1/+1 counters among any number of target Elves"
  (Numa, Joraga Chieftain: X paid twice, CR 107.3), "If you sacrificed a creature this way, create ..." and "For each
  opponent who didn't discard two nonland cards this way, you draw a card" (Garruk, Veiled Butcher), "loses all
  abilities, and gains hexproof. It can't be blocked this turn" (Chromium, the Mutable), "put three +1/+1 counters on up
  to one other target artifact or creature. If it isn't a creature, it becomes a 0/0 Mutant creature" (Pizza Face,
  Gastromancer), "Put a +1/+1 counter on it for each Mount and/or Vehicle you control other than ~" (Spire Mechcycle).
  +16 (28,631 of 31,936 with round 225).
- Out after round B64 (looked at, not done): Toluz, Clever Conductor ("exile them" about the discarded cards as a
  group), Shackles of Treachery (a granted trigger targeting Equipment attached to it), The Five Doctors and Say Its
  Name (searching library and/or graveyard, or graveyard, hand and/or library), Cosmium Confluence (the same mode more
  than once), Winter, Cursed Rider (exiling X cards as a cost), Melira, the Living Cure (poison replacement and a
  delayed return), Mirkwood Trapper ("that player chooses an attacking creature"), Captain Marvel, Apex Avenger ("the
  same number and kind of counters"), Storyweave (lore counters and the next enchantment creatures entering), Lodestone
  Bauble (cards from one player's graveyard on top in any order), Ellywick Tumblestrum ("If it's legendary" in a dig,
  and her emblem), Scythe Specter (the greatest mana value among the discarded cards), Moorland Rescuer (total power X
  or less), Nazahn, Revered Bladesmith, Liliana, the Necromancer (creature cards from graveyards onto the battlefield).
- Round B65 (the unlisted ones from EDHREC rank about 19,700 up, and Hollow One and Take Out the Trash from the B10 and
  B11 lists): "Whenever ~ is dealt damage, exile that many cards from the top of your library. Choose one of them. Until
  the end of your next turn, you may play that card" (Feldon, Ronom Excavator) and the same "exile that many cards" after
  combat damage this turn (Fire Giant's Fury), "Then you may sacrifice it. If you do, exile the top X cards of your
  library, where X is the number of skewer counters on ~" (Rotisserie Elemental: its counters as it last existed),
  "Whenever ~ or an instant or sorcery spell you control deals damage to a player" (Syr Carah, the Bold: any player, you
  too, once for each), "Whenever a creature attacking one of your opponents becomes blocked by two or more creatures"
  (Seifer, Balamb Rival: anyone's creature), "Whenever an Aura you control is put into your graveyard from the
  battlefield, exile it. Until the end of your next turn, you may cast that card" (Mazzy, Truesword Paladin), "Whenever
  one or more creatures deal combat damage to you while you're the monarch, tap those creatures and put a stun counter
  on each of them" (Tamiyo, Upriser Crowned), "you may discard any number of land cards. When you discard one or more
  cards this way, ~ deals twice that much damage to target creature" (Borborygmos and Fblthp), "put a charge counter on
  it or remove one from it. When you remove a counter this way, choose one —" (Immard, the Stormcleaver: removing only
  with a counter there, CR 608.2d; the "or" choice now names the card instead of "~"), "If a land enters this way, it
  enters tapped" after a flicker (Silver Surfer, Cosmic Voyager), "target creature card with lesser power from your
  graveyard" (Gyrus, Waker of Corpses), "Discover X, where X is the mana value of the exiled card" (Ellie and Alan,
  Paleontologists), "for each card you've cycled or discarded this turn" (Hollow One: cycling is a discard, CR
  702.29a), "If you control a Raccoon, you may discard a card. If you do, draw a card" (Take Out the Trash). +14 (28,661
  of 31,936 with round 226).
- Out after round B65 (looked at, not done): Kaya, Ghost Assassin ("Exile ~ or up to one target creature"), Syrix,
  Carrier of the Flame ("if a creature card left your graveyard this turn", and casting it from the graveyard as a
  trigger resolves), Rinoa, Angel Wing (returning one of the attacking creatures that died, from any owner's graveyard),
  Tide of War ("Whenever one or more creatures block" and sacrifices by each controller), Countersculpt ("behold a Jace
  or pay {1}"), Druid of the Emerald Grove (a d20 that splits the searched cards), Sphinx's Approach ("exile ~ and four
  cards named ~"), Faces of the Past (creatures that share a creature type with it), Diaochan, Artful Beauty (a target
  of an opponent's choice).
- Round B66 (eight from the B10 list, and Stormwild Capridor, Kentaro, the Smiling Cat, Majestic Myriarch and
  Thunderous Orator from EDHREC rank about 19,700 up): "If damage would be dealt to you, prevent that damage. You gain
  life equal to the damage prevented this way" (Purity: one life gain for each damage event, CR 615.5 and 119.10), "If
  noncombat damage would be dealt to ~, prevent that damage. Put a +1/+1 counter on ~ for each 1 damage prevented this
  way" (Stormwild Capridor; static damage rules' extra effects now apply, before only the plan saw them), "Whenever a
  creature you control dies, if ~ is in your graveyard" and "When a nontoken creature is put into your graveyard from
  the battlefield, if ~ is in your graveyard, exile ~" (Bridge from Below), "If you have no cards in hand, ~ can't be
  countered and the damage can't be prevented" (Demonfire: checked when something would counter it and as it deals the damage), Sadistic
  Sacrament's kicked search, "You may pay {X} rather than pay the mana cost for Samurai spells you cast, where X is that
  spell's mana value" (Kentaro: a new alternative cost, "Cast it for" in the card's menu, X is 0 for spells with {X},
  CR 107.3 and 601.2f), "Your maximum hand size is equal to the number of hour counters on ~" (Midnight Oil), "At the
  beginning of the next end step, sacrifice it. If you do, you gain life equal to its toughness" (Spinal Embrace: its
  toughness as it last existed), "Whenever a player gains life, that player loses 2 life for each 1 life they gained"
  (False Cure), "loses 2 life plus 2 life for each Spirit sacrificed this way" (Devouring Greed), "~ gains X until end
  of turn if you control a creature with X. The same is true for ..." (Majestic Myriarch, Thunderous Orator: each
  hexproof variant as that variant, rulings). +12 (28,673 of 31,936 with round 226).
- Out after round B66 (looked at, not done): Swans of Bryn Argoll (its draws in the middle of damage could be replaced
  by dredge), Szadek, Lord of Secrets (the affected player orders it against prevention), Domri, Chaos Bringer (riot on mana spent from a loyalty
  ability), Dreamshaper Shaman (a nonland permanent card put onto the battlefield: Auras and battles), Qasali Ambusher
  (flash only for the alternative cost), Debt of Loyalty ("if it regenerates this way"), Murktide Regent (which cards
  delve exiled), War Tax, Mine Layer, Tatsumasa, the Dragon's Fang, Ride the Avalanche, Light Up the Night, Arachnus
  Spinner (done in round B71), Auratouched Mage, Bludgeon Brawl and Last Light of Durin's Day (searches across zones, cost-time choices or
  granted abilities with their own costs).
- Round B67 (from EDHREC rank about 19,700 up and the B10 and B11 lists): "{1}: The next time you would draw a card this
  turn, create a 2/2 green Bear creature token (you gain 5 life) instead" (Words of Wilding, Words of Worship: one draw
  replaced for each activation, from an empty library too, CR 614.11; a bot uses one in its upkeep for its draw step),
  "You may look at face-down creatures you don't control any time" (Lens of Clarity, also the top of your library;
  Found Footage, Keeper of the Lens: the UI shows what they are, not face-down spells, rulings; browser test),
  "Creatures can't attack a player unless that player cast a spell or put a nontoken permanent onto the battlefield
  during their last turn" (Arboria: who put it, the controller of what resolved, rulings; not their planeswalkers),
  "When one or more of your opponents are dealt combat damage during your turn, draw two cards. If your library has no
  cards in it, you win the game" (Fblthp, Impossibly Lost), "Then if that creature is a Mutant, Ninja, or Turtle"
  (Turtle Van), Take's "Remove all +1/+1 counters ... Draw that many cards" (Give // Take, fused too), Believe's "You may
  put it onto the battlefield if it's a creature card. If you don't, put it into your hand" (Reason // Believe), "a
  noncreature or Robot spell from your hand without paying its mana cost" once each of your turns (Vision, Spectral
  Synthezoid), Howl of the Horde's raid copy "an additional time" (a second delayed trigger, rulings), "Whenever a player
  taps a Mountain, Forest, or Plains for mana" (Keeper of Progenitus), "that player adds {G}{G}{G}. Until end of turn,
  they don't lose this mana" (Shizuko, Caller of Autumn). +14 (28,724 of 31,936 with round 229).
- Round B68 (from EDHREC rank about 19,700 up and the B10 and B11 lists): B67's Words gap fixed: with shields of
  different kinds waiting (two different Words, or a Words and Urabrask, Heretic Praetor), the drawing player chooses
  which one replaces the draw (CR 616.1; bots take their own Words, life at 10 or less, a token otherwise; a picker
  in the UI, browser test); the others wait for the next draw. "Look at the top three cards of your library instead.
  Put one of those cards into your hand and the rest on the bottom of your library in any order" (Tomorrow, Azami's
  Familiar; browser test), "Target creature attacks target opponent this turn if able" (Dulcet Sirens), "Creatures
  played by your opponents enter tapped" (Uphill Battle: cast creature spells only), Skeletal Swarming, "For as long as
  that card remains exiled, you may play it if you control a Kavu" (Possibility Technician), "If the exiled creature was
  a Thrull" (Soul Exchange: the exiled creature's last known types), "Noncreature spells you control have conspire"
  (Raiding Schemes), "Each red or green instant or sorcery spell you cast has conspire" (Wort, the Raidmother: no copy
  if Wort is gone as it's cast, rulings), Rassilon, the War President, Behold the Unspeakable (chapter II's
  "Otherwise, scry 2, then draw two cards"), "Each other Dog you control has unleash" (Tesak, Judith's Hellhound),
  "Each instant and sorcery card in your graveyard that's exactly two colors has jump-start" (Niv-Mizzet, Supreme).
  +12 (28,736 of 31,936 with B67).
- Round B69 (from EDHREC rank about 19,700 up): B68's gaps fixed: each instance of conspire is its own optional cost
  and its own copy (CR 702.78b: two Raiding Schemes, or Wort on a card with printed conspire; the UI asks again for each
  instance, bots pay every instance they have the creatures for; browser test), and every replacement of a draw waiting
  together is the drawing player's choice (CR 616.1): Words and Urabrask shields, Underrealm Lich, Tomorrow, dredge,
  Alhammarret's Archive, Abundance, Notion Thief and Scion of Halaster's look (bots keep their own Words, then the
  Archive, a look, the dredge card they want most; browser test). "Copy target triggered ability you control twice"
  (Mister Fantastic), "the next noncreature spell you cast this turn has affinity for artifacts" (Don & Raph, Hard
  Science), "Creature spells you cast have demonstrate" (Silverquill Lecturer), "As long as ~ has a conqueror counter
  on him, nonbasic lands are Mountains" (Zhao, the Moon Slayer), "All lands have \"{T}: Add one mana of any color\" and
  lose all other abilities" (Toxicrene, a basic land's own mana ability too), "transforms into a non-Human creature"
  (Cult of the Waxing Moon), "instead exile it and put a number of +1/+1 counters equal to that creature's power on
  this creature" (Ravenous Slime: its last known power; still exiled if the Slime dies at the same time, rulings),
  "Until your next turn, he becomes a land" (Hydro-Man, Fluid Felon), "This turn, creatures can't block unless their
  controller pays {X} for each blocking creature they control" (War Cadence), "Remove X +1/+1 counters from among
  creatures you control" (Retribution of the Ancients; browser test). +10 (28,774 of 31,936 with rounds 230 and 231).
- Round B70 (from EDHREC rank about 19,700 up and the B10 and B67 lists): cards exiled with ~ linked to more abilities
  (CR 607.2a): "You may cast a spell with mana value X from among cards exiled with ~ without paying its mana cost"
  (Kaho, Minamo Historian: the bot picks an X it can cast; browser test), "cast an instant or sorcery spell from among
  cards exiled with ~" (Jeleva, Nephalia's Scourge), "until end of turn, you may play a card exiled with ~" (Raphael,
  Most Attitude: one card, paid for; browser test), "Until end of turn, you may cast a creature spell from among cards
  exiled with this artifact" (Serpent's Soul-Jar), "Until end of turn, you may play cards you own exiled with this
  artifact" (Kayla's Music Box, exiled face down), the cards delve exiled are exiled with ~ (Ethereal Forager, rulings),
  "Spells with the same name as a card exiled with ~ can't be cast" by opponents (Circu, Dimir Lobotomist; CR 201.2a,
  bots target opponents' libraries with it). "During that turn, power-up abilities can't be activated" (Kang the
  Conqueror), "Attach all Equipment attached to that creature to ~" when another equipped creature attacks or dies
  (Rhuk, Hexgold Nabber: the Equipment attached as it died), "Creatures attacking the last chosen player have menace /
  get +1/+0" (Triarch Stalker, Beckoning Will-o'-Wisp), "Each opponent exiles the top card of their library. Until end
  of turn, you may cast spells from among those cards by paying life equal to the spells' mana values" (Xander's
  Pact), "Exile the top card of target player's library". +12 (28,799 of 31,936 with rounds 230 to 232).
- Round B71 (from EDHREC rank about 19,700 up, and a few more played cards the same templates cover): "Search your
  graveyard, hand, and/or library for a card named Scion of Darkness and put it onto the battlefield. If you search your
  library this way, shuffle." (Dark Supplicant, Gate to the Afterlife; Agency Outfitter's "a card named A and/or a card
  named B ... put them": the library only if you choose, then a shuffle, rulings; "Graveyard and hand only" in the UI,
  browser test), "Search your graveyard and/or library for a card named Arachnus Web and put it onto the battlefield
  attached to target creature" (Arachnus Spinner: the Aura only onto that creature, if it can enchant it, CR 303.4f-g;
  bots aim it at an opponent's creature), "Search your library and graveyard for a basic land card and a card named
  Jiang Yanggu" (Journey for the Elixir, Nissa's Encouragement: up to one of each; a card named Forest only, rulings),
  "Whenever an opponent shuffles their library" (Cosi's Trickster, Psychic Surgery: each time a library is shuffled, an
  empty one too, twice for Green Sun's Zenith, but not cards put on the bottom in a random order, rulings, CR 701.24;
  Psychic Surgery's look, exile one and the rest back in your order; browser test), "This effect doesn't remove this
  Aura" after a pump (Tattoo Ward) and "doesn't remove Auras" (Spectra Ward: no Aura falls off for it, but one with
  protection from its color from elsewhere does, White Ward staying, rulings, CR 702.16c), "if this artifact has a
  charge counter on it, tap it and remove all charge counters from it. Add {C} for each charge counter removed this way"
  (Ventifact Bottle), "creature or planeswalker an opponent controls that's red or white" and "deals damage equal to its
  power to that permanent" (Flourishing Grapple: that permanent is the first target; it was read as the creature
  dealing the damage), "a basic, Sphere, or Locus land card" and "Activate only if there are nine or more lands with
  different names among the basic, Sphere, and Locus lands you control" (Monument to Perfection). +13 (28,871 of 31,936
  with rounds 230 to 236).
- Round B72 (from EDHREC rank about 24,300 up to 13,300; every card left unread in that range that a "cards exiled
  with ~" or "while it has a counter" template could cover): cards exiled with ~ (CR 607.2a): "Put a creature card
  exiled with ~ onto the battlefield under your control. It gains haste until end of turn" (Yggdrasil, Rebirth Engine:
  the cards both its exile abilities exiled), "Choose a card at random that was exiled with ~. Put that card into its
  owner's hand" (Skyship Weatherlight), "Return up to X cards from among cards exiled with ~ to their owners' hands,
  where X is the result" (Bag of Devouring: the die roll, picked as it resolves), "Cast any number of cards exiled with ~
  without paying their mana costs" (Izzet Chemister), imprint "look at the top four cards of your library, exile one
  face down, then put the rest on the bottom of your library in any order" (Clone Shell; browser test) and "turn the
  exiled card face up. If it's a creature card, put it onto the battlefield" (Clone Shell, Summoner's Egg: otherwise it
  stays exiled face up, rulings), "You may cast spells from among cards exiled with ~" (Rona, Disciple of Gix: spells
  only, so not a land; not once Rona has left, rulings), "return all cards you own exiled with ~ to your hand" (Bottled
  Cloister, as errata'd), "Put a card exiled with this Saga into its owner's hand" (Roads Go Ever, Ever On); counters:
  "If you do, that creature has base power and toughness 3/1 and has flying for as long as it has a feather counter on
  it" (Aven Mimeomancer, CR 611.2b), "For as long as that land has a blaze counter on it, it has ..." (Obsidian
  Fireheart), "When that creature dies, if it has an egg counter on it, draw a card and create ..." (Xira, the Golden
  Sting: a delayed trigger that outlives Xira, checked with the counters it died with, CR 603.4, 603.10a), rejection
  counters and "for each opponent, choose up to one target creature they control with a rejection counter on it. That
  creature's owner puts it on their choice of the top or bottom of their library" (Tolarian Contempt); "choose a
  suspended card you own and remove that many time counters from it" (Amy Pond: picked as it resolves, the last counter
  casts it, CR 702.62; browser test). Engine fix: a "top or bottom of their library" effect with several targets
  looped forever (it moved the cards already put there again). +14 (28,885 of 31,936 with rounds 230 to 236).
- Round B73 (from EDHREC rank about 27,700 up to 22,500; cards whose one blocking line a small template covers): "~ is every
  creature type (even if this card isn't on the battlefield)" (Mistform Ultimus: a characteristic-defining ability like
  changeling, in every zone, kept when it loses its abilities, CR 604.3, 613.3), "It gets -6/-0 instead as long as its
  controller has seven or more cards in their graveyard" (So Tiny: the enchanted creature's controller), "that player
  sacrifices that creature unless they pay {2}" at the upkeep of the enchanted creature's controller (Slow Motion: not
  once someone else controls it, CR 701.21a), "Whenever enchanted land becomes tapped, ~ deals 2 damage to that land's
  controller" (Psychic Venom), "if that player controls more lands than each other player, the player creates" (Greener
  Pastures, checked again as it resolves, CR 603.4), "unless one of their opponents was dealt damage this turn"
  (Antagonism: the end step's player, the whole turn looked back on), "if ~ is the only creature card in your graveyard,
  you may return ~ to the battlefield" (Nether Spirit: two of them stop each other, rulings), "Choose three target
  nonenchantment permanents. Destroy one of them at random." (Wild Swing: among the targets still legal as it resolves),
  "X damage divided evenly, rounded down, among all creatures target opponent controls" (Dwarven Catapult: none if there
  are more creatures than X), "target opponent gains control of all other permanents you control" (Sky Swallower),
  "Enchanted land is the chosen type" (Convincing Mirage, Phantasmal Terrain: the basic land type chosen as the Aura
  entered, in place of its land types and their abilities, CR 305.7; browser test), "Prevent all damage that would be
  dealt to enchanted creature by sources of the chosen color" (Prismatic Ward; browser test), "Players (Your opponents)
  can't cast spells with the same name as the exiled card" (Exclusion Ritual, Ixalan's Binding: the card the enters
  ability exiled, while it stays exiled, CR 607.2a), "The owner of target spell or nonland permanent puts it on their
  choice of the top or bottom of their library" (Sudden Setback: a spell leaves the stack without being countered),
  "If it's (~ is) an Aura, enchanted creature gets ... instead" (Everflame Eidolon, Erebos's Emissary: bestowed, CR
  702.103), "target permanent you own or control" (Telim'Tor's Edict). +19 (28,904 of 31,936 with rounds 230 to 236).
- Round B74 (abilities an Equipment or Aura grants that name it, from the bottom of the list): quoted granted text
  naming the Equipment or Aura now points at that object (bound as the ability is granted, so it follows the object even
  if the creature changes, CR 113.7, 607.2): "Sacrifice Blazing Torch: Blazing Torch deals 2 damage to any target"
  (Blazing Torch: the damage source is the Torch as it last existed, CR 608.2h; only its controller can sacrifice it,
  CR 701.21a; browser test), Sunfire Torch, Ninja's Kunai, Deconstruction Hammer, Citizen's Crowbar, Spare Dagger,
  Surestrike Trident and Rakdos Riteknife ("Sacrifice ~", "counters on ~"), "{T}, Unattach Leonin Bola: Tap target
  creature" (Leonin Bola, Heartseeker, Trusty Boomerang, Razor Boomerang: unattaching only from that creature, CR
  701.3d; Razor Boomerang's damage comes from the Boomerang; browser test), "Return Blinding Powder to its owner's
  hand" (Blinding Powder), Trickster's Talisman, Archery Training; "can't attack (block) unless a creature with greater
  power also attacks (blocks)" (Okk, CR 508.1c, 509.1b: a blocker declared earlier in the combat counts), "each player
  who didn't discard a creature card this way loses 4 life" (Strongarm Tactics), "If it isn't a creature or Vehicle, it
  becomes a 0/0 Construct" (Lifecraft Awakening), "Whenever a card is put into your graveyard from your library"
  (Pedantic Learning), "Whenever a permanent is returned to your hand" (Azorius Aethermage, tokens included), "Whenever
  a permanent is returned to a player's hand, that player ..." (Warped Devotion: its owner). +21 (28,925 of
  31,936 with rounds 230 to 236 and B71 to B73). Also faster: the characteristics cache's count check (it
  was rebuilt as a string on every read) and the state copy, which took the slow Cocoon test from about 5 s to 1 s.
- Round B75 (one-line templates from the bottom of the list): "Put up to one target ... on top of its owner's library"
  (Dovin's Dismissal: with its only target illegal it doesn't resolve, CR 608.2b), "reveal it, then put it into your
  hand" (Sun-Blessed Mount), a search to the battlefield then one of library and graveyard for a named card (Verdant
  Crescendo), "Search your graveyard, hand, and/or library for an Aura (Rune) card and put it onto the battlefield
  attached to ~" (Boonweaver Giant, Runed Crown: only an Aura that could enchant it, CR 303.4a), granted outlast
  (Enduring Sliver, CR 702.107a), "another creature" once each turn (Knight of Wundagore), "creature you control that
  has an Adventure" (Mysterious Pathlighter), "Aura spells with enchant creature as though they had flash" (Rootwater
  Shaman: a creature cast bestowed too, CR 702.103b, d), "base power and toughness become N/N and they gain"
  (Moon Girl and Devil Dinosaur), "sacrifice ~ and it deals ... and you gain" (Eye of Jace), "When you cast ~ while you
  control a ..." (Social Snub), "gain control of target ..., untap that creature, and it gains haste" (Eldrazi
  Obligator, Yasova Dragonclaw: a may-pay untap of an untapped creature still gives control and haste, CR 701.26b,
  609.3), "loses all land types and abilities" (Lithoform Blight, CR 305.7), unlocked doors among Rooms you control
  (Rampaging Soulrager), "Whenever this Equipment becomes attached to a creature, tap that creature" (Enormous Energy
  Blade), "Whenever enchanted creature blocks a creature, that creature doesn't untap" (Shield
  of the Righteous), costs {1} less for each opponent you're attacking (Astral Confrontation), cards in the hand of the opponent
  with the most (Adamaro, First to Desire), "if you had an X or a Y enter the battlefield under your control this turn"
  (Cleaving Reaper). Fix: "Then if ..., sacrifice ~ and it deals" put the damage outside the condition. +21 (28,985 of
  31,936 with rounds 237 to 239).
- Round B76 (one-line templates from the bottom of the list): look-at-the-top filters "a blue or artifact card"
  (Tezzeret's Gatebreaker), "a card with a kicker ability" (Coralhelm Chronicler: multikicker too, not replicate,
  rulings), "a land card or a card with {X} in its mana cost" (Paradox Surveyor), "if an opponent cast a blue and/or
  black spell this turn" (Sandstalker Moloch); "target artifact (Forest) becomes an artifact creature with base power and
  toughness 5/5 (a 4/5 green Treefolk creature) for as long as ~ remains on the battlefield" (Skilled Animator, Unctus's
  Retrofitter, Awakener Druid, CR 611.2b); "becomes an Island in addition to its other types" with no duration (Sealock
  Monster) and "the basic land type of your choice in addition to its other types" (Navigator's Compass, CR 305.7);
  base power and toughness set to another creature's actual ones as the trigger resolves (Galion, Elvenking's Butler,
  Exuberant Wolfbear, Unruly Krasis) or to "4/1 or 1/4" (Master of Winds, CR 613.4b); "you may look at the top card of
  target opponent's library. If you do, you may put that card on the bottom" (Precognition); a token's delayed exile
  leaving it "that creature" (Elemental Appeal); three different targets with three bonuses (Arm the Cathars);
  creatures black and lands Swamps (Nightcreep); "creatures controlled by that player or by that planeswalker's
  controller can't block this turn", a rule for the turn (Concussive Bolt, rulings); exile, then back tapped under your
  control if its mana value was 3 or less (Vindictive Triumph); plural "become blue Illusions in addition to their other
  colors and types" (Phantasmal Form); "Return target Aura card from your graveyard to the battlefield" (Rise to Glory,
  Brotherhood Outcast: what it enchants is chosen as it enters, CR 303.4f); "discard a number of cards equal to"
  (Cabal Conditioning); "Enchanted creature deals 1 damage to target creature with flying" (Dizzying Gaze: the creature
  is the source). +24 (29,009 of 31,936 with rounds 237 to 239).
- Round B77 (one-line templates from the bottom of the list): "target player reveals a number of cards from their hand
  equal to ... You choose one of them. That player discards that card" (Disciple of Phenax, Klaw, Sonic Subjugator,
  Acquisitions Expert, Bala Ged Thief, Mire's Toll; "reveals X cards" Cabal Interrogator and Hollow Specter): that
  player picks which cards to reveal (new prompt, browser test; a bot reveals its cheapest), all of them if they have no
  more (CR 609.3); "As ~ enters, you may sacrifice any number of creatures and/or planeswalkers. If you do, it enters with
  twice that many +1/+1 counters" (Devouring Hellion) and "you may return a nonland permanent you control to its owner's
  hand. If you do, ~ enters with a +1/+1 counter" (Rescuer Sphinx, browser test), devour's choice as it enters (CR
  614.12); converge in an enters trigger: a target "with mana value less than or equal to the number of colors of mana
  spent to cast ~" (Sundering Archaic) and "draw X cards ... If you draw one or more cards this way, discard two cards"
  (Transcendent Archaic); "If it was dealt noncombat damage this turn" (Grisly Sigil, GameObject.wasDealtNoncombatDamage);
  "During that player's next untap step, creatures they control don't untap" (Imaginary Threats); "if enchanted
  permanent is a creature with the greatest power among creatures on the battlefield" (Historian's Wisdom); "choose a
  player. That player adds two mana of any one color they choose" (Stadium Vendors); "Choose a card type. Target opponent
  reveals their hand. ... for each card of the chosen type revealed this way" (Fertile Imagination, Blood Oath); "an Aura
  card with enchant creature" (Tallowisp); "both gain your choice of first strike or lifelink" (Ballroom Brawlers);
  "Return a Pirate card ..., then do the same for Vampire, Dinosaur, and Merfolk" (Grim Captain's Call); "choose target
  creature you don't control and tap it" (Celestial Regulator); "discards cards equal to the damage" (Jagged Poppet);
  "put a +1/+1 counter on another target creature you control, and that creature gains flying" (Skyrider Patrol). +23
  (29,032 of 31,936 with rounds 237 to 239).
- Round B78 (one-line templates from the bottom of the list): "If it's an enchantment creature or legendary creature,
  instead put a +1/+1 counter on it and it gets +1/+1" (Regent's Authority); "you control a land creature or a land
  entered the battlefield under your control this turn" (Earth Rumble Wrestlers); "~ escapes with N +1/+1 counters on
  it. When it enters this way, ..." (Pharika's Spawn, an enters trigger "if it escaped"); "Exile that creature until ~
  leaves the battlefield" (Grasping Giant); "At end of combat, gain control of that creature" (Tolarian Entrancer, and
  Charisma); "Whenever one or more creatures you control become blocked" (Hezrou); "~ loses all abilities and gains
  haste" as it returns (Hellcat, Undying Vigilante); a dies trigger "if it's not a Spirit" that returns it, "It's a
  Spirit Detective" (Otherworldly Escort); "Shuffle ~ and up to three target cards from a single graveyard into their owners'
  libraries" (Serene Remembrance); "Put a plague counter on ~ or remove a plague counter from it" (Plague Boiler, the
  either prompt); "has double strike as long as it's an enchantment. Otherwise, prevent all damage that would be dealt
  by enchanted creature" (Armament of Nyx); a search of that player's library that shuffles it once (Rootwater Thief);
  "until your next upkeep" (Xenic Poltergeist); "You may play that card for as long as you control ~" (Victor Mancha,
  Runaway); "counters equal to half that card's mana value, rounded up" of a card exiled from your graveyard (Torrent
  Sculptor). No new prompt. +16 (29,085 of 31,936 with rounds 240 to 242).
- Round B79 (one-line templates from the bottom of the list): an equip cost "{1} if it targets a colorless creature"
  (Ghostfire Blade); "You can't choose an untapped permanent as ~'s target as you cast it" (Dream Leash, Enthralling
  Hold; the bot picks tapped targets too); "{N} less to cast if it targets a creature whose controller has eight or more
  cards in their graveyard" (Lullmage's Domination); "Prevent all combat damage non-Soldier creatures would deal this
  turn" (Frontline Strategist); "+2/-2 or -2/+2" on target creature (Shaper Parasite); "put two time counters on it and
  it gains vanishing" (Maelstrom Djinn, CR 702.63b); look at the top card of target player's library and pay 2 life to
  put a nonland card into their graveyard (Wand of Denial: the pick says "you pay 2 life for each"; browser test);
  "gets +1/+0 if you've cast another instant or sorcery spell this turn. Then it deals damage" (Burrog Barrage); "Add
  {B}{B} or {G}{G}" (Cadaverous Bloom; browser test of the two-color choice); "Prevent all damage that would be dealt by
  instant and sorcery spells" (Energy Storm); "can't be the target of abilities from artifact sources" (Artifact Ward);
  "When a Vehicle you control attacks, exile enchanted creature" (Caught in the Brights); "When ~'s echo cost is paid"
  (Shah of Naar Isle, mana echo only); "You may play that card this turn" after an opponent exiles their top card
  (Ornate Kanzashi); "Remove an oil counter from ~: It becomes a 5/5" (Meldweb Strider); "Whenever you become the target
  of a spell" (Dormant Gomazoa). UI fix: a look at another player's library is headed "The top of Ana's library", not
  "your library". +17 (29,065 of 31,936; 29,102 with rounds 240 to 242).
- Round B80 (one-line templates from the bottom of the list): "Whenever ~ becomes blocked by a creature, the blocking
  creature gets -1/-1" (Order of the Alabaster Host); "becomes blocked by a nonartifact, non-Dragon creature, that
  creature gets -X/-0, where X is half the creature's power" (Catacomb Dragon); "becomes blocked by a non-Wall creature,
  that creature's controller sacrifices it at end of combat. If the player does, they create" (Basalt Golem); "Whenever
  a creature blocking ~ dies" (Baneblade Scoundrel // Baneclaw Marauder, read from last known blocking); "Counter target
  activated ability from an artifact source unless its controller pays {W}" (Ayesha Tanaka); "Counter target activated
  ability from an artifact source and destroy that artifact if it's on the battlefield" (Ouphe Vandals: the source is
  destroyed even if the ability can't be countered); "Creatures don't untap during target player's next untap step"
  (Blinding Beam, all creatures that player's untap step would untap, Seedborn Muse too, per the ruling); exile the top
  card and get +X/+X of its power and toughness (Bioplasm); draw, discard, "if a creature card is discarded this way,
  transform ~" (Civilized Scholar); put a rust counter on each artifact target opponent controls, then destroy each
  artifact with mana value at most its rust counters (Corrosion, read literally: a 0-mana-value artifact with no rust
  counters is destroyed too); reveal until three nonland cards, those to hand and "the rest on the bottom of your library
  in any order" (Fathom Trawl: new bottom-order pick after the reveal; browser test); "creature cards that were put into
  your graveyard from the battlefield this turn" (Fell Shepherd); "if there is a colorless creature card in your
  graveyard" (Grizzled Angler); "the greatest mana value among the milled cards" (Heretic's Punishment); "Copy target
  instant or sorcery spell that targets you" (Mirror Sheen); "unless they sacrifice another creature of their choice"
  (Unnatural Hunger: not the enchanted creature); "Whenever that creature deals combat damage this turn, if this spell
  was kicked" (Vigorous Charge); "power less than 0" (Wasp, Shrinking Savior). +18 (29,120 of 31,936; 29,146 with rounds
  243 and 244).
- Round B81 (one-line templates from the bottom of the list): "If an instant or sorcery card is milled this way,
  transform ~" (Aberrant Researcher); target player reveals the top four, "You choose two of those cards and put them
  into their graveyard. Put the rest on top of their library in any order" (Bamboozle); "If an instant card or a card
  with flash is exiled this way, they lose 1 life. Otherwise, you lose 1 life" after exiling a card from their hand
  (Check for Traps); "Simultaneously untap all tapped creatures and tap all untapped creatures" (Breaking Wave); "Exile
  all creature cards in all graveyards that were put there from the battlefield this turn" (Cry of the Carnarium); a
  graveyard trigger with a "sacrifice a Swamp" cost (Akuta, Born of Ash); "sacrifice ~ unless you put a card from your
  graveyard on the bottom of your library" (Anurid Scavenger: new graveyard pick; browser test); "The controller of
  target artifact sacrifices it, then reveals ... until an artifact card" (Shape Anew); reveal until "a creature card of
  the chosen type" onto the battlefield, the rest shuffled (Riptide Shapeshifter); "you may reveal ... until a land. If
  you do, put" (Avenging Druid); "Whenever an enchanted creature you control becomes blocked" (Beastmaster's
  Magemark); "each Aura attached to a creature deals 2 damage to the creature it's attached to" (Aura Barbs); "you may
  cast target instant or sorcery card from your graveyard without paying its mana cost" this turn (Sins of the Past: X
  is 0, no alternative costs, CR 118.9, 107.3b); "Tap enchanted creature and remove it from combat" and "As long as
  enchanted creature isn't legendary, it doesn't untap" (Stunning Strike); "Exile it until ~ leaves the battlefield"
  (Hixus, Prison Warden); "If a source would deal 4 or more damage to a permanent or player, that source deals 3 damage
  to that permanent or player instead" (Divine Presence). Rules bug fixed: a static "As long as enchanted/equipped
  creature ..., it ..." applied "it" to the Aura or Equipment itself instead of the creature (no other card's
  compilation changed). +16 (29,136 of 31,936; 29,162 with rounds 243 and 244).
- Round B82 (one-line templates from the bottom of the list): "You gain 1 life and ~ deals 1 damage to target player"
  as two sentences (Axelrod Gunnarson); "The next time a creature with shadow of your choice would deal damage to you
  this turn, prevent that damage" (Circle of Protection: Shadow); the same for "a creature of the chosen type" (Circle
  of Solace); "~ deals damage to that creature and that player equal to X" after "target creature's controller"
  (Friendly Fire); "During combat, players can't cast instant spells or activate abilities that aren't mana
  abilities" (Hand to Hand); "Whenever another card is put into your graveyard from anywhere" (Measure of
  Wickedness); "discards all cards of each of the sacrificed creature's colors" (Mind Extraction: a colorless creature
  makes them discard nothing); "unless defending player sacrifices a creature of their choice" (Ogre Marauder);
  "Reveal your hand and discard a card of target opponent's choice. Then that player reveals their hand and discards a
  card of your choice" (Rakdos Augermage); three creature targets dealt 2, 3 and 4 damage with an "exile it instead" rider
  (Serpentine Spike); "That player looks at the top N cards of your library, then puts them back in any order"
  (Tahngarth's Glare, the opponent orders your library); "you may pay {2}{R}{R}. If you do, you may cast ~ from your
  graveyard without paying its mana cost" (Thunderblade Charge); "Whenever an artifact you control is put into a
  graveyard from the battlefield, if it wasn't sacrificed" (Urza's Miter); "Whenever a creature dealt damage by
  enchanted creature this turn dies" (Vampiric Embrace); "destroy ~ and it deals damage to you equal to the number of
  pin counters on it" and "X is the number of pin counters on ~" (Voodoo Doll). +15 (29,177 of 31,936 with rounds 243
  and 244; 29,191 with round 245).
- Round B83 (one-line templates from the bottom of the list): "Whenever a legendary permanent other than ~ is put into a
  graveyard from the battlefield" (Yomiji, Who Bars the Way: it sees a legendary permanent that dies with it); "At the
  beginning of your upkeep, if ~ is on the battlefield, each player returns all cards named ~ from their graveyard to
  the battlefield" (Myr Servitor); "This ability triggers only once" (Acrobatic Cheerleader, kept on the object, CR
  603.2h); "Tap another untapped creature you control with flying" as a cost (Radiant, Serra Archangel); exchanging
  control with "target artifact or creature you don't control" (Shrewd Negotiation); "target creature with power less
  than or equal to that creature's power an opponent controls", checked again as it resolves (Spawnbroker); "For each
  of those permanents, its controller creates ..." after destroying up to three targets (Soul of Emancipation);
  "Change the target of target spell (or ability) that targets only a player / ~. The new target must be a
  player/creature", every target that names it changing (Rebound, Torchling, Silver Wyvern; bots use Torchling's and
  Silver Wyvern's against an opponent's harmful spell); "Prevent all combat damage that would be dealt this turn by
  creatures other than enchanted creatures and enchantment creatures" (Inspire Awe); a delayed "Whenever a creature
  attacking you deals combat damage to you this turn" (Harsh Justice); "Prevent all combat damage a creature of your
  choice would deal this turn", offering only permanents (Ajani's Aid); a delayed "Whenever ~ becomes blocked by a
  creature of that color this turn, destroy that creature" (Zombie Boa); "Whenever one or more cards are put into
  exile during your turn" (Stonebinder's Familiar); "Each creature you control is no longer goaded" (Serene Sleuth);
  "X is the number of times this ability has resolved this turn" (Bronze Cudgels). +17 (29,208 of 31,936; 29,226 with round 246).
- Round B84 (one-line templates from the bottom of the list): "as long as they haven't dealt combat damage yet"
  (Ruric Thar, Magecrusher; reset when it changes zones); "Whenever a creature / spell deals damage to ~, ~ deals that
  much damage to that creature / that spell's controller" (Tephraderm); Animate Artifact (enchanted noncreature
  artifact becomes a creature with P/T equal to its mana value); "deals that much damage" from a spell's mana value
  (Imminent Doom); Chaos Lord (an opponent gains control of it if the number of permanents is even; haste unless it
  entered this turn); Mirror Golem (protection from each of the exiled card's card types, read from the linked exile);
  "Each other player may put a creature card from their hand onto the battlefield" (Charmed Griffin); "the damage
  dealt to you so far this turn by artifacts" (Reverse Polarity); "Whenever a source of the chosen color deals damage
  to you" (Circle of Affliction); "Pay 3 life for each velocity counter on ~" as a cost (Tornado); damage equal to
  the cards drawn this way (Malignant Growth); exile the top four and repeat while two share a name (Scalpelexis);
  exile the top three and repeat until a land (Rally the Horde); "Any number of target players may each search"
  (Turtle Tracks); look at the top eight, exile four at random (Orcish Librarian); "Whenever a creature card leaves an
  opponent's graveyard" from the graveyard (Erebos's Titan); "That opponent may put ... from their hand onto the
  battlefield" (Metamorphose); protection from each color whose basic land type you control (Dominaria's Judgment);
  "if it shares a color with the most common color" (Tsabo's Assassin). +19 (29,263 of 31,936 with B83 and rounds 246
  and 247).
- Round B85 (one-line templates from the bottom of the list): "that targets only ~" (Reflective Golem); "You may
  change the targets of target instant or sorcery spell", all of them or none (CR 115.7a; Goblin Flectomancer, with
  the retarget bar saying so); "Activate only if you've controlled ~ continuously since the beginning of your most
  recent turn" (Rocket Launcher); "that spell or ability's controller gains control of that creature" (Fractured
  Loyalty); Burden of Proof; "Whenever ~ deals combat damage to one or more blocking creatures" (Arashin War Beast);
  "Whenever ~ and another creature attack different players" (Canal Courier); "When you discard one or more nonland
  cards this way" (Seasoned Cryomancer); "if you attacked with exactly one other creature this combat" (Creepy
  Puppeteer); "Permanents you control can't be the targets of blue or black spells your opponents control this turn"
  (Display of Dominance); damage equal to a planeswalker's loyalty (Compel Brutality); each player chooses a
  nonland permanent for a doom counter (Eye of Doom); Hazezon Tamar (X counted at the upkeep); Goblin Lyre (that
  opponent or that planeswalker's controller); "if you've activated a loyalty ability this turn" (Kiora of Salt and
  Sand); "When you do" after exiling one or more cards from your graveyard (Specter of Mortality). Two-word creature
  types ("Eldrazi Scion", "Sand Warrior", "Spider Hero") now need both types instead of either (CR 205.3), which fixes
  Kor Castigator, Deathless Behemoth, Hand of Emrakul, Drowner of Hope, Brood Birthing and Radioactive Spider. +16
  (29,279 of 31,936 with B84; 29,293 with round 248).
- Round B86 (one-line templates from the bottom of the list): "Whenever a creature you control attacks a player
  alone" (Yuriko, Blade of the Mighty, Jiang Yanggu, Alone: attackers of that player's planeswalkers don't count,
  per the rulings) and Yuriko's "During combat, players can't cast spells or activate abilities that aren't mana
  abilities"; "target opponent previously dealt damage by it" and "each opponent and planeswalker it has dealt damage
  to this game" (Diseased Vermin, The Fallen: a permanent remembers whom it has dealt damage to while it stays on the
  battlefield); a planeswalker with loyalty counters is a creature with no abilities whose power and toughness equal
  its loyalty (Spark Rupture); support then "each creature you control with a +1/+1 counter on it deals damage"
  (Nissa's Judgment); "for as long as that creature is enchanted" (Rootwater Matriarch); "you control each creature
  on the battlefield with the greatest power" (Might Makes Right); "each creature with the greatest mana value"
  (Favor of the Mighty); "the player with the lowest life total or tied for lowest" gains control (Loxodon
  Peacekeeper); a token "that's attacking" with ~'s power and toughness (Gemini Engine); the greatest mana value
  among noncreature permanents and noncreature cards in your graveyard (Dragon Man, Reformed Robot); mana spent only
  on a spell with flashback cast from a graveyard (Altar of the Lost); "if it shares a card type with the card exiled
  this way" (Holistic Wisdom); "if an opponent was dealt noncombat damage last turn" and counters on "each other
  Wizard token you control" (Command the Stage); "Enchanted creature can't be blocked as long as it's attacking
  alone" (Gutter Skulker // Gutter Shortcut). +16 (29,295 of 31,936 with B85; 29,319 with rounds 248 and 249).
- Round B87 (one-line templates from the bottom of the list): "Reveal the first card you draw each turn. Whenever you
  reveal a basic land card / creature card this way" (Rowen, Primitive Etchings); "When you attack with exactly two
  creatures, transform this creature" (Alluring Suitor // Deadly Dancer); Daredevil Dragster's velocity counters
  (its "it" read as ~); revealing until a creature card, "you may put it onto
  the battlefield", then shuffling all other revealed cards (Thicket Elemental); "choose target creature card in your
  graveyard with toughness less than ~'s toughness. Return that card" (Thunderkin Awakener); "If it's a creature, it's
  a Zombie in addition to its other creature types" (Lim-Dûl the Necromancer); "Return it at the beginning of the next
  end step unless you pay" (Koya, Death from Above: a "you may pay; if you don't" delayed trigger); a named token
  "that's all colors" (Dragonbroods' Relic); "A creature dealt damage this way can't block this turn" (Ballista
  Watcher // Ballista Wielder); "if it has blocked or been blocked since your last upkeep" / "if it attacked or
  blocked since your last upkeep", a +1/+1 counter, otherwise one removed (Wiitigo, Shape of the Wiitigo); "Return a creature card with mana value 1, 2, and 3 each" (Gruesome Menagerie); "Discard two
  nonland cards with the same name" as an activation cost (Sphinx of the Chimes, with a picker that only takes a
  same-name pair and a browser test). +14 (29,333 of 31,936 with B86 and rounds 248 and 249; 29,364 with rounds 250 to 252).
- Round B88 (one-line templates from the bottom of the list): "When ~ enters, choose one or both. Each mode must target
  a different player." (Splinter & Leo, Father & Son; Donnie & April, Adorkable Duo; Mikey & Mona, Mutant Sitters, whose
  "target player chooses a creature they control and puts two +1/+1 counters on it" is that player's pick and putting;
  Casey & Raph, Hotheads, whose "target player exiles the top card of their library. Until that player's next end step,
  they may play that card without paying its mana cost" gives that player the permission); "put a +1/+1 counter on each
  other creature target player controls" (other than ~); "Whenever ~ attacks or dies" (Balor, now with all three of its
  modes); "you may sacrifice an artifact, enchantment, or token. If you don't, tap ~" (Devouring Sugarmaw // Have for
  Dinner); delirium's "If there are four or more card types among cards in your graveyard, exile the top card of your
  library. You may play it until the end of your next turn" (Impossible Inferno); "Creature spells you cast that share a
  creature type with ~ cost {1} less" (Mistform Warchief, with its types as they are now); "a creature token of the chosen
  color and type" (Volrath's Laboratory, Riptide Replicator, named after the type per the rulings, and with what was
  chosen as it last existed if the source is gone, CR 608.2h); "As ~ enters, choose white Citizen, blue Camarid, black
  Thrull, red Goblin, or green Saproling" (Sarpadian Empires, Vol. VII: a color and a creature type picked together, with
  a browser test); "Sacrifice an Equipment/Aura attached to ~" as an activation cost (Ronin, Shadow Stalker; Faunsbane
  Troll). +13 (29,346 of 31,936 with B86, B87 and rounds 248 and 249).
- Out after round B88 (looked at, not done): Psychic Rebuttal (copying a spell after it's been countered), Soulblast
  (an additional cost of sacrificing all creatures you control), Tyrannical Pitlord ("as ~ enters, choose another
  creature you control"), Spatial Binding ("can't phase out"), Batroc the Leaper (up to X targets, X the times kicked),
  Miasma Demon (discard any number, then up to that many targets), Gorex, the Tombshell (an optional exile cost that
  reduces the cost), Rasputin Dreamweaver ("if ~ started the turn untapped").
- Round B89 (one-line templates from the bottom of the list): Aura moves, "Attach target Aura attached to a creature to
  another creature" (any controller's, Enchantment Alteration's "a creature or land" to one of the same type), "with the
  same controller" (Simic Guildmage, also its "Move a +1/+1 counter from target creature onto another target creature
  with the same controller", checked again as it resolves, CR 608.2b), "attach all Auras enchanting target permanent to
  another permanent with the same controller" (Glamer Spinners: one permanent that can take every Aura, or none move);
  the destination is picked as it resolves, with browser tests; "Return target Aura card from your graveyard attached to
  ~" during your upkeep and "Destroy all Auras attached to ~" (Hakim, Loreweaver); "flip a coin. If you win, create a
  token named X. If you lose, destroy all permanents named X" (Wirefly Hive); "flip a coin at the beginning of the next
  end step. If you lose the flip, sacrifice that creature" (Goblin Kites); "Each creature you control can't be blocked
  as long as defending player controls an artifact land" (Tanglewalker, checked against each defender); "you may reveal
  that many cards. Put an artifact card revealed this way into your hand and the rest into your graveyard" (Glint
  Raker); "Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls"
  (Rayne, Academy Chancellor, two cards if enchanted; Leovold, Emissary of Trest's draw now compiles too, though
  Leovold is banned in Commander); "Spells that target ~ cost {2} more to cast" on an instant or sorcery (Kaervek's
  Torch); "~ costs 3 life more to cast for each target" (Phyrexian Purge, paid as it's cast and not given back); hourglass counters (Temporal Distortion). +12 legal
  (29,358 of 31,936 with B86, B87 and rounds 248 and 249; 29,398 with B88 and rounds 250 to 253).
- Round B90 (one-line templates from the bottom of the list): "~'s power is equal to ..." and "~'s toughness is equal
  to ..." on two lines, two characteristic-defining abilities read as one (Yavimaya Kavu, CR 604.3); "When you sacrifice ~
  while casting a spell with emerge" (Foul Emissary: any sacrifice paying that spell's costs, per the rulings; mana
  abilities are activated before a spell is cast here, so a sacrifice for mana before casting doesn't count); "You may pay
  {1} rather than pay the mana cost for Rune spells you cast" and a search of the library and/or graveyard for a Rune card
  (Runeforge Champion; Rune and Case are subtypes the target parser knows now); "whenever you solve a Case" and "You may
  spend mana as though it were mana of any color to cast Case spells" (Case File Auditor); "a creature card with
  eternalize or embalm" and "Whenever you activate an eternalize or embalm ability" (Vizier of the Anointed: embalm and
  eternalize abilities carry their keyword now); "if its mana value was 1 or greater, you may remove that many reprieve
  counters from ~. If you do, return that card" (Magnanimous Magistrate); "Whenever ~ becomes tapped to pay a teamwork
  cost" (Agent Maria Hill); "At the beginning of your next upkeep, choose a basic land type. ~ gains landwalk of the
  chosen type until the end of that turn" (Giant Slug); "When you cast this spell from your hand, copy it if you control
  an artifact, then copy it if you control an enchantment" (Banish into Fable); "You may cast spells with mana value less
  than or equal to the number of creatures you control from your hand without paying their mana costs" (Omnipresence).
  +10 (29,368 of 31,936 with B86 to B89 and rounds 248 and 249; 29,417 with rounds 250 to 254).
- Round B91 (one-line templates from the bottom of the list): "choose a land type", any land type, basic or not (CR
  205.3i), for "landwalk of the chosen type" (Traveler's Cloak as it enters, with a browser test; Illusionary Presence at
  your upkeep) and "snow landwalk of the chosen type" (Barbarian Guides, a snow land of that type, CR 702.14c); "a spell
  with {H} in its mana cost", any Phyrexian mana symbol (Rage Extractor, CR 107.4f); "unless that creature attacked this
  turn" at the end step of the enchanted creature's controller (Insubordination, checked as it resolves); "During target
  player's next turn, creatures that player controls attack you if able" (Taunt, CR 508.1d); "return the exiled cards to
  their owner's graveyard" (Gravegouger); "Choose two target creatures controlled by the same opponent (player)", one of
  them picked as it resolves among those still legal, by their controller or by you (Retribution, Barrin's Spite,
  Incriminate, Trial of Agony, Cannibalize, with a browser test); "Whenever you activate an ability of an Elemental"
  (Ceaseless Searblades); "Whenever one or more creatures you control that entered this turn attack a player" (Whirlwind,
  Killer Cyclone). +14 (29,422 of 31,936 with B86 to B90 and rounds 248 to 253; 29,441 with rounds 254 and 255; 29,452 with round 256).
- Round B92 (one-line templates from the bottom of the list): lands tapped for mana producing another type, a
  replacement effect on the mana (CR 106.12b, 614.1a) that "could produce" counts too (CR 106.7): "If a land is tapped for
  mana, it produces {B} (colorless mana) instead of any other type" (Infernal Darkness, Ritual of Subdual), "... and
  amount" (Contamination: one mana), "Until end of turn, if a player taps a nonbasic land for mana" (Pale Moon), "if you
  tap a land you control for mana" (Deep Water), "If target Plains is tapped for mana, it produces colorless mana instead
  of white mana" indefinitely (Quarum Trench Gnomes: only its white mana); with Mana Reflection or Damping Sphere too, the
  player's order (CR 616.1) is the one giving the most mana, else timestamp order (the engine picks it for them).
  "Whenever you cast a spell using teamwork" (Virtual Assistant, CR 702.194b); "that player chooses a permanent for each
  card in their graveyard, then untaps those permanents" (Mist of Stagnation, anyone's permanents, with a browser test);
  "Each player sacrifices a Plains or a white permanent of their choice for each white permanent they control" (Omen of
  Fire, each their own number, counted before anyone sacrifices); "You may put a card that has an Adventure that player
  owns from exile into that player's graveyard" (Memory Theft, face-up ones only, with a browser test); "Choose up to X
  creatures and/or planeswalkers you control, where X is the number of times ~ was kicked. Those permanents phase out"
  (Temporal Firestorm, with a browser test); "If ~ would enter, instead sacrifice each other permanent named ~ you
  control" (Sheltered Valley); "a creature you control with power greater than its base power deals combat damage to a
  player" (Ms. Marvel, Elastic Ally, CR 208.4b); "Whenever a creature becomes blocked by (blocks) a creature with lesser
  power" (No Quarter, once for each pair as blockers are declared, CR 509.3c-d). +14 (29,466 of 31,936 with B91 and
  rounds 254 to 256; 29,475 with round 257).
- Round B93 (one-line templates from the bottom of the list): "target player, planeswalker, or Sliver creature" (Cautery
  Sliver: a creature only if it has that type); "Simultaneously, all phased-out creatures phase in and all creatures with
  phasing phase out" (Time and Tide, with what phased out indirectly coming back with its host, CR 702.26g); "Whenever a
  player taps a snow land for mana, that player adds one mana of any type that land produced. That land doesn't untap
  during its controller's next untap step" (Winter's Night); "If a permanent with a wind counter on it would untap during
  its controller's untap step, remove all wind counters from it instead" (Freyalise's Winds, only a tapped permanent that
  would untap, rulings); Remove Enchantments (the enchantments and Auras you own among them to your hand, then the rest
  destroyed); "You and target opponent each gain control of all creatures the other controls until end of turn. Untap
  those creatures" (Twist Allegiance: untapped after the exchange); "Each player skips their untap step" and "that player
  simultaneously untaps each tapped artifact, creature, and land they control and taps each untapped ..." (Sands of
  Time); "When enchanted land becomes tapped, destroy it. That land's controller may attach ~ to a land of their choice"
  (Kudzu, Steam Vines: the land's controller as it last existed picks any land, with a browser test); "discard a card at
  random. If you discard a creature card this way, return it from your graveyard to the battlefield unless any player
  pays 5 life" (Aether Rift); "that player chooses artifact, creature, land, or non-Aura enchantment. All nontoken
  permanents of that type phase out" (Teferi's Realm, with a browser test); Juxtapose (the greatest mana value creatures,
  then artifacts, exchanged; a tie chosen by its controller, with a browser test). +12 (29,494 of 31,936 with B92 and
  rounds 257 and 258; 29,512 with rounds 259 and 260).
- Round B94 (one-line templates from the bottom of the list): "As ~ enters, choose Island or Swamp. Whenever a land of
  the chosen type an opponent controls becomes tapped" (Roots of Life); "Discard any number of cards at random.
  Creatures you control get +1/+0 until end of turn for each card discarded this way" (Rites of Initiation, the number
  chosen as it resolves, with a browser test); Darigaaz, the Igniter (pay {2}{R}, then the color chosen and the hand
  revealed, rulings); "If it's a Bison card, you may put it onto the battlefield. If it's a creature card, you may reveal
  it and put it into your hand. Otherwise, ..." (Bison Whistle: the second only if the card is still on top); "The
  controller of target instant or sorcery spell copies it" (Meletis Charlatan, CR 707.10); "Until end of turn, if target
  player would draw a card, instead that player skips that draw and you draw a card" (Plagiarize, the draw step's draw
  included, CR 614.1a); Amplifire (base power and toughness twice the revealed creature's until your next turn, 0/0 if
  none, the cards to the bottom at random); "Any opponent may have you put that card into your hand. If no player does,
  you draw three cards" (Distant Memories, with a browser test); "For each of those cards, put that card into your hand
  unless any opponent pays 3 life. Then exile the rest" (Sword-Point Diplomacy, card by card in the order you choose,
  rulings, with a browser test); "{2}, Exile this card from your hand: Target land gains "{T}: Add ..." until this card
  is cast from exile. You may cast this card for as long as it remains exiled" (Shattered Seraph, Emrakul, the Exigent
  Doom, Glamorous Outlaw, Masked Bandits, Rakish Revelers, Spara's Adjudicators: ends as it's cast, after its costs are
  paid, and never if the card leaves exile another way, rulings; with a browser test). Also: "{N}, Exile ~ from your
  hand" with any other effect used to compile with the exile cost dropped; it now only compiles for these. +15 (29,509 of
  31,936 with B93 and rounds 257 and 258; 29,527 with rounds 259 and 260; 29,534 with rounds 261 and 262).
- Round B95 (templates from the bottom of the list): "Whenever a spell or ability causes a player to shuffle their
  library" (Psychogenic Probe) and "causes its controller to shuffle their library" (Widespread Panic): the shuffle is
  the resolving spell or ability's controller's, or a static replacement's controller's (Darksteel Colossus), never a
  game rule's; "Choose target opponent. Until that player's next turn, they gain protection from everything and their
  life total can't change. All nonland permanents they control phase out" (Teferi's Reproach); "Whenever an opponent
  puts one or more counters on a creature they control, they put the same number and kind of counters on this creature"
  (Bold Plagiarist, once per kind put); "You can cast spells only during your turn and you can cast no more than two
  spells each turn" and free spells with mana value up to the number of lands you control (Fires of Invention); "if
  there are five basic land types among lands you control" (Nael, Avizoa Aeronaut); Aethermage's Touch (the creature
  gains "At the beginning of your end step, return this creature to its owner's hand"); "Roll a d8. Reveal cards ...
  until you reveal a creature card with mana value equal to the result" (Bag of Tricks); Timesifter (each upkeep every
  player exiles their top card, the greatest mana value takes an extra turn, tied players repeat, CR 500.7); Storage
  Matrix (each player chooses artifact, creature, or land in their untap step while it's untapped, CR 502.3, with a
  browser test; it limits the active player's own untaps, which are the only ones the untap step makes). +10 (29,544 of
  31,936 with B94 and rounds 261 and 262; 29,556 with rounds 263 and 264).
- Out after round B95 (looked at, not done): Enduring Renewal, Breathstealer's Crypt, Zur's Weirding and Chains of
  Mephistopheles (draw replacements that would have to be ordered with the existing draw replacements, CR 616.1), Wheel
  of Sun and Moon (a replacement for cards going to a player's graveyard from anywhere), Over the Top (every player's
  permanent cards entering at once, Auras needing hosts among them), Spirit-Sister's Call (a sacrifice sharing a card
  type with a card put into your graveyard, then a granted leave-the-battlefield replacement), Back from the Brink (a
  token copy of the card exiled to pay the cost), Dream Halls (an alternative cost for every player's spells: discard a
  card sharing a color), Hall of Gemstone (lands tapped for mana make the chosen color instead, a mana replacement).
- Out after round B94 (looked at, not done): Forgotten Lore and Shrouded Lore (an opponent chooses a card in your
  graveyard, repeated while you pay, none chosen twice), Graceful Takedown ("any number of target enchanted creatures you
  control and up to one other target creature" each dealing damage), Nahiri's Sacrifice (an additional sacrifice with
  mana value X, then X divided), Clay Champion (counters for each {G}{G} and each {W}{W} spent), Sutured Ghoul (power and
  toughness from the cards exiled as it enters), Soul Separator (a copy token "except it's 1/1" plus a token with that
  card's power and toughness), Magus of the Mind (play lands and cast spells from among the exiled cards free this turn),
  Hallowed Moonlight ("if a creature would enter and it wasn't cast"), Welcome to the Fold (a madness-paid X changing the
  toughness limit), Obstinate Familiar (a may skip of each draw). Bot gaps: bots never use the Shattered Seraph cycle's
  hand ability (bots skip "Exile ~ from your hand" abilities).
- Out after round B93 (looked at, not done): Bewitching Leechcraft ("If ~ would untap during your untap step, remove a
  +1/+1 counter from it instead": with Freyalise's Winds too, its controller would order the two replacements, CR 616.1),
  Drafna's Restoration (targets in the graveyard of an earlier target player), Rite of Ruin (an order for three card
  types, then three rounds of sacrifices), Tariff (a punisher whose cost is the chosen creature's mana cost), Powerleech
  and Haunting Wind ("activates an artifact's ability without {T} in its activation cost", and "that artifact's
  controller"), Fasting (a may skip of the draw step as it would begin), Naked Singularity (a land with two basic land
  types, as Reality Twist), Harsh Judgment and Aegis of Honor (an instant or sorcery's damage redirected to its
  controller), Peace Talks ("this turn and next turn"), Stronghold Gambit, Grenzo's Rebuttal, Planar Overlay, Worldpurge,
  Call to Arms.
- Out after round B92 (looked at, not done): Reality Twist ("Plains produce {R}, Swamps produce {G}...": a land with two
  basic land types lets its controller pick the color, rulings), Harvest Mage and Pulse of Llanowar (mana of a color of
  your choice instead: a choice as the land is tapped), Escaped Shapeshifter (keywords and protection read from opponents'
  creatures, a layer 6 dependency), Spoils of War (X set by an opponent's graveyard as you cast it), Drain Life, Soul Burn
  and Consume Spirit ("Spend only black mana on X" on a spell, with cost reductions), Emblazoned Golem (one mana of each
  color on X), Fatal Lore (an opponent chooses the mode), Echo Chamber (an opponent chooses the target), Butcher Orgg and
  Cunning Giant (combat damage assigned to other creatures).
- Out after round B91 (looked at, not done): Goblin Test Pilot (a target chosen at random as an activated ability is
  activated: the activation, the bots and the UI would all need to leave the target to chance), Flying Drone (a colored
  activation cost reduction, "if another creature with flying entered the battlefield under your control this turn"),
  Suppress (a hand exiled face down until the end step of that player's next turn), Yare ("target creature defending
  player controls" when several players are attacked), Matopi Golem (a trigger when a regeneration shield is used), Rock
  Hydra and Lichenthrope (replacements for each 1 damage, and Rock Hydra's counters removed even if the damage can't be
  prevented), Quenchable Fire ("unless that player pays {U} before that step": a payment any time before the upkeep).
- Out after round B90 (looked at, not done): Twinning Glass (a free cast by a name cast this turn: split and adventure
  names), Threefold Signal (replicate granted to spells, beside a spell's own kicker-like cost), Blade of the Swarm
  (targeting any card in exile), Blaze Commando and Flame Channeler (an instant or sorcery spell dealing damage to
  anything, once per instruction), Shorecrasher Elemental and Skittish Valesk (returning or turning a permanent face
  down), Preferred Selection, Scrying Glass, Hedron Alignment, Ertai's Familiar, Death-Mask Duplicant, Relive the Past.
- Out after round B89 (looked at, not done): Barbed Foliage ("loses flanking": flanking is a triggered ability granted
  by the keyword, not just a keyword to remove), Brothers Yamazaki (an exception to the legend rule), Rogue Skycaptain
  and Rohgahh of Kher Keep ("an opponent gains control of ~"), Stangg and Dance of the Many (linked tokens that leave
  with their source), Sengir Nosferatu (a token's ability returns an exiled card named ~), Splintering Wind,
  Negative Zone Portal, Sol'Kanar the Tainted, Mystic Barrier, Covenant of Minds.
- Out after round B87 (looked at, not done): Kodama of the Center Tree (soulshift X: a target bounded by a changing
  number), Hide // Seek (the mana value of a card found by the search), Revival Experiment (one card of each permanent
  type, and a battle's protector on entering is unclear), Love on the Battlefield (a combat damage trigger granted until
  end of turn), Sharkey, Tyrant of the Shire, Woodcaller Automaton, Dancing Sword, Elemental Resonance, Bat Colony.
- Out after round B86 (looked at, not done): Goblin Maskmaker (cost reduction for face-down spells), Bortuk
  Bonerattle (a destination chosen by mana value against domain), Nick Fury (put onto the battlefield tapped and
  attacking from the hand), Oath of Mages (a target chosen by another player), Glyph of Life, Mob Mentality,
  Breaking // Entering, Darigaaz, Grime Gorger, Naya Soulbeast.
- Out after round B85 (looked at, not done): Grave Consequences (each player exiles any number from their own
  graveyard, then a count per player), Magus of the Arena (a target chosen by an opponent), Paragon of Modernity
  (exactly three colors of mana spent on an activation), Scarwood Bandits (an "Unless an opponent pays" lead clause on
  an activated ability).
- Out after round B84 (looked at, not done): Traveling Plague (an Aura returned from the graveyard needs an attach
  choice), Spellshift (another player's free cast from revealed cards), Obscura Ascendancy (an intervening "equals"
  check), Eye of Singularity, Cornered Market and Bazaar of Wonders (name-based filters), Weight of Conscience ("share
  a creature type" tap cost), Psychic Theft, Last Rites, Thought Dissector, Mimeofacture, Hakim,
  Guard Dogs, Carry Away, Jandor's Ring.
- Out after round B83 (looked at, not done): Fighting Chance (a coin flip for each blocking creature), Ersatz Gnomes
  (a spell becomes colorless: no rule for changing a spell's color yet), Clash of Elements (the owner's choice decides
  what happens to it and who is dealt damage), Write into Being (manifest one of the top two cards), Samite Elder
  (protection from each of a target permanent's colors).
- Out after round B82 (looked at, not done): Builder's Bane (destroy X target artifacts: a variable number of
  targets), Burning of Xinye (each player destroys lands of their choice), Sirocco and Wand of Ith (a punisher per
  revealed card), Stench of Evil (a punisher per land destroyed), Gargantuan Gorilla (a snow Forest sacrifice
  condition and a mutual damage ability).
- Out after round B81 (looked at, not done): Kaervek's Spite (an additional cost of sacrificing all permanents and
  discarding your hand), Ignorant Bliss, Turn the Tables, Angry Mob, Time to Reflect (not attempted this round).
- Out after round B80 (looked at, not done): Gloom Surgeon (prevent combat damage and exile that many cards: a
  prevention with a follow-up action), Marvel Boy, Noh-Varr ("whenever you activate a power-up ability"), Ms. Marvel,
  Elastic Ally ("power greater than its base power"), Whirlwind, Killer Cyclone ("one or more creatures that entered
  this turn attack a player": a batch attack trigger naming the player), Titania, Rugged Rumbler (an "or" additional
  cost and an "or" ward cost).
- Out after round B79 (looked at, not done): Aquamorph Entity (a choice as it's turned face up: the special action
  can't pause yet), Volrath's Laboratory and Riptide Replicator (tokens of the chosen color and creature type), Barbed
  Foliage ("loses flanking" has to remove the trigger), Sunglasses of Urza, Knight of Valor, Grifter's Blade, Halfdane,
  Bronze Horse, Mister Immortal (activated from exile), Wall of Deceit and Backslide (turn a creature face down),
  Sarkhan's Whelp, Dredging Claw, Defiant Vanguard. Known gaps: Dormant Gomazoa doesn't trigger when a spell's target is
  changed to you; a non-mana echo cost (Echo—discard) doesn't count as "echo cost is paid".
- Out after round B78 (looked at, not done): Master of Barbs ("one or more opponents are dealt noncombat damage": no
  batch event for damage), Cellar Door ("the bottom card of their library into their graveyard"), Swallow Whole (the
  creature tapped for the additional cost), Betrothed of Fire and Bloodfire Infusion ("Sacrifice enchanted creature" as
  a cost), Rasputin, the Oneiromancer (a mana ability whose X is the counters removed), Arcee, Sharpshooter (the back
  face's "that many" targets), Lavabrink Floodgates (each player's own may), Lurebound Scarecrow (a state trigger bound
  to the chosen color), Grim Contest (each deals damage equal to its toughness to the other: a fight by toughness).
- Out after round B77 (looked at, not done): Consecrate Land ("can't be enchanted by other Auras": no rule for it yet),
  Corpseweft ("Exile one or more creature cards from your graveyard" as a cost, X from how many), Ruin in Their Wake
  (where a found card goes depends on controlling a land named Wastes, with a "may"), Evangelize ("target creature of an
  opponent's choice": an opponent picks the target).
- Out after round B76 (looked at, not done): Mind Roots (a land card discarded this way onto the battlefield: no
  effect for cards a discard just moved yet), Mark for Death ("Other creatures that player controls can't block this
  turn": a can't-block rule for one player's creatures except the target), Ashnod's Cylix (the target player looks at
  the top three and chooses which one goes back), Bullseye, Death Dealer and Ion Storm (costs with "or": "sacrifice an
  artifact or discard a nonland card", "remove a +1/+1 counter or a charge counter").
- Out after round B75 (looked at, not done): Mishra, Artificer Prodigy (a search for a card with the cast spell's name),
  Titania, Voice of Gaea's ward ("discard a card or pay {2}"), Fog Patch and Choking Vines ("become blocked"), Mistform
  Warchief, Vexing Sphinx (cumulative upkeep of discarding), Invoke the Ancients (a counter chosen for each token),
  Wolfbat, Ronin (sacrificing an attached Equipment as a cost), Tallowisp (an Aura with enchant creature in a search:
  next, it can reuse Rootwater Shaman's filter).
- Out after round B74 (looked at, not done): Hankyu (remove all aim counters as a cost, damage equal to the number
  removed), Fishing Pole ("Tap Fishing Pole" as a cost of the granted ability), Hold for Ransom (the Aura's controller
  as a player), Heliod's Punishment ("Then if it has no task counters on it, destroy Heliod's Punishment"), Shuriken
  (its controller gains control of it unless it was unattached from a Ninja), Nettlevine Blight, Animal Friend and
  The Dominion Bracelet (granted abilities that move or recount the source), Gutter Grime and Saproling Burst (token
  abilities naming the permanent that made them), Earnest Fellowship and Pledge of Loyalty (Lane A's round 236, now
  merged, changed the same keyword-binding code: next).
- Out after round B73 (looked at, not done): Nafs Asp and Glass Asp ("unless they pay {1} before that draw step": a
  payment the player may make any time before then, not as the trigger resolves), Illusionary Terrain (two basic land
  types chosen, the first changed into the second), Chromatic Armor (the last chosen color, chosen again with sleight
  counters).
- Out after round B72 (looked at, not done): Ghost Ark (unearth until end of turn: Lane A's round 233 added escape until
  end of turn, now in main, to build on), Kheru Mind-Eater (whoever controls it may look at and play the face-down card),
  Lodestone Bauble (up to four basic land cards from one player's graveyard, the player chosen even with no target),
  Gather Specimens (creatures entering under an opponent's control this turn, against other replacement effects),
  Varchild's War-Riders (cumulative upkeep tokens each for a different opponent), Shaun & Rebecca, Agents (a reflexive
  trigger inside a mana ability), Timecrafting (a permanent with time counters or a suspended card as one target),
  Stardew Valley ("another player of your choice may gain control of that permanent"), Merieke Ri Berit (destroy the
  creature when ~ leaves the battlefield or becomes untapped), Fortune's Favor (an opponent splits the cards into two
  piles, face down), Templar Knight (tap five untapped attacking creatures named ~ as a cost), Muse Vessel (the card its discard exiled isn't
  linked yet; "choose a card exiled with ~, you may play it this turn"), Purgatory (pay {4} and 2 life at upkeep to
  return a card exiled with it, the exile from a "put into your graveyard" trigger not linked yet).
- Out after round B71 (looked at, not done): Say Its Name ("Exile this card and two other cards named ~ from your
  graveyard" as a cost), Valleymaker ("Choose a player. That player adds {G}{G}{G}" is a mana ability with a sacrifice
  cost, which would use the stack here, see the mana abilities gap below), Sewers of Estark ("If it's blocking, prevent
  all combat damage that would be dealt this combat by it and each creature it's blocking"), Benevolent Blessing (only
  the Auras and Equipment you control already attached), Tunnel Vision (reveal until a named card, then the rest into the
  graveyard and that card on top).
- Known gaps from round B71: bots always search the library too when "and/or library" lets them skip it, even with
  Psychic Surgery or Cosi's Trickster watching.
- Out after round B70 (looked at, not done): Shell of the Last Kappa and Gale's Redirection (exiling a spell from the
  stack), Munda, Ambush Leader (cards from the top revealed and put back on top in any order), Krang & Shredder
  (each opponent exiles until a nonland card, then a free cast among them under a Disappear condition).
- Known gaps from round B69: War Cadence with X = 0 lets creatures block free, but a cost of {0} still has to be chosen
  (rulings: a block requirement can't make a player pay it); with Ravenous Slime and another "exile it instead" (two
  Slimes, Kalitas), the first one found applies, not the dying creature's controller's choice (CR 616.1); bots never
  activate "Remove X counters from among" abilities (Retribution of the Ancients); granted casualty (Anhelo, the
  Painter; Ashad) still needs more than one instance of casualty (CR 702.153b).
- Out after round B69 (looked at, not done): Day of the Moon (names chosen for the Saga each chapter, then goad by
  them), Anhelo, the Painter and Ashad, the Lone Cyberman (granted casualty, several instances), Unidentified Hovership
  (the owner of each card it exiled), Crafty Cutpurse (tokens an opponent would create, against token doubling and the
  attack rulings), Insatiable Frugivore (a repeat loop), Galloping Lizrog (counters spread over creatures).
- Out after round B68 (looked at, not done): Oko, Lorwyn Liege (the back face's emblem of a chosen creature type),
  Abuelo's Awakening (the returned artifact that's also a Spirit creature), Light of Judgment ("up to one Equipment"
  chosen as it resolves), Chandra, Chill of Compliance (which cards surveil put into the graveyard).
- Out after round B67 (looked at, not done): Words of War, Words of Waste and Words of Wind (a target or choices in the
  middle of a draw), Hedonist's Trove (lands from its exile any number of times, one spell a turn), Day of the Dragons,
  Lumbering Battlement, Wall of Mourning (cards exiled with ~ from abilities not linked yet; Kayla's Music Box and
  Serpent's Soul-Jar done in round B70), Ashes of the Fallen (creature types of cards in a graveyard: Lane A's round 227 adds those for Roshan,
  so after it merges), Desolation (who tapped a land for mana this turn), Nefarious Lich (damage replaced by exiling
  from the graveyard, losing if you can't).
- Next for Lane B, least played first: the unsupported ones no round has written down yet (`npm run popular -- --least`,
  minus the names already in ROADMAP and HISTORY). After round B75 about 269 of those are ranked below 25,000 and about
  412 between 25,000 and 19,700, mostly multi-line cards and mechanics not modeled yet (banding, text changes, mana
  replacement, damage dealt this turn by a source); only 7 are left between 19,700 and 15,000. Then the lists below.
  Then up from about 17,100 (round B10 took the easier ones up to about 15,000; about 480 are still unsupported
  there, its skips included, mostly multi-line cards and new mechanics): Mirror Match, Reweave, Kheru Mind-Eater, Day of the Dragons, Bloodbond March, Song of Inspiration, Countersculpt, Order of
  Succession, Drain Power, Volcano Hellion, Drain Life, Desolation, Urza's Sylex, Diabolic Servitude, Shared Fate.
  Then up from about 15,100 to 13,200 (round B11 took the easier ones; about 460 are still unsupported there, its skips
  included): Aeon Engine, Haunting Imitation, The Fugitive Doctor, Shifting Shadow, Prince of Thralls,
  Eriette, Manifold Insights, Fortune's Favor, Curse of Inertia, Dreamshaper Shaman, Fishing Pole, Regna's Sanction,
  Kathril, Feral Encounter; then on up from 13,200.

## Known gaps (from earlier rounds)

- Layer 3 (text-changing effects).
- "Divided as you choose" with X ("X damage divided", Rolling Thunder, Fire Covenant), distributing X counters
  and "then" riders (Biogenic Upgrade), divided prevention (Remedy); "up to X target" with an X that isn't the spell's own (Rats' Feast, Martyr of
  Bones' "up to X target cards from a single graveyard").
- "Costs {1} less for each target", reductions of colored mana, "the first face-down / kicked spell you cast each
  turn" (Kadena, Vine Gecko), Radagast's "and can be cast as though it had flash", Eluge's "{U} (or {1}) less".
  Equip reductions "that target enchanted creature" (Strong Back).
- Granted static abilities ('has "This creature can't block"'), battles, "can't attack unless", "becomes tapped".
- Protection from a player; protection that doesn't remove other Auras (Benevolent Blessing; Spectra Ward done in round B71).
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
  (Benthic Explorers), Incubation Druid's "three mana of that type instead".
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
