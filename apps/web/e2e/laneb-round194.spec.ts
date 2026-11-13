// Lane B round B194 in the browser: Rubble Rouser (its mana ability exiles a card from your graveyard as its cost, adds
// {R} at once, and its reflexive trigger deals 1 damage to each opponent from the stack) and Spark of Creativity (decline
// the damage and the exiled card may be played this turn).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Rubble Rouser: exile Shock from your graveyard for {R}; then 1 damage to each opponent", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Rubble Rouser"], yard: ["Shock", "Grizzly Bears"] });
  const [shock, bears] = [one(s, "Shock"), one(s, "Grizzly Bears")];
  const lives = [1, 2, 3].map((p) => s.players[p]!.life);
  await open(page, s);
  await card(page, "Rubble Rouser", s).click();
  await menu(page).locator("button", { hasText: "Exile a card from your graveyard: Add" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("exile from your graveyard a card");
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const added = await resolveUntil(page, (st) => st.objects[shock]!.zone === "exile");
  expect(added.players[0]!.manaPool.R).toBe(1);
  expect(added.objects[bears]!.zone).toBe("graveyard");
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === lives[0]! - 1);
  expect([1, 2, 3].map((p) => after.players[p]!.life)).toEqual(lives.map((l) => l - 1));
  expect(pageErrors(page)).toEqual([]);
});

test("Spark of Creativity: decline the damage, then cast the exiled Sol Ring this turn", async ({ page }) => {
  const s = scene({ hand: ["Spark of Creativity"], board: [...LANDS], library: ["Sol Ring"] }, [{ board: ["Hill Giant"] }]);
  const [ring, giant] = [one(s, "Sol Ring"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Spark of Creativity", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(asked.objects[ring!]!.zone).toBe("exile");
  const bar = controls(page);
  await expect(bar).toContainText("deal damage to that creature");
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[ring!]!.mayPlay);
  expect(after.objects[giant!]!.damage).toBe(0);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  const played = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring!]!.zone === "battlefield");
  expect(played.objects[ring!]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
