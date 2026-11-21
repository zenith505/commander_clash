// Round 437: The Ur-Sphinx (cast one card each player milled, from the milled-cards picker) and Nathan Drake, Treasure
// Hunter (an opponent's exiled Lightning Bolt cast with an Island's blue mana as though it were red).
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { attack, clickPlayer, controls, resolveUntil } from "./ui";

test("The Ur-Sphinx: each player mills one; cast your Divination and Ana's Lightning Bolt for free", async ({ page }) => {
  const s = scene({ board: ["Plains", "The Ur-Sphinx"], library: ["Divination"] }, [{ library: ["Lightning Bolt"] }]);
  const [ur, div, bolt] = [one(s, "The Ur-Sphinx"), one(s, "Divination"), one(s, "Lightning Bolt")];
  const life = s.players[1]!.life;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[ur, 1]]);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong" && x.pending.player === 0);
  expect([div, bolt].map((id) => st.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  const bar = controls(page);
  await expect(bar).toContainText("among the cards each player milled (one of each player's)");
  await bar.getByRole("button", { name: /^Divination/ }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong" && !x.pending.options.includes(div));
  await bar.getByRole("button", { name: /^Lightning Bolt/ }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  // Its target, chosen as it's cast (CR 601.2c).
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && x.objects[bolt]!.zone === "graveyard" && x.objects[div]!.zone === "graveyard" && x.players[0]!.hand.length === hand + 2);
  expect(after.players[1]!.life).toBeLessThanOrEqual(life - 3);
  expect(after.objects[idsOf(after, "Plains", "battlefield", 0)[0]!]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Nathan Drake: cast Ana's exiled Lightning Bolt with an Island, blue mana spent as though it were red", async ({ page }) => {
  const s = scene({ board: ["Island", "Nathan Drake, Treasure Hunter"] }, [{ library: ["Lightning Bolt"] }]);
  const [nathan, bolt] = [one(s, "Nathan Drake, Treasure Hunter"), one(s, "Lightning Bolt")];
  const island = idsOf(s, "Island", "battlefield", 0)[0]!;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[nathan, 1]]);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong" && x.pending.player === 0);
  expect(st.objects[bolt]!.zone).toBe("exile");
  const life = st.players[1]!.life;
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from among the exiled cards?");
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  // Its target, chosen as it's cast (CR 601.2c).
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && x.objects[bolt]!.zone === "graveyard");
  expect(after.objects[island]!.tapped).toBe(true);
  // Bolt's 3 (and Nathan's first-strike combat damage too, if the game has moved on to it).
  expect([life - 3, life - 6]).toContain(after.players[1]!.life);
  expect(pageErrors(page)).toEqual([]);
});
