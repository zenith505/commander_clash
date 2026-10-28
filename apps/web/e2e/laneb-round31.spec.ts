// Lane B round 31 in the browser: Nulltread Gargantuan's "put a creature you control on top of its owner's library"
// (click the creature, then Put on top) and Painbringer's "Exile any number of cards from your graveyard" (X is chosen
// first, up to how many cards there are, then you click that many cards, CR 107.3a, 602.2b).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Nulltread Gargantuan: click Grizzly Bears, Put on top, and it's the top card of your library", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"], hand: ["Nulltread Gargantuan"] });
  const [giant, bears] = [one(s0, "Nulltread Gargantuan"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, giant)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, action: "libraryTop" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Nulltread Gargantuan");
  const top = bar.getByRole("button", { name: "Put on top", exact: true });
  await expect(top).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await top.click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[bears]!.zone === "library");
  expect(after.players[0]!.library[0]).toBe(bears);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Painbringer: choose X = 2, click two cards in your graveyard, then Ana's Grizzly Bears gets -2/-2 and dies", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Painbringer"], yard: ["Giant Growth", "Lightning Bolt", "Shock"] }, [{ board: ["Grizzly Bears"] }]);
  const [pain, bears, growth, bolt, shock] = [one(s, "Painbringer"), one(s, "Grizzly Bears"), one(s, "Giant Growth"), one(s, "Lightning Bolt"), one(s, "Shock")];
  await open(page, s);
  await page.locator(`[data-obj="${pain}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile any number of cards" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("exile X cards from your graveyard: choose X (up to 3)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const pick = modal(page);
  await expect(pick).toContainText("Painbringer: exile from your graveyard 2 cards");
  await pick.locator(`[data-pick="${growth}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect([growth, bolt, shock].map((id) => after.objects[id]!.zone)).toEqual(["exile", "graveyard", "exile"]);
  expect(after.objects[pain]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
