// "For each opponent, … up to one target … that player controls" (CR 601.2c): a click goes to the slot of the
// target's controller, in any order, and Done leaves the others unchosen. "If you control a commander, you may cast
// this spell without paying its mana cost" from the card's menu (CR 118.9), and "counter target spell with mana value X"
// with X chosen before the target (CR 601.2b-c).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Dismantling Wave: one artifact for each opponent, picked in any order", async ({ page }) => {
  const s = scene({ hand: ["Dismantling Wave"], board: LANDS }, [{ board: ["Sol Ring", "Mind Stone"] }, {}, { board: ["Sol Ring"] }]);
  const [anaRing, cyRing] = [idsOf(s, "Sol Ring", "battlefield", 1)[0]!, idsOf(s, "Sol Ring", "battlefield", 3)[0]!];
  const stone = one(s, "Mind Stone");
  await open(page, s);
  await card(page, "Dismantling Wave", s).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  const panel = page.locator(".targeting", { hasText: "Dismantling Wave" });
  await expect(panel).toContainText("one for each opponent: Ana —, Ben —, Cy —");
  // Cy's first: the panel stays open for the others.
  await page.locator(`[data-obj="${cyRing}"]`).click();
  await expect(panel).toContainText("Ana —, Ben —, Cy Sol Ring");
  await page.locator(`[data-obj="${anaRing}"]`).click();
  await expect(panel).toContainText("Ana Sol Ring, Ben —, Cy Sol Ring");
  // Another of Ana's replaces her first pick.
  await page.locator(`[data-obj="${stone}"]`).click();
  await expect(panel).toContainText("Ana Mind Stone, Ben —, Cy Sol Ring");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Dismantling Wave")]!.zone === "graveyard");
  expect([stone, cyRing, anaRing].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

/** Our commander on the battlefield instead of in the command zone. */
function commanderOut(s: GameState) {
  const id = s.players[0]!.command.find((x) => s.objects[x]!.isCommander)!;
  s.players[0]!.command = s.players[0]!.command.filter((x) => x !== id);
  s.objects[id]!.zone = "battlefield";
  s.battlefield.push(id);
  invalidateCharacteristics(s);
  return s;
}

test("Fierce Guardianship: cast for free while we control a commander", async ({ page }) => {
  const s = commanderOut(scene({ hand: ["Divination", "Fierce Guardianship"], board: ["Island", "Island", "Island"] }));
  const divination = one(s, "Divination");
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Fierce Guardianship", s).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Fierce Guardianship")]!.zone === "graveyard");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).not.toContain(divination);
  expect(pageErrors(page)).toEqual([]);
});

test("Spell Blast: X is chosen first, then only a spell with mana value X can be targeted", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Spell Blast"], board: LANDS });
  const divination = one(s, "Divination");
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  const top = (await state(page)).stack[0]!.id;
  await card(page, "Spell Blast", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const panel = page.locator(".targeting", { hasText: "Spell Blast" });
  await expect(panel).toContainText("target spell with mana value 2");
  // Divination is mana value 3: not a legal target with X = 2.
  await page.locator(`[data-stack="${top}"]`).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await card(page, "Spell Blast", s).click();
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await expect(panel).toContainText("target spell with mana value 3");
  await page.locator(`[data-stack="${top}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Spell Blast")]!.zone === "graveyard");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).not.toContain(divination);
  expect(pageErrors(page)).toEqual([]);
});
