// Round 441: Wayta, Trainer Prodigy (its fight, targeting two creatures you control, costs only {G}; Ripjaw Raptor dealt
// damage draws two cards) and The Myriad Pools (tapped for {U} to cast Grizzly Bears: you click Sol Ring, which becomes a
// Grizzly Bears until end of turn).
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Wayta, Trainer Prodigy: Ripjaw Raptor fights your Grizzly Bears for {G}, and its enrage draws two cards", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Wayta, Trainer Prodigy", "Ripjaw Raptor", "Grizzly Bears"] });
  const [wayta, raptor, bears] = [one(s, "Wayta, Trainer Prodigy"), one(s, "Ripjaw Raptor"), one(s, "Grizzly Bears")];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${wayta}"]`).click();
  const item = menu(page).getByRole("button", { name: /fights another target creature/ });
  if (await item.count()) await item.first().click();
  await page.locator(`[data-obj="${raptor}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st: GameState) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[raptor]!.damage).toBe(2);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  // {2} less: only one land tapped, for {G}.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped && after.cards[after.objects[id]!.cardId]!.types.includes("Land")).length).toBe(1);
  expect(after.objects[wayta]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("The Myriad Pools: tap it for {U}, cast Grizzly Bears, click Sol Ring, and Sol Ring is a Grizzly Bears this turn", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "The Everflowing Well // The Myriad Pools", "Sol Ring"] });
  const [pools, ring, bears] = [one(s, "The Everflowing Well"), one(s, "Sol Ring"), one(s, "Grizzly Bears")];
  s.objects[pools]!.face = 1; // transformed
  await open(page, s);
  await page.locator(`[data-obj="${pools}"]`).click();
  // A land with one mana ability taps for it on the click; a menu, if one opens, offers it.
  const add = menu(page).getByRole("button", { name: /: add U$/ });
  if (await add.count()) await add.click();
  await resolveUntil(page, (st) => st.players[0]!.manaPool.U === 1);
  await card(page, "Grizzly Bears", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".targeting")).toContainText("becomes a copy of that spell");
  await page.locator(`[data-obj="${ring}"]`).click();
  const copied = await resolveUntil(page, (st) => !st.stack.some((x) => x.kind === "ability") && !st.triggerQueue.length && characteristics(st, st.objects[ring]!).name === "Grizzly Bears");
  expect(characteristics(copied, copied.objects[ring]!).types).toEqual(["Creature"]);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(characteristics(after, after.objects[ring]!).name).toBe("Grizzly Bears");
  expect(pageErrors(page)).toEqual([]);
});
