// Overload, surge and spectacle cast buttons, and the stop for an ability usable only during your upkeep.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, menu, resolveUntil } from "./ui";

test("Cyclonic Rift: Overload from its menu returns each nonland permanent you don't control, hexproof too", async ({ page }) => {
  const s = scene({ hand: ["Cyclonic Rift"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Grizzly Bears", "Slippery Bogle"] }]);
  const mine = idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!, theirs = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  const bogle = one(s, "Slippery Bogle");
  await open(page, s);
  await card(page, "Cyclonic Rift", s).click();
  const overload = menu(page).getByRole("button", { name: /^Overload/ });
  await expect(overload).toBeEnabled();
  await overload.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bogle]!.zone === "hand");
  expect(after.objects[theirs]!.zone).toBe("hand");
  expect(after.objects[mine]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Reckless Bushwhacker: Surge is greyed out until you cast another spell this turn", async ({ page }) => {
  const s = scene({ hand: ["Reckless Bushwhacker", "Grizzly Bears"], board: LANDS });
  const [bushwhacker, bears] = [one(s, "Reckless Bushwhacker"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Reckless Bushwhacker", s).click();
  await expect(menu(page).getByRole("button", { name: /^Surge/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  await card(page, "Reckless Bushwhacker", s).click();
  const surge = menu(page).getByRole("button", { name: /^Surge/ });
  await expect(surge).toBeEnabled();
  await surge.click();
  // Its enters trigger (surge paid): other creatures you control get +1/+0 and haste.
  await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[bushwhacker]!.zone === "battlefield");
  const now = await state(page);
  invalidateCharacteristics(now);
  expect(characteristics(now, now.objects[bears]!).power).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Skewer the Critics: Spectacle once an opponent lost life this turn", async ({ page }) => {
  const s = scene({ hand: ["Skewer the Critics"], board: ["Mountain"] });
  s.lostLifeThisTurn = [1];
  await open(page, s);
  await card(page, "Skewer the Critics", s).click();
  await expect(menu(page).getByRole("button", { name: /^Cast it/ }).first()).toBeDisabled(); // {2}{R}: one Mountain isn't enough
  await menu(page).getByRole("button", { name: /^Spectacle/ }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.players[1]!.life === 37);
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Augur il-Vec: the game stops in your upkeep so you can use its 'only during your upkeep' ability", async ({ page }) => {
  const s = scene({ board: ["Augur il-Vec"] }, [], { step: "upkeep" });
  const augur = one(s, "Augur il-Vec");
  await open(page, s);
  // Nothing else to do in an upkeep, so it would auto-pass without the ability.
  await page.waitForTimeout(1500);
  expect((await state(page)).step).toBe("upkeep");
  await card(page, "Augur il-Vec", s).click();
  await menu(page).getByRole("button", { name: /gain 4 life/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[augur]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(44);
  expect(pageErrors(page)).toEqual([]);
});
