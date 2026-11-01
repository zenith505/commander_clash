// Lane B round B72: Clone Shell's imprint ("look at the top four cards of your library, exile one face down, then put
// the rest on the bottom of your library in any order"): pick one, then order the other three at the bottom. And Amy
// Pond ("choose a suspended card you own and remove that many time counters from it"): pick which suspended card.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, modal, resolveUntil } from "./ui";

test("Clone Shell: exile one of the top four face down, then order the other three on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Clone Shell"], board: LANDS, library: ["Grizzly Bears", "Opt", "Shock", "Divination"] });
  const [bears, opt, shock, div] = ["Grizzly Bears", "Opt", "Shock", "Divination"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Clone Shell", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([bears!, opt!, shock!, div!].sort());
  const pick = modal(page);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  expect(mid.objects[bears!]!.zone).toBe("exile");
  const order = mid.pending?.kind === "arrangeTop" ? mid.pending.cards : [];
  expect(mid.pending?.kind === "arrangeTop" && mid.pending.how).toBe("bottom");
  expect(new Set(order)).toEqual(new Set([opt, shock, div]));
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put 3 cards on the bottom of your library in any order");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[0]}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.library.slice(-3)).toEqual([order[1], order[0], order[2]]);
  expect(after.objects[bears!]!.zone).toBe("exile");
  expect(after.objects[bears!]!.hiddenExile).toBeDefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Amy Pond: combat damage to a player, then pick the suspended card that loses that many time counters", async ({ page }) => {
  const s = scene({ board: ["Amy Pond"], exile: ["Ancestral Vision", "Rift Bolt"] });
  const [amy, vision, bolt] = [one(s, "Amy Pond"), one(s, "Ancestral Vision"), one(s, "Rift Bolt")];
  s.objects[vision]!.counters.time = 4;
  s.objects[bolt]!.counters.time = 3;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[amy, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([vision, bolt].sort());
  const pick = modal(page);
  await expect(pick).toContainText("suspended card you own");
  await pick.locator(`[data-pick="${vision}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[vision]!.counters.time === 2);
  expect(after.objects[bolt]!.counters.time).toBe(3);
  expect(after.players[1]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});
