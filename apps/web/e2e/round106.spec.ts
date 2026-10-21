// Round 106's prompts: March of Swirling Mist's "you may exile any number of blue cards from your hand" (asked before
// X, each card {2} off), Defiler of Vigor's "you may pay 2 life" for a green permanent spell ({G} off), and Lively
// Dirge's graveyard pick "with total mana value 4 or less".
import { expect, test } from "@playwright/test";
import { open, one, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("March of Swirling Mist: exile Opt from your hand, X = 1, only {U} paid", async ({ page }) => {
  const s = scene({ hand: ["March of Swirling Mist", "Opt", "Shock"], board: ["Island", "Island", "Grizzly Bears"] });
  const [march, opt, shock, bears] = [one(s, "March of Swirling Mist"), one(s, "Opt"), one(s, "Shock"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "March of Swirling Mist", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("you may exile any number of blue cards from your hand");
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await expect(pick.getByRole("button", { name: "Done" })).toBeEnabled(); // none is fine
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[march]!.zone === "graveyard");
  expect(after.objects[opt]!.zone).toBe("exile");
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("phasedOut");
  // {1}{U} less {2}: one Island tapped.
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Island" && after.objects[id]!.tapped).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Defiler of Vigor: pay 2 life and cast Grizzly Bears for {1}", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: ["Defiler of Vigor", "Mountain"] });
  const [defiler, bears] = [one(s, "Defiler of Vigor"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("you may pay 2 life for each to make it cost one colored mana less");
  await pick.locator(`[data-pick="${defiler}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(38);
  // The Defiler's cast trigger: a +1/+1 counter on each creature you control.
  expect(after.objects[defiler]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Lively Dirge: return creature cards with total mana value 4 or less; a card that would go over is dimmed", async ({ page }) => {
  const s = scene({ hand: ["Lively Dirge"], board: ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp"], yard: ["Grizzly Bears", "Llanowar Elves", "Hill Giant"] });
  const [dirge, bears, elves, giant] = [one(s, "Lively Dirge"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Lively Dirge", s).click();
  // Spree: the second mode only.
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /^\+ \{2\} — Return up to two creature cards/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${bears}"]`).click();
  // Hill Giant (4) would take the total to 6.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${elves}"]`).click();
  await expect(pick).toContainText("total mana value 3 of at most 4");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dirge]!.zone === "graveyard");
  expect([bears, elves, giant].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
