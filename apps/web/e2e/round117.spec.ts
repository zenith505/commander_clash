// Round 117's prompts: Druid of Purification ("starting with you, each player may choose an artifact or enchantment you
// don't control": a button for each, and "Choose nothing") and Odric, Master Tactician (you choose the defending
// player's blocks: click their creatures, then your attackers).
import { expect, test } from "@playwright/test";
import { applyAction } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Druid of Purification: choose an artifact you don't control, or nothing; each one chosen is destroyed", async ({ page }) => {
  const s = scene({ hand: ["Druid of Purification"], board: [...LANDS, "Mind Stone"] }, [{ board: ["Sol Ring"] }, { board: ["Grizzly Bears"] }]);
  const ring = idsOf(s, "Sol Ring", "battlefield", 1)[0]!;
  const mine = idsOf(s, "Mind Stone", "battlefield", 0)[0]!;
  await open(page, s);
  await card(page, "Druid of Purification", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Druid of Purification: choose an artifact or enchantment you don't control");
  await expect(bar.getByRole("button", { name: "Choose nothing" })).toBeVisible();
  // Your own Mind Stone isn't one of the choices.
  await expect(bar.getByRole("button", { name: /Mind Stone/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Sol Ring (Ana)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(after.objects[mine]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text === "You chose Sol Ring (Ana).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Odric, Master Tactician: with three others attacking, you choose how Ana blocks", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Odric, Master Tactician", "Hill Giant", "Llanowar Elves", "Serra Angel"] }, [{ board: ["Grizzly Bears"] }]);
  const [odric, giant, elves, angel] = ["Odric, Master Tactician", "Hill Giant", "Llanowar Elves", "Serra Angel"].map((n) => one(s, n)) as [string, string, string, string];
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  // The attack and Odric's trigger are played in the engine; the test starts as blockers are declared.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers");
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [odric, giant, elves, angel].map((attacker) => ({ attacker, defender: 1 })) });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers");
  expect(s.pending).toMatchObject({ player: 0, defender: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("You choose Ana's blocks: click one of their untapped creatures, then the attacker it blocks.");
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("Now click the attacker Grizzly Bears blocks.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Block with 1" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[bears]!.blocking !== undefined);
  expect(after.objects[bears]!.blocking).toEqual([giant]);
  expect(after.log.some((l) => l.text === "Grizzly Bears blocks Hill Giant (You chose).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
