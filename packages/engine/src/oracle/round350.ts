// Round 350's sentences, read before round 349's (round349Sentence in oracle/round349.ts, which reads these first), and
// its whole lines (compile.ts, after round 349's): a dying creature's optional return at your next upkeep (Breathkeeper
// Seraph's granted ability), a Bat token's gained ability linked to the card exiled for it (Timothar, Baron of Bats) and
// Deserts coming back at your next end step (Desert Warfare).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { round351Sentence } from "./round351";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round350Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 351's sentences first (oracle/round351.ts).
  const r351 = round351Sentence(s, sentences, si, ctx, effects);
  if (r351) return r351;
  const line = plain(s);
  // Breathkeeper Seraph: "When this creature dies, you may return it to the battlefield under its owner's control at the
  // beginning of your next upkeep.": a delayed trigger (CR 603.7) about the card in the graveyard now, at the next upkeep of
  // the dies trigger's controller (who controlled the creature as it died, CR 603.3a, 603.7d); the choice is made as that
  // delayed trigger resolves, and the card comes back only if it's still in the graveyard then (CR 400.7).
  if (!ctx.spell && !ctx.activated && ctx.selfCard && /^[Yy]ou may return it to the battlefield under its owner's control at the beginning of your next upkeep$/.test(line)) {
    const put: Effect = { type: "putOntoBattlefield", what: { ref: "subjectCard" }, owner: true };
    return { effect: { type: "delayed", when: "yourNextUpkeep", each: "selfCard", effects: [{ type: "may", effects: [put], text: "return it to the battlefield under its owner's control" }], text: "you may return ~ to the battlefield under its owner's control" }, next: si + 1 };
  }
  // Timothar, Baron of Bats: "you may pay {1} and exile it. If you do, create a 1/1 black Bat creature token with flying. It
  // gains "When this token deals combat damage to a player, sacrifice it and return the exiled card to the battlefield
  // tapped."": the card this resolution exiled is "the exiled card" of each Bat it created (rulings: only that card, every
  // Bat if a replacement made several), and the Bat has the ability from a resolved effect, not as a copiable value (CR
  // 707.2, rulings: a copy of the Bat doesn't have it).
  const gains = /^It gains "When ~ deals combat damage to a player, sacrifice it and return the exiled card to the battlefield tapped\."$/.exec(s.trim());
  const ifDid = effects[effects.length - 1];
  const paid = effects[effects.length - 2];
  if (gains && !ctx.spell && !ctx.activated && ifDid?.type === "if" && ifDid.cond.kind === "youDid" && !ifDid.otherwise && ifDid.effects.length === 1 && ifDid.effects[0]!.type === "createToken" && paid?.type === "may" && paid.effects.length === 1 && paid.effects[0]!.type === "exile" && paid.effects[0]!.what.ref === "subjectCard") {
    ifDid.effects.push({ type: "linkSubjectCardToCreated" });
    return { effect: { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addAbility", text: GRANTED }], duration: "game" }, next: si + 1 };
  }
  return null;
}

const GRANTED = "When ~ deals combat damage to a player, sacrifice it and return the exiled card to the battlefield tapped.";

export function round350Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // The Bat's ability from Timothar, Baron of Bats: "sacrifice it" is the Bat, then the card linked to it comes back under
  // the control of the trigger's controller (who controlled the Bat as it dealt the damage, CR 110.2a, rulings), even if the
  // Bat was already gone; if the card has left exile, the Bat is still sacrificed (rulings).
  if (line === GRANTED) {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ event: "selfDealsCombatDamageToPlayer", body: { targets: [], effects: [{ type: "sacrifice", what: { ref: "self" } }, { type: "returnLinked", dest: "battlefield", tapped: true, yours: true, here: true }], text: GRANTED } });
    return true;
  }
  // Desert Warfare: "Whenever you sacrifice a Desert and whenever a Desert card is put into your graveyard from your hand or
  // library, put that card onto the battlefield under your control at the beginning of your next end step.": one ability
  // with two trigger events (CR 603.2), which never happen together (a sacrificed Desert comes from the battlefield), so two
  // triggers here. A sacrificed Desert you control but don't own comes back from its owner's graveyard under your control;
  // only Deserts put there while Desert Warfare is on the battlefield (rulings), each one still there as the delayed trigger
  // resolves (rulings, CR 400.7).
  if (line === "Whenever you sacrifice a Desert and whenever a Desert card is put into your graveyard from your hand or library, put that card onto the battlefield under your control at the beginning of your next end step.") {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    const none = { notTypes: [], notColors: [] };
    const text = "put that card onto the battlefield under your control at the beginning of your next end step.";
    out.triggers.push({ event: "youSacrifice", sacrifices: { filter: { kind: "object", types: [], ...none, subtypes: ["Desert"], text: "Desert" } }, body: { targets: [], effects: [{ type: "putAtYourNextEndStep", what: { ref: "subjectCard" } }], text } });
    out.triggers.push({ event: "batch", batch: { what: "toGraveyard", whose: "you", filter: { kind: "card", types: [], ...none, subtypes: ["Desert"], text: "Desert card" }, from: "handOrLibrary", each: true }, body: { targets: [], effects: [{ type: "putAtYourNextEndStep", what: { ref: "eventGroup" } }], text } });
    return true;
  }
  // Desert Warfare: "At the beginning of combat on your turn, if you control five or more Deserts, create that many 1/1 red,
  // green, and white Sand Warrior creature tokens. They gain haste.": an intervening "if" (CR 603.4), "that many" the
  // Deserts you control as it resolves; the haste lasts with no duration stated (CR 611.2a).
  if (line === "At the beginning of combat on your turn, if you control five or more Deserts, create that many 1/1 red, green, and white Sand Warrior creature tokens. They gain haste.") {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    const deserts = { kind: "object" as const, types: [], notTypes: [], notColors: [], subtypes: ["Desert"], text: "Deserts" };
    out.triggers.push({
      event: "yourBeginCombat",
      ifCond: { kind: "control", who: "you", filter: deserts, min: 5 },
      body: {
        targets: [],
        effects: [
          { type: "createToken", who: { ref: "you" }, n: { count: { kind: "permanents", filter: { ...deserts, controller: "you" } } }, token: { name: "Sand Warrior", power: 1, toughness: 1, colors: ["R", "G", "W"], types: ["Creature"], subtypes: ["Sand", "Warrior"], keywords: [] } },
          { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "game" },
        ],
        text: "if you control five or more Deserts, create that many 1/1 red, green, and white Sand Warrior creature tokens. They gain haste.",
      },
    });
    return true;
  }
  // Steward of the Harvest: "Creatures you control have all activated abilities of all land cards exiled with ~.": as
  // Agatha's Soul Cauldron's (CompiledCard.lendsExiled), the cards its one exile ability exiled (CR 607.2a); only
  // activated abilities, a basic land type's mana ability among them, "~" in them being the creature (rulings).
  if (line === "Creatures you control have all activated abilities of all land cards exiled with ~.") {
    if (isSpell || out.lendsExiled) {
      out.unsupported.push(raw);
      return true;
    }
    out.lendsExiled = { to: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" }, cards: { kind: "card", types: ["Land"], notTypes: [], notColors: [], text: "land cards" } };
    return true;
  }
  // Rex, Cyber-Hound: "Pay {E}{E}: Choose target creature card in a graveyard. Exile it with a brain counter on it.
  // Activate only as a sorcery.": the target exiled with the counter (CR 122.1), for its "~ has all activated abilities of
  // all cards in exile with brain counters on them" (compile.ts, CompiledCard.borrows exiledWithCounter).
  if (line === "Pay {E}{E}: Choose target creature card in a graveyard. Exile it with a brain counter on it. Activate only as a sorcery.") {
    if (isSpell) {
      out.unsupported.push(raw);
      return true;
    }
    out.activated.push({ text: line, manaCost: "", tap: false, sacrificeSelf: false, sorcerySpeed: true, energyCost: 2, body: { targets: [{ kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card in a graveyard" }], effects: [{ type: "exile", what: { ref: "target", index: 0 }, counters: { brain: 1 } }], text: "Choose target creature card in a graveyard. Exile it with a brain counter on it." } });
    return true;
  }
  return false;
}
