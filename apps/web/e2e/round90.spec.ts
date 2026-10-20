// Round 90's prompts: Tireless Provisioner's Food-or-Treasure buttons, Mox Diamond's discard-a-land-instead buttons,
// Sylvan Library's two drawn cards and its pay-4-life-or-put-back buttons, Animate Dead's target in a graveyard, and
// Pyroblast's "if it's blue" modes.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Tireless Provisioner: play a land, then a button for Food and one for Treasure", async ({ page }) => {
  const s = scene({ hand: ["Forest"], board: [...LANDS, "Tireless Provisioner"] });
  const treasures = (st: typeof s) => st.battlefield.filter((id) => st.objects[id]!.controller === 0 && st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]!.name.startsWith("Treasure")).length;
  const forest = idsOf(s, "Forest", "hand", 0)[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const bar = controls(page);
  await expect(bar).toContainText("Tireless Provisioner:");
  await expect(bar.getByRole("button")).toHaveText(["Create a Food token", "Create a Treasure token"]);
  await bar.getByRole("button", { name: "Create a Treasure token" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(treasures(after)).toBe(treasures(s) + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Mox Diamond: discard a land card for it to enter, or let it go to the graveyard", async ({ page }) => {
  const s = scene({ hand: ["Mox Diamond", "Forest"], board: LANDS });
  const [mox, forest] = [one(s, "Mox Diamond"), idsOf(s, "Forest", "hand", 0)[0]!];
  await open(page, s);
  await card(page, "Mox Diamond", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "discardInstead");
  const bar = controls(page);
  await expect(bar).toContainText("Mox Diamond:");
  await expect(bar.getByRole("button")).toHaveText(["Discard Forest", "Don't (it goes to the graveyard)"]);
  await bar.getByRole("button", { name: "Discard Forest" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[mox]!.zone).toBe("battlefield");
  expect(after.objects[forest]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Sylvan Library: draw two more, pick two drawn cards, pay 4 life for one and put the other back", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sylvan Library"], library: ["Grizzly Bears", "Hill Giant", "Shock"] }, [], { step: "upkeep" });
  const [bears, giant, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Sylvan Library: choose 2 cards drawn this turn");
  // The three drawn this turn: the draw step's and the two more.
  for (const id of [bears, giant, shock]) await expect(pick.locator(`[data-pick="${id}"]`)).toHaveClass(/targetable/);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payOrTop");
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveText(["Pay 4 life to keep Hill Giant", "Put Hill Giant on top of your library"]);
  await bar.getByRole("button", { name: "Pay 4 life to keep Hill Giant" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payOrTop" && st.pending.about === shock);
  await bar.getByRole("button", { name: "Put Shock on top of your library" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 4);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.players[0]!.library[0]).toBe(shock);
  expect(pageErrors(page)).toEqual([]);
});

test("Animate Dead: pick a creature card in an opponent's graveyard; it comes back under your control", async ({ page }) => {
  const s = scene({ hand: ["Animate Dead"], board: LANDS }, [{ yard: ["Hill Giant"] }]);
  const [aura, giant] = [one(s, "Animate Dead"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Animate Dead", s).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[aura]!).toMatchObject({ zone: "battlefield", attachedTo: giant });
  expect(pageErrors(page)).toEqual([]);
});

test("Pyroblast: the destroy mode on a blue permanent", async ({ page }) => {
  const s = scene({ hand: ["Pyroblast"], board: LANDS }, [{ board: ["Merfolk of the Pearl Trident"] }]);
  const merfolk = one(s, "Merfolk of the Pearl Trident");
  await open(page, s);
  await card(page, "Pyroblast", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Destroy target permanent if it's blue/ }).click();
  const done = modes.getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  await page.locator(`[data-obj="${merfolk}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[merfolk]!.zone === "graveyard");
  expect(after.objects[merfolk]!.zone).toBe("graveyard");
  expect((await state(page)).players[1]!.graveyard).toContain(merfolk);
  expect(pageErrors(page)).toEqual([]);
});
