// Round 382: Manascape Refractor's borrowed land ability from its menu, paid for with white mana; Day of the Moon's
// creature card name picker and the goad it gives every creature with that name; Kang Dynasty's chapter targets, one for
// each opponent, and the card drawn when one of them deals combat damage.
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

const goaded = (st: GameState, id: string) => !!characteristics(st, st.objects[id]!).goaded;

test("Manascape Refractor: activate Ana's Gavony Township ability from the Refractor's menu, paying {2}{G}{W} with Plains", async ({ page }) => {
  const s = scene({ board: ["Plains", "Plains", "Plains", "Plains", "Manascape Refractor", "Hill Giant"] }, [{ board: ["Gavony Township"] }]);
  const [refractor, giant] = [one(s, "Manascape Refractor"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${refractor}"]`).first().click();
  await menu(page).locator("button", { hasText: "Put a +1/+1 counter on each creature you control" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[giant]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[refractor]!.tapped).toBe(true);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.cards[after.objects[id]!.cardId]!.name === "Plains" && after.objects[id]!.tapped)).toHaveLength(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Day of the Moon: name Hill Giant from the creature card names; every Hill Giant is goaded, Ana's and yours", async ({ page }) => {
  const s = scene({ hand: ["Day of the Moon"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Hill Giant"] }, {}, { board: ["Craw Wurm"] }]);
  const giants = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Hill Giant");
  const wurm = one(s, "Craw Wurm");
  await open(page, s);
  await card(page, "Day of the Moon", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  const pick = modal(page);
  await expect(pick).toContainText("Day of the Moon: choose a creature card name: you goad every creature with a name chosen for Day of the Moon");
  await pick.locator("input").fill("hill");
  await pick.locator('[data-name="Hill Giant"]').click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && giants.every((id) => goaded(st, id)));
  expect(goaded(after, wurm)).toBe(false);
  expect(after.log.some((l) => l.text === "Names chosen for Day of the Moon: Hill Giant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Kang Dynasty: chapter I taps and goads Ana's Hill Giant and Cy's Craw Wurm, one target for each opponent", async ({ page }) => {
  const s = scene({ hand: ["Kang Dynasty"], board: LANDS }, [{ board: ["Hill Giant"] }, {}, { board: ["Craw Wurm"] }]);
  const [giant, wurm] = [one(s, "Hill Giant"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Kang Dynasty", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  const panel = page.locator(".targeting", { hasText: "Kang Dynasty" });
  await expect(panel).toContainText("one for each opponent: Ana —, Ben —, Cy —");
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await expect(panel).toContainText("Ana Hill Giant, Ben —, Cy Craw Wurm");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && goaded(st, giant) && goaded(st, wurm));
  expect([giant, wurm].map((id) => after.objects[id]!.tapped)).toEqual([true, true]);
  expect(after.floatingTriggers?.filter((f) => f.about && [giant, wurm].includes(f.about.id))).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
