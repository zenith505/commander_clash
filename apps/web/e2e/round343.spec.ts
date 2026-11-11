// Round 343's prompts: a card cast as an instruction resolves "by paying [a cost] rather than paying its mana cost" (an
// alternative cost, CR 118.9): The Infamous Cruelclaw's "by discarding a card" (the discard picked as it's cast), Anrakyr
// the Traveller's "an artifact spell from your hand or graveyard by paying life equal to its mana value" (which card,
// then the life), Amped Raptor's "{E} equal to its mana value" and Blue Mage's Cane's copy "by paying {3}".
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("The Infamous Cruelclaw: the exiled Grizzly Bears, cast by discarding Lightning Bolt", async ({ page }) => {
  const s0: GameState = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "The Infamous Cruelclaw"], library: ["Forest", "Grizzly Bears"] });
  const [claw, bolt] = [one(s0, "The Infamous Cruelclaw"), one(s0, "Lightning Bolt")];
  const bears = idsOf(s0, "Grizzly Bears", "library", 0)[0]!;
  const s = playWithBots(s0, (st) => st.pending?.kind === "castFree" && st.pending.player === 0, [[claw, 1]]);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("cast Grizzly Bears from exile by discarding a card rather than paying its mana cost? Only now.");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("discard");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Anrakyr the Traveller: Mind Stone from your hand for 2 life as it attacks", async ({ page }) => {
  const s0: GameState = scene({ hand: ["Mind Stone", "Lightning Bolt"], yard: ["Sol Ring"], board: [...LANDS, "Anrakyr the Traveller"] });
  const [anrakyr, stone, ring] = [one(s0, "Anrakyr the Traveller"), one(s0, "Mind Stone"), one(s0, "Sol Ring")];
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong", [[anrakyr, 1]]);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("cast an artifact spell from your hand or graveyard by paying life equal to its mana value rather than paying its mana cost?");
  await expect(bar.getByRole("button", { name: "Lightning Bolt" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Mind Stone (hand)" }).click();
  await expect(bar).toContainText("cast Mind Stone from your hand by paying life equal to its mana value (2) rather than paying its mana cost?");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[stone]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 2);
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Amped Raptor: cast from your hand, {E}{E}, then Grizzly Bears cast for its two {E}", async ({ page }) => {
  const s: GameState = scene({ hand: ["Amped Raptor"], board: LANDS, library: ["Grizzly Bears"] });
  const bears = idsOf(s, "Grizzly Bears", "library", 0)[0]!;
  await open(page, s);
  await card(page, "Amped Raptor", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("cast Grizzly Bears from exile by paying {E} equal to its mana value (2) rather than paying its mana cost? Only now.");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.players[0]!.energy ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Blue Mage's Cane: a copy of Ana's Lightning Bolt, cast for {3} at Ana", async ({ page }) => {
  const s0: GameState = scene({ board: [...LANDS, "Grizzly Bears", "Blue Mage's Cane"] }, [{ yard: ["Lightning Bolt"] }]);
  const [bears, staff, bolt] = [one(s0, "Grizzly Bears"), one(s0, "Blue Mage's Cane"), one(s0, "Lightning Bolt")];
  s0.objects[staff]!.attachedTo = bears;
  let t = playWithBots(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, [[bears, 1]]);
  t = applyAction(t, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: bolt }] });
  const s = playWithBots(t, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("by paying {3} rather than paying its mana cost?");
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await expect(bar).toContainText("cast Lightning Bolt from exile by paying {3} rather than paying its mana cost? Only now.");
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === s.players[1]!.life - 3);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
