// Lane B round B277's lines, read by compileCard before the generic triggers and statics (after round B276's): Lightning
// Storm's ability on the stack and Sacred Ground's trigger.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const STORM =
  "Discard a land card: Put two charge counters on ~. You may choose a new target for it. Any player may activate this ability but only if ~ is on the stack.";

const SACRED_GROUND =
  "Whenever a spell or ability an opponent controls causes a land to be put into your graveyard from the battlefield, return that card to the battlefield.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB277Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Lightning Storm: an ability of an instant spell that functions only while it's on the stack (CR 113.6, 113.6b). Any
  // player may activate it (CR 602.2), and that player controls it (CR 113.8), "you" in it. Its cost is discarding a land
  // card (CR 602.2b, 601.2h). As it resolves, two charge counters go on the spell if it's still on the stack as that object
  // (CR 122.1, 400.7; Effect spellCounters), then that player may choose a new target for it, keeping the old one if there's
  // no other legal target, even an illegal one (CR 115.7d, rulings). The spell's damage counts its counters as it resolves.
  if (line === STORM) {
    const a = isSpell ? parseActivated("Discard a land card: Put two charge counters on ~. Any player may activate this ability.") : null;
    const cost = a && a !== "fail" ? a.costs : undefined;
    const put = a && a !== "fail" ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || !a.anyPlayer || a.tap || a.manaCost || cost?.length !== 1 || cost[0]!.kind !== "discard" || a.body.targets.length || a.body.effects.length !== 1 || put?.type !== "counters" || put.what.ref !== "self" || put.counter !== "charge" || put.n !== 2) return fail();
    out.activated.push({
      ...a,
      zone: "stack",
      text: line,
      body: { targets: [], effects: [{ type: "spellCounters", counter: "charge", n: 2 }, { type: "newTargets", index: -1, ofSource: true }], text: "Put two charge counters on ~. You may choose a new target for it." },
    });
    return true;
  }
  // Sacred Ground: a land card that goes to its owner's graveyard (you own it) from the battlefield because a spell or
  // ability an opponent controls moved it there, by its effect (a destruction, a sacrifice it instructs, "put into a
  // graveyard") or its cost; not a state-based action, which no spell or ability causes (CR 704.3), nor anything you or
  // a game rule does (Effect "dies" event `cause`). The card returns to the battlefield, under your control (CR 110.2a),
  // only if it's still in that graveyard as the object it became there (CR 400.7).
  if (line === SACRED_GROUND) {
    const t = isSpell ? undefined : parseTrigger("Whenever a land is put into your graveyard from the battlefield, return that card to the battlefield.");
    const put = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "permanentDies" || !t.dies || t.dies.filter.kind !== "object" || t.dies.filter.owner !== "you" || t.body.targets.length || t.body.effects.length !== 1 || put?.type !== "putOntoBattlefield" || put.what.ref !== "subjectCard") return fail();
    out.triggers.push({ ...t, dies: { ...t.dies, causedByOpponent: true }, body: { ...t.body, effects: [{ ...put, what: { ref: "subjectCard", zone: "graveyard" } }] } });
    return true;
  }
  return false;
}
