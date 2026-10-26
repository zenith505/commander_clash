// Lane B round 3's prompts: Cruel Fate (one of an opponent's top five into their graveyard, then you order the rest),
// Perish the Thought (a card from their revealed hand shuffled into their library), Stunted Growth (three cards from your
// hand on top of your library) and Imperial Edict cast at you (you choose the creature it destroys).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Cruel Fate: put one of the opponent's top five into their graveyard, then order the other four on top", async ({ page }) => {
  const TOP = ["Lightning Bolt", "Sol Ring", "Mind Stone", "Counterspell", "Dark Ritual"];
  const s0 = scene({ board: [...LANDS], hand: ["Cruel Fate"] }, [{ library: TOP }]);
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Cruel Fate"), [{ kind: "player", id: 1 }])));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, min: 1, max: 1 });
  const [bolt, ring, stone, spell, ritual] = TOP.map((n) => idsOf(s, n, "library", 1)[0]!);
  const name = s.players[1]!.name;
  await open(page, s);
  await expect(modal(page)).toContainText(`Cruel Fate: put a card into ${name}'s graveyard`);
  await modal(page).locator(`[data-pick="${ring}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  // Then the other four, in the order you choose, on top of their library.
  const mid = await resolveUntil(page, (x) => x.pending?.kind === "arrangeTop" && x.pending.player === 0);
  expect(mid.objects[ring]!.zone).toBe("graveyard");
  const order = mid.pending?.kind === "arrangeTop" ? mid.pending.cards : [];
  expect(new Set(order)).toEqual(new Set([bolt, stone, spell, ritual]));
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Cruel Fate");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[1]}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.players[1]!.library.slice(0, 4)).toEqual([order[1], order[0], order[2], order[3]]);
  expect(after.players[1]!.graveyard).toContain(ring);
  expect(pageErrors(page)).toEqual([]);
});

test("Perish the Thought: choose a card from the opponent's revealed hand; they shuffle it into their library", async ({ page }) => {
  const s0 = scene({ board: [...LANDS], hand: ["Perish the Thought"] }, [{ hand: ["Lightning Bolt", "Sol Ring"] }]);
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Perish the Thought"), [{ kind: "player", id: 1 }])));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, hand: 1 });
  const ring = idsOf(s, "Sol Ring", "hand", 1)[0]!;
  const name = s.players[1]!.name;
  await open(page, s);
  await expect(modal(page)).toContainText(`Perish the Thought: choose a card for ${name} to shuffle into their library`);
  await modal(page).locator(`[data-pick="${ring}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[ring]!.zone === "library");
  expect(after.players[1]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Lightning Bolt"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Stunted Growth on yourself: click three cards from your hand to put on top of your library", async ({ page }) => {
  const s0 = scene({ board: [...LANDS], hand: ["Stunted Growth", "Lightning Bolt", "Sol Ring", "Mind Stone", "Counterspell"] });
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Stunted Growth"), [{ kind: "player", id: 0 }])));
  expect(s.pending).toMatchObject({ kind: "handToTop", player: 0, count: 3 });
  const [bolt, ring, stone] = ["Lightning Bolt", "Sol Ring", "Mind Stone"].map((n) => one(s, n));
  await open(page, s);
  await expect(controls(page)).toContainText("Stunted Growth: click 3 cards to put on top of your library (first pick ends on top).");
  const put = controls(page).getByRole("button", { name: "Put on top" });
  await expect(put).toBeDisabled();
  for (const id of [stone, bolt, ring]) await page.locator(`[data-obj="${id}"]`).click();
  await put.click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.players[0]!.library.slice(0, 3)).toEqual([stone, bolt, ring]);
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Counterspell"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Imperial Edict cast at you: the prompt says your chosen creature is destroyed, and it is", async ({ page }) => {
  // The opponent's bot casts it on its turn (two Swamps: nothing else to cast); you're its only opponent with creatures.
  const s0 = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{ hand: ["Imperial Edict"], board: ["Swamp", "Swamp"] }]);
  const s = playWithBots(s0, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, action: "choose" });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await expect(controls(page)).toContainText("Imperial Edict: click a creature you control. Imperial Edict destroys it.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
