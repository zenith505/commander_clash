// Round 352's whole lines (compile.ts, after round 351's): exiling cards with four or more card types among them from your
// graveyard (Winter, Cynical Opportunist; Nethergoyf's escape cost is in keyword-abilities.ts), casualty X (Ob Nixilis,
// the Adversary) and a Mirror that copies one of the cards it imprinted (Panoptic Mirror).
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseTrigger } from "./triggers";

const PERMANENT_CARD: TargetSpec = { kind: "card", types: ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"], notTypes: [], notColors: [], text: "permanent card" };

const WINTER = /^(?:Delirium — )?At the beginning of your end step, you may exile any number of cards from your graveyard with four or more card types among them\. If you do, put a permanent card from among them onto the battlefield with a finality counter on it\.$/;

export function round352Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Winter, Cynical Opportunist: "At the beginning of your end step, you may exile any number of cards from your graveyard
  // with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a
  // finality counter on it.": no intervening if (Delirium is an ability word, CR 207.2c); as it resolves, none, or cards
  // whose card types together number four or more (CR 205.2a), exiled at once; then one permanent card among them, chosen
  // then (CR 608.2c), enters with a finality counter (CR 122.1h: if it would be put into a graveyard from the
  // battlefield, it's exiled instead).
  if (WINTER.test(line)) {
    const t = parseTrigger("At the beginning of your end step, draw a card.");
    if (isSpell || !t || t === "fail" || t.event !== "yourEndStep") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({
      ...t,
      body: {
        targets: [],
        effects: [
          { type: "chooseFromGraveyard", n: 99, upTo: true, dest: "exile", cardTypes: 4 },
          { type: "putFromYardChosen", filter: PERMANENT_CARD, counters: { finality: 1 } },
        ],
        text: line.replace(/^Delirium — /, ""),
      },
    });
    return true;
  }
  // Panoptic Mirror: "At the beginning of your upkeep, you may copy a card exiled with ~. If you do, you may cast the copy
  // without paying its mana cost.": one trigger each upkeep, not one for each card (rulings); one of the cards its imprint
  // ability exiled (CR 607.2a; compile.ts links it), chosen as it resolves, copied in exile (CR 707.12) and cast for free
  // (CR 118.9: X is 0, additional costs paid, no alternative costs; a split card one half, rulings); a copy not cast
  // ceases to exist (CR 704.5e). Nothing if no card is exiled with it.
  if (line === "At the beginning of your upkeep, you may copy a card exiled with ~. If you do, you may cast the copy without paying its mana cost.") {
    const t = parseTrigger("At the beginning of your upkeep, draw a card.");
    if (isSpell || !t || t === "fail" || t.event !== "yourUpkeep") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "castLinkedCopy", choose: true }], text: line } });
    return true;
  }
  return false;
}
