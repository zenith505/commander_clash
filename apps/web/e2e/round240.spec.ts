// Round 240 in the browser: Nissa, Worldsoul Speaker's "You may pay eight {E} rather than pay the mana cost for permanent
// spells you cast" (a "Cast it: pay 8 energy" button on the card's menu), and Case of the Uneaten Feast's "Creature cards
// in your graveyard gain "You may cast this card from your graveyard" until end of turn" (the graveyard view's "Cast from
// graveyard" button for a creature card that was there).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Nissa, Worldsoul Speaker: cast Grizzly Bears for eight energy, no land tapped", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Shock"], board: [...LANDS, "Nissa, Worldsoul Speaker"] });
  s.players[0]!.energy = 9;
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  // Not for an instant.
  await card(page, "Shock", s).click();
  await expect(menu(page).getByRole("button", { name: "Cast it: pay 8 energy" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await card(page, "Grizzly Bears", s).click();
  await menu(page).getByRole("button", { name: "Cast it: pay 8 energy" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.players[0]!.energy).toBe(1);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped)).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Case of the Uneaten Feast: sacrifice it solved, then cast Hill Giant from your graveyard", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Case of the Uneaten Feast"], yard: ["Hill Giant"] });
  const [feast, giant] = [one(s, "Case of the Uneaten Feast"), one(s, "Hill Giant")];
  s.objects[feast]!.solved = true;
  await open(page, s);
  await page.locator(`[data-obj="${feast}"]`).click();
  await menu(page).getByRole("button", { name: /Sacrifice/ }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[feast]!.zone === "graveyard");
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
