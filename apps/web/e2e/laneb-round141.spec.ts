// Lane B round B141 in the browser: "target ... of an opponent's choice" in a spell or an activated ability. You choose
// which opponent chooses it as you cast or activate it (Evangelize, Magus of the Arena), the only opponent who can
// chooses at once (Echo Chamber), and a bot's spell asks you to choose one of your creatures for it (CR 601.2c).
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Evangelize: no buyback, you pick Ben to choose, and Ben gives you his least valuable creature", async ({ page }) => {
  const s = scene({ hand: ["Evangelize"], board: LANDS }, [{ board: ["Grizzly Bears"] }, { board: ["Hill Giant", "Craw Wurm"] }]);
  const [ev, giant, wurm] = [one(s, "Evangelize"), one(s, "Hill Giant"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Evangelize", s).click();
  await page.locator(".targeting").getByRole("button", { name: "Don't", exact: true }).click();
  // No target to click: Ana and Ben each have a creature, so you choose who chooses (Cy has none).
  await expect(controls(page)).toContainText("Evangelize: which opponent chooses target creature they control?");
  await expect(controls(page).getByRole("button", { name: "Cy", exact: true })).toHaveCount(0);
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ev]!.zone === "graveyard");
  expect(controllerOf(after, after.objects[giant]!)).toBe(0);
  expect(controllerOf(after, after.objects[wurm]!)).toBe(2);
  expect(after.log.some((l) => l.text === "You asks Ben to choose target creature they control for Evangelize.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Magus of the Arena: you click your creature, pick Ana to choose hers, and they fight", async ({ page }) => {
  const s = scene({ board: ["Magus of the Arena", "Craw Wurm", ...LANDS] }, [{ board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Grizzly Bears"] }]);
  const [magus, wurm, anaGiant] = [one(s, "Magus of the Arena"), one(s, "Craw Wurm"), one(s, "Hill Giant")];
  const anaBears = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${magus}"]`).first().click();
  await menu(page).getByRole("button", { name: /Tap target creature you control and target creature of an opponent's choice/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target creature you control");
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  await expect(controls(page)).toContainText("which opponent chooses target creature they control?");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  // Ana's bot chooses one of hers: neither kills Craw Wurm or survives it, so the one worth less, Grizzly Bears.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[anaBears]!.zone === "graveyard");
  expect(after.objects[anaGiant]!.zone).toBe("battlefield");
  expect(after.objects[magus]!.tapped).toBe(true);
  expect(after.objects[wurm]!.tapped).toBe(true);
  expect(after.objects[wurm]!.damage).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Echo Chamber: only Ana has a creature, so she chooses at once; you get a hasty token copy of it", async ({ page }) => {
  const s = scene({ board: ["Echo Chamber", ...LANDS] }, [{ board: ["Hill Giant"] }]);
  const chamber = one(s, "Echo Chamber");
  await open(page, s);
  await page.locator(`[data-obj="${chamber}"]`).first().click();
  await menu(page).getByRole("button", { name: /An opponent chooses target creature they control/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  const tok = after.battlefield.find((id) => after.objects[id]!.isToken)!;
  expect(controllerOf(after, after.objects[tok]!)).toBe(0);
  expect(after.cards[after.objects[tok]!.cardId]?.name ?? "").toBe("Hill Giant");
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Evangelize: Ana asks you to choose one of your creatures; you click Grizzly Bears and she gains it", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears", "Craw Wurm"] }, [{ hand: ["Evangelize"], board: ["Plains", "Plains", "Plains", "Plains", "Plains"] }]);
  const [bears, wurm] = [one(s0, "Grizzly Bears"), one(s0, "Craw Wurm")];
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: 0, controller: 1 });
  await open(page, s);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Ana asks you to choose a target for Evangelize");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => controllerOf(st, st.objects[bears]!) === 1);
  expect(controllerOf(after, after.objects[wurm]!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
