// Round 110's prompts: The Great Work's chapter III lets you cast an instant from an opponent's graveyard (their
// graveyard shows it as playable; it's exiled instead of going to a graveyard), and Abundance's "Reveal until a land /
// nonland card" buttons on each draw, with the other revealed cards ordered on the bottom of your library.
import { expect, test } from "@playwright/test";
import { type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("The Great Work, chapter III: cast Ana's Lightning Bolt from her graveyard at her; it's exiled", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Urabrask // The Great Work"] }, [{ yard: ["Lightning Bolt"] }]);
  const [u, bolt] = [one(s, "Urabrask"), one(s, "Lightning Bolt")];
  s.objects[u]!.face = 1;
  s.objects[u]!.counters.lore = 2;
  // Round the table to your next main phase: chapter III resolves after your draw step.
  const start = s.turn;
  s = playWithBots(s, (st) => st.turn > start && st.activePlayer === 0 && st.step === "main1" && st.stack.length === 0 && !st.pending && st.priority === 0);
  expect(s.graveyardTurn?.some((g) => g.anyGraveyard && g.player === 0)).toBe(true);
  const life = s.players[1]!.life;
  await open(page, s);
  await expect(page.locator('[data-graveyard="1"] .zone-title')).toHaveText("Graveyard ✦");
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  await menu(page).locator("button", { hasText: "Cast from graveyard" }).click();
  await clickPlayer(page, 1);
  // Urabrask's cast trigger: 1 damage to target opponent.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.stack.some((i) => i.objectId === bolt));
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  // 3 from the Bolt and 1 from Urabrask, back on its front face.
  expect(after.players[1]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Abundance: Divination's first draw reveals until a land, the others go to the bottom in your order; the second is drawn", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Abundance"], library: ["Shock", "Opt", "Forest", "Hill Giant"] });
  const [shock, opt, giant] = [one(s, "Shock"), one(s, "Opt"), one(s, "Hill Giant")];
  const forest = s.players[0]!.library[2]!;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "dredge" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Abundance: draw a card, or instead reveal cards");
  await expect(bar).toContainText("(2 draws left)");
  await bar.getByRole("button", { name: "Reveal until a land card" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "orderLibrary");
  expect(st.objects[forest]!.zone).toBe("hand");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Abundance");
  const start = st.pending?.kind === "orderLibrary" ? st.pending.cards : [];
  expect(new Set(start)).toEqual(new Set([shock, opt]));
  await arrange.getByRole("button", { name: "Done" }).click();
  // The second draw: draw it.
  await resolveUntil(page, (x) => x.pending?.kind === "dredge" && x.pending.left === 1);
  await bar.getByRole("button", { name: "Draw", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.players[0]!.library.slice(-2)).toEqual(start);
  expect(pageErrors(page)).toEqual([]);
});
