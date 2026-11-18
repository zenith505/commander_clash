// Lane B round B256 in the browser: False Orders and Balduvian Warlord ask which attacking creature the removed blocker
// blocks; Raiding Party asks you for the white creatures to tap, then the Plains to spare; Search the City asks whether to
// put the exiled card with the played card's name into your hand.
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

/** You attack Ana with Grizzly Bears and Hill Giant; she blocks the Bears with Giant Badger. Your priority in declare blockers. */
function blocked(hand: string[], board: string[] = []) {
  let s = scene({ hand, board: [...LANDS, "Grizzly Bears", "Hill Giant", ...board] }, [{ board: ["Giant Badger"] }]);
  const [bears, giant, badger] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Giant Badger")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }, { attacker: giant, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker: badger, attacker: bears }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && !st.stack.length && !st.triggerQueue.length && waitingOn(st) === 0);
  return { s, bears, giant, badger };
}

test("False Orders: cast at Ana's blocking Giant Badger, then click the Hill Giant for it to block instead", async ({ page }) => {
  const { s, bears, giant, badger } = blocked(["False Orders"]);
  await open(page, s);
  await card(page, "False Orders", s).click();
  await page.locator(`[data-obj="${badger}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "reblockAttacker" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose an attacking creature for Giant Badger to block, if you want");
  await expect(bar.getByRole("button", { name: "Giant Badger doesn't block", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Giant Badger blocks Hill Giant", exact: true }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[badger]!.blocking).toEqual([giant]);
  expect(after.objects[bears]!.blockedBy).toBeUndefined();
  expect(after.objects[giant]!.blockedBy).toEqual([badger]);
  expect(after.log.some((l) => l.text === "Giant Badger blocks Hill Giant (False Orders).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Balduvian Warlord: its ability on the blocking Giant Badger, then it must block an attacker you click", async ({ page }) => {
  const { s, bears, badger } = blocked([], ["Balduvian Warlord"]);
  const warlord = one(s, "Balduvian Warlord");
  await open(page, s);
  await page.locator(`[data-obj="${warlord}"]`).first().click();
  await menu(page).getByRole("button", { name: /Remove target blocking creature from combat/ }).click();
  await page.locator(`[data-obj="${badger}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "reblockAttacker" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose an attacking creature for Giant Badger to block");
  await expect(bar.getByRole("button", { name: "Giant Badger doesn't block", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Giant Badger blocks Grizzly Bears", exact: true }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[bears]!.blockedBy).toEqual([badger]);
  expect(after.objects[warlord]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Raiding Party: sacrifice an Orc, tap Savannah Lions, then click the two Plains to spare; Ana's Plains is destroyed", async ({ page }) => {
  const s = scene({ board: ["Raiding Party", "Mardu Outrider", "Savannah Lions", "Plains", "Snow-Covered Plains"] }, [{ board: ["Plains"] }]);
  const [party, orc, lions, plains, snowy] = [one(s, "Raiding Party"), one(s, "Mardu Outrider"), one(s, "Savannah Lions"), s.battlefield.find((id) => s.objects[id]!.controller === 0 && s.cards[s.objects[id]!.cardId]!.name === "Plains")!, one(s, "Snow-Covered Plains")];
  const anas = s.battlefield.find((id) => s.objects[id]!.controller === 1 && s.cards[s.objects[id]!.cardId]!.name === "Plains")!;
  await open(page, s);
  await page.locator(`[data-obj="${party}"]`).first().click();
  await menu(page).getByRole("button", { name: /Each player may tap any number of untapped white creatures/ }).click();
  await page.locator(`[data-obj="${orc}"]`).first().click();
  await page.locator(".targeting").getByRole("button", { name: /^Sacrifice/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.raid === "tap" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("tap any number of untapped white creatures you control");
  await page.locator(`[data-obj="${lions}"]`).first().click();
  await bar.getByRole("button", { name: "Tap 1", exact: true }).click();
  let mid: GameState = s;
  await expect.poll(async () => ((mid = await state(page)).pending?.kind === "pickPermanents" ? mid.pending.raid : undefined)).toBe("plains");
  await expect(bar).toContainText("choose up to 2 Plains (anyone's) to spare");
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await page.locator(`[data-obj="${snowy}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[anas]!.zone === "graveyard");
  expect(after.objects[orc]!.zone).toBe("graveyard");
  expect(after.objects[lions]!.tapped).toBe(true);
  expect(after.objects[plains]!.zone).toBe("battlefield");
  expect(after.objects[snowy]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Search the City: casting Lightning Bolt asks to put the exiled Lightning Bolt into your hand; the last one gives an extra turn", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], exile: ["Lightning Bolt"], board: [...LANDS, "Search the City"] });
  const city = one(s, "Search the City");
  const exiled = s.players[0]!.exile[0]!;
  const bolt = s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Lightning Bolt")!;
  // As its enters ability would have: the exiled Bolt is linked to it (CR 607.2a).
  s.linkedExile = { [`${city}@${s.objects[city]!.zoneChanges ?? 0}`]: [{ id: exiled, zc: s.objects[exiled]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await page.locator(`[data-obj="${bolt}"]`).first().click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cityCard" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("you may put one of the exiled cards named Lightning Bolt into its owner's hand");
  await expect(bar.getByRole("button", { name: "Leave them exiled", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Put Lightning Bolt into your hand", exact: true }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[city]!.zone).toBe("graveyard");
  expect(after.objects[exiled]!.zone).toBe("hand");
  expect(after.extraTurns).toEqual([expect.objectContaining({ player: 0 })]);
  expect(pageErrors(page)).toEqual([]);
});
