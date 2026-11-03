// Round 272's prompt: a target in exile (CR 406), picked from the card picker's "cards in exile" groups: Sorceress's
// Schemes offers your graveyard's instants and sorceries and your exiled cards with flashback as one target, Pull from
// Eternity any player's face-up exiled card, and Rootcoil Creeper's ability your exiled cards with flashback.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Sorceress's Schemes: return Think Twice from exile, picked beside your graveyard", async ({ page }) => {
  const s = scene({ hand: ["Sorceress's Schemes"], board: LANDS, yard: ["Lightning Bolt"], exile: ["Think Twice", "Shock"] });
  const bolt = idsOf(s, "Lightning Bolt", "graveyard", 0)[0]!;
  const twice = idsOf(s, "Think Twice", "exile", 0)[0]!;
  const shock = idsOf(s, "Shock", "exile", 0)[0]!;
  await open(page, s);
  await card(page, "Sorceress's Schemes", s).click();
  const modal = page.locator(".modal");
  await expect(modal.locator("h4", { hasText: "Your graveyard" })).toBeVisible();
  await expect(modal.locator("h4", { hasText: "Your cards in exile" })).toBeVisible();
  await expect(modal.locator(`[data-pick="${bolt}"]`)).toHaveCount(1);
  // Shock has no flashback.
  await expect(modal.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await modal.locator(`[data-pick="${twice}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[twice]!.zone === "hand");
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Pull from Eternity: put an opponent's exiled card into their graveyard", async ({ page }) => {
  const s = scene({ hand: ["Pull from Eternity"], board: LANDS }, [{ exile: ["Lotus Bloom"] }]);
  const bloom = idsOf(s, "Lotus Bloom", "exile", 1)[0]!;
  await open(page, s);
  await card(page, "Pull from Eternity", s).click();
  const modal = page.locator(".modal");
  await expect(modal.locator("h4", { hasText: "cards in exile" })).toBeVisible();
  await modal.locator(`[data-pick="${bloom}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bloom]!.zone === "graveyard");
  expect(after.players[1]!.graveyard).toContain(bloom);
  expect(pageErrors(page)).toEqual([]);
});

test("Rootcoil Creeper: exile it to return Think Twice from exile to your hand", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Rootcoil Creeper"], exile: ["Think Twice"] });
  const creeper = idsOf(s, "Rootcoil Creeper", "battlefield", 0)[0]!;
  const twice = idsOf(s, "Think Twice", "exile", 0)[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${creeper}"]`).first().click();
  await menu(page).locator("button", { hasText: "Return target card with flashback" }).click();
  await page.locator(".modal").locator(`[data-pick="${twice}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[twice]!.zone === "hand");
  expect(after.objects[creeper]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

// Proteus Staff on your own creature: you reveal until a creature card, it enters, and you order the revealed lands on
// the bottom of your library in the arrange prompt.
test("Proteus Staff: put Grizzly Bears on the bottom, Hill Giant enters, order the lands under it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Proteus Staff", "Grizzly Bears"], library: ["Island", "Mountain", "Hill Giant"] });
  const staff = idsOf(s, "Proteus Staff", "battlefield", 0)[0]!;
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!;
  const [island, mountain, giant] = s.players[0]!.library.slice(0, 3);
  await open(page, s);
  await page.locator(`[data-obj="${staff}"]`).first().click();
  await menu(page).locator("button", { hasText: "Put target creature on the bottom" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  const order = asked.pending?.kind === "arrangeTop" ? asked.pending.cards : [];
  expect(new Set(order)).toEqual(new Set([island, mountain]));
  const arrange = page.locator(".modal.arrange");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[0]}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant!]!.zone === "battlefield");
  expect(after.players[0]!.library.slice(-3)).toEqual([bears, order[1], order[0]]);
  expect(pageErrors(page)).toEqual([]);
});
