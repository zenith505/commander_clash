// Lane B round B284's effects: Tahngarth, First Mate's giveControlAttacking. Chorus of the Conclave's additional cost is in
// game.ts (chorusFor, castSpell, moveObject).
import type { Effect } from "../abilities";
import { objIsType } from "../cards";
import { attackingPermanentOf, attackedName, livingPlayers, log, obj, player, syncControl } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId, PlayerId } from "../types";
import { type ResolveCtx, players, runEffect } from "./resolve";
import { inCombat } from "./triggers";

type B284Effect = Extract<Effect, { type: "giveControlAttacking" }>;

/**
 * The players and planeswalkers `attacker`'s attacking creatures (other than `except`) are attacking now, as chooseOption
 * "attackWhom" keys ("<player>" or "<controller>:<planeswalker id>"): a player only if a creature attacks that player
 * (not only their planeswalker), a planeswalker only while it's still that object and a planeswalker (Tahngarth's rulings;
 * a battle isn't a player or planeswalker), each player still in the game (CR 800.4a).
 */
export function attackedNow(s: GameState, attacker: PlayerId, except?: ObjectId): { key: string; label: string; player: PlayerId; planeswalker?: ObjectId }[] {
  const out: { key: string; label: string; player: PlayerId; planeswalker?: ObjectId }[] = [];
  const living = livingPlayers(s);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (id === except || o.attacking === undefined || controllerOf(s, o) !== attacker || !objIsType(s, o, "Creature")) continue;
    const at = o.attackingPermanent;
    if (!at) {
      if (living.includes(o.attacking) && !out.some((x) => x.planeswalker === undefined && x.player === o.attacking)) out.push({ key: String(o.attacking), label: player(s, o.attacking).name, player: o.attacking });
      continue;
    }
    const pw = s.objects[at.id];
    if (at.battleController !== undefined || !pw || pw.zone !== "battlefield" || (pw.zoneChanges ?? 0) !== at.zc || !objIsType(s, pw, "Planeswalker")) continue;
    const ctl = controllerOf(s, pw);
    if (!living.includes(ctl) || out.some((x) => x.planeswalker === pw.id)) continue;
    out.push({ key: `${ctl}:${pw.id}`, label: `${characteristics(s, pw).name} (${player(s, ctl).name})`, player: ctl, planeswalker: pw.id });
  }
  // In turn order, players before their planeswalkers.
  const seat = (p: PlayerId) => s.turnOrder.indexOf(p);
  return out.sort((a, b) => seat(a.player) - seat(b.player) || (a.planeswalker === undefined ? -1 : 0) - (b.planeswalker === undefined ? -1 : 0));
}

export function runLaneB284Effect(s: GameState, e: B284Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "giveControlAttacking": {
      // Tahngarth, First Mate: "you may have that opponent gain control of ~ until end of combat. If you do, choose a player
      // or planeswalker that opponent is attacking. ~ is attacking that player or planeswalker." Only the source as the
      // object it was (CR 400.7), the attacking player still in the game, during this combat. The choice is made first
      // (nothing happens in between, rulings), then the control change (layer 2, until end of combat, CR 500.5a, 611.2a),
      // seen at once (CR 506.4 would take it out of combat if it changed later), then it's attacking what was chosen: it
      // wasn't declared, so "whenever ~ attacks" doesn't trigger and nothing restricts it (rulings, CR 506.3, 508.4).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const to = players(s, e.to, ctx)[0];
      if (to === undefined || player(s, to).lost || !inCombat(s) || s.activePlayer !== to) return;
      const sc = (s.resolving!.scratch ??= {});
      const options = attackedNow(s, to, me.id);
      if (options.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: options.map((a) => a.key), labels: options.map((a) => a.label), about: me.id, prompt: `choose what ${src} attacks for ${player(s, to).name}` };
        return "paused";
      }
      const pick = options.length > 1 ? options.find((a) => a.key === sc.attackWhom) : options[0];
      sc.attackWhom = undefined;
      runEffect(s, { type: "continuous", what: { ref: "self" }, mods: [{ kind: "control" }], duration: "endOfCombat", giveTo: e.to }, ctx);
      syncControl(s);
      if (controllerOf(s, me) !== to) return;
      if (!pick) {
        log(s, `${src} isn't attacking (${player(s, to).name}'s creatures attack no player or planeswalker it could attack).`);
        return;
      }
      me.attacking = pick.player;
      me.attackingPermanent = pick.planeswalker !== undefined ? attackingPermanentOf(s, pick.planeswalker) : undefined;
      invalidateCharacteristics(s);
      log(s, `${src} is attacking ${attackedName(s, me)} for ${player(s, to).name}.`);
      return;
    }
  }
}
