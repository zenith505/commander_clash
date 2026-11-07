// Lane B round B126 in the browser: Battlefield Scrounger's cost, three cards from your graveyard put on the bottom of your
// library, picked as you activate it; Gurzigost's upkeep "sacrifice this creature unless you put two cards from your
// graveyard on the bottom of your library", answered yes and the two cards picked.
import { expect, test } from "@playwright/test";
import { type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

const YARD = ["Grizzly Bears", "Hill Giant", "Gray Ogre", "Shock", "Lightning Bolt", "Giant Growth", "Counterspell"];

test("Battlefield Scrounger: put three graveyard cards on the bottom of your library for +3/+3", async ({ page }) => {
  const s = scene({ board: ["Battlefield Scrounger"], yard: YARD });
  const sc = one(s, "Battlefield Scrounger");
  const [bears, giant, ogre, shock] = ["Grizzly Bears", "Hill Giant", "Gray Ogre", "Shock"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await card(page, "Battlefield Scrounger", s).click();
  await menu(page).locator("button", { hasText: "Put three cards from your graveyard" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("put 3 cards from your graveyard on the bottom of your library");
  for (const id of [giant, bears, ogre]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.graveyard.length === 4);
  expect(after.players[0]!.library.slice(-3).sort()).toEqual([bears, giant, ogre].sort());
  expect(after.objects[shock]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-obj="${sc}"]`).first()).toContainText("6/6");
  expect(pageErrors(page)).toEqual([]);
});

test("Gurzigost: at your upkeep, put two graveyard cards on the bottom of your library to keep it", async ({ page }) => {
  let s = scene({ board: ["Gurzigost"], yard: ["Grizzly Bears", "Hill Giant", "Shock"] });
  const g = one(s, "Gurzigost");
  const [bears, giant, shock] = ["Grizzly Bears", "Hill Giant", "Shock"].map((n) => one(s, n)) as [string, string, string];
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const at: GameState = s;
  await open(page, at);
  const bar = controls(page);
  await expect(bar).toContainText("Put two cards from your graveyard on the bottom of your library");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => !!st.pending && st.pending.kind !== "chooseMay" && st.pending.player === 0);
  const pick = modal(page);
  for (const id of [giant, shock]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.graveyard.length === 1);
  expect(after.objects[g]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[0]!.library.slice(-2).sort()).toEqual([giant, shock].sort());
  expect(pageErrors(page)).toEqual([]);
});
