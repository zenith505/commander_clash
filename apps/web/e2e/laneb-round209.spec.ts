// Lane B round B209 in the browser: Jötun Grunt's cumulative upkeep (two cards from a single graveyard for each age
// counter), Beamsplitter Mage's choice of the creature its copy targets, Bill Potts's copy with a new target, and the
// abilities Hankyu and Shuriken give the equipped creature.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Jötun Grunt: keep it by putting Ana's Hill Giant and Gray Ogre on the bottom of her library", async ({ page }) => {
  let s = scene({ board: ["Jötun Grunt"], yard: ["Grizzly Bears"] }, [{ yard: ["Hill Giant", "Gray Ogre"] }]);
  const [grunt, bears, giant, ogre] = [one(s, "Jötun Grunt"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Put 2 cards from graveyards on the bottom of their owners' libraries, two from a single graveyard for each age counter");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("an even number from each graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Ana (a bot) orders her two on the bottom.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "library" && st.objects[ogre]!.zone === "library");
  expect(after.objects[grunt]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[1]!.library.slice(-2).sort()).toEqual([giant, ogre].sort());
  expect(pageErrors(page)).toEqual([]);
});

test("Beamsplitter Mage: Giant Growth on it is copied onto the Grizzly Bears you choose, not the Elvish Visionary", async ({ page }) => {
  const s = scene({ hand: ["Giant Growth"], board: [...LANDS, "Beamsplitter Mage", "Grizzly Bears", "Elvish Visionary"] });
  const [mage, bears, visionary] = [one(s, "Beamsplitter Mage"), one(s, "Grizzly Bears"), one(s, "Elvish Visionary")];
  await open(page, s);
  await card(page, "Giant Growth", s).click();
  await page.locator(`[data-obj="${mage}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyOrder" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose the creature the copy of Giant Growth targets");
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Giant Growth")]!.zone === "graveyard");
  expect(after.stack.length).toBe(0);
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("5/5");
  await expect(page.locator(`[data-obj="${mage}"]`).first()).toContainText("5/5");
  await expect(page.locator(`[data-obj="${visionary}"]`).first()).toContainText("1/1");
  expect(pageErrors(page)).toEqual([]);
});

test("Bill Potts: Giant Growth on Bill is copied, and the copy targets your Grizzly Bears instead", async ({ page }) => {
  const s = scene({ hand: ["Giant Growth"], board: [...LANDS, "Bill Potts", "Grizzly Bears"] });
  const [bill, bears] = [one(s, "Bill Potts"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Giant Growth", s).click();
  await page.locator(`[data-obj="${bill}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Giant Growth")]!.zone === "graveyard");
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("5/5");
  await expect(page.locator(`[data-obj="${bill}"]`).first()).toContainText("5/7");
  expect(pageErrors(page)).toEqual([]);
});

test("Hankyu: the equipped Grizzly Bears removes Hankyu's two aim counters to deal 2 damage to Ana", async ({ page }) => {
  const s = scene({ board: ["Grizzly Bears", "Hankyu"] });
  const [bears, hankyu] = [one(s, "Grizzly Bears"), one(s, "Hankyu")];
  s.objects[hankyu]!.attachedTo = bears;
  s.objects[hankyu]!.counters = { aim: 2 };
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await expect(menu(page).locator("button", { hasText: "Put an aim counter on Hankyu" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "equal to the number of aim counters removed" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 38);
  expect(after.objects[hankyu]!.counters.aim ?? 0).toBe(0);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Shuriken: unattached from your Grizzly Bears for 2 damage to Ana's Hill Giant; Ana gains control of it", async ({ page }) => {
  const s = scene({ board: ["Grizzly Bears", "Shuriken"] }, [{ board: ["Hill Giant"] }]);
  const [bears, shuriken, giant] = [one(s, "Grizzly Bears"), one(s, "Shuriken"), one(s, "Hill Giant")];
  s.objects[shuriken]!.attachedTo = bears;
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await menu(page).locator("button", { hasText: "Shuriken deals 2 damage to target creature" }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.damage === 2);
  expect(after.objects[shuriken]!.attachedTo).toBeUndefined();
  expect(controllerOf(after, after.objects[shuriken]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
