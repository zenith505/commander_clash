// Lane B round B305's prompt in the browser: Panglacial Wurm offered while you search your library (Rampant Growth), cast
// from there before the search finds anything, or declined and the search goes on; Shaman's Trance letting you flash back
// a card in Ana's graveyard and play a land from there with your Crucible of Worlds.
import { expect, test } from "@playwright/test";
import { defOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Panglacial Wurm: cast from your library while Rampant Growth searches it, then the search goes on", async ({ page }) => {
  const s = scene({ hand: ["Rampant Growth"], board: LANDS, library: ["Panglacial Wurm"] });
  const wurm = one(s, "Panglacial Wurm");
  await open(page, s);
  await card(page, "Rampant Growth", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await expect(controls(page)).toContainText("Rampant Growth: you're searching your library. Cast Panglacial Wurm from your library for");
  await controls(page).getByRole("button", { name: "Cast it", exact: true }).click();
  const searching = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  expect(searching.objects[wurm]!.zone).toBe("stack");
  // The Wurm can't be found; a Forest is.
  await expect(modal(page).locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  const forest = searching.pending!.kind === "searchLibrary" ? searching.pending.cards.find((id) => defOf(searching, searching.objects[id]!).name === "Forest")! : "";
  await modal(page).locator(`[data-pick="${forest}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "battlefield");
  expect(after.objects[forest]!.zone).toBe("battlefield");
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Panglacial Wurm: declined, Rampant Growth's search goes on and the Wurm stays in your library", async ({ page }) => {
  const s = scene({ hand: ["Rampant Growth"], board: LANDS, library: ["Panglacial Wurm"] });
  const [wurm, growth] = [one(s, "Panglacial Wurm"), one(s, "Rampant Growth")];
  await open(page, s);
  await card(page, "Rampant Growth", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await controls(page).getByRole("button", { name: "Don't", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).getByRole("button", { name: "Find nothing" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[growth]!.zone === "graveyard");
  expect(after.objects[wurm]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Shaman's Trance: flash back Think Twice from Ana's graveyard, then play the Forest there with your Crucible of Worlds", async ({ page }) => {
  const s = scene({ hand: ["Shaman's Trance"], board: [...LANDS, "Crucible of Worlds"] }, [{ yard: ["Think Twice", "Forest"] }]);
  s.players[0]!.landsPlayedThisTurn = 0;
  const [trance, think] = [one(s, "Shaman's Trance"), one(s, "Think Twice")];
  const forest = s.players[1]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
  await open(page, s);
  await card(page, "Shaman's Trance", s).click();
  const up = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[trance]!.zone === "graveyard");
  expect(up.log.some((l) => l.text.startsWith("Shaman's Trance: other players can't play lands or cast spells from their graveyards this turn"))).toBe(true);
  const hand = up.players[0]!.hand.length;
  await expect(page.locator('[data-graveyard="1"] .zone-title')).toHaveText("Graveyard ✦");
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Think Twice" }).click();
  await menu(page).getByRole("button", { name: /^Flashback/ }).click();
  const drew = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[think]!.zone === "exile");
  expect(drew.players[0]!.hand.length).toBe(hand + 1);
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Forest" }).click();
  await menu(page).getByRole("button", { name: /^Play it/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[forest]!.zone === "battlefield");
  expect(after.objects[forest]!.controller).toBe(0);
  expect(after.objects[forest]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
