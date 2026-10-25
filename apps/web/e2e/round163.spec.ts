// Round 163: Street Wraith's cycling that costs life, not mana, and Brood Sliver's "its controller may create" asking
// the controller of the Sliver that dealt the damage, not Brood Sliver's controller.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Street Wraith: cycle it by paying 2 life", async ({ page }) => {
  const s = scene({ hand: ["Street Wraith"], library: ["Gray Ogre"] });
  const [wraith, ogre] = [one(s, "Street Wraith"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Street Wraith", s).click();
  await menu(page).getByRole("button", { name: /^Cycling/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[wraith]!.zone === "graveyard" && st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.hand).toEqual([ogre]);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Brood Sliver: your Sliver hits a player, and you may create the Sliver token although Ben controls Brood Sliver", async ({ page }) => {
  const s0 = scene({ board: ["Muscle Sliver"] }, [{}, { board: ["Brood Sliver"] }]);
  const muscle = one(s0, "Muscle Sliver");
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, [[muscle, 1]]);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Brood Sliver");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  invalidateCharacteristics(after);
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  expect(tokens).toHaveLength(1);
  expect(after.objects[tokens[0]!]!.controller).toBe(0);
  expect(characteristics(after, after.objects[tokens[0]!]!).subtypes).toContain("Sliver");
  expect(pageErrors(page)).toEqual([]);
});
