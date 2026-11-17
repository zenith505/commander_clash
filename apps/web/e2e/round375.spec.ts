// Round 375: Garland, Royal Kidnapper's two targets (the opponent who becomes the monarch, then a creature of theirs),
// Lorcan, Warlock Collector's "pay life" yes, Endless Whispers' target opponent for a creature that died, and Jon
// Irenicus's end step targets (an opponent and up to one creature, or none).
import { expect, test } from "@playwright/test";
import { controllerOf, power, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

/** Who controls it now, through the layers (a control-changing effect, CR 613.1b). */
const ctl = (st: GameState, id: string) => controllerOf(st, st.objects[id]!);

test("Garland, Royal Kidnapper: cast it, make Ana the monarch, then take her Grizzly Bears (4/4 under you)", async ({ page }) => {
  const s = scene({ hand: ["Garland, Royal Kidnapper"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Garland, Royal Kidnapper", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.monarch === 1 && st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ctl(st, bears) === 0);
  expect(after.monarch).toBe(1);
  expect(power(after, after.objects[bears]!)).toBe(4);
  expect(after.effects.some((e) => e.whileMonarch === 1 && e.affected.includes(bears))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Lorcan, Warlock Collector: Shock Ana's Grizzly Bears, pay 2 life, and it's yours, a Warlock", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Lorcan, Warlock Collector"] }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Pay life equal to its mana value");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Endless Whispers: your Grizzly Bears dies, you target Ana, and she gets it at the next end step", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Endless Whispers", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && st.objects[bears]!.zone === "graveyard");
  await clickPlayer(page, 1);
  const waiting = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.delayed?.length);
  expect(waiting.objects[bears]!.zone).toBe("graveyard");
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield", 80);
  expect(after.objects[bears]!.controller).toBe(1);
  expect(after.step).toBe("end");
  expect(pageErrors(page)).toEqual([]);
});

test("Jon Irenicus: at your end step give Ana your Gray Ogre: two counters, tapped, goaded", async ({ page }) => {
  let s = scene({ board: ["Jon Irenicus, Shattered One", "Gray Ogre"] });
  const ogre = one(s, "Gray Ogre");
  s = playUntil(s, (st) => st.step === "end" && st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  // Mana in your pool keeps the page from passing your end step once the trigger resolves (useGame.ts shouldAutoPass):
  // otherwise Ana's untap step can untap the Ogre before the state below is read (the flake of rounds 375-400).
  s.players[0]!.manaPool.C = 1;
  await open(page, s);
  await clickPlayer(page, 1);
  await page.locator(`[data-obj="${ogre}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && ctl(st, ogre) === 1 && st.step === "end" && st.activePlayer === 0);
  expect(after.objects[ogre]!.counters["+1/+1"]).toBe(2);
  expect(after.objects[ogre]!.tapped).toBe(true);
  expect(after.effects.some((e) => e.affected.includes(ogre) && e.duration === "game" && e.mods.some((m) => m.kind === "goad"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Jon Irenicus: target Ana and choose no creature: your Gray Ogre stays", async ({ page }) => {
  let s = scene({ board: ["Jon Irenicus, Shattered One", "Gray Ogre"] });
  const ogre = one(s, "Gray Ogre");
  s = playUntil(s, (st) => st.step === "end" && st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await clickPlayer(page, 1);
  await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(ctl(after, ogre)).toBe(0);
  expect(after.objects[ogre]!.counters["+1/+1"]).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
