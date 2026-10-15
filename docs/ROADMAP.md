# Roadmap

12,380 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Each round takes the next item,
implements it with tests, and updates this file. `npm run blockers` shows how many cards each missing line blocks.

## Ken's standing instructions

- Keep going round after round until the plan is done; no need to ask before each round.
- Skip cards that aren't legal in any format.
- Don't guess on complex cards: research the rules and rulings first.
- Infinite or long loops: shortcut them like paper Magic (CR 732): propose a loop and a number of iterations,
  others accept or stop it earlier.
- A UI polish pass comes at the end. Don't reorder the game log (Ken rejected that).

## Next rounds

1. By `npm run blockers`: firebending, assist, provoke, phasing, support, "the Ring tempts you", the initiative,
   converge (the colors spent are now recorded, see sunburst), Phantom creatures' "prevent that damage, remove a
   counter", "Tap an untapped creature you control: Add one mana", "put them back in any order".

## Known gaps (from earlier rounds)

- Layer 3 (text-changing effects).
- "Divided as you choose", "up to X target", targets that must share something ("from a single graveyard").
- "The first spell you cast each turn costs less", "costs {1} less for each target", reductions of colored mana.
- Granted static abilities ('has "This creature can't block"'), battles, "can't attack unless", "becomes tapped".
- Protection from a player; Auras whose protection doesn't remove themselves.
- "One or more creatures enter/die" (once per batch), "whenever ~ connives", "while ~ is in your graveyard".
- Choosing what to proliferate; putting cards back "in any order" yourself.
- Effects on the attackers as a group; impulse draw from an opponent's library; lands from graveyard or library.
- Vorinclex (counters on players, halving), Academy Manufactor.
- "If ~ attacked or blocked this combat", "until end of combat", myriad attacking planeswalkers, "at the beginning
  of combat on each opponent's turn".
- "Copy target activated or triggered ability" (Strionic Resonator).
- Blocking: "whenever ~ blocks two or more creatures" (Lairwatch Giant), "for each creature it's blocking" (Guardian
  of the Gateless), "an additional creature for each Equipment attached" (Kemba's Legion), Yare's "creature
  defending player controls". A blocker's damage among several attackers is divided automatically, like an
  attacker's among several blockers.
- Soulbond: "whenever ~ or a creature it's paired with is dealt damage" (Donna Noble, also Doctor's companion);
  granted triggers Breathkeeper Seraph's "at the beginning of your next upkeep" and Tandem Lookout's "deals damage
  to an opponent".
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
- Life: "whenever you lose life", "whenever a player loses life", "whenever you gain life for the first time each
  turn", "draw that many cards"; "players can't gain life" and life-gain replacement effects.

## Later

- Proper legend-rule choice, the 903.9 commander choice.
- Deck builder using the full card database, with rulings in the card preview.
- Better bots, then online play (the engine runs on a server; clients send actions).
