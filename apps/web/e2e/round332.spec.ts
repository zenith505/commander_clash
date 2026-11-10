// Round 332's prompts: Leori, Sparktouched Hunter's planeswalker type picker (the creature type picker's search, with
// planeswalker types), and Guile's free cast of the spell it exiled instead of your Counterspell countering it.
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil } from "./ui";

test("Leori: choose Jace in the planeswalker type picker; Jace Beleren's +2 is copied", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Leori, Sparktouched Hunter", "Jace Beleren"] });
  const [leori, jace] = [one(s, "Leori, Sparktouched Hunter"), one(s, "Jace Beleren")];
  // Its starting loyalty (CR 306.5b), as if it had been cast.
  s.objects[jace]!.counters.loyalty = 3;
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[leori, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "planeswalkerType" && st.pending.player === 0, 60);
  const options = (asked.pending as { options: string[] }).options;
  expect(options).toContain("Jace");
  expect(options).not.toContain("Elf");
  const pick = modal(page);
  await expect(pick).toContainText("Leori, Sparktouched Hunter: choose a planeswalker type");
  // Jace Beleren on your battlefield is listed first; the search finds any type.
  await expect(pick).toContainText("On the battlefield, in your hand and in your graveyard");
  await expect(pick.locator('button[data-type="Jace"]').first()).toContainText("1 yours");
  await pick.getByPlaceholder("Type to search…").fill("vron");
  await expect(pick.locator('button[data-type="Vronos"]')).toBeVisible();
  await expect(pick.locator('button[data-type="Elf"]')).toHaveCount(0);
  await pick.getByPlaceholder("Type to search…").fill("Jace");
  await pick.locator('button[data-type="Jace"]').click();
  const main2 = await resolveUntil(page, (st) => st.step === "main2" && st.stack.length === 0 && !st.pending, 80);
  expect(main2.floatingTriggers?.some((f) => f.trigger.activates?.of?.subtypes?.includes("Jace"))).toBe(true);
  const hands = main2.turnOrder.map((p) => main2.players[p]!.hand.length);
  await page.locator(`[data-obj="${jace}"]`).click();
  await menu(page).locator("button", { hasText: "Each player draws a card" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hands[0]! + 2, 40);
  expect(after.turnOrder.map((p) => after.players[p]!.hand.length)).toEqual(hands.map((n) => n + 2));
  expect(after.log.some((l) => /copies/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Guile: your Counterspell exiles your Grizzly Bears instead, and you cast it for free", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Counterspell"], board: [...LANDS, "Guile"] });
  const [bears, cs] = [one(s, "Grizzly Bears"), one(s, "Counterspell")];
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  let st: GameState = await state(page);
  for (let i = 0; i < 50 && st.stack.length !== 1; i++) {
    await page.waitForTimeout(100);
    st = await state(page);
  }
  expect(st.stack.length).toBe(1);
  await card(page, "Counterspell", s).click();
  await page.locator(`[data-stack="${st.stack[0]!.id}"]`).click();
  const offered = await resolveUntil(page, (x) => x.pending?.kind === "castFree" && x.pending.objectId === bears, 40);
  expect(offered.objects[bears]!.zone).toBe("exile");
  await expect(controls(page)).toContainText("Grizzly Bears");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bears]!.zone === "battlefield", 40);
  expect(after.objects[cs]!.zone).toBe("graveyard");
  expect(after.log.some((l) => /instead of being countered/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
