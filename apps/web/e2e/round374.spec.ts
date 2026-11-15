// Round 374: Coin of Fate's cost (two creature cards exiled from your graveyard) and the opponent who splits them,
// Rescue from the Underworld's target and sacrifice (both back at your next upkeep), and Dawnbreak Reclaimer's end step
// picks: yours in an opponent's graveyard and then the yes or no, and an opponent's in yours when it's a bot's.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Coin of Fate: exile Grizzly Bears and Hill Giant, choose Ana; one goes to the bottom of your library, the other returns tapped", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Coin of Fate"], yard: ["Grizzly Bears", "Hill Giant", "Shock"] });
  const [coin, bears, giant, shock] = ["Coin of Fate", "Grizzly Bears", "Hill Giant", "Shock"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${coin}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "An opponent chooses" });
  if (await item.count()) await item.click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  for (const id of [bears, giant]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Ana" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.monarch === 0);
  const back = [bears, giant].filter((id) => after.objects[id]!.zone === "battlefield");
  expect(back).toHaveLength(1);
  expect(after.objects[back[0]!]!.tapped).toBe(true);
  const bottom = [bears, giant].find((id) => id !== back[0])!;
  expect(after.players[0]!.library.at(-1)).toBe(bottom);
  expect(after.objects[coin]!.zone).toBe("graveyard");
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Rescue from the Underworld: target Hill Giant, sacrifice Gray Ogre; both return at your next upkeep", async ({ page }) => {
  const s = scene({ hand: ["Rescue from the Underworld"], board: [...LANDS, "Gray Ogre"], yard: ["Hill Giant"] });
  const [rescue, ogre, giant] = ["Rescue from the Underworld", "Gray Ogre", "Hill Giant"].map((n) => one(s, n)) as [string, string, string];
  await open(page, s);
  await card(page, "Rescue from the Underworld", s).click();
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a creature" });
  await page.locator(`[data-obj="${ogre}"]`).first().click();
  await bar.getByRole("button", { name: /Sacrifice and cast/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[rescue]!.zone === "exile");
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.delayed?.length).toBe(1);
  const later = playUntil(after, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.turn > after.turn && st.stack.length === 0 && !st.triggerQueue.length && st.objects[giant]!.zone === "battlefield");
  expect(later.objects[ogre]!.zone).toBe("battlefield");
  expect(later.objects[giant]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Dawnbreak Reclaimer: at your end step pick Ana's Grizzly Bears; Ana picks one of yours; return both", async ({ page }) => {
  let s = scene({ board: ["Dawnbreak Reclaimer"], yard: ["Gray Ogre", "Hill Giant"] }, [{ yard: ["Grizzly Bears", "Shock"] }]);
  const [ogre, giant, bears, shock] = ["Gray Ogre", "Hill Giant", "Grizzly Bears", "Shock"].map((n) => one(s, n)) as [string, string, string, string];
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "end" && st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("a creature card in an opponent's graveyard");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Grizzly Bears");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(1);
  // Ana picked one of yours: it's back under your control, the other stays.
  const mine = [ogre, giant].filter((id) => after.objects[id]!.zone === "battlefield");
  expect(mine).toHaveLength(1);
  expect(after.objects[mine[0]!]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Dawnbreak Reclaimer under Ana: she picks your Grizzly Bears, you pick a creature card in her graveyard", async ({ page }) => {
  let s = scene({ yard: ["Grizzly Bears"] }, [{ board: ["Dawnbreak Reclaimer"], yard: ["Gray Ogre", "Hill Giant"] }]);
  const [bears, ogre, giant] = ["Grizzly Bears", "Gray Ogre", "Hill Giant"].map((n) => one(s, n)) as [string, string, string];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "end" && st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("a creature card in Ana's graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  // Ana's Hill Giant (mana value 4) is worth more than your Bears (2): she returns both.
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(1);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
