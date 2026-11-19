// Round 420 in the browser: Kotose, the Silent Spider exiling Ana's Lightning Bolts (the target in her graveyard and the
// one in her hand found by the search), then one cast from exile with Swamps only; Allure of the Unknown, where you choose
// Ana, she exiles one of your revealed cards and casts it; Ana's Allure, where you pick the card and cast it for free;
// and Cloak and Dagger, Entwined, exiling Ana's chosen creature from the picker that holds her hand too.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, playWithBots, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

const SWAMPS = ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Island"];

test("Kotose, the Silent Spider: exiles Ana's graveyard Bolt and the one in her hand, then you cast one of them with a Swamp", async ({ page }) => {
  const s = scene({ hand: ["Kotose, the Silent Spider"], board: SWAMPS }, [{ yard: ["Lightning Bolt"], hand: ["Lightning Bolt"] }]);
  const [yardBolt, handBolt] = [s.players[1]!.graveyard[0]!, s.players[1]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Lightning Bolt")!];
  await open(page, s);
  await card(page, "Kotose, the Silent Spider", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".targeting", { hasText: "Kotose" })).toBeVisible();
  await modal(page).locator(`[data-pick="${yardBolt}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await expect(modal(page)).toContainText("Lightning Bolt");
  await modal(page).locator(`[data-pick="${handBolt}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[handBolt]!.zone === "exile");
  expect(after.objects[yardBolt]!.zone).toBe("exile");
  expect(after.objects[yardBolt]!.mayPlay).toMatchObject({ player: 0, until: "whileControlled", anyColor: true });
  // Cast Ana's Bolt from exile at Ana, with a Swamp's black mana (CR 609.4b).
  const life = after.players[1]!.life;
  // Ana's exile, where her cards are, shows a card you may play.
  const exile = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-title")).toHaveText("Exile ✦");
  await exile.click();
  await expect(modal(page)).toContainText("Ana's exile");
  await expect(modal(page).locator(".card.playable")).toHaveCount(2);
  await modal(page).locator(".card.playable").first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await clickPlayer(page, 1);
  const cast = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  // The one cast went to Ana's graveyard; the other stays in exile.
  expect([cast.objects[yardBolt]!.zone, cast.objects[handBolt]!.zone].sort()).toEqual(["exile", "graveyard"]);
  // One of them only: the other stays in exile, no longer playable.
  expect(cast.oneOfUsed).toContain(after.objects[handBolt]!.mayPlay!.oneOf);
  expect(pageErrors(page)).toEqual([]);
});

test("Allure of the Unknown: you choose Ana, who exiles your Hill Giant and casts it; you take the rest", async ({ page }) => {
  const s = scene({ hand: ["Allure of the Unknown"], board: LANDS, library: ["Hill Giant", "Plains", "Plains", "Plains", "Plains", "Plains"] }, [{}, {}, {}]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Allure of the Unknown", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose an opponent to exile a nonland card and cast it");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(controllerOf(after, after.objects[giant]!)).toBe(1);
  expect(after.objects[giant]!.owner).toBe(0);
  expect(after.players[0]!.hand.length).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Allure of the Unknown cast by Ana: you pick which of her revealed cards to exile, then cast it for free", async ({ page }) => {
  const s0 = scene({}, [{ hand: ["Allure of the Unknown"], board: LANDS, library: ["Plains", "Hill Giant", "Grizzly Bears", "Plains", "Plains", "Plains", "Plains"] }]);
  const [giant, bears] = [one(s0, "Hill Giant"), one(s0, "Grizzly Bears")];
  // Ben and Cy have left the game, so Ana's Allure chooses you.
  for (const p of [2, 3]) s0.players[p]!.lost = true;
  // Ana draws the first Plains on her turn, casts Allure and chooses you; your pick comes up.
  const s = playWithBots(s0, (st) => (st.pending?.kind === "searchLibrary" || st.pending?.kind === "castFree") && st.pending.player === 0);
  await open(page, s);
  await expect(modal(page)).toContainText("Hill Giant");
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Hill Giant");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(controllerOf(after, after.objects[giant]!)).toBe(0);
  expect(after.objects[giant]!.owner).toBe(1);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Cloak and Dagger, Entwined: target Ana and her Grizzly Bears; from her revealed hand and the Bears you exile the Bears", async ({ page }) => {
  const s = scene({ hand: ["Cloak and Dagger, Entwined"], board: LANDS }, [{ hand: ["Lightning Bolt", "Forest"], board: ["Grizzly Bears"] }]);
  const [bears, bolt] = [one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Cloak and Dagger, Entwined", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".targeting", { hasText: "Cloak and Dagger" })).toBeVisible();
  await clickPlayer(page, 1);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Ana's hand and the chosen creature");
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${bears}"]`)).toContainText("battlefield");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  let seen = await state(page);
  await expect.poll(async () => (seen = await state(page)).objects[bears]!.zone).toBe("exile");
  expect(seen.objects[bolt]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
