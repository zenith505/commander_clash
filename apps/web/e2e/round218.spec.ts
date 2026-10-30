// Round 218: "For each player, choose friend or foe" (Virtus's Maneuver): you answer once for each player, yourself too,
// then the friends and the foes do what the card says.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Virtus's Maneuver: choose friend or foe for each player", async ({ page }) => {
  let s: GameState = scene({ hand: ["Virtus's Maneuver"], board: LANDS, yard: ["Llanowar Elves"] }, [{ board: ["Grizzly Bears"] }, { board: ["Grizzly Bears"] }]);
  const maneuver = one(s, "Virtus's Maneuver");
  const elves = one(s, "Llanowar Elves");
  const [anaBears, benBears] = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears").sort((a, b) => s.objects[a]!.controller - s.objects[b]!.controller);
  for (const a of planCast(s, 0, maneuver)!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "word");
  const bar = controls(page);
  for (const [who, pick] of [["yourself", "Friend"], ["Ana", "Foe"], ["Ben", "Friend"], ["Cy", "Foe"]] as const) {
    await expect(bar).toContainText(`choose friend or foe for ${who}`);
    await expect(bar.getByRole("button", { name: "Foe" })).toBeVisible();
    await bar.getByRole("button", { name: pick }).click();
  }
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[maneuver]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("hand");
  expect(after.objects[anaBears!]!.zone).toBe("graveyard");
  expect(after.objects[benBears!]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
