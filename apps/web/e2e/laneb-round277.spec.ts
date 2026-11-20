// Lane B round B277 in the browser: Lightning Storm (Ana casts it at you; you click its ability on the stack card, discard
// your Mountain, and choose Ana as its new target as the ability resolves, so she takes 5) and Sacred Ground (your Mountain
// that Ana's Stone Rain destroys comes back).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, modal, resolveUntil } from "./ui";

const MOUNTAINS = ["Mountain", "Mountain", "Mountain"];
/** Ana's hand holds no land card, so she has nothing to discard to send it back. */
const noLandsInAnasHand = (s: GameState) => {
  for (const id of [...s.players[1]!.hand]) {
    if (!s.cards[s.objects[id]!.cardId]!.types.includes("Land")) continue;
    s.players[1]!.hand.splice(s.players[1]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[1]!.library.unshift(id);
  }
};

test("Lightning Storm: Ana casts it at you; you discard your Mountain with its ability on the stack and send it at Ana", async ({ page }) => {
  const s0 = scene({ hand: ["Mountain"] }, [{ hand: ["Lightning Storm"], board: MOUNTAINS }]);
  const [storm, land] = [one(s0, "Lightning Storm"), idsOf(s0, "Mountain", "hand", 0)[0]!];
  let s = playUntil(s0, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  noLandsInAnasHand(s);
  for (const a of planCast(s, 1, storm, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  const anaLife = s.players[1]!.life;
  await open(page, s);
  const button = page.locator(`.stack-card [data-stack-ability="0"]`);
  await expect(button).toContainText("Discard a land card: Put two charge counters on Lightning Storm. You may choose a new target for it.");
  await button.click();
  const pick = modal(page);
  await expect(pick).toContainText("discard a land card");
  await pick.locator(`[data-pick="${land}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // As the ability resolves, you may choose a new target for the spell (CR 115.7d).
  const retarget = await resolveUntil(page, (x) => x.pending?.kind === "newTargets" && x.pending.player === 0);
  expect(retarget.objects[land]!.zone).toBe("graveyard");
  expect(retarget.objects[storm]!.counters.charge).toBe(2);
  await expect(page.locator(`[data-spell-counters="charge"]`)).toContainText("2 charge counters");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[storm]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(anaLife - 5);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Sacred Ground: Ana's Stone Rain destroys your Mountain, which comes back", async ({ page }) => {
  const s0 = scene({ board: ["Sacred Ground", "Mountain"] }, [{ hand: ["Stone Rain"], board: MOUNTAINS }]);
  const [rain, land] = [one(s0, "Stone Rain"), idsOf(s0, "Mountain", "battlefield", 0)[0]!];
  let s = playUntil(s0, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  for (const a of planCast(s, 1, rain, [{ kind: "object", id: land }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 1 && !x.pending);
  await open(page, s);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[rain]!.zone === "graveyard" && x.objects[land]!.zone === "battlefield");
  expect(after.objects[land]!.zoneChanges).toBe(2);
  expect(after.objects[land]!.controller).toBe(0);
  await expect(page.locator(`[data-obj="${land}"]`).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
