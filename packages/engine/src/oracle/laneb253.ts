// Lane B round B253's lines, read by compileCard: Lich, Nefarious Lich and Dralnu, Lich Lord. roundB253Line before the
// generic static abilities (after round B252's).
import type { CompiledCard, DamageMod, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB253Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Lich: "As ~ enters, you lose life equal to your life total." A replacement effect on how it enters (CR 614.1c, 614.12):
  // the player it enters under loses their life total as it enters (rulings: a player who gains control of it later loses
  // nothing); with 0 or less life, nothing (CR 107.1b). game.ts moveObject.
  if (line === "As ~ enters, you lose life equal to your life total.") {
    out.entersLoseLifeTotal = true;
    return true;
  }
  // Lich, Nefarious Lich: "If you would gain life, draw that many cards instead." (CR 119.10, 614.1a): the draws are made
  // right after the event they replace (GameState.damageDraws); one card for each life however many Liches there are, as
  // only one of them can replace that gain (rulings), and a Lich doesn't replace a gain that one of its own draws turned
  // into (CR 614.5, rulings on Nefarious Lich). game.ts gainLife.
  if (line === "If you would gain life, draw that many cards instead.") {
    out.gainLifeDrawsInstead = true;
    return true;
  }
  // Lich: "Whenever you're dealt damage, sacrifice that many nontoken permanents. If you can't, you lose the game." A
  // triggered ability (rulings: two Liches, two sacrifices), the permanents sacrificed at once (rulings). With fewer than that
  // many it could sacrifice, none is sacrificed and you lose (as the rulings on Egon, God of Death read "If you can't").
  if (line === "Whenever you're dealt damage, sacrifice that many nontoken permanents. If you can't, you lose the game.") {
    const t = parseTrigger("Whenever you're dealt damage, sacrifice that many nontoken permanents.");
    const pick = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "youAreDealtDamage" || t.ifCond || pick?.type !== "pick" || pick.action !== "sacrifice" || pick.who.ref !== "you") {
      out.unsupported.push(line);
      return true;
    }
    const lich: Effect = { type: "if", cond: { kind: "canSacrificeMany", filter: pick.filter, n: pick.n }, effects: [pick], otherwise: [{ type: "loseGame", who: { ref: "you" } }] };
    out.triggers.push({ ...t, body: { ...t.body, effects: [lich], text: "sacrifice that many nontoken permanents. If you can't, you lose the game." } });
    return true;
  }
  // Nefarious Lich: "If damage would be dealt to you, exile that many cards from your graveyard instead. If you can't, you
  // lose the game." A replacement, not prevention (CR 614.1a): none of the damage is dealt (no lifelink, infect or "dealt
  // damage" trigger), even when damage can't be prevented (CR 615.12), and the player orders it with the other replacement
  // and prevention effects (CR 616.1). The cards are chosen as it applies (damage.ts planShields); with fewer cards there,
  // none is exiled and the player loses (rulings on Egon, God of Death).
  if (line === "If damage would be dealt to you, exile that many cards from your graveyard instead. If you can't, you lose the game.") {
    const mod: DamageMod = { op: "exileYard", to: { players: "you" }, text: line };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line });
    return true;
  }
  // Dralnu, Lich Lord: "If damage would be dealt to ~, sacrifice that many permanents instead." A replacement (CR 614.1a),
  // its controller choosing the permanents as it applies, Dralnu among them if they like; with more damage than they have
  // permanents, all of them (rulings). The permanents are sacrificed as the rest of the damage is dealt: their own damage is
  // still dealt, and their abilities that would trigger on it don't (rulings). damage.ts planShields, dealPlanned.
  if (line === "If damage would be dealt to ~, sacrifice that many permanents instead.") {
    const mod: DamageMod = { op: "sacrifice", to: { self: true }, text: line };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "damageMod", mod }], text: line });
    return true;
  }
  return false;
}
