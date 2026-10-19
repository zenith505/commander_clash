// Battles (CR 310): a battle enters with defense counters (310.4b) and a protector (310.9a), damage to it removes
// defense counters (310.6), and it can be attacked by any player its protector defends against (310.9b). A Siege's
// protector is one of its controller's opponents (310.12a), and when its last defense counter is removed it's exiled
// and may be cast transformed (310.12b, see the "lastCounterRemoved" trigger and the "siegeDefeated" effect).

import { cardIdOf, objIsType } from "./cards";
import { log, moveObject, obj, opponents, player } from "./game";
import { characteristics, controllerOf } from "./layers";
import type { GameObject, GameState, PlayerId } from "./types";

export const isBattle = (s: GameState, o: GameObject) => objIsType(s, o, "Battle");
export const isSiege = (s: GameState, o: GameObject) => isBattle(s, o) && characteristics(s, o).subtypes.includes("Siege");

/** Who can protect this battle (CR 310.9a): an opponent of its controller for a Siege (310.12a), else its controller. */
export function protectorOptions(s: GameState, o: GameObject): PlayerId[] {
  const you = controllerOf(s, o);
  if (isSiege(s, o)) return opponents(s, you);
  return player(s, you).lost ? [] : [you];
}

/** The battle `o` attacks, if it attacks one: the permanent it attacks, still the same battle (see attackedPlaneswalker). */
const attackedBy = (s: GameState, b: GameObject) =>
  s.battlefield.some((id) => {
    const a = obj(s, id).attackingPermanent;
    return a?.id === b.id && a.zc === (b.zoneChanges ?? 0);
  });

/**
 * A Siege that's the source of a triggered ability that has triggered but not yet left the stack stays with no
 * defense (CR 704.5v), so its own "when the last defense counter is removed" can resolve.
 */
function hasWaitingTrigger(s: GameState, o: GameObject): boolean {
  const zc = o.zoneChanges ?? 0;
  const same = (sourceId: string | undefined, sourceZc: number | undefined) => sourceId === o.id && (sourceZc === undefined || sourceZc === zc);
  return s.triggerQueue.some((t) => same(t.sourceId, t.sourceZc)) || s.stack.some((x) => x.kind === "ability" && same(x.sourceId, x.sourceZc));
}

/**
 * The state-based actions for battles (CR 704.5v-y). A battle whose protector has to be chosen again is queued for its
 * controller's choice (s.entersChoices, "protector"), unless there's only one player it can be.
 */
export function battleSBAs(s: GameState): boolean {
  let changed = false;
  for (const id of [...s.battlefield]) {
    const o = s.objects[id];
    if (!o || o.zone !== "battlefield" || !isBattle(s, o)) continue;
    const name = characteristics(s, o).name;
    // A battle with no defense goes to its owner's graveyard (704.5v-w): a Siege not while its own trigger waits.
    if ((o.counters.defense ?? 0) <= 0 && !(isSiege(s, o) && hasWaitingTrigger(s, o))) {
      log(s, `${name} has no defense left and is put into the graveyard.`);
      moveObject(s, id, "graveyard");
      changed = true;
      continue;
    }
    // Its protector left the game or can't be its protector any more (704.5x-y): its controller chooses another, but a
    // battle whose protector left isn't given a new one while creatures are still attacking it (rulings).
    const options = protectorOptions(s, o);
    if (o.protector !== undefined && options.includes(o.protector)) continue;
    const gone = o.protector === undefined || player(s, o.protector).lost;
    if (gone && attackedBy(s, o)) continue;
    if (s.entersChoices?.some((c) => c.id === id && c.what === "protector")) continue;
    if (!options.length) {
      log(s, `${name} has no player who can protect it and is put into the graveyard.`);
      moveObject(s, id, "graveyard");
      changed = true;
      continue;
    }
    if (options.length === 1) setProtector(s, o, options[0]!);
    else (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "protector" });
    changed = true;
  }
  return changed;
}

export function setProtector(s: GameState, o: GameObject, pid: PlayerId) {
  o.protector = pid;
  log(s, `${player(s, pid).name} protects ${characteristics(s, o).name}.`);
}

/** The intrinsic trigger of a Siege (CR 310.12b), as its last defense counter is removed. */
export function siegeTrigger(s: GameState, o: GameObject) {
  s.triggerQueue.push({
    sourceId: o.id,
    sourceCardId: cardIdOf(o),
    sourceZc: o.zoneChanges ?? 0,
    controller: controllerOf(s, o),
    index: -1,
    subject: { id: o.id, zc: o.zoneChanges ?? 0 },
    body: { targets: [], effects: [{ type: "siegeDefeated" }], text: "When the last defense counter is removed from ~, exile it, then you may cast it transformed without paying its mana cost." },
  });
}
