// Round 313's special action (CR 116.2d): paying to ignore a permanent's effect until end of turn from its menu. Leonin
// Arbiter (an opponent's) for {2}, then a search works; Lost in Thought by exiling three cards from your graveyard;
// Volrath's Curse by sacrificing a permanent.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Leonin Arbiter: pay {2} from Ana's Arbiter's menu, then Rampant Growth can search", async ({ page }) => {
  const s = scene({ hand: ["Rampant Growth"], board: LANDS, library: ["Forest"] }, [{ board: ["Leonin Arbiter"] }]);
  const arbiter = one(s, "Leonin Arbiter");
  await open(page, s);
  await page.locator(`[data-obj="${arbiter}"]`).first().click();
  await menu(page).getByRole("button", { name: /^Ignore Leonin Arbiter's effect this turn/ }).click();
  const paid = await resolveUntil(page, (st) => !!st.objects[arbiter]!.ignoredBy?.players.includes(0));
  // A special action: nothing on the stack, and two lands tapped for it.
  expect(paid.stack.length).toBe(0);
  expect(paid.battlefield.filter((id) => paid.objects[id]!.controller === 0 && paid.objects[id]!.tapped).length).toBe(2);
  // Paid once: the menu no longer offers it.
  await page.locator(`[data-obj="${arbiter}"]`).first().click();
  await expect(menu(page).getByRole("button", { name: /^Ignore Leonin Arbiter's effect/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await card(page, "Rampant Growth", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await expect(modal(page)).toContainText("basic land");
  expect(pageErrors(page)).toEqual([]);
});

test("Lost in Thought: exile three cards from your graveyard from its menu, picking them in the window", async ({ page }) => {
  const s = scene({ board: ["Hill Giant"], yard: ["Grizzly Bears", "Shock", "Forest", "Island"] }, [{ board: ["Lost in Thought"] }]);
  const [giant, aura] = [one(s, "Hill Giant"), one(s, "Lost in Thought")];
  const [bears, shock, forest, island] = ["Grizzly Bears", "Shock", "Forest", "Island"].map((n) => idsOf(s, n, "graveyard", 0)[0]!) as [string, string, string, string];
  s.objects[aura]!.attachedTo = giant;
  invalidateCharacteristics(s);
  await open(page, s);
  // Attached under the Giant: its visible corner.
  await page.locator(`[data-obj="${aura}"]`).first().click({ position: { x: 6, y: 6 } });
  await menu(page).getByRole("button", { name: /^Ignore Lost in Thought's effect this turn: exile three cards from your graveyard/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("exile 3 cards from your graveyard");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !!st.objects[aura]!.ignoredBy?.players.includes(0));
  expect([bears, shock, forest].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(after.objects[island]!.zone).toBe("graveyard");
  expect(after.stack.length).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Volrath's Curse: sacrifice Grizzly Bears from its menu to ignore it this turn", async ({ page }) => {
  const s = scene({ board: ["Hill Giant", "Grizzly Bears", "Plains"] }, [{ board: ["Volrath's Curse"] }]);
  const [giant, bears, aura] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Volrath's Curse")];
  s.objects[aura]!.attachedTo = giant;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${aura}"]`).first().click({ position: { x: 6, y: 6 } });
  await menu(page).getByRole("button", { name: /^Ignore Volrath's Curse's effect this turn: sacrifice a permanent/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a permanent (click it)" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Sacrifice" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice" }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "graveyard");
  expect(after.objects[aura]!.ignoredBy?.players).toEqual([0]);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Damping Engine: with the most permanents, sacrifice a Plains from Ana's Engine's menu, then cast Grizzly Bears", async ({ page }) => {
  // One land of each name: lands of one name stack, and only the top one can be clicked.
  const s = scene({ hand: ["Grizzly Bears"], board: ["Plains", "Island", "Swamp", "Mountain", "Forest"] }, [{ board: ["Damping Engine"] }]);
  const [engine, bears] = [one(s, "Damping Engine"), idsOf(s, "Grizzly Bears", "hand", 0)[0]!];
  const plains = idsOf(s, "Plains", "battlefield", 0)[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${engine}"]`).first().click();
  await menu(page).getByRole("button", { name: /^Ignore Damping Engine's effect this turn: sacrifice a permanent/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a permanent (click it)" });
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice" }).click();
  await resolveUntil(page, (st) => st.objects[plains]!.zone === "graveyard");
  await card(page, "Grizzly Bears", s).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[engine]!.ignoredBy?.players).toEqual([0]);
  expect(pageErrors(page)).toEqual([]);
});
