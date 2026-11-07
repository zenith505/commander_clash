// Round 298: Dauntless Bodyguard's "as it enters, choose another creature you control" (CR 614.12c), Game of Chaos's
// "flip again?" for the winner of each flip (the stakes doubling), and Squee's Revenge's number of coin flips.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Dauntless Bodyguard: as it enters you choose another creature you control; sacrificing it makes that creature indestructible", async ({ page }) => {
  const s = scene({ hand: ["Dauntless Bodyguard"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  const guard = one(s, "Dauntless Bodyguard");
  await open(page, s);
  await card(page, "Dauntless Bodyguard", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "chosenObject" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose another creature you control");
  await expect(bar.getByRole("button", { name: "Grizzly Bears", exact: true })).toHaveCount(1);
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  const entered = await resolveUntil(page, (st) => st.objects[guard]!.zone === "battlefield" && !st.pending && st.stack.length === 0);
  expect(entered.objects[guard]!.chosen?.object?.id).toBe(giant);
  // Its ability: sacrifice it, and the chosen creature gains indestructible until end of turn.
  await card(page, "Dauntless Bodyguard", entered).click();
  await menu(page).getByRole("button", { name: /Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[guard]!.zone === "graveyard");
  expect(after.log.some((l) => /Hill Giant gains indestructible/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Game of Chaos with Edgar: you win the first flip and decide not to flip again", async ({ page }) => {
  const s = scene({ hand: ["Game of Chaos"], board: [...LANDS, "Edgar, King of Figaro"] });
  await open(page, s);
  await card(page, "Game of Chaos", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText(/flip again for 2 life/i);
  await bar.getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.life).toBe(41);
  expect(after.players[1]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

test("Game of Chaos with Edgar: flipping again doubles the stakes", async ({ page }) => {
  const s = scene({ hand: ["Game of Chaos"], board: [...LANDS, "Edgar, King of Figaro"] });
  await open(page, s);
  await card(page, "Game of Chaos", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  // The second flip, for 2: won, you're asked again (for 4); lost, Ana is up 1 and stops.
  const next = await resolveUntil(page, (st) => (st.pending?.kind === "chooseMay" && st.pending.player === 0) || (st.stack.length === 0 && !st.pending));
  let after = next;
  if (next.pending) {
    await expect(bar).toContainText(/flip again for 4 life/i);
    await bar.getByRole("button", { name: "No" }).click();
    after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  }
  expect([43, 39]).toContain(after.players[0]!.life);
  expect(after.players[0]!.life + after.players[1]!.life).toBe(80);
  expect(pageErrors(page)).toEqual([]);
});

test("Squee's Revenge with Edgar: choose one flip, win it, and draw two cards", async ({ page }) => {
  const s = scene({ hand: ["Squee's Revenge"], board: [...LANDS, "Edgar, King of Figaro"] });
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Squee's Revenge", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a number of coin flips");
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: "Choose 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.hand).toHaveLength(hand - 1 + 2);
  expect(pageErrors(page)).toEqual([]);
});
