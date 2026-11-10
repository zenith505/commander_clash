// Round 331's cast paths: a spell cast from the top of your library with Into the Pit's permission asks for the nonland
// permanent to sacrifice (CR 601.2f-h); Elsha of the Infinite casts a noncreature spell from the top; Osteomancer Adept's
// "cast creature spells from your graveyard by foraging" asks for the three cards to exile, and the creature enters with
// a finality counter; Intrepid Paleontologist exiles a Dinosaur card from your graveyard, then casts it from exile;
// Fblthp, Lost on the Range adds Plot to the menu of the top card of your library.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

test("Into the Pit: cast Hill Giant from the top of your library, sacrificing Ornithopter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Into the Pit", "Ornithopter"], library: ["Hill Giant"] });
  const [giant, thopter, pit] = [one(s, "Hill Giant"), one(s, "Ornithopter"), one(s, "Into the Pit")];
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await library.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice" });
  await expect(bar).toContainText("nonland permanent");
  await expect(bar.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${thopter}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[thopter]!.zone).toBe("graveyard");
  expect(after.objects[pit]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Elsha of the Infinite: cast Divination from the top of your library", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Elsha of the Infinite"], library: ["Divination"] });
  const div = one(s, "Divination");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  await library.locator(`[data-obj="${div}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Osteomancer Adept: tap it, then cast Hill Giant from your graveyard, exiling three other cards to forage", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Osteomancer Adept"], yard: ["Hill Giant", "Shock", "Lightning Bolt", "Giant Growth"] });
  const [giant, shock, bolt, growth] = ["Hill Giant", "Shock", "Lightning Bolt", "Giant Growth"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await card(page, "Osteomancer Adept", s).click();
  await menu(page).getByRole("button", { name: /Until end of turn, you may cast creature spells from your graveyard by foraging/ }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.graveyardTurn?.length);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("exile three cards from your graveyard to forage");
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  for (const id of [shock, bolt, growth]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.counters.finality).toBe(1);
  expect([shock, bolt, growth].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Intrepid Paleontologist: exile Ripjaw Raptor from your graveyard, then cast it from exile with a finality counter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Intrepid Paleontologist"], yard: ["Ripjaw Raptor"] });
  const raptor = one(s, "Ripjaw Raptor");
  await open(page, s);
  await card(page, "Intrepid Paleontologist", s).click();
  await menu(page).getByRole("button", { name: /Exile target card from a graveyard/ }).click();
  await modal(page).locator(`[data-pick="${raptor}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[raptor]!.zone === "exile");
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-title")).toHaveText("Exile ✦");
  await exile.click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[raptor]!.zone === "battlefield");
  expect(after.objects[raptor]!.counters.finality).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Fblthp, Lost on the Range: the top card's menu plots Hill Giant for its mana cost", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Fblthp, Lost on the Range"], library: ["Hill Giant", "Shock"] });
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await library.locator(`[data-obj="${giant}"]`).click();
  await menu(page).getByRole("button", { name: /^Plot/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.mayPlay?.until).toBe("plot");
  expect(after.players[0]!.library[0]).toBe(shock);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(4);
  expect(pageErrors(page)).toEqual([]);
});
