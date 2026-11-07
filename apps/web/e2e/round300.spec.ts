// Round 300 in the browser: an {X} in an alternative cost the mana cost doesn't have (CR 107.3a) is asked for as the
// card is cast that way: From Under the Floorboards' "Madness {X}{B}{B}" and Starnheim Unleashed's "Foretell {X}{X}{W}".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("From Under the Floorboards: discarded, cast for its madness cost with X = 2: two tapped Zombies and 2 life", async ({ page }) => {
  const s = scene({ hand: ["Faithless Looting", "From Under the Floorboards", "Hill Giant"], board: LANDS, library: ["Shock", "Opt"] });
  const [boards, giant] = [one(s, "From Under the Floorboards"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Faithless Looting", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard");
  const bar = controls(page);
  await card(page, "From Under the Floorboards", s).click();
  await card(page, "Hill Giant", s).click();
  await bar.getByRole("button", { name: "Discard" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === boards);
  await bar.getByRole("button", { name: "Cast it" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await expect(x).toContainText("From Under the Floorboards XBB: choose X");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[boards]!.zone === "graveyard");
  const zombies = after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.cards[after.objects[id]!.cardId]!.name === "Zombie Token");
  expect(zombies).toHaveLength(2);
  expect(zombies.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(after.players[0]!.life).toBe(s.players[0]!.life + 2);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Starnheim Unleashed: foretold, then cast for {X}{X}{W} with X = 2 on your next turn: two Angel Warriors", async ({ page }) => {
  const s = scene({ hand: ["Starnheim Unleashed"], board: LANDS });
  const starn = one(s, "Starnheim Unleashed");
  await open(page, s);
  await card(page, "Starnheim Unleashed", s).click();
  await menu(page).getByRole("button", { name: /^Foretell/ }).click();
  const now = await resolveUntil(page, (st) => !!st.objects[starn]!.foretold);
  // On to your next turn's main phase, in the engine (for speed).
  await open(page, playUntil(now, (st) => st.step === "main1" && st.activePlayer === 0 && st.turn === s.turn + 4 && !st.stack.length && !st.pending));
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /Cast it for its foretell cost/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await expect(x).toContainText("Starnheim Unleashed XXW: choose X");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[starn]!.zone === "graveyard");
  const angels = after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.cards[after.objects[id]!.cardId]!.name === "Angel Warrior Token");
  expect(angels).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
