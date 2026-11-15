// Round 381: Long List of the Ents' chapter noting any creature type (the type picker) and the next spell of it entering
// with a +1/+1 counter, Sokrates, Athenian Teacher's Sokratic Dialogue (both players draw half the damage, a dredge question
// in the middle of combat damage), and Coram, the Undertaker's land and spell from an opponent's graveyard.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, moveObject, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil } from "./ui";

test("Long List of the Ents: cast it, note Elf from all creature types, then Llanowar Elves enters with a +1/+1 counter", async ({ page }) => {
  const s = scene({ hand: ["Long List of the Ents", "Llanowar Elves", "Hill Giant"], board: LANDS });
  const [elves, giant] = [one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Long List of the Ents", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "noteType");
  const pick = page.locator(".modal.type-pick");
  await expect(pick).toContainText("note a creature type that hasn't been noted");
  await expect(pick).toContainText("All creature types");
  await pick.locator("input").fill("Elf");
  await pick.locator('[data-type="Elf"]').first().click();
  const noted = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && Object.values(st.notedFor ?? {}).some((t) => t.includes("Elf")));
  expect(noted.nextCast?.some((n) => n.filter.subtypes?.includes("Elf"))).toBe(true);
  // Hill Giant isn't an Elf: no counter, and the next Elf still gets it.
  await card(page, "Hill Giant", noted).click();
  const big = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(big.objects[giant]!.counters["+1/+1"] ?? 0).toBe(0);
  await card(page, "Llanowar Elves", big).click();
  const after = await resolveUntil(page, (st) => st.objects[elves]!.zone === "battlefield" && st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending);
  expect(after.objects[elves]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Sokrates, Athenian Teacher: give your Craw Wurm Sokratic Dialogue and attack Ana; no damage, and you and Ana draw three each", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sokrates, Athenian Teacher", "Craw Wurm"] });
  const [sok, wurm] = [one(s, "Sokrates, Athenian Teacher"), one(s, "Craw Wurm")];
  const [mine, hers] = [s.players[0]!.hand.length, s.players[1]!.hand.length];
  await open(page, s);
  await page.locator(`[data-obj="${sok}"]`).first().click();
  await menu(page).locator("button", { hasText: "target creature gains" }).click();
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  const granted = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[sok]!.tapped && !st.pending);
  expect(granted.log.some((l) => l.text.includes('Craw Wurm gains "If this creature would deal combat damage to a player, prevent that damage. This creature\'s controller'))).toBe(true);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[wurm, 1]]);
  const after = await resolveUntil(page, (st) => st.log.some((l) => l.text.startsWith("Ana draws 3 cards")), 60);
  expect(after.players[1]!.life).toBe(40);
  expect(after.players[0]!.hand.length).toBe(mine + 3);
  expect(after.players[1]!.hand.length - hers).toBeGreaterThanOrEqual(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Sokrates, Athenian Teacher: your first draw from the prevented damage asks about dredge; dredge Dakmor Salvage, then the rest are drawn", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sokrates, Athenian Teacher", "Craw Wurm"], yard: ["Dakmor Salvage"] });
  const [sok, wurm, salvage] = [one(s, "Sokrates, Athenian Teacher"), one(s, "Craw Wurm"), one(s, "Dakmor Salvage")];
  await open(page, s);
  await page.locator(`[data-obj="${sok}"]`).first().click();
  await menu(page).locator("button", { hasText: "target creature gains" }).click();
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[wurm, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "dredge" && st.pending.player === 0, 60);
  expect(asked.step).toBe("combatDamage");
  const hand = asked.players[0]!.hand.length;
  await controls(page).getByRole("button", { name: "Dredge Dakmor Salvage (mill 2)" }).click();
  // Back in hand, the Salvage can't dredge again: your other two draws, then Ana's three.
  const after = await resolveUntil(page, (st) => st.log.some((l) => l.text.startsWith("Ana draws 3 cards")) && !st.pending, 60);
  expect(after.objects[salvage]!.zone).toBe("hand");
  expect(after.players[0]!.hand.length).toBe(hand + 3);
  expect(after.players[1]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

/** Coram with Ana's top two cards milled this turn (put there from her library). */
const coramScene = (): GameState => {
  const s = scene({ board: [...LANDS, "Coram, the Undertaker"] }, [{ library: ["Forest", "Hill Giant"] }]);
  for (const name of ["Forest", "Hill Giant"]) moveObject(s, s.players[1]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === name)!, "graveyard", { milled: true });
  s.players[0]!.landsPlayedThisTurn = 0;
  invalidateCharacteristics(s);
  return s;
};

test("Coram, the Undertaker: cast Hill Giant from Ana's graveyard (milled this turn); it's yours", async ({ page }) => {
  const s = coramScene();
  const giant = s.players[1]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Hill Giant")!;
  await open(page, s);
  await expect(page.locator('[data-graveyard="1"] .zone-title')).toHaveText("Graveyard ✦");
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[giant]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Coram, the Undertaker: play the Forest Ana milled this turn from her graveyard as your land", async ({ page }) => {
  const s = coramScene();
  const forest = s.players[1]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
  await open(page, s);
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Forest" }).click();
  await menu(page).getByRole("button", { name: /^Play it/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[forest]!.zone === "battlefield");
  expect(after.objects[forest]!.controller).toBe(0);
  expect(after.log.some((l) => l.text === "You plays Forest from Ana's graveyard." || l.text === "You play Forest from Ana's graveyard.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
