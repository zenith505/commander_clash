// Round 426: Celestial Reunion's optional additional cost "choose a creature type and behold two creatures of that type",
// offered like kicker, then the creature type picker, then the behold picker for that type (a creature you control and a
// creature card from your hand); the Bear found goes onto the battlefield. Declined, no type is asked and it goes to hand.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

const COST = "choose a creature type and behold two creatures of that type";

test("Celestial Reunion: X = 2, choose Bear, behold your Grizzly Bears and the one in your hand; the Bear found enters the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Celestial Reunion", "Grizzly Bears"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"], library: ["Grizzly Bears"] });
  const [inHand, onBoard, inLibrary, elf] = [idsOf(s, "Grizzly Bears", "hand", 0)[0]!, idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!, idsOf(s, "Grizzly Bears", "library", 0)[0]!, idsOf(s, "Llanowar Elves", "battlefield", 0)[0]!];
  await open(page, s);
  await card(page, "Celestial Reunion", s).click();
  await page.locator(".targeting", { hasText: `as an additional cost, you may ${COST}` }).getByRole("button", { name: "Choose a creature type and behold two creatures of that type" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const types = modal(page);
  await expect(types).toContainText("Celestial Reunion (behold two creatures of that type): choose a creature type");
  await types.locator('button[data-type="Bear"]').first().click();
  const pick = modal(page);
  await expect(pick).toContainText("behold two Bear creatures");
  // Bears only: not the Elf.
  await expect(pick.locator(`[data-pick="${elf}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${onBoard}"]`).click();
  await pick.locator(`[data-pick="${inHand}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const searching = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(searching.log.some((l) => /casts Celestial Reunion with X=2, choosing Bear/.test(l.text))).toBe(true);
  const search = modal(page);
  await search.locator(`[data-pick="${inLibrary}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[inLibrary]!.zone !== "library");
  expect(after.objects[inLibrary]!.zone).toBe("battlefield");
  // Beheld, not moved.
  expect(after.objects[inHand]!.zone).toBe("hand");
  expect(after.objects[onBoard]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Celestial Reunion: the additional cost declined, no creature type is asked; the Bear found goes to your hand", async ({ page }) => {
  const s = scene({ hand: ["Celestial Reunion"], board: [...LANDS, "Grizzly Bears", "Grizzly Bears"], library: ["Grizzly Bears"] });
  const inLibrary = idsOf(s, "Grizzly Bears", "library", 0)[0]!;
  await open(page, s);
  await card(page, "Celestial Reunion", s).click();
  await page.locator(".targeting", { hasText: `as an additional cost, you may ${COST}` }).getByRole("button", { name: "Don't" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const searching = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(searching.log.some((l) => /casts Celestial Reunion with X=2\./.test(l.text))).toBe(true);
  const search = modal(page);
  await search.locator(`[data-pick="${inLibrary}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[inLibrary]!.zone !== "library");
  expect(after.objects[inLibrary]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
