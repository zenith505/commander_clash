// Round 301's menu entries: the next spell cast this turn for an alternative cost (CR 118.9) its source made: life equal
// to its mana value (Marshland Bloodcaster: "Cast it: pay 3 life") and nothing at all (World War Hulk's chapter I: "Cast
// it: without paying its mana cost", offered to a green creature card but not a blue spell).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, planCast, type Action, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
const settled = (s: GameState) => s.stack.length === 0 && s.triggerQueue.length === 0 && !s.pending && s.activePlayer === 0 && s.step === "main1";

test("Marshland Bloodcaster: after its ability, cast Rhystic Study for 3 life, no mana", async ({ page }) => {
  let s = scene({ hand: ["Rhystic Study"], board: ["Marshland Bloodcaster", "Swamp", "Swamp", "Island", "Island", "Island"] });
  const study = one(s, "Rhystic Study");
  s = playUntil(run(s, planActivate(s, 0, one(s, "Marshland Bloodcaster"), 0)), settled);
  expect(s.nextCast).toHaveLength(1);
  await open(page, s);
  await card(page, "Rhystic Study", s).click();
  await menu(page).getByRole("button", { name: "Cast it: pay 3 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[study]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 3);
  // The Islands weren't needed.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped && after.cards[after.objects[id]!.cardId]!.name === "Island")).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("World War Hulk: chapter I's next green creature spell cast without paying its mana cost", async ({ page }) => {
  let s = scene({ hand: ["World War Hulk", "Rhystic Study", "Colossal Dreadmaw"], board: ["Forest", "Forest", "Forest", "Forest", "Forest", "Island", "Island", "Island"] });
  const dreadmaw = one(s, "Colossal Dreadmaw");
  s = playUntil(run(s, planCast(s, 0, one(s, "World War Hulk"))), settled);
  expect(s.objects[one(s, "World War Hulk")]!.counters.lore).toBe(1);
  // Autopay may have tapped Islands for the Saga's {3}: the lands start the page untapped, the Dreadmaw's 6 not there.
  for (const id of s.battlefield) s.objects[id]!.tapped = false;
  await open(page, s);
  // Rhystic Study isn't a red or green creature spell: no such entry, so a click casts it for its mana cost.
  await card(page, "Rhystic Study", s).click();
  await expect(menu(page)).toHaveCount(0);
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Rhystic Study")]!.zone === "battlefield");
  expect(mid.nextCast).toHaveLength(1);
  await card(page, "Colossal Dreadmaw", mid).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dreadmaw]!.zone === "battlefield");
  expect(after.nextCast ?? []).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});
