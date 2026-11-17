// Round 400 in the browser: Quicksilver Elemental's "{U}: gains all activated abilities of target creature" on Ana's
// Prodigal Pyromancer, then the ping it gained (paid for with nothing but its own tap); Havengul Lich's "{1}: You may cast
// target creature card in a graveyard this turn" on a card in Ana's graveyard, cast from there, and the Lich's gained ping.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Quicksilver Elemental: gain Ana's Prodigal Pyromancer's ability, then ping Ana's Grizzly Bears with it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Quicksilver Elemental"] }, [{ board: ["Prodigal Pyromancer", "Grizzly Bears"] }]);
  const [q, pyro, bears] = [one(s, "Quicksilver Elemental"), one(s, "Prodigal Pyromancer"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Quicksilver Elemental", s).click();
  await menu(page).locator("button", { hasText: "gains all activated abilities" }).first().click();
  await page.locator(`[data-obj="${pyro}"]`).first().click();
  const gained = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.effects.some((e) => e.affected.includes(q)));
  expect(gained.objects[q]!.tapped).toBe(false);
  // The gained abilities show on Quicksilver.
  await expect(page.locator(`[data-obj="${q}"] [title*="all activated abilities of Prodigal Pyromancer"]`).first()).toBeAttached();
  await card(page, "Quicksilver Elemental", s).click();
  await menu(page).locator("button", { hasText: "deals 1 damage" }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.damage === 1);
  expect(after.objects[q]!.tapped).toBe(true);
  expect(after.objects[pyro]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Havengul Lich: target Prodigal Pyromancer in Ana's graveyard, cast it from there, then the Lich pings Ana", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Havengul Lich"] }, [{ yard: ["Prodigal Pyromancer", "Grizzly Bears"] }]);
  const [lich, pyro, bears] = [one(s, "Havengul Lich"), one(s, "Prodigal Pyromancer"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Havengul Lich", s).click();
  await menu(page).locator("button", { hasText: "You may cast target creature card" }).first().click();
  await modal(page).locator(`[data-pick="${pyro}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.graveGrants?.length);
  await page.locator('[data-graveyard="1"]').click();
  // Only the Pyromancer can be cast from there.
  await expect(modal(page).locator(".card.playable", { hasText: "Grizzly Bears" })).toHaveCount(0);
  await modal(page).locator(".card.playable", { hasText: "Prodigal Pyromancer" }).click();
  await menu(page).locator("button", { hasText: "Cast from graveyard" }).click();
  const cast = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pyro]!.zone === "battlefield");
  expect(cast.objects[pyro]!.controller).toBe(0);
  expect(cast.objects[bears]!.zone).toBe("graveyard");
  await card(page, "Havengul Lich", s).click();
  await menu(page).locator("button", { hasText: "deals 1 damage" }).first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === cast.players[1]!.life - 1);
  expect(after.objects[lich]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
