// Lane B round B217 in the browser: Forbidden Crypt's "return a card from your graveyard to your hand" for each draw,
// Heart of Kiran's "Remove a loyalty counter from <planeswalker> instead" button in the crew bar, and Long Rest's X
// targets, each with a different mana value.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Forbidden Crypt: drawing two, you return Hill Giant, then Grizzly Bears, from your graveyard to your hand instead", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Forbidden Crypt"], yard: ["Grizzly Bears", "Hill Giant", "Llanowar Elves"] });
  const [bears, giant, elves, divination] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Divination")];
  const library = s.players[0]!.library.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawEmptyReturn" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Forbidden Crypt: instead of drawing, return a card from your graveyard to your hand (1 more draw after this)");
  await expect(bar.getByRole("button", { name: "Return Llanowar Elves" })).toBeVisible();
  await bar.getByRole("button", { name: "Return Hill Giant" }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "drawEmptyReturn" && st.pending.player === 0 && st.pending.left === 0);
  expect(second.objects[giant]!.zone).toBe("hand");
  await expect(bar).not.toContainText("more draw");
  await bar.getByRole("button", { name: "Return Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "hand");
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(after.players[0]!.library.length).toBe(library);
  // Its other ability: Divination is exiled rather than put into your graveyard.
  expect(after.objects[divination]!.zone).toBe("exile");
  expect(after.players[0]!.lost).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});

test("Heart of Kiran: with no creature, remove a loyalty counter from Ajani Goldmane instead of crewing it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Heart of Kiran", "Ajani Goldmane"] });
  const [heart, ajani] = [one(s, "Heart of Kiran"), one(s, "Ajani Goldmane")];
  s.objects[ajani]!.counters.loyalty = 4;
  await open(page, s);
  await page.locator(`[data-obj="${heart}"]`).first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /Crew 3/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Crew Heart of Kiran");
  await expect(bar.getByRole("button", { name: "Crew", exact: true })).toBeDisabled();
  await bar.getByRole("button", { name: "Remove a loyalty counter from Ajani Goldmane instead" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ajani]!.counters.loyalty === 3);
  expect(after.log.some((e) => /crews Heart of Kiran, removing a loyalty counter from Ajani Goldmane/.test(e.text))).toBe(true);
  expect(after.effects.some((e) => e.affected.includes(heart))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Long Rest: X = 2 returns Grizzly Bears and Hill Giant; Runeclaw Bear, with the same mana value as the Bears, can't be picked", async ({ page }) => {
  const s = scene({ hand: ["Long Rest"], board: LANDS, yard: ["Grizzly Bears", "Runeclaw Bear", "Hill Giant"] });
  const [bears, runeclaw, giant, rest] = [one(s, "Grizzly Bears"), one(s, "Runeclaw Bear"), one(s, "Hill Giant"), one(s, "Long Rest")];
  await open(page, s);
  await card(page, "Long Rest", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await expect(modal(page).locator(`[data-pick="${runeclaw}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[rest]!.zone === "exile");
  expect([bears, runeclaw, giant].map((id) => after.objects[id]!.zone)).toEqual(["hand", "graveyard", "hand"]);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});
