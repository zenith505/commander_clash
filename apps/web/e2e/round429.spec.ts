// Round 429: Bloodthirsty Adversary (pay {2}{R} how many times, then up to that many instant and sorcery cards from your
// graveyard as targets, the copies cast for free), Metamorphic Alteration (as it enters you choose any player's creature
// for what it enchants to copy) and Evelyn, the Covetous (cast Ana's Lightning Bolt exiled with a collection counter,
// paying with an Island; once each turn).
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Bloodthirsty Adversary: pay {2}{R} once, target Lightning Bolt in your graveyard, cast its copy for free", async ({ page }) => {
  const s = scene({ hand: ["Bloodthirsty Adversary"], board: LANDS, yard: ["Lightning Bolt", "Divination", "Hill Giant"] });
  const [adv, bolt, div] = [one(s, "Bloodthirsty Adversary"), one(s, "Lightning Bolt"), one(s, "Divination")];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Bloodthirsty Adversary", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payX" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("pay {2}{R} how many times?");
  await bar.getByRole("button", { name: "1 time ({2}{R})" }).click();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  // Up to one target: the first pick is all of them; the creature card isn't offered.
  await expect(modal(page).locator(`[data-pick="${one(s, "Hill Giant")}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  expect(asked.objects[adv]!.counters["+1/+1"]).toBe(1);
  expect([asked.objects[bolt]!.zone, asked.objects[div]!.zone]).toEqual(["exile", "graveyard"]);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  // The card stays exiled; what was cast was a copy.
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Metamorphic Alteration: enchant your Grizzly Bears, choose Ana's Hill Giant: the Bears are a copy of it", async ({ page }) => {
  const s = scene({ hand: ["Metamorphic Alteration"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [aura, bears, giant] = [one(s, "Metamorphic Alteration"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Metamorphic Alteration", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "chosenObject" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature");
  await expect(bar.getByRole("button", { name: "Grizzly Bears", exact: true })).toHaveCount(1);
  await bar.getByRole("button", { name: /^Hill Giant/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[aura]!.zone === "battlefield" && !st.pending && st.stack.length === 0 && !!st.objects[bears]!.copyEffects?.length);
  expect(after.objects[aura]!.attachedTo).toBe(bears);
  expect(after.objects[aura]!.chosen?.object?.id).toBe(giant);
  expect(after.log.some((l) => /Grizzly Bears is a copy of Hill Giant/.test(l.text))).toBe(true);
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Evelyn, the Covetous: cast Ana's Lightning Bolt exiled with a collection counter, paying with an Island; then not her Forest", async ({ page }) => {
  const s = scene({ board: ["Evelyn, the Covetous", "Island"] }, [{ exile: ["Lightning Bolt", "Forest"] }]);
  const [bolt, forest] = [one(s, "Lightning Bolt"), idsOf(s, "Forest", "exile", 1)[0]!];
  for (const id of [bolt, forest]) {
    s.objects[id]!.counters = { collection: 1 };
    s.objects[id]!.exiledByPlayer = 0;
  }
  const life = s.players[1]!.life;
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await theirs.click();
  await expect(modal(page).locator(".card.playable", { hasText: "Forest" })).toHaveCount(1);
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await clickPlayer(page, 1);
  const cast = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(cast.players[1]!.life).toBe(life - 3);
  // Once each turn: the Forest can't be played now.
  await theirs.click();
  await expect(modal(page).locator(".card", { hasText: "Forest" })).toHaveCount(1);
  await expect(modal(page).locator(".card.playable", { hasText: "Forest" })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
