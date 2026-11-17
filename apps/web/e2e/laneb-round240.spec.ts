// Lane B round B240 in the browser: Bösium Strip's ability, then the instant on top of your graveyard cast from there (the
// one under it only once it's on top), and a spell with cycling cast from your graveyard with Abandoned Sarcophagus.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Bösium Strip: after its ability, Lightning Bolt on top of your graveyard is cast at Ana and exiled; Shock under it isn't offered", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Bösium Strip"], yard: ["Shock", "Lightning Bolt"] });
  const [strip, shockId, bolt] = [one(s, "Bösium Strip"), one(s, "Shock"), one(s, "Lightning Bolt")];
  expect(s.players[0]!.graveyard.at(-1)).toBe(bolt);
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${strip}"]`).first().click();
  await menu(page).getByRole("button", { name: /Until end of turn, you may cast instant and sorcery spells from the top of your graveyard/ }).click();
  let mid = s;
  await expect.poll(async () => (mid = await state(page)).objects[strip]!.tapped && mid.stack.length === 0 && !!mid.graveyardTurn?.some((g) => g.topOnly)).toBe(true);
  await page.locator('[data-graveyard="0"]').click();
  await expect(modal(page).locator(".card.playable", { hasText: "Shock" })).toHaveCount(0);
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(after.players[1]!.life).toBe(life - 3);
  expect(after.objects[shockId]!.zone).toBe("graveyard");
  expect(after.players[0]!.graveyard.at(-1)).toBe(shockId);
  expect(pageErrors(page)).toEqual([]);
});

test("Abandoned Sarcophagus: Hieroglyphic Illumination is cast from your graveyard, draws two and is exiled", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Abandoned Sarcophagus"], yard: ["Hieroglyphic Illumination", "Lightning Bolt"] });
  const ill = one(s, "Hieroglyphic Illumination");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  // Lightning Bolt has no cycling ability.
  await expect(modal(page).locator(".card.playable", { hasText: "Lightning Bolt" })).toHaveCount(0);
  await modal(page).locator(".card.playable", { hasText: "Hieroglyphic Illumination" }).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ill]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});
