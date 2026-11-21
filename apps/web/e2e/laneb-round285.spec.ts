// Lane B round B285 in the browser: Pygmy Hippo (unblocked, you say yes: Ana taps her Forest and Island and loses that
// mana, the Hippo deals no damage, and you get {C}{C} in your postcombat main phase) and Ice Cauldron (X = 1, pick
// Lightning Bolt from your hand to exile; a charge counter and the mana spent noted).
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Pygmy Hippo: unblocked, you have Ana tap her lands and lose the mana; {C}{C} comes to you after combat", async ({ page }) => {
  let s = scene({ board: ["Pygmy Hippo"] }, [{ board: ["Forest", "Island"] }]);
  const [hippo, forest, island] = [one(s, "Pygmy Hippo"), idsOf(s, "Forest", "battlefield", 1)[0]!, idsOf(s, "Island", "battlefield", 1)[0]!];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: hippo, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const life = s.players[1]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Pygmy Hippo");
  await expect(bar).toContainText("activate a mana ability of each land they control and lose all unspent mana");
  await bar.getByRole("button", { name: "Yes" }).click();
  const tapped = await settled(page, (st) => st.objects[forest]!.tapped && st.objects[island]!.tapped);
  expect(tapped.players[1]!.manaPool.G + tapped.players[1]!.manaPool.U).toBe(0);
  const after = await resolveUntil(page, (st) => st.step === "main2" && st.stack.length === 0 && st.players[0]!.manaPool.C === 2);
  // No combat damage from it this turn.
  expect(after.players[1]!.life).toBe(life);
  expect(pageErrors(page)).toEqual([]);
});

test("Ice Cauldron: X = 1, pick Lightning Bolt to exile; a charge counter and the mana noted", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Grizzly Bears"], board: [...LANDS, "Ice Cauldron"] });
  const [cauldron, bolt, bears] = [one(s, "Ice Cauldron"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${cauldron}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "You may exile a nonland card from your hand" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const charged = await settled(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bolt]!.zone === "exile");
  expect(charged.objects[cauldron]!.counters.charge).toBe(1);
  expect(charged.objects[cauldron]!.notedManaAll).toHaveLength(1);
  expect(charged.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
