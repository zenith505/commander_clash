# Roadmap

11,952 of 31,936 Commander-legal cards are fully supported (`npm run coverage`). Each round takes the next item,
implements it with tests, and updates this file. `npm run blockers` shows how many cards each missing line blocks.

## Ken's standing instructions

- Keep going round after round until the plan is done; no need to ask before each round.
- Skip cards that aren't legal in any format.
- Don't guess on complex cards: research the rules and rulings first.
- Infinite or long loops: shortcut them like paper Magic (CR 732): propose a loop and a number of iterations,
  others accept or stop it earlier.
- A UI polish pass comes at the end. Don't reorder the game log (Ken rejected that).

## Next rounds

1. **"Becomes a copy"** (CR 707.4, layer 1), and copying double-faced or face-down permanents.
2. **Madness, suspend, bestow, dredge, casualty.**
3. **CR 732 loop shortcuts.**
4. Then by `npm run blockers`: banding, offspring, enlist, sunburst, For Mirrodin!, squad, ravenous, amplify,
   "assign combat damage as though it weren't blocked", flash with a cleanup sacrifice, Start your engines!.

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

## Later

- Proper legend-rule choice, the 903.9 commander choice.
- Deck builder using the full card database, with rulings in the card preview.
- Better bots, then online play (the engine runs on a server; clients send actions).
