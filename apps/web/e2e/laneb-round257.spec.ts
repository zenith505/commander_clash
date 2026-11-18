// Lane B round B257 in the browser: Shell of the Last Kappa's menu entry and a spell on the stack that targets you as its
// target, then its sacrifice ability's pick of the exiled card to cast free; Arcum's Whistle's pay-or-attack question;
// Eye for an Eye's source pick, and its question when a prevention effect would stop the damage too.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Shell of the Last Kappa: cast Lightning Bolt at yourself, then exile it with the Shell's ability, clicking the spell", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Shell of the Last Kappa"] });
  const [shell, bolt] = [one(s, "Shell of the Last Kappa"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 0);
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await page.locator(`[data-obj="${shell}"]`).first().click();
  await menu(page).getByRole("button", { name: /Exile target instant or sorcery spell that targets you/ }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bolt]!.zone === "exile");
  expect(after.players[0]!.life).toBe(40);
  expect(after.objects[shell]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Shell of the Last Kappa: sacrifice it, pick the exiled Lightning Bolt and cast it free at Ana", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Shell of the Last Kappa"], exile: ["Lightning Bolt"] });
  const shell = one(s, "Shell of the Last Kappa");
  const bolt = idsOf(s, "Lightning Bolt", "exile")[0]!;
  // As its first ability would have: the exiled Bolt is linked to it (CR 607.2a).
  s.linkedExile = { [`${shell}@${s.objects[shell]!.zoneChanges ?? 0}`]: [{ id: bolt, zc: s.objects[bolt]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await page.locator(`[data-obj="${shell}"]`).first().click();
  await menu(page).getByRole("button", { name: /You may cast a spell from among cards exiled with/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(40 - 3);
  expect(after.objects[shell]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

for (const pay of [true, false])
  test(`Arcum's Whistle at your own Hill Giant: ${pay ? "pay {4} and nothing happens" : "don't pay, and it must attack this turn"}`, async ({ page }) => {
    const s = scene({ board: [...LANDS, "Arcum's Whistle", "Hill Giant"] });
    const [whistle, giant] = [one(s, "Arcum's Whistle"), one(s, "Hill Giant")];
    await open(page, s);
    await page.locator(`[data-obj="${whistle}"]`).first().click();
    await menu(page).getByRole("button", { name: /Choose target non-Wall creature the active player has controlled/ }).click();
    await page.locator(`[data-obj="${giant}"]`).first().click();
    await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
    const bar = controls(page);
    await expect(bar).toContainText("Arcum's Whistle:");
    await expect(bar.getByRole("button", { name: "Pay", exact: true })).toBeEnabled();
    await bar.getByRole("button", { name: pay ? "Pay" : "Don't pay", exact: true }).click();
    const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
    const forced = after.effects.some((e) => e.affected?.includes(giant) && e.mods.some((m) => m.kind === "attacksIfAble"));
    expect(forced).toBe(!pay);
    // The Whistle's {3} and, paid, the Giant's {4}.
    expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped && after.cards[after.objects[id]!.cardId]!.types.includes("Land")).length).toBe(pay ? 7 : 3);
    expect(pageErrors(page)).toEqual([]);
  });

test("Eye for an Eye: pick Ana's Lightning Bolt as the source; with Safe Passage too, choose Eye for an Eye first", async ({ page }) => {
  let s = scene({ hand: ["Eye for an Eye", "Safe Passage"], board: [...LANDS] }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const anaBolt = one(s, "Lightning Bolt");
  // Ana casts Lightning Bolt at you in your main phase (in the engine), and it's your priority with it on the stack.
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planCast(s, 1, anaBolt, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => waitingOn(st) === 0 && !st.pending);
  await open(page, s);
  await card(page, "Eye for an Eye", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageSource" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: /^Lightning Bolt/ }).click();
  let mid: GameState = s;
  await expect.poll(async () => (mid = await state(page)).damageRules?.some((r) => r.echo) ?? false).toBe(true);
  expect(mid.stack.length).toBe(1);
  await card(page, "Safe Passage", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0);
  await expect(bar).toContainText("Damage from Lightning Bolt to You: which applies first?");
  await expect(bar.getByRole("button", { name: /^Prevent the damage first/ })).toBeVisible();
  await bar.getByRole("button", { name: /^Eye for an Eye first/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life < 40);
  expect(after.players[0]!.life).toBe(40);
  expect(after.players[1]!.life).toBe(40 - 3);
  expect(pageErrors(page)).toEqual([]);
});
