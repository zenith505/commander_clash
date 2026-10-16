// Collect evidence (CR 701.59a): picking cards in your graveyard until their mana values add up, as a spell's optional
// additional cost (Bite Down on Crime, Crimestopper Sprite), an activated ability's cost (Forensic Researcher), a "you
// may" as a trigger resolves (Izoni), and Conspiracy Unraveler's alternative cost.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Bite Down on Crime: collect evidence 6 for {2} less, Done once the mana values add up", async ({ page }) => {
  const s = scene({ hand: ["Bite Down on Crime"], board: ["Forest", "Forest", "Grizzly Bears"], yard: ["Hill Giant", "Shock", "Divination"] }, [{ board: ["Craw Wurm"] }]);
  const bite = one(s, "Bite Down on Crime"), bears = one(s, "Grizzly Bears"), wurm = one(s, "Craw Wurm"), giant = one(s, "Hill Giant"), shock = one(s, "Shock"), divination = one(s, "Divination");
  await open(page, s);
  await card(page, "Bite Down on Crime", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${wurm}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Bite Down on Crime: you may collect evidence 6");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await expect(pick).toContainText("total mana value 5 of 6");
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${divination}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Two Forests pay the {1}{G} it costs now.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bite]!.zone === "graveyard");
  expect([giant, shock, divination].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(after.log.some((e) => /Grizzly Bears deals 4 damage to Craw Wurm/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Crimestopper Sprite: don't collect evidence, so no stun counter", async ({ page }) => {
  const s = scene({ hand: ["Crimestopper Sprite"], board: ["Island", "Island", "Island"], yard: ["Craw Wurm"] }, [{ board: ["Hill Giant"] }]);
  const sprite = one(s, "Crimestopper Sprite"), wurm = one(s, "Craw Wurm"), giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Crimestopper Sprite", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("Crimestopper Sprite: you may collect evidence 6");
  await pick.getByRole("button", { name: "Don't collect evidence" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sprite]!.zone === "battlefield" && st.objects[giant]!.tapped);
  expect(after.objects[giant]!.counters.stun).toBeUndefined();
  expect(after.objects[wurm]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Forensic Researcher: {T}, collect evidence 3 to tap a creature", async ({ page }) => {
  const s = scene({ board: ["Forensic Researcher"], yard: ["Divination", "Shock"] }, [{ board: ["Hill Giant"] }]);
  const researcher = one(s, "Forensic Researcher"), giant = one(s, "Hill Giant"), divination = one(s, "Divination"), shock = one(s, "Shock");
  await open(page, s);
  await page.locator(`[data-obj="${researcher}"]`).click();
  await menu(page).getByRole("button", { name: /Tap target creature you don't control/ }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Forensic Researcher: collect evidence 3");
  await expect(pick.getByRole("button", { name: "Don't collect evidence" })).toHaveCount(0);
  await pick.locator(`[data-pick="${divination}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.tapped);
  expect(after.objects[divination]!.zone).toBe("exile");
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Izoni: 'you may collect evidence 4' as its trigger resolves, then two Spiders", async ({ page }) => {
  const s = scene({ hand: ["Izoni, Center of the Web"], board: ["Swamp", "Swamp", "Swamp", "Forest", "Forest", "Forest"], yard: ["Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Izoni, Center of the Web", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "collectEvidence" || st.stack.length === 0 && st.log.some((e) => /Izoni.*resolves/.test(e.text)));
  const pick = modal(page);
  await expect(pick).toContainText("Izoni, Center of the Web: you may collect evidence 4");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Spider Token").length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Conspiracy Unraveler: cast a spell by collecting evidence 10 instead of paying its mana cost", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: ["Conspiracy Unraveler"], yard: ["Craw Wurm", "Divination", "Shock"] });
  const giant = one(s, "Hill Giant"), wurm = one(s, "Craw Wurm"), divination = one(s, "Divination"), shock = one(s, "Shock");
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).getByRole("button", { name: "Cast it: collect evidence 10" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Hill Giant: collect evidence 10");
  await pick.locator(`[data-pick="${wurm}"]`).click();
  await pick.locator(`[data-pick="${divination}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).stack[0]?.objectId).toBe(giant);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect([wurm, divination, shock].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
