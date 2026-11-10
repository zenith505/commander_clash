// Lane B round B171 in the browser: Sutured Ghoul asks, one card at a time, which creature cards of your graveyard to exile
// as it enters (its power and toughness their total), and Frankenstein's Monster exiles X of them and asks for a counter
// for each; Tetravus asks at your upkeep which +1/+1 counters to make into Tetravites, and later which of its Tetravites to
// exile for counters back.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Sutured Ghoul: exile Hill Giant, then That's all; it's a 3/3 and Grizzly Bears stays in the graveyard", async ({ page }) => {
  const s = scene({ hand: ["Sutured Ghoul"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant", "Lightning Bolt"] });
  const ghoul = one(s, "Sutured Ghoul");
  const [bears, giant, bolt] = [idsOf(s, "Grizzly Bears", "graveyard", 0)[0]!, idsOf(s, "Hill Giant", "graveyard", 0)[0]!, idsOf(s, "Lightning Bolt", "graveyard", 0)[0]!];
  await open(page, s);
  await card(page, "Sutured Ghoul", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "exileFromYard");
  // The creature cards only, and a way to stop.
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([bears, giant, "done"].sort());
  const c = controls(page);
  await expect(c).toContainText("exile any number of creature cards from your graveyard as it enters");
  await expect(c.getByRole("button", { name: "Exile none" })).toBeVisible();
  await c.getByRole("button", { name: "Exile Hill Giant" }).click();
  await expect(c).toContainText("(1 so far)");
  await expect(c.getByRole("button", { name: "Exile Hill Giant" })).toHaveCount(0);
  await c.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ghoul]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-obj="${ghoul}"]`)).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Frankenstein's Monster: X = 2, exile Grizzly Bears and Hill Giant, a +2/+0 and a +0/+2 counter make it a 2/3", async ({ page }) => {
  const s = scene({ hand: ["Frankenstein's Monster"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant", "Llanowar Elves"] });
  const monster = one(s, "Frankenstein's Monster");
  const [bears, giant, elves] = [idsOf(s, "Grizzly Bears", "graveyard", 0)[0]!, idsOf(s, "Hill Giant", "graveyard", 0)[0]!, idsOf(s, "Llanowar Elves", "graveyard", 0)[0]!];
  await open(page, s);
  await card(page, "Frankenstein's Monster", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "exileFromYard");
  const c = controls(page);
  await expect(c).toContainText("exile 2 creature cards from your graveyard as it enters, each one a +2/+0, +1/+1, or +0/+2 counter (2 more to choose)");
  // Exactly two: no way to stop early.
  await expect(c.getByRole("button", { name: "That's all" })).toHaveCount(0);
  await c.getByRole("button", { name: "Exile Grizzly Bears" }).click();
  await expect(c).toContainText("(1 more to choose)");
  await c.getByRole("button", { name: "Exile Hill Giant" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterChoice");
  await c.getByRole("button", { name: "A +2/+0 counter" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterChoice" && st.objects[monster]!.counters?.["+2/+0"] === 1);
  await c.getByRole("button", { name: "A +0/+2 counter" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[monster]!.zone === "battlefield");
  expect([bears, giant, elves].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard"]);
  expect(after.objects[monster]!.counters).toMatchObject({ "+2/+0": 1, "+0/+2": 1 });
  await expect(page.locator(`[data-obj="${monster}"]`)).toContainText("2/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Tetravus: two of its three counters become Tetravites at your upkeep; next upkeep, exile one for a counter back", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Tetravus"] }, [], { step: "end" });
  const tetravus = one(s0, "Tetravus");
  s0.objects[tetravus]!.counters["+1/+1"] = 3;
  const s = playUntil(s0, (st) => st.activePlayer === 0 && st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  await open(page, s);
  const c = controls(page);
  await expect(c).toContainText("choose a counter to remove from Tetravus (1 of 3)");
  await c.getByRole("button", { name: "A +1/+1 counter (3 left)" }).click();
  await expect(c).toContainText("(2 of 3)");
  await c.getByRole("button", { name: "A +1/+1 counter (2 left)" }).click();
  await expect(c).toContainText("(3 of 3)");
  await c.getByRole("button", { name: "That's all" }).click();
  const made = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.filter((id) => st.objects[id]!.isToken).length === 2);
  const tokens = made.battlefield.filter((id) => made.objects[id]!.isToken);
  expect(made.objects[tetravus]!.counters["+1/+1"]).toBe(1);
  // Round the table to your next upkeep, where the exile ability asks.
  const later = playUntil(made, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.pending?.kind === "pickPermanents");
  await open(page, later);
  await expect(c).toContainText("click any number of tokens created with Tetravus to exile (a +1/+1 counter on Tetravus for each), then exile them.");
  await page.locator(`[data-obj="${tokens[0]}"]`).click();
  await c.getByRole("button", { name: "Exile", exact: true }).click();
  const asked = await resolveUntil(page, (st) => !st.battlefield.includes(tokens[0]!) && (st.pending?.kind === "chooseOption" || (st.stack.length === 0 && !st.pending)));
  expect(asked.objects[tetravus]!.counters["+1/+1"]).toBe(2);
  expect(asked.battlefield).toContain(tokens[1]);
  expect(pageErrors(page)).toEqual([]);
});
