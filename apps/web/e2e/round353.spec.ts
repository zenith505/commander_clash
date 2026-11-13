// Round 353's prompts: Tempt with Mayhem's copies (the opponents decide, then you keep the target for each of yours),
// Spinerock Tyrant's "you may copy it" and the copy aimed at another creature, and Magus Lucea Kane's mana ability copying
// the next spell with {X} (the copy keeps X), and Curse of Echoes asking you whether to copy an opponent's spell.
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playWithBots, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Tempt with Mayhem: target your Lightning Bolt at Ben; keep the target for each of your copies", async ({ page }) => {
  let s = scene({ hand: ["Lightning Bolt", "Tempt with Mayhem"], board: LANDS });
  const [bolt, tempt] = [one(s, "Lightning Bolt"), one(s, "Tempt with Mayhem")];
  for (const a of planCast(s, 0, bolt, [{ kind: "player", id: 2 }])!) s = applyAction(s, a);
  const boltItem = s.stack[0]!.id;
  await open(page, s);
  await card(page, "Tempt with Mayhem", s).click();
  await page.locator(`[data-stack="${boltItem}"]`).click();
  // The opponents (bots) decide and copy first; then yours, once plus once for each of them who copied it.
  let asked = await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0, 80);
  const theirs = asked.log.filter((e) => / copies Lightning Bolt/.test(e.text) && !/^You /.test(e.text)).length;
  const mine = 1 + theirs;
  expect(asked.pending?.kind === "copyTargets" && asked.pending.left).toBe(mine);
  for (let left = mine; left > 0; left--) {
    if (left < mine) asked = await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0 && st.pending.left === left);
    const bar = page.locator(".targeting");
    if (left > 1) await expect(bar).toContainText(`${left} copies left`);
    await bar.getByRole("button", { name: /^Keep target/ }).click();
  }
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[tempt]!.zone === "graveyard", 80);
  expect(after.log.filter((e) => /^You copies Lightning Bolt|^You copy Lightning Bolt/.test(e.text))).toHaveLength(mine);
  // Your copies and the original all hit Ben.
  expect(after.log.filter((e) => e.text === "Lightning Bolt deals 3 damage to Ben.").length).toBeGreaterThanOrEqual(mine + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Spinerock Tyrant: copy Lightning Bolt, aim the copy at Hill Giant; with wither, Craw Wurm gets three -1/-1 counters", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Spinerock Tyrant"] }, [{ board: ["Craw Wurm", "Hill Giant"] }]);
  const [wurm, giant] = [one(s, "Craw Wurm"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${wurm}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Spinerock Tyrant: Copy it (it and the copy gain wither)?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[wurm]!.counters["-1/-1"]).toBe(3);
  expect(after.objects[wurm]!.damage).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Magus Lucea Kane: tap it for {C}{C}, then Blaze with X = 2 at Ana is copied; keep the target, Ana loses 4", async ({ page }) => {
  const s = scene({ hand: ["Blaze"], board: [...LANDS, "Magus Lucea Kane"] });
  const [magus, blaze] = [one(s, "Magus Lucea Kane"), one(s, "Blaze")];
  await open(page, s);
  await page.locator(`[data-obj="${magus}"]`).click();
  // Its only mana ability: tapped at once, or picked from its menu.
  const ready = await expect
    .poll(async () => {
      if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /\{C\}\{C\}|Psychic Stimulus/ }).first().click();
      return (await state(page)).players[0]!.manaPool.C ?? 0;
    })
    .toBe(2)
    .then(() => true);
  expect(ready).toBe(true);
  await card(page, "Blaze", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[blaze]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(36);
  expect(after.nextCast?.some((d) => d.xAbility) ?? false).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Curse of Echoes on Ana: she casts Divination, Ben and Cy decide first, then you copy it and draw two", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Curse of Echoes"] }, [{ hand: ["Divination"], board: ["Island", "Island", "Island"] }]);
  const [curse, divination] = [one(s0, "Curse of Echoes"), one(s0, "Divination")];
  s0.objects[curse]!.attachedToPlayer = 1;
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  // In turn order from Ana's turn, leaving her out: Ben, Cy, then you.
  expect(s.log.filter((e) => /copies Divination/.test(e.text)).map((e) => e.text.split(" copies")[0])).toEqual(["Ben", "Cy"]);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Curse of Echoes: Copy Divination?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.log.some((e) => /^You cop(?:y|ies) Divination/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
