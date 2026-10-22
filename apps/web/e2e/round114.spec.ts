// Round 114's prompts: "add X mana in any combination of colors" from a triggered ability (Klauth, Unrivaled Ancient):
// as it resolves, a bar to pick how much of each color (CR 106.1b, 608.2d), with no Cancel (the ability is resolving).
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene, state } from "./scene";
import { resolveUntil } from "./ui";

test("Klauth attacks with Grizzly Bears: add 6 mana in any combination of colors, kept for spells this turn", async ({ page }) => {
  let s: GameState = scene({ board: ["Klauth, Unrivaled Ancient", "Grizzly Bears"] });
  const [klauth, bears] = [one(s, "Klauth, Unrivaled Ancient"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: klauth, defender: 1 }, { attacker: bears, defender: 1 }] });
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "manaMix" && st.pending.player === 0);
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("Klauth, Unrivaled Ancient: add 6 mana in any combination of colors (6 left)");
  await expect(bar.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  const add = bar.getByRole("button", { name: "Add" });
  for (let i = 0; i < 4; i++) await bar.getByRole("button", { name: "Red plus one" }).click();
  await expect(add).toBeDisabled();
  await bar.getByRole("button", { name: "Green plus one" }).click();
  await bar.getByRole("button", { name: "Green plus one" }).click();
  await expect(bar).toContainText("(0 left)");
  await add.click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.R).toBe(4);
  const after = await state(page);
  expect(after.players[0]!.manaPool.G).toBe(2);
  expect(after.players[0]!.manaLots?.every((l) => l.keep === "turn" && !!l.only)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
