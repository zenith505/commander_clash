// Round 105's prompts: "discard up to N cards" (Celes), Resourceful Defense moving counters one at a time, Exploration
// Broodship's graveyard permission with a land to sacrifice, Chainer's one-cast permission, and Cultivator Colossus putting
// lands from the hand again and again.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Celes: discard up to all your cards (here one), then draw that many plus one", async ({ page }) => {
  const s = scene({ hand: ["Celes, Rune Knight", "Shock", "Opt"], board: LANDS });
  const [shock, opt] = [one(s, "Shock"), one(s, "Opt")];
  await open(page, s);
  await card(page, "Celes, Rune Knight", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard");
  const bar = controls(page);
  await expect(bar).toContainText("click up to 2 cards in your hand to discard");
  await expect(bar.getByRole("button", { name: "Discard" })).toBeEnabled();
  await card(page, "Shock", s).click();
  await bar.getByRole("button", { name: "Discard" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(after.objects[opt]!.zone).toBe("hand");
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Resourceful Defense: move two +1/+1 counters onto a second permanent, then stop", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Resourceful Defense", "Hill Giant", "Grizzly Bears"] });
  const [defense, giant, bears] = [one(s, "Resourceful Defense"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  s.objects[giant]!.counters = { "+1/+1": 3 };
  await open(page, s);
  await page.locator(`[data-obj="${defense}"]`).click();
  await menu(page).locator("button", { hasText: "Move any number of counters" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter to move from Hill Giant onto Grizzly Bears");
  await bar.getByRole("button", { name: "A +1/+1 counter (3 left)" }).click();
  await bar.getByRole("button", { name: "A +1/+1 counter (2 left)" }).click();
  await bar.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Exploration Broodship: cast a creature from the graveyard by sacrificing a land", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Exploration Broodship", "Evolving Wilds"], yard: ["Hill Giant"] });
  const [ship, giant, forest] = [one(s, "Exploration Broodship"), one(s, "Hill Giant"), one(s, "Evolving Wilds")];
  s.objects[ship]!.counters = { charge: 8 };
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("sacrifice a land");
  await page.locator(`[data-obj="${forest}"]`).click();
  await costBar.getByRole("button", { name: /^Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[forest]!.zone).toBe("graveyard");
  expect(after.turnLog?.gravePermits).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Chainer: discard a card, then cast a creature from the graveyard with that permission", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Chainer, Nightmare Adept"], hand: ["Shock"], yard: ["Hill Giant"] });
  const [chainer, giant, shock] = [one(s, "Chainer, Nightmare Adept"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await page.locator(`[data-obj="${chainer}"]`).click();
  await menu(page).locator("button", { hasText: "Discard a card" }).click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !!st.graveGrants?.length);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(after.log.map((l) => l.text).join("\n")).toMatch(/Hill Giant gains haste/);
  expect(pageErrors(page)).toEqual([]);
});

test("Cultivator Colossus: put a land from the hand, draw, and again until you take none", async ({ page }) => {
  const s = scene({ hand: ["Cultivator Colossus", "Mountain", "Island"], board: LANDS });
  const mountain = idsOf(s, "Mountain", "hand")[0]!;
  await open(page, s);
  await card(page, "Cultivator Colossus", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Your hand");
  await pick.locator(`[data-pick="${mountain}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).objects[mountain]!.zone).toBe("battlefield");
  // Asked again, with a card drawn: this time take none.
  await expect(pick).toContainText("Your hand");
  await pick.getByRole("button", { name: "Take none" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[mountain]!.tapped).toBe(true);
  expect(after.players[0]!.hand.filter((id) => after.objects[id]!.zone === "hand")).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
