// Round 225: Gideon Jura's "+2: During target opponent's next turn, creatures that player controls attack Gideon Jura if
// able" (CR 508.1d). As you declare attackers that turn, the bar says your creature has to attack him, and you can't
// declare until it does. Clicking his card attacks him, not Ana (the click no longer also reaches her seat).
import { expect, test } from "@playwright/test";
import { open, one, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Gideon Jura: your creature must attack him this turn: the bar says so and Attack waits until it does", async ({ page }) => {
  const s = scene({ board: ["Grizzly Bears"] }, [{ board: ["Gideon Jura"] }]);
  const [bears, gideon] = [one(s, "Grizzly Bears"), one(s, "Gideon Jura")];
  s.objects[gideon]!.counters.loyalty = 8;
  // Ana's +2 resolved on her last turn: this is your next turn.
  s.attackWalkerNextTurn = [{ pw: gideon, pwZc: s.objects[gideon]!.zoneChanges ?? 0, player: 0, since: s.turn - 1, turn: s.turn }];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  const bar = controls(page);
  await expect(bar).toContainText("Grizzly Bears must attack Gideon Jura if able: click it, then that planeswalker.");
  await expect(bar.getByRole("button", { name: "No attacks" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("Now click the player or planeswalker Grizzly Bears attacks.");
  await page.locator(`[data-obj="${gideon}"]`).click();
  await bar.getByRole("button", { name: "Attack with 1" }).click();
  const after = await resolveUntil(page, (st) => st.objects[gideon]!.counters.loyalty === 6);
  expect(after.log.some((l) => l.text === "Grizzly Bears attacks Ana's Gideon Jura.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
