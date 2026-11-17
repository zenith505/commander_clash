// Round 395 in the browser: Krang & Shredder's end step cast of a card exiled with it (disappear), Gandalf, Westward
// Voyager's copy of Lava Axe aimed at another opponent, and Impact Resonance's damage divided by the most one source dealt.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

const cast = (s: GameState, name: string, targets?: Parameters<typeof planCast>[3]) => {
  for (const a of planCast(s, 0, idsOf(s, name, "hand", 0)[0]!, targets)!) s = applyAction(s, a);
  return playUntil(s, (st) => st.stack.length === 0 && !st.pending);
};

test("Krang & Shredder: Ana's Divination exiled as it enters; after Murder on your Grizzly Bears, at your end step you cast it free", async ({ page }) => {
  const s0 = scene({ hand: ["Krang & Shredder", "Murder"], board: [...LANDS, "Grizzly Bears"] }, [{ library: ["Divination"] }]);
  const [div, bears] = [one(s0, "Divination"), one(s0, "Grizzly Bears")];
  let s = cast(s0, "Krang & Shredder");
  expect(s.objects[div]!.zone).toBe("exile");
  s = cast(s, "Murder", [{ kind: "object", id: bears }]);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from among the exiled cards without paying its mana cost?");
  await bar.getByRole("button", { name: "Divination" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.objects[div]!.owner).toBe(1);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Gandalf, Westward Voyager: Lava Axe at Ana, Ana reveals Divination (a sorcery too), the copy goes at Ben and each opponent draws", async ({ page }) => {
  const s = scene({ hand: ["Lava Axe"], board: [...LANDS, "Gandalf, Westward Voyager"] }, [{ library: ["Divination"] }]);
  const life = [1, 2, 3].map((p) => s.players[p]!.life);
  const hands = [1, 2, 3].map((p) => s.players[p]!.hand.length);
  await open(page, s);
  await card(page, "Lava Axe", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[2]!.life < life[1]!);
  expect(after.players[1]!.life).toBe(life[0]! - 5);
  expect(after.players[2]!.life).toBe(life[1]! - 5);
  expect([1, 2, 3].map((p) => after.players[p]!.hand.length)).toEqual(hands.map((n) => n + 1));
  expect(pageErrors(page)).toEqual([]);
});

test("Impact Resonance: after Lightning Bolt dealt Ana 3, its 3 damage is divided between Ana's Grizzly Bears and Llanowar Elves", async ({ page }) => {
  const s0 = scene({ hand: ["Lightning Bolt", "Impact Resonance"], board: LANDS }, [{ board: ["Grizzly Bears", "Llanowar Elves", "Hill Giant"] }]);
  const [bears, elves, giant] = [one(s0, "Grizzly Bears"), one(s0, "Llanowar Elves"), one(s0, "Hill Giant")];
  const s = cast(s0, "Lightning Bolt", [{ kind: "player", id: 1 }]);
  expect(s.turnLog?.greatestDamage).toBe(3);
  await open(page, s);
  await card(page, "Impact Resonance", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const elvesRow = panel.locator(".divide", { hasText: "Llanowar Elves" });
  // 3 in all, at least 1 each.
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await expect(elvesRow.locator("strong")).toHaveText("1");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
