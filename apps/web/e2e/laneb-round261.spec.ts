// Lane B round B261 in the browser: Mangara's Equity's "choose black or red" as it enters; Turf War's target land for
// each player (yours first) and the land you choose to take when your creature deals combat damage; Aetherplasm's "return
// it to your hand" and the creature card you put onto the battlefield blocking the attacker.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, type GameState } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Mangara's Equity: cast it and click Red; red is the chosen color", async ({ page }) => {
  const s = scene({ hand: ["Mangara's Equity"], board: LANDS });
  const me = one(s, "Mangara's Equity");
  await open(page, s);
  await card(page, "Mangara's Equity", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "B Black", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "R Red", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[me]!.zone === "battlefield" && !st.pending);
  expect(after.objects[me]!.chosen?.color).toBe("R");
  expect(pageErrors(page)).toEqual([]);
});

test("Turf War: click a land of yours, then one of each opponent's; each gets a contested counter", async ({ page }) => {
  // Maze of Ith makes no mana, so paying for Turf War leaves it untapped on top of its own stack.
  const s = scene({ hand: ["Turf War"], board: [...LANDS, "Maze of Ith"] }, [{ board: ["Mountain"] }, { board: ["Forest"] }, { board: ["Island"] }]);
  const [ana, ben, cy] = [idsOf(s, "Mountain", "battlefield", 1)[0]!, idsOf(s, "Forest", "battlefield", 2)[0]!, idsOf(s, "Island", "battlefield", 3)[0]!];
  const mine = one(s, "Maze of Ith");
  await open(page, s);
  await card(page, "Turf War", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const panel = page.locator(".targeting", { hasText: "Turf War" });
  await expect(panel).toContainText("target land you control (1/4)");
  await page.locator(`[data-obj="${mine}"]`).first().click();
  await expect(panel).toContainText("target land Ana controls (2/4)");
  await page.locator(`[data-obj="${ana}"]`).first().click();
  await expect(panel).toContainText("Ben controls (3/4)");
  await page.locator(`[data-obj="${ben}"]`).first().click();
  await expect(panel).toContainText("Cy controls (4/4)");
  await page.locator(`[data-obj="${cy}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.stack.length && !st.pending && st.objects[cy]!.counters.contested === 1);
  for (const id of [mine, ana, ben]) expect(after.objects[id]!.counters.contested).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Turf War: your Hill Giant deals combat damage to Ana; click one of her two contested lands to take it", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Turf War", "Hill Giant"] }, [{ board: ["Mountain", "Swamp"] }]);
  const [giant, mountain, swamp] = [one(s, "Hill Giant"), idsOf(s, "Mountain", "battlefield", 1)[0]!, idsOf(s, "Swamp", "battlefield", 1)[0]!];
  s.objects[mountain]!.counters.contested = 1;
  s.objects[swamp]!.counters.contested = 1;
  s.objects[swamp]!.tapped = true;
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: giant, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("click one of Ana's lands with a contested counter on it: you gain control of it and untap it");
  await page.locator(`[data-obj="${swamp}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.stack.length && !st.pending && controllerOf(st, st.objects[swamp]!) === 0);
  expect(after.objects[swamp]!.tapped).toBe(false);
  expect(controllerOf(after, after.objects[mountain]!)).toBe(1);
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Aetherplasm: it blocks Ana's Hill Giant; click Yes, then Craw Wurm from your hand, which enters blocking the Giant", async ({ page }) => {
  let s: GameState = scene({ hand: ["Craw Wurm"], board: ["Aetherplasm"] }, [{ board: ["Hill Giant"] }]);
  const [plasm, wurm, giant] = [one(s, "Aetherplasm"), one(s, "Craw Wurm"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareBlockers", player: 0, blocks: [{ blocker: plasm, attacker: giant }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Aetherplasm:");
  await expect(bar).toContainText("Return Aetherplasm to its owner's hand?");
  await bar.getByRole("button", { name: "Yes" }).click();
  let mid: GameState = s;
  await expect.poll(async () => (mid = await state(page)).pending?.kind).toBe("searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Aetherplasm: you may put a creature card from your hand onto the battlefield blocking Hill Giant");
  await pick.locator(`[data-pick="${wurm}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "graveyard");
  expect(after.objects[wurm]!.zone).toBe("battlefield");
  expect(after.objects[plasm]!.zone).toBe("hand");
  expect(after.players[0]!.life).toBe(40);
  expect(mid.objects[plasm]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
