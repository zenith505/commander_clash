// Round 118's prompts: with Odric, Master Tactician, the blocks another player chose for you cost mana (Archangel of
// Tithes): Pay or Don't pay (rulings: if you don't, they choose again); Agitator Ant's "each player may put two +1/+1
// counters on a creature they control" (a button for each of your creatures, or "Choose nothing"); Yuriko's commander
// ninjutsu from the command zone; Kozilek, the Broken Reality's pick of the cards you manifest from your hand.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Odric: Ana chooses your blocks, which cost {1} with her Archangel of Tithes attacking; you pay", async ({ page }) => {
  let s: GameState = scene({ board: ["Giant Spider", "Plains"] }, [{ board: ["Odric, Master Tactician", "Archangel of Tithes", "Hill Giant", "Grizzly Bears"] }]);
  const [spider, odric, angel, giant, bears, plains] = [one(s, "Giant Spider"), one(s, "Odric, Master Tactician"), one(s, "Archangel of Tithes"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), idsOf(s, "Plains", "battlefield", 0)[0]!];
  // Ana's turn, in the engine: she attacks you with all four, and Odric's trigger lets her choose your blocks.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [odric, angel, giant, bears].map((attacker) => ({ attacker, defender: 0 })) });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers");
  expect(s.pending).toMatchObject({ player: 1, defender: 0 });
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker: spider, attacker: giant }] });
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("for the blocks Ana chose (Giant Spider blocks Hill Giant)?");
  await expect(bar.getByRole("button", { name: "Don't pay" })).toBeVisible();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[spider]!.blocking !== undefined);
  expect(after.objects[spider]!.blocking).toEqual([giant]);
  expect(after.objects[plains]!.tapped).toBe(true);
  expect(after.log.some((l) => /^You pays? \{1\} to block\.$/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Agitator Ant: at your end step you choose a creature of yours for two +1/+1 counters; it's goaded", async ({ page }) => {
  let s: GameState = scene({ board: ["Agitator Ant", "Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const giant = one(s, "Hill Giant");
  // The end step, in the engine: the Ant's trigger asks you first.
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Agitator Ant: put two +1/+1 counters on a creature you control");
  await expect(bar.getByRole("button", { name: "Choose nothing" })).toBeVisible();
  // Only your creatures: not Ana's Grizzly Bears.
  await expect(bar.getByRole("button", { name: /Grizzly Bears/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Hill Giant (You)" }).click();
  const after = await resolveUntil(page, (st) => (st.objects[giant]!.counters["+1/+1"] ?? 0) > 0);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(2);
  expect(characteristics(after, after.objects[giant]!).goadedBy).toContain(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Yuriko: commander ninjutsu from the command zone returns your unblocked attacker and puts her in attacking", async ({ page }) => {
  let s: GameState = scene({ commander: "Yuriko, the Tiger's Shadow", board: ["Grizzly Bears", "Island", "Swamp"] });
  const [yuriko, bears] = [one(s, "Yuriko, the Tiger's Shadow"), one(s, "Grizzly Bears")];
  // In the engine: you attack Ana with the Bears, and no one blocks.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0 && st.stack.length === 0);
  await open(page, s);
  await page.locator(`[data-obj="${yuriko}"]`).first().click();
  await menu(page).getByRole("button", { name: /Commander ninjutsu/ }).click();
  const bar = page.locator(".targeting", { hasText: "return an unblocked attacker you control to hand (click it)" });
  await expect(bar.getByRole("button", { name: "Return and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Return and activate" }).click();
  const after = await resolveUntil(page, (st) => st.objects[yuriko]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[yuriko]!.attacking).toBe(1);
  expect(after.objects[yuriko]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Kozilek, the Broken Reality: you manifest the two cards you pick from your hand, and draw two", async ({ page }) => {
  const s: GameState = scene({ hand: ["Kozilek, the Broken Reality", "Hill Giant", "Goblin Piker", "Plains"], board: LANDS });
  const [kozilek, giant, piker, plains] = [one(s, "Kozilek, the Broken Reality"), one(s, "Hill Giant"), one(s, "Goblin Piker"), idsOf(s, "Plains", "hand", 0)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${kozilek}"]`).first().click();
  // The cast trigger's targets: up to two players; you pick only yourself.
  const targeting = page.locator(".targeting", { hasText: "choose target player (optional, up to 2 more)" });
  await expect(targeting.getByRole("button", { name: "Choose none" })).toBeVisible();
  await clickPlayer(page, 0);
  await page.locator(".targeting", { hasText: "up to 1 more" }).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const picker = modal(page);
  await expect(picker).toContainText("Kozilek, the Broken Reality: manifest 2 cards from your hand (each a face-down 2/2 creature)");
  await picker.locator(".card", { hasText: "Hill Giant" }).click();
  await picker.locator(".card", { hasText: "Plains" }).click();
  await expect(picker).toContainText("Found 2 of 2.");
  await picker.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[giant]!.faceDown).toBe("manifest");
  expect(after.objects[plains]!.zone).toBe("battlefield");
  expect(after.objects[piker]!.zone).toBe("hand");
  expect(after.players[0]!.hand.length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
