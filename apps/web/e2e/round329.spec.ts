// Round 329's prompt: when you would lose the game and more than one replacement could apply (The Golden Throne,
// Exquisite Archangel, Stunning Reversal), you choose which one does (CR 616.1); an Archangel dying in the same check
// may go to the graveyard instead of exile (rulings).
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Losing the game with The Golden Throne and Exquisite Archangel: you choose the Throne, which is exiled", async ({ page }) => {
  let s: GameState = scene({ board: ["Exquisite Archangel", "The Golden Throne"] }, []);
  const [angel, throne] = [one(s, "Exquisite Archangel"), one(s, "The Golden Throne")];
  s.players[0]!.life = 0;
  s = applyAction(s, { type: "passPriority", player: 0 });
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "loseReplacement" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Losing the game: you would lose the game (life total reached 0). Which replacement applies?");
  await expect(bar.getByRole("button", { name: "Exile Exquisite Archangel: your life total becomes 40" })).toBeVisible();
  await bar.getByRole("button", { name: "Exile The Golden Throne: your life total becomes 1" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[throne]!.zone === "exile");
  expect(after.players[0]!.lost).toBeFalsy();
  expect(after.players[0]!.life).toBe(1);
  expect(after.objects[angel]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Exquisite Archangel dies as you would lose: you put it into your graveyard, and your life total becomes 40", async ({ page }) => {
  let s: GameState = scene({ board: ["Exquisite Archangel"] }, []);
  const angel = one(s, "Exquisite Archangel");
  s.objects[angel]!.damage = 5;
  s.players[0]!.life = 0;
  s = applyAction(s, { type: "passPriority", player: 0 });
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "loseReplacement" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Exile Exquisite Archangel: your life total becomes 40" })).toBeVisible();
  await bar.getByRole("button", { name: "Put Exquisite Archangel into your graveyard (it dies): your life total becomes 40" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[angel]!.zone === "graveyard");
  expect(after.players[0]!.lost).toBeFalsy();
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});
