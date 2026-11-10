// Round 326's prompts: Academy Loremaster asks you in your draw step whether to draw another card (your spells then cost
// {2} more this turn); Seeker of Slaanesh won't let you declare no attackers while one of your creatures can attack; Gavi,
// Nest Warden lets you cycle the first card each turn for {0}.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, resolveUntil } from "./ui";
import { spellCost, type GameState } from "@cc/engine";

test("Academy Loremaster: yes to the extra draw in your draw step, and Grizzly Bears costs {2} more this turn", async ({ page }) => {
  let s: GameState = scene({ board: ["Academy Loremaster"], hand: ["Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  // On to your next turn's upkeep: the bots answer the Loremaster in their own draw steps.
  s = playUntil(s, (st) => st.turn > 1 && st.activePlayer === 0 && st.step === "upkeep");
  await open(page, s);
  const before = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const hand = before.players[0]!.hand.length;
  await expect(controls(page)).toContainText("Academy Loremaster");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.hand.length === hand + 1 && !st.pending && st.stack.length === 0);
  const cost = spellCost(after, 0, after.objects[bears]!);
  expect(cost.extra + cost.cost.symbols.reduce((n, y) => n + (y.kind === "generic" ? y.amount : 1), 0)).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Seeker of Slaanesh: No attacks is refused while Grizzly Bears can attack; attacking with it is fine", async ({ page }) => {
  let s: GameState = scene({ board: ["Grizzly Bears"] }, [{ board: ["Seeker of Slaanesh"] }]);
  const bears = one(s, "Grizzly Bears");
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("Click a creature, then the player it attacks");
  await controls(page).getByRole("button", { name: "No attacks" }).click();
  await expect(page.locator(".error")).toContainText("must attack with at least one creature");
  await attack(page, [[bears, 2]]);
  const after = await resolveUntil(page, (st) => st.objects[bears]!.attacking === 2);
  expect(after.objects[bears]!.attacking).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Gavi, Nest Warden: cycle Forgotten Cave with no mana, the first card cycled this turn", async ({ page }) => {
  const s = scene({ hand: ["Forgotten Cave"], board: ["Gavi, Nest Warden"], library: ["Gray Ogre"] });
  const [cave, ogre] = [one(s, "Forgotten Cave"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Forgotten Cave", s).click();
  await menu(page).getByRole("button", { name: /^Cycling/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[cave]!.zone === "graveyard" && st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.hand).toContain(ogre);
  expect(pageErrors(page)).toEqual([]);
});
