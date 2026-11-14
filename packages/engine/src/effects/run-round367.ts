// Round 367's effects: a tapped land's controller tapping every land of theirs that could make a type of mana it could
// (Mana Web).
import { objIsType } from "../cards";
import { log, player, tapPermanent } from "../game";
import { controllerOf, characteristics } from "../layers";
import { landCouldProduce } from "../manaabilities";
import type { GameState, ManaType } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Mana Web: "tap all lands that player controls that could produce any type of mana that land could produce": the types of
 * mana the tapped land (the trigger's subject) could produce with any of its mana abilities, not only the one used
 * (rulings), as it is now (CR 106.7) or, if it has left the battlefield, as it was when it was tapped; then every land the
 * trigger's player controls now that could produce one of those types (CR 106.7, whatever their costs). They're only
 * tapped, not tapped for mana, so they make none (rulings).
 */
export function runTapLandsSharingManaEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  const pid = ctx.event?.player;
  if (pid === undefined || player(s, pid).lost) return;
  const subj = ctx.subject;
  const land = subj ? s.objects[subj.id] : undefined;
  const here = !!land && land.zone === "battlefield" && (land.zoneChanges ?? 0) === subj!.zc;
  const types: ManaType[] = here ? landCouldProduce(s, land!) : (ctx.event?.couldProduce ?? []);
  if (!types.length) {
    log(s, `${src}: that land could produce no mana.`);
    return;
  }
  const lands = s.battlefield.map((id) => s.objects[id]!).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Land") && !o.tapped && landCouldProduce(s, o).some((m) => types.includes(m)));
  for (const o of lands) tapPermanent(s, o, undefined, ctx.controller);
  const tapped = lands.filter((o) => o.tapped);
  log(s, tapped.length ? `${src} taps ${tapped.map((o) => characteristics(s, o).name).join(", ")} (${player(s, pid).name}'s lands that could produce ${types.map((m) => `{${m}}`).join("")}).` : `${src}: ${player(s, pid).name} has no other untapped land that could produce ${types.map((m) => `{${m}}`).join("")}.`);
}
