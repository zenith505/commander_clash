// Round 91's prompts: a Pact's pay-or-lose-the-game at your next upkeep, Culling Ritual's choice of mana, and abilities
// that work from your hand (Simian Spirit Guide's mana, Talon Gates of Madara putting itself onto the battlefield).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Pact of the Titan: a Giant now, then Pay {4}{R} at your next upkeep or lose the game", async ({ page }) => {
  const s = scene({ hand: ["Pact of the Titan"], board: LANDS });
  await open(page, s);
  await card(page, "Pact of the Titan", s).click();
  const giants = (st: typeof s) => st.battlefield.filter((id) => st.objects[id]!.controller === 0 && st.cards[st.objects[id]!.cardId]!.name === "Giant Token").length;
  await resolveUntil(page, (st) => st.stack.length === 0 && giants(st) === 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, 400);
  const bar = controls(page);
  await expect(bar).toContainText("Pact of the Titan:");
  await expect(bar).toContainText("or lose the game?");
  await expect(bar.getByRole("button")).toHaveText(["Pay", "Don't pay"]);
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.step !== "upkeep");
  expect(after.players[0]!.lost ?? false).toBe(false);
  // Five lands paid for it.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Culling Ritual: a button for each way to split the mana", async ({ page }) => {
  const s = scene({ hand: ["Culling Ritual"], board: [...LANDS, "Grizzly Bears", "Grizzly Bears"] });
  await open(page, s);
  await card(page, "Culling Ritual", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const bar = controls(page);
  await expect(bar).toContainText("Culling Ritual:");
  await expect(bar.getByRole("button")).toHaveText(["Add {B}{B}", "Add {B}{G}", "Add {G}{G}"]);
  await bar.getByRole("button", { name: "Add {B}{G}" }).click();
  await expect.poll(async () => {
    const st = await state(page);
    return [st.players[0]!.manaPool.B, st.players[0]!.manaPool.G];
  }).toEqual([1, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Simian Spirit Guide: exile it from your hand for {R}", async ({ page }) => {
  const s = scene({ hand: ["Simian Spirit Guide"], board: ["Forest"] });
  const guide = one(s, "Simian Spirit Guide");
  await open(page, s);
  await card(page, "Simian Spirit Guide", s).click();
  await menu(page).getByRole("button", { name: /from your hand/ }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.R).toBe(1);
  const after = await state(page);
  expect(after.objects[guide]!.zone).toBe("exile");
  expect(after.stack).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Talon Gates of Madara: {4} from your hand puts it onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Talon Gates of Madara"], board: LANDS });
  const gates = one(s, "Talon Gates of Madara");
  await open(page, s);
  await card(page, "Talon Gates of Madara", s).click();
  await menu(page).getByRole("button", { name: /Put Talon Gates of Madara from your hand onto the battlefield/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[gates]!.zone === "battlefield" && st.stack.length === 0 && (!st.pending || st.pending.kind === "chooseTargets"));
  // Not a land play.
  expect(after.players[0]!.landsPlayedThisTurn).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
