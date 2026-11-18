// Round 412 in the browser: Xanathar, Guild Kingpin's target opponent at your upkeep, then the top card of their library
// shown to you in their seat and played from there (a spell paid with mana of the wrong color, then a land, Wastes), and Sen
// Triplets' target opponent, whose revealed hand you open and play a land (Wastes) and a spell from.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, menu, modal, resolveUntil, seat } from "./ui";

const SWAMPS = ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp"];

test("Xanathar, Guild Kingpin: target Ana at your upkeep, then cast Serra Angel from the top of her library with Swamps and play her Wastes", async ({ page }) => {
  // Ana and Ben each draw a Mountain on their turns, so the Angel and the Giant are on top at your next upkeep.
  const s0 = scene({ board: [...SWAMPS, "Xanathar, Guild Kingpin"] }, [{ library: ["Mountain", "Serra Angel", "Wastes"] }, { library: ["Mountain", "Hill Giant"] }, {}]);
  const [angel, wastes, giant] = [one(s0, "Serra Angel"), one(s0, "Wastes"), one(s0, "Hill Giant")];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await expect(page.locator(".targeting", { hasText: "Xanathar" })).toBeVisible();
  await clickPlayer(page, 1);
  const main = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && st.stack.length === 0 && !st.pending);
  expect(main.topTurn?.[0]).toMatchObject({ player: 0, of: 1, anyColor: true });
  expect([main.players[1]!.library[0], main.players[2]!.library[0]]).toEqual([angel, giant]);
  expect(main.log.map((l) => l.text).join("\n")).toContain("Ana can't cast spells this turn.");
  // Ana's top card is shown in her seat, playable; Ben's stays hidden.
  const library = seat(page, 1).locator(".zone", { hasText: "Library" });
  await expect(library.locator(`[data-obj="${angel}"]`)).toBeVisible();
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  await expect(seat(page, 2).locator(`[data-obj="${giant}"]`)).toHaveCount(0);
  await library.locator(`[data-obj="${angel}"]`).click();
  const cast = await resolveUntil(page, (st) => st.objects[angel]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(controllerOf(cast, cast.objects[angel]!)).toBe(0);
  expect(cast.objects[angel]!.owner).toBe(1);
  // Then her Wastes, with your land play.
  await expect(library.locator(`[data-obj="${wastes}"]`)).toBeVisible();
  await library.locator(`[data-obj="${wastes}"]`).click();
  const played = await resolveUntil(page, (st) => st.objects[wastes]!.zone === "battlefield");
  expect(controllerOf(played, played.objects[wastes]!)).toBe(0);
  expect(played.players[0]!.landsPlayedThisTurn).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Sen Triplets: target Ana at your upkeep, then open her revealed hand and play her Wastes and cast her Serra Angel", async ({ page }) => {
  const s0 = scene({ board: ["Plains", "Plains", "Swamp", "Swamp", "Swamp", "Sen Triplets"] }, [{ hand: ["Serra Angel", "Wastes"] }, {}, {}]);
  const [angel, wastes] = [one(s0, "Serra Angel"), one(s0, "Wastes")];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await expect(page.locator(".targeting", { hasText: "Sen Triplets" })).toBeVisible();
  await clickPlayer(page, 1);
  const main = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && st.stack.length === 0 && !st.pending);
  expect(main.handTurn?.[0]).toMatchObject({ player: 0, of: 1 });
  expect(main.log.map((l) => l.text).join("\n")).toContain("Ana can't activate abilities this turn.");
  // Her hand is revealed, with cards you may play.
  const peek = seat(page, 1).locator("button.hand-peek");
  await expect(peek).toContainText("✦");
  await peek.click();
  await expect(modal(page)).toContainText("Ana's revealed hand");
  await modal(page).locator(".card.playable", { hasText: "Wastes" }).click();
  await menu(page).getByRole("button", { name: /^Play it/ }).click();
  const played = await resolveUntil(page, (st) => st.objects[wastes]!.zone === "battlefield");
  expect(controllerOf(played, played.objects[wastes]!)).toBe(0);
  await seat(page, 1).locator("button.hand-peek").click();
  await modal(page).locator(".card.playable", { hasText: "Serra Angel" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  const cast = await resolveUntil(page, (st) => st.objects[angel]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(controllerOf(cast, cast.objects[angel]!)).toBe(0);
  expect(cast.objects[angel]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
