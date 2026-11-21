// Lane B round B289 in the browser: Breathstealer's Crypt (an opponent's: your Divination's draws are revealed, and you pay 3
// life to keep Serra Angel, then don't pay for Hill Giant, which is discarded) and Parnesse, the Subtle Brush (Ana's: your
// Lightning Bolt at her Grizzly Bears asks you to pay 4 life; yours: you copy Lightning Bolt with replicate, then pick Ana as
// the opponent who may also copy it, and she does).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Breathstealer's Crypt: pay 3 life to keep Serra Angel, then don't pay and Hill Giant is discarded", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: LANDS, library: ["Serra Angel", "Hill Giant"] }, [{ board: ["Breathstealer's Crypt"] }]);
  const [div, angel, giant] = [one(s, "Divination"), one(s, "Serra Angel"), one(s, "Hill Giant")];
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Divination", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(first.pending?.kind === "chooseMay" && first.pending.card).toBe(angel);
  const bar = controls(page);
  await expect(bar).toContainText("Breathstealer's Crypt: Pay 3 life to keep Serra Angel (otherwise you discard it)?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const second = await settled(page, (st) => st.pending?.kind === "chooseMay" && st.pending.card === giant);
  expect(second.objects[angel]!.zone).toBe("hand");
  expect(second.players[0]!.life).toBe(life - 3);
  await expect(bar).toContainText("Breathstealer's Crypt: Pay 3 life to keep Hill Giant (otherwise you discard it)?");
  await bar.getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(life - 3);
  expect(after.log.some((l) => l.text.startsWith("You reveals Serra Angel, a creature card (Breathstealer's Crypt)."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Parnesse, the Subtle Brush (Ana's): your Lightning Bolt at her Grizzly Bears resolves once you pay 4 life", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: LANDS }, [{ board: ["Parnesse, the Subtle Brush", "Grizzly Bears"] }]);
  const [bolt, bears] = [one(s, "Lightning Bolt"), one(s, "Grizzly Bears")];
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("4 life");
  await bar.getByRole("button", { name: /^Pay/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Parnesse, the Subtle Brush (yours): you copy Lightning Bolt with replicate, pick Ana, and she copies it too", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Parnesse, the Subtle Brush", "Djinn Illuminatus"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }, {}, {}]);
  const [bolt, bears, giant] = [one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  const rep = page.locator("[data-replicate-pick]");
  await rep.getByRole("button", { name: "Replicate Djinn Illuminatus one more time" }).click();
  await rep.getByRole("button", { name: "Replicate once" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${giant}"]`).click();
  // Parnesse's trigger for our copy: up to one target opponent.
  const aiming = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(aiming.stack.filter((it) => it.copy).length).toBe(1);
  await expect(page.locator(".targeting")).toContainText("target opponent");
  await clickPlayer(page, 1);
  // Ana (a bot) copies Lightning Bolt and aims her copy herself.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && st.objects[bolt]!.zone === "graveyard");
  expect(after.log.some((l) => l.text.startsWith("Ana copies Lightning Bolt"))).toBe(true);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
