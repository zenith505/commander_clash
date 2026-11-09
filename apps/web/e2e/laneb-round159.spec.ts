// Lane B round B159 in the browser: Grim Reminder's search for a card that stays in your library, revealed, against the
// names of the spells your opponents cast this turn, and Grinning Totem's search of an opponent's library for a card you
// may play until your next upkeep.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

test("Grim Reminder: you pick Lightning Bolt, which stays in your library, and Ana, who cast one this turn, loses 6 life", async ({ page }) => {
  let s: GameState = scene({ hand: ["Grim Reminder"], board: LANDS, library: ["Lightning Bolt", "Hill Giant"] });
  const [spell, bolt] = [one(s, "Grim Reminder"), one(s, "Lightning Bolt")];
  // Ana cast a Lightning Bolt earlier this turn; Bo cast a Hill Giant.
  s.castThisTurn = [{ player: 1, card: s.cards[s.objects[bolt]!.cardId]!.oracleId, name: "Lightning Bolt" }, { player: 2, card: "giant", name: "Hill Giant" }];
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  const lives = s.players.map((p) => p.life);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("reveal");
  await pick.locator(`[data-pick="${bolt}"]`).first().click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.objects[bolt]!.zone).toBe("library");
  expect(after.players.map((p) => p.life)).toEqual([lives[0], lives[1]! - 6, lives[2], lives[3]]);
  expect(pageErrors(page)).toEqual([]);
});

test("Grinning Totem: you pick Hill Giant from Ana's library; it's exiled for you to play until your next upkeep", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Grinning Totem"] }, [{ library: ["Hill Giant", "Grizzly Bears"] }]);
  const totem = one(s, "Grinning Totem");
  const giant = one(s, "Hill Giant");
  for (const a of planActivate(s, 0, totem, 0, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(s.pending).toMatchObject({ min: 1, max: 1 });
  await open(page, s);
  const pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).first().click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0, until: "yourNextUpkeep" });
  expect(after.objects[totem]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
