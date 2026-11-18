// Lane B round B251 in the browser: Kasmina, Enigma Sage's loyalty abilities on another planeswalker's menu, Sharkey,
// Tyrant of the Shire's borrowed land ability paid with mana of any type, and Tamiyo, Collector of Tales' +1 naming a card.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Kasmina, Enigma Sage: Chandra activates Kasmina's +2 (Scry 1) for her own loyalty", async ({ page }) => {
  const s = scene({ board: ["Kasmina, Enigma Sage", "Chandra, Torch of Defiance"] });
  const [kasmina, chandra] = [one(s, "Kasmina, Enigma Sage"), one(s, "Chandra, Torch of Defiance")];
  s.objects[kasmina]!.counters.loyalty = 2;
  s.objects[chandra]!.counters.loyalty = 4;
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).click();
  await menu(page).locator("button", { hasText: "Scry 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  await page.locator(".modal.arrange").getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[chandra]!.counters.loyalty).toBe(6);
  expect(after.objects[kasmina]!.counters.loyalty).toBe(2);
  expect(after.log.some((l) => /activates Chandra, Torch of Defiance \(\+2: Scry 1\)/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Sharkey, Tyrant of the Shire: Ana's Sea Gate Wreckage's {2}{C} draw, paid with Islands and a Plains", async ({ page }) => {
  const s = scene({ board: ["Sharkey, Tyrant of the Shire", "Island", "Island", "Plains"] }, [{ board: ["Sea Gate Wreckage"] }]);
  const sharkey = one(s, "Sharkey, Tyrant of the Shire");
  await open(page, s);
  await page.locator(`[data-obj="${sharkey}"]`).click();
  await menu(page).locator("button", { hasText: "Draw a card. Activate only if you have no cards in hand." }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.hand.length === 1);
  expect(after.objects[sharkey]!.tapped).toBe(true);
  expect(idsOf(after, "Island", "battlefield", 0).every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Tamiyo, Collector of Tales: +1 naming Lightning Bolt puts both revealed Bolts in your hand, the rest in your graveyard", async ({ page }) => {
  const s = scene({ board: ["Tamiyo, Collector of Tales"], library: ["Lightning Bolt", "Grizzly Bears", "Lightning Bolt", "Forest"] });
  const tamiyo = one(s, "Tamiyo, Collector of Tales");
  s.objects[tamiyo]!.counters.loyalty = 2;
  const bolts = idsOf(s, "Lightning Bolt", "library", 0);
  await open(page, s);
  await page.locator(`[data-obj="${tamiyo}"]`).click();
  await menu(page).locator("button", { hasText: "Choose a nonland card name" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  const pick = modal(page);
  await pick.locator("input").fill("bolt");
  await pick.locator('[data-name="Lightning Bolt"]').click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(bolts.map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand"]);
  expect(after.players[0]!.graveyard.map((id) => after.cards[after.objects[id]!.cardId]!.name).sort()).toEqual(["Forest", "Grizzly Bears"]);
  expect(after.objects[tamiyo]!.counters.loyalty).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
