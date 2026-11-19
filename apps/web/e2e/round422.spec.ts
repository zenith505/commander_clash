// Round 422 in the browser: Possibility Storm exiling your Divination and the cards down to the next sorcery, which you
// cast for free; Knowledge Pool, cast, then a Divination from your hand exiled and Ana's Lightning Bolt cast from among
// the cards exiled with it; Ashnod the Uncaring copying a Mogg Fanatic's ability that sacrificed it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Possibility Storm: Divination is exiled, then cards down to the next sorcery, which you cast for free", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Possibility Storm"], library: ["Lightning Bolt", "Mind Stone", "Divination"] });
  const ids = s.players[0]!.library.slice(0, 3);
  const cast = s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Divination")!;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Divination");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ids[2]!]!.zone === "graveyard");
  // The free Divination drew two; the one cast from your hand, the Bolt and the Mind Stone are at the bottom.
  expect(after.players[0]!.hand.length).toBe(hand - 1 + 2);
  const lib = after.players[0]!.library;
  for (const id of [cast, ids[0]!, ids[1]!]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Knowledge Pool: your Divination is exiled and you cast Ana's Lightning Bolt from among the cards exiled with it", async ({ page }) => {
  const s = scene({ hand: ["Knowledge Pool", "Divination"], board: [...LANDS, "Island", "Island", "Island", "Island"], library: ["Plains", "Plains", "Plains"] }, [{ library: ["Lightning Bolt", "Grizzly Bears", "Plains"] }]);
  const bolt = one(s, "Lightning Bolt");
  const div = one(s, "Divination");
  await open(page, s);
  await card(page, "Knowledge Pool", s).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => (st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong") || st.pending?.kind === "castFree");
  const bar = controls(page);
  // The Divination just exiled isn't offered; the Bolt and the Bears are.
  await expect(bar.getByRole("button", { name: "Divination" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const life = s.players[1]!.life;
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(after.objects[div]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Ashnod the Uncaring: Mogg Fanatic sacrificed for its ability, copied; Ana takes 2", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ashnod the Uncaring", "Mogg Fanatic"] });
  const fanatic = one(s, "Mogg Fanatic");
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${fanatic}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "damage" });
  if (await item.count()) await item.first().click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Ashnod the Uncaring: Copy that ability?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 2);
  expect(after.objects[fanatic]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
