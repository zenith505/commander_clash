// Lane B round B158 in the browser: Distended Mindbender's two picks from the revealed hand (a nonland card with mana
// value 3 or less, then a card with mana value 4 or greater), and Jester's Mask's search of an opponent's library for as
// many cards as they put back from their hand.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

test("Distended Mindbender: you pick Grizzly Bears, then Hill Giant, from Ana's hand, and she discards both", async ({ page }) => {
  let s: GameState = scene({ hand: ["Distended Mindbender"], board: LANDS }, [{ hand: ["Grizzly Bears", "Hill Giant", "Forest"] }]);
  const [spell, bears, giant, forest] = [one(s, "Distended Mindbender"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), s.players[1]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!];
  for (const a of planCast(s, 0, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "player", id: 1 }] });
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  // Only the nonland card with mana value 3 or less is offered first.
  expect(s.pending?.kind === "searchLibrary" ? s.pending.cards : []).toEqual([bears]);
  await open(page, s);
  let pick = modal(page);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const second = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0 && x.pending.cards.includes(giant));
  expect(second.pending?.kind === "searchLibrary" ? second.pending.cards : []).toEqual([giant]);
  pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[forest]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Jester's Mask: Ana puts her two cards on top and you pick two cards from her library for her hand", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Jester's Mask"] }, [{ hand: ["Hill Giant", "Grizzly Bears"] }]);
  const mask = one(s, "Jester's Mask");
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  s.objects[mask]!.tapped = false;
  for (const a of planActivate(s, 0, mask, 0, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  // Ana (a bot) orders her hand on top; then you search.
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(s.players[1]!.hand).toEqual([]);
  expect(s.pending).toMatchObject({ min: 2, max: 2 });
  const lands = (s.pending?.kind === "searchLibrary" ? s.pending.cards : []).filter((id) => id !== giant && id !== bears).slice(0, 1);
  await open(page, s);
  const pick = modal(page);
  await pick.locator(`[data-pick="${lands[0]}"]`).first().click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.players[1]!.hand.length === 2);
  expect([...after.players[1]!.hand].sort()).toEqual([lands[0]!, bears].sort());
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.objects[mask]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
