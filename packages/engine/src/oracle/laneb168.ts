// Lane B round B168's sentences, read at the end of round B167's (parseBodyText is at TS2563's limit).
import type { Effect } from "../abilities";
import { parseOne, reflexiveBody, type Ctx } from "./body";
import { QUOTED_SOURCE_NAME } from "./compile";
import { roundB169Sentence } from "./laneb169";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function roundB168Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Psychotic Episode: "Target player reveals their hand and the top card of their library. You choose a card revealed this
  // way. That player puts the chosen card on the bottom of their library.": the hand and the top card revealed to all (CR
  // 701.20a); you choose any one of them, even one revealed before for another effect (rulings); a card from the library
  // moves to its bottom without changing zones (CR 400.7).
  if (s === "Target player reveals their hand and the top card of their library" && plain(sentences[si + 1]) === "You choose a card revealed this way" && plain(sentences[si + 2]) === "That player puts the chosen card on the bottom of their library") {
    const look = parseOne("Target player reveals their hand", ctx);
    const l = look?.length === 1 ? look[0] : undefined;
    if (l?.type !== "lookAtHand" || !l.reveal || l.who.ref !== "target") return "fail";
    effects.push(l);
    return { effect: { type: "takeFromHand", who: l.who, action: "libraryBottom", orLibraryTop: true }, next: si + 3 };
  }
  // Novel Nunchaku: "When ~ enters, attach it to target creature you control. When you do, equipped creature fights up to
  // one target creature an opponent controls.": a reflexive trigger (CR 603.12) only if ~ became attached to that creature
  // (CR 701.3c), its target chosen as it's put on the stack (rulings); "equipped creature" is the one ~ is attached to as
  // the reflexive ability resolves.
  if (s === "attach it to target creature you control" && !ctx.spell && !ctx.activated) {
    const when = /^When you do, (equipped creature fights up to one target creature an opponent controls)$/.exec(plain(sentences[si + 1]));
    if (!when) return null;
    const fx = parseOne(s, ctx);
    const a = fx?.length === 1 ? fx[0] : undefined;
    if (a?.type !== "attach" || a.what.ref !== "target" || a.source) return "fail";
    const body = reflexiveBody(when[1]!, ctx, false, true);
    if (!body || !body.effects.every((e) => e.type === "fight" && e.a.ref === "attached")) return "fail";
    effects.push(a);
    return { effect: { type: "reflexive", body, about: { target: a.what.index, attachedThisWay: true } }, next: si + 2 };
  }
  // Hold for Ransom's granted "{7}: Hold for Ransom's controller sacrifices it and draws a card.": the Aura's controller
  // (usually not the creature's, who activates it, rulings) sacrifices the Aura (CR 701.21a) and draws, the controller it
  // had as it last existed if it's gone by then (CR 608.2h).
  if (s === `${QUOTED_SOURCE_NAME}'s controller sacrifices it and draws a card` && ctx.activated && !ctx.spell) {
    effects.push({ type: "sacrifice", what: { ref: "grantSource" }, byController: true });
    return { effect: { type: "draw", who: { ref: "grantSourceController" }, n: 1 }, next: si + 1 };
  }
  // Day of the Dragons: "exile all creatures you control. Then create that many 5/5 red Dragon creature tokens with
  // flying.": as many as were exiled this way, tokens too (rulings).
  const thatMany = /^(?:Then )?[Cc]reate that many (\d+\/\d+ [a-z ]+? [A-Z][a-z]+ creature) tokens( with [a-z]+)?$/.exec(s);
  if (thatMany) {
    const prev = effects.at(-1);
    if (prev?.type !== "exile" || prev.what.ref !== "each" || !prev.what.filter || prev.what.filter.kind !== "object") return null;
    const made = parseOne(`Create two ${thatMany[1]} tokens${thatMany[2] ?? ""}`, ctx);
    const t = made?.length === 1 ? made[0] : undefined;
    if (t?.type !== "createToken" || t.n !== 2) return "fail";
    return { effect: { ...t, n: { count: { kind: "exiledThisWay", filter: prev.what.filter } } }, next: si + 1 };
  }
  // Day of the Dragons: "When ~ leaves the battlefield, sacrifice all Dragons you control. Then return the exiled cards to
  // the battlefield under your control.": the cards its enters ability exiled (CR 607.2a), under the ability's
  // controller's control.
  if (/^(?:Then )?return the exiled cards to the battlefield under your control$/i.test(s) && ctx.selfCard) return { effect: { type: "returnLinked", dest: "battlefield", yours: true }, next: si + 1 };
  // Exotic Pets: "Then for each kind of counter among creatures you control, put a counter of that kind on either of those
  // tokens.": the kinds as this happens (the tokens have none yet), one counter of each kind on the token you choose.
  if (/^(?:Then )?[Ff]or each kind of counter among creatures you control, put a counter of that kind on either of those tokens$/.test(s)) {
    const prev = effects.at(-1);
    if (prev?.type !== "createToken" || prev.n !== 2 || prev.who.ref !== "you") return "fail";
    return { effect: { type: "counterKindsOnEither" }, next: si + 1 };
  }
  return roundB169Sentence(s, sentences, si, ctx, effects);
}
