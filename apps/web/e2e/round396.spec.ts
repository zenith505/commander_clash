// Round 396 in the browser: Zygon Infiltrator's body-print on Ana's Serra Angel, Blade of Shared Souls' Rebel becoming a copy
// of your Hill Giant (its target and "you may"), and Assimilation Aegis's pick between two creature cards exiled with it.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

test("Zygon Infiltrator: tap Ana's Serra Angel with a stun counter, and Zygon becomes a copy of it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Zygon Infiltrator"] }, [{ board: ["Serra Angel"] }]);
  const [zygon, angel] = [one(s, "Zygon Infiltrator"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Zygon Infiltrator", s).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Tap another target creature" }).first().click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.tapped === true);
  expect(after.objects[angel]!.counters.stun).toBe(1);
  expect(nameOf(after, zygon)).toBe("Serra Angel");
  await expect(page.locator(`[data-obj="${zygon}"]`).first()).toContainText("4/4");
  expect(pageErrors(page)).toEqual([]);
});

test("Blade of Shared Souls: its Rebel becomes a copy of your Hill Giant (target, then yes)", async ({ page }) => {
  const s = scene({ hand: ["Blade of Shared Souls"], board: [...LANDS, "Hill Giant"] });
  const [blade, giant] = [one(s, "Blade of Shared Souls"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Blade of Shared Souls", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const aimed = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const rebel = aimed.objects[blade]!.attachedTo!;
  expect(rebel).toBeTruthy();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && nameOf(st, rebel) === "Hill Giant");
  expect(after.objects[rebel]!.isToken).toBe(true);
  expect(after.objects[blade]!.attachedTo).toBe(rebel);
  expect(pageErrors(page)).toEqual([]);
});

test("Assimilation Aegis: two creature cards exiled with it (Panharmonicon); equipped, Grizzly Bears becomes the Hill Giant you pick", async ({ page }) => {
  const s0 = scene({ hand: ["Assimilation Aegis"], board: [...LANDS, "Panharmonicon", "Grizzly Bears"] }, [{ board: ["Serra Angel"] }, { board: ["Hill Giant"] }]);
  const [aegis, bears, angel, giant] = [one(s0, "Assimilation Aegis"), one(s0, "Grizzly Bears"), one(s0, "Serra Angel"), one(s0, "Hill Giant")];
  let s = s0;
  for (const a of planCast(s, 0, aegis)!) s = applyAction(s, a);
  // The two enters triggers (Panharmonicon): one at the Angel, one at the Giant.
  for (const t of [angel, giant]) {
    s = playUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
    s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: t }] });
  }
  s = playUntil(s, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending);
  expect([angel, giant].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  await open(page, s);
  await card(page, "Assimilation Aegis", s).click();
  await menu(page).locator("button", { hasText: "Equip" }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "aegisCopy" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature card exiled with Assimilation Aegis");
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && nameOf(st, bears) === "Hill Giant");
  expect(after.objects[aegis]!.attachedTo).toBe(bears);
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});
