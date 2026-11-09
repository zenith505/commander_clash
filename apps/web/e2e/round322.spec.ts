// Round 322's prompts: Puca's Mischief's two targets chosen as a set (only an opponent's permanent with equal or lesser
// mana value than yours can be clicked), then its "you may"; Coveted Falcon turned face up: target opponent, then any
// number of your permanents to give them, and a card drawn for each; Curse of Misfortunes' search, which offers only a
// Curse whose name no Curse on that player has.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, invalidateCharacteristics, planTurnFaceUp } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Puca's Mischief: you click your Worn Powerstone, the Gilded Lotus can't be clicked, the Mind Stone can, and you exchange", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Puca's Mischief", "Worn Powerstone"] }, [{ board: ["Mind Stone", "Gilded Lotus"] }]);
  const [mine, stone, lotus] = [one(s, "Worn Powerstone"), one(s, "Mind Stone"), one(s, "Gilded Lotus")];
  s = playUntil(s, (x) => x.turn > s.turn && x.activePlayer === 0 && x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  await open(page, s);
  await page.locator(`[data-obj="${mine}"]`).click();
  await expect(page.locator(`[data-obj="${stone}"]`)).toHaveClass(/targetable/);
  await expect(page.locator(`[data-obj="${lotus}"]`)).not.toHaveClass(/targetable/);
  await page.locator(`[data-obj="${stone}"]`).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && controllerOf(x, x.objects[mine]!) === 1);
  expect(controllerOf(after, after.objects[stone]!)).toBe(0);
  expect(controllerOf(after, after.objects[lotus]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Coveted Falcon turned face up: you click Ana, then your Sol Ring and Mind Stone, Done, and draw two cards", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Coveted Falcon", "Sol Ring", "Mind Stone", "Thought Vessel"] }, [{}]);
  const [falcon, ring, stone, vessel] = [one(s, "Coveted Falcon"), one(s, "Sol Ring"), one(s, "Mind Stone"), one(s, "Thought Vessel")];
  s.objects[falcon]!.faceDown = "disguise";
  invalidateCharacteristics(s);
  for (const a of planTurnFaceUp(s, 0, falcon)!) s = applyAction(s, a);
  const hand = s.players[0]!.hand.length;
  s = playUntil(s, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  await open(page, s);
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${ring}"]`).click();
  await page.locator(`[data-obj="${stone}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && controllerOf(x, x.objects[ring]!) === 1);
  expect(controllerOf(after, after.objects[stone]!)).toBe(1);
  expect(controllerOf(after, after.objects[vessel]!)).toBe(0);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Curse of Misfortunes: the search offers Curse of Death's Hold, not another Curse of the Pierced Heart, and attaches it to Ana", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Curse of Misfortunes", "Curse of the Pierced Heart"], library: ["Curse of the Pierced Heart", "Curse of Death's Hold"] }, [{}]);
  const [mis, heart] = [s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Curse of Misfortunes")!, s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Curse of the Pierced Heart")!];
  s.objects[mis]!.attachedToPlayer = 1;
  s.objects[heart]!.attachedToPlayer = 1;
  invalidateCharacteristics(s);
  const hold = one(s, "Curse of Death's Hold");
  const libHeart = s.players[0]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Curse of the Pierced Heart")!;
  s = playUntil(s, (x) => x.turn > s.turn && x.activePlayer === 0 && x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await open(page, s);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  const box = modal(page);
  await expect(box.locator(`[data-pick="${hold}"]`)).toBeVisible();
  await expect(box.locator(`[data-pick="${libHeart}"]`)).toHaveCount(0);
  await box.locator(`[data-pick="${hold}"]`).click();
  await box.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[hold]!.zone === "battlefield");
  expect(after.objects[hold]!.attachedToPlayer).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
