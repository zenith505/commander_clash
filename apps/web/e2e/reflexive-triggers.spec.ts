// Reflexive triggered abilities (CR 603.12): "you may pay {2}{R}. When you do, it deals 3 damage to any target"
// (Sparktongue Dragon): you press Pay, and only then is the target chosen, for the new ability on the stack.
// "You may sacrifice another creature. When you do, destroy target creature an opponent controls" (Cavalier of
// Night): Yes, click the creature to sacrifice, then the creature to destroy.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Sparktongue Dragon: Pay, then pick the target of the ability that triggers", async ({ page }) => {
  const s = scene({ hand: ["Sparktongue Dragon"], board: [...LANDS, "Mountain", "Mountain"] }, [{ board: ["Grizzly Bears"] }]);
  const dragon = one(s, "Sparktongue Dragon");
  await open(page, s);
  await card(page, "Sparktongue Dragon", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Sparktongue Dragon:");
  await expect(bar).toContainText("When you do, it deals 3 damage to any target");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  // Paying triggers the second ability: its target is chosen now.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  expect(after.objects[dragon]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Cavalier of Night: sacrifice another creature, then destroy one of theirs", async ({ page }) => {
  const s = scene({ hand: ["Cavalier of Night"], board: [...LANDS, "Swamp", "Swamp", "Grizzly Bears", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const cavalier = one(s, "Cavalier of Night"), [bears, other] = idsOf(s, "Grizzly Bears", undefined, 0) as [string, string], giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Cavalier of Night", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Cavalier of Night:");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  // Two creatures to choose from, so you're asked which.
  await expect(bar).toContainText("Cavalier of Night: click another creature of yours to sacrifice.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[cavalier]!.zone === "battlefield");
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone, after.objects[other]!.zone]).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
