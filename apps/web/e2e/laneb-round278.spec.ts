// Lane B round B278 in the browser: Land Equilibrium (Ana controls it and no lands; you play your Forest, then click your
// Mountain to sacrifice it, or the Forest just played) and Noxious Vapors (you keep Lightning Helix and Lightning Bolt, one
// card of each color, and discard Shivan Dragon).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";
import type { GameState } from "@cc/engine";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Land Equilibrium: you play a Forest while Ana controls no more lands, then sacrifice your Mountain", async ({ page }) => {
  const s = scene({ hand: ["Forest"], board: ["Mountain", "Island"] }, [{ board: ["Land Equilibrium"] }]);
  const [forest, mountain, island] = [idsOf(s, "Forest", "hand", 0)[0]!, idsOf(s, "Mountain", "battlefield", 0)[0]!, idsOf(s, "Island", "battlefield", 0)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await expect(controls(page)).toContainText("Land Equilibrium: you put a land onto the battlefield, so sacrifice a land (the new one too, if you like): click it, then sacrifice.");
  const button = controls(page).getByRole("button", { name: "Sacrifice", exact: true });
  await expect(button).toBeDisabled();
  await page.locator(`[data-obj="${mountain}"]`).first().click();
  await button.click();
  const after = await settled(page, (x) => !x.pending && x.objects[mountain]!.zone === "graveyard");
  await expect(controls(page)).not.toContainText("Land Equilibrium");
  expect(after.objects[forest]!.zone).toBe("battlefield");
  expect(after.objects[island]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Land Equilibrium: you may sacrifice the Forest you just played", async ({ page }) => {
  const s = scene({ hand: ["Forest"], board: ["Mountain"] }, [{ board: ["Land Equilibrium"] }]);
  const [forest, mountain] = [idsOf(s, "Forest", "hand", 0)[0]!, idsOf(s, "Mountain", "battlefield", 0)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await expect(controls(page)).toContainText("so sacrifice a land");
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await controls(page).getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await settled(page, (x) => !x.pending && x.objects[forest]!.zone === "graveyard");
  expect(after.objects[mountain]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Noxious Vapors: you keep Lightning Helix (white) and Lightning Bolt (red) and discard Shivan Dragon", async ({ page }) => {
  const s = scene({ hand: ["Noxious Vapors", "Lightning Helix", "Lightning Bolt", "Shivan Dragon"], board: LANDS }, [{ hand: ["Grizzly Bears"] }]);
  const [vapors, helix, bolt, dragon, bears] = [one(s, "Noxious Vapors"), one(s, "Lightning Helix"), one(s, "Lightning Bolt"), one(s, "Shivan Dragon"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Noxious Vapors", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Noxious Vapors: choose one card of each color (a multicolored card for one of its colors) from your hand to keep; you discard your other nonland cards");
  await expect(pick).toContainText("Your hand");
  await pick.locator(`[data-pick="${helix}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Keep 2" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[vapors]!.zone === "graveyard");
  expect(after.objects[helix]!.zone).toBe("hand");
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(after.objects[dragon]!.zone).toBe("graveyard");
  // Ana's only colored card is kept without a question.
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
