// Lane B round B142 in the browser: "An opponent chooses one —". You choose which opponent chooses the mode of your
// Misfortune or Fatal Lore (CR 700.2e), then the targets of Fatal Lore's mode (601.2c); a bot's Fatal Lore asks you for
// the mode, and "that player draws up to three cards" asks you how many.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

const MANA = ["Swamp", "Swamp", "Mountain", "Forest", "Plains"];

test("Misfortune: you pick Ben to choose the mode; he takes the -1/-1 counters and 4 damage", async ({ page }) => {
  const s = scene({ hand: ["Misfortune"], board: [...MANA, "Gray Ogre"] }, [{ board: ["Llanowar Elves"] }, { board: ["Hill Giant"] }]);
  const [mis, giant, ogre] = [one(s, "Misfortune"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Misfortune", s).click();
  // No mode to pick yourself: you choose who chooses.
  await expect(page.locator(".mode-menu")).toHaveCount(0);
  await expect(controls(page)).toContainText("Misfortune: which opponent chooses the mode of Misfortune?");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  // Ben's Hill Giant survives a -1/-1 counter and he has life to spare: the mode about him.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mis]!.zone === "graveyard");
  expect(after.objects[giant]!.counters["-1/-1"]).toBe(1);
  expect(after.objects[ogre]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.players.map((p) => p.life)).toEqual([40, 40, 36, 40]);
  expect(after.log.some((l) => l.text === "You asks Ben to choose the mode of Misfortune.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Fatal Lore: Cy, who has no creature, chooses the destroy mode; you then choose its targets (none of Ana's)", async ({ page }) => {
  const s = scene({ hand: ["Fatal Lore"], board: ["Swamp", "Swamp", "Swamp", "Swamp"] }, [{ board: ["Hill Giant"] }, { board: ["Gray Ogre"] }, {}]);
  const [lore, giant] = [one(s, "Fatal Lore"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Fatal Lore", s).click();
  await controls(page).getByRole("button", { name: "Cy", exact: true }).click();
  // Cy's bot chose the mode that destroys creatures Cy controls: the targets are yours to choose now, and Ana's Hill
  // Giant isn't one of them.
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Fatal Lore");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await expect(bar).toContainText("Fatal Lore");
  await bar.getByRole("button", { name: "Choose none" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[lore]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.stack.length).toBe(0);
  // Cy drew up to three.
  expect(after.players[3]!.hand.length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Fatal Lore: you, her only opponent left, choose the destroy mode; she destroys your creatures and you draw up to three", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{ hand: ["Fatal Lore"], board: ["Swamp", "Swamp", "Swamp", "Swamp"] }]);
  const [bears, giant] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  // Only you left to ask.
  for (const p of [2, 3]) s0.players[p]!.lost = true;
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseModes", player: 0 });
  await open(page, s);
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("Fatal Lore: Ana's spell, you choose its mode");
  await modes.getByRole("button", { name: /You destroy up to two target creatures that player controls/ }).click();
  const hand = s.players[0]!.hand.length;
  // Ana chooses your two creatures; once it resolves, you're asked how many cards to draw.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "drawUpTo" && st.pending.player === 0);
  expect(asked.objects[bears]!.zone).toBe("graveyard");
  expect(asked.objects[giant]!.zone).toBe("graveyard");
  const bar = controls(page);
  await expect(bar).toContainText("draw up to 3 cards?");
  await bar.getByRole("button", { name: "Draw 3 cards" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 3);
  expect(after.players[0]!.hand.length).toBe(hand + 3);
  expect(pageErrors(page)).toEqual([]);
});
