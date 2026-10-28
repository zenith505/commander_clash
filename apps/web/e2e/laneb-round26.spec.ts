// Lane B round 26 in the browser: Exalted Dragon's cost to attack, "sacrifice a land" (CR 508.1g-i), paid as it's
// declared an attacker: click one of your lands, then Sacrifice. Drop of Honey: of the creatures tied for the least
// power, anyone's, click the one to destroy, then Choose.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, controls, passTo, resolveUntil } from "./ui";

test("Exalted Dragon: sacrifice a Mountain to attack Ana with it", async ({ page }) => {
  const s = scene({ board: ["Plains", "Mountain", "Exalted Dragon"] });
  // Basic lands are in the library too: the ones on your battlefield.
  const [plains, mountain, dragon] = [idsOf(s, "Plains", "battlefield", 0)[0]!, idsOf(s, "Mountain", "battlefield", 0)[0]!, one(s, "Exalted Dragon")];
  const life = s.players[1]!.life;
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[dragon, 1]]);
  await expect(controls(page)).toContainText("to attack with it, sacrifice a land");
  const sacrifice = controls(page).getByRole("button", { name: "Sacrifice" });
  await expect(sacrifice).toBeDisabled();
  await page.locator(`[data-obj="${mountain}"]`).click();
  await sacrifice.click();
  await passTo(page, "main2");
  const after = await state(page);
  expect(after.objects[mountain]!.zone).toBe("graveyard");
  expect(after.objects[plains]!.zone).toBe("battlefield");
  expect(after.players[1]!.life).toBe(life - 5);
  expect(pageErrors(page)).toEqual([]);
});

test("Drop of Honey: in your upkeep, choose Ana's Runeclaw Bear of the creatures tied for the least power, and it's destroyed", async ({ page }) => {
  const s0 = scene({ board: ["Drop of Honey", "Grizzly Bears", "Hill Giant"] }, [{ board: ["Runeclaw Bear"] }]);
  const [bears, giant, runeclaw] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Runeclaw Bear")];
  const s = playUntil(s0, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("click a creature tied for the least power (anyone's). Drop of Honey destroys it.");
  const choose = controls(page).getByRole("button", { name: "Choose" });
  await expect(choose).toBeDisabled();
  await page.locator(`[data-obj="${runeclaw}"]`).click();
  await choose.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[runeclaw]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
