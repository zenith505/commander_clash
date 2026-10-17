// "Choose an opponent. That player sacrifices a creature of their choice." (Myrkul's Edict, rolling 1-9): chosen as the
// spell resolves (CR 608.2d), a button for each opponent.
import { expect, test } from "@playwright/test";
import { nextRandom, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

/** The next d20 rolled comes up `value` (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, value: number) {
  for (let st = 1; ; st++) {
    if (1 + Math.floor(nextRandom({ rngState: st }) * 20) === value) {
      s.rngState = st;
      return;
    }
  }
}

test("Myrkul's Edict: choose an opponent, who sacrifices a creature", async ({ page }) => {
  const s = scene({ hand: ["Myrkul's Edict"], board: ["Swamp", "Swamp"] }, [{ board: ["Grizzly Bears"] }, { board: ["Grizzly Bears"] }]);
  const edict = one(s, "Myrkul's Edict");
  const [anas, bens] = [idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!, idsOf(s, "Grizzly Bears", "battlefield", 2)[0]!];
  rig(s, 5);
  await open(page, s);
  await card(page, "Myrkul's Edict", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  const bar = controls(page);
  await expect(bar).toContainText("Myrkul's Edict: choose an opponent");
  for (const name of ["Ana", "Ben", "Cy"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[edict]?.zone === "graveyard");
  expect(after.objects[bens]!.zone).toBe("graveyard");
  expect(after.objects[anas]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text === "You chooses Ben for Myrkul's Edict.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
