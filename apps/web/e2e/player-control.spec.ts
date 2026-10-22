// Controlling another player (CR 723): with Emrakul, the Promised End you play Ana's next turn from her side of the
// table (her hand at the bottom, her land, her attack), then she takes an extra turn on her own; a bot controlling you
// plays your turn while you watch.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene, state } from "./scene";
import { attack, resolveUntil, seat } from "./ui";

test("Emrakul: you play Ana's next turn (her Forest, her Grizzly Bears attacking Ben), then she takes an extra turn", async ({ page }) => {
  let s: GameState = scene({ hand: ["Emrakul, the Promised End"], board: LANDS }, [{ hand: ["Forest"], board: ["Grizzly Bears"] }]);
  const [forest, bears] = [idsOf(s, "Forest", "hand", 1)[0]!, one(s, "Grizzly Bears")];
  for (const a of planCast(s, 0, one(s, "Emrakul, the Promised End"))!) s = applyAction(s, a);
  // Its cast trigger targets Ana.
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "player", id: 1 }] });
  s = playWithBots(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && st.priority === 1);
  const turn = s.turn;
  await open(page, s);
  await expect(page.locator(".control-note")).toHaveText("You control Ana this turn");
  // You see the table from Ana's seat, with her hand.
  await expect(seat(page, 1)).toHaveClass(/\bme\b/);
  await page.locator(`.hand [data-obj="${forest}"]`).click();
  await expect.poll(async () => (await state(page)).objects[forest]!.zone).toBe("battlefield");
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  await attack(page, [[bears, 2]]);
  const after = await resolveUntil(page, (st) => st.turn === turn + 1, 80);
  // Ben took 2; now Ana's extra turn, hers to play.
  expect(after.players[2]!.life).toBe(38);
  expect(after.activePlayer).toBe(1);
  expect(after.controlledTurn).toBeUndefined();
  await expect(page.locator(".control-note")).toHaveCount(0);
  await expect(seat(page, 0)).toHaveClass(/\bme\b/);
  expect(pageErrors(page)).toEqual([]);
});

test("Ana controls you during your turn: she plays it for you and you watch", async ({ page }) => {
  let s: GameState = scene({ hand: ["Grizzly Bears"], board: LANDS });
  s.playerControls = [{ controlled: 0, controller: 1 }];
  const start = s.turn;
  // Round the table to your next turn, which she controls.
  s = playWithBots(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.turn > start);
  expect(s.controlledTurn).toEqual({ controlled: 0, controller: 1 });
  const turn = s.turn;
  await open(page, s);
  await expect(page.locator(".control-note")).toHaveText("Ana controls you this turn");
  // She casts nothing for you: the turn goes by without a click, Grizzly Bears still in your hand.
  await expect.poll(async () => (await state(page)).turn, { timeout: 30000 }).toBe(turn + 1);
  const after = await state(page);
  expect(after.objects[one(s, "Grizzly Bears")]!.zone).toBe("hand");
  await expect(page.locator(".control-note")).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
