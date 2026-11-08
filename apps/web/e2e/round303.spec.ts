// Round 303's prompts: Phyrexian Dreadnought's "sacrifice any number of creatures with total power 12 or greater"
// (the button held back below 12, the running total shown), Contractual Safeguard's creature and kind of counter,
// Bounty of Skemfar's land onto the battlefield then Elf card into your hand, and Cursecloth Wrappings' embalm
// granted to a creature card in your graveyard, on the graveyard's menu.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planActivate, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil, seat } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Phyrexian Dreadnought: Yes, then 8 power isn't enough; Colossal Dreadmaw and Craw Wurm are sacrificed and it stays", async ({ page }) => {
  const s0 = scene({ hand: ["Phyrexian Dreadnought"], board: [...LANDS, "Colossal Dreadmaw", "Craw Wurm", "Grizzly Bears"] });
  const [dread, dreadmaw, wurm, bears] = [one(s0, "Phyrexian Dreadnought"), one(s0, "Colossal Dreadmaw"), one(s0, "Craw Wurm"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, dread)));
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ action: "sacrifice", minTotalPower: 12 });
  await expect(bar).toContainText("sacrifice any number of your creatures with total power 12 or greater");
  await page.locator(`[data-obj="${dreadmaw}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("(total power now 8)");
  await expect(bar.getByRole("button", { name: "Sacrifice", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${wurm}"]`).click();
  await expect(bar).toContainText("(total power now 12)");
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[wurm]!.zone === "graveyard");
  expect([dread, dreadmaw, bears].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Contractual Safeguard: a shield counter on Grizzly Bears, then Hill Giant's flying counter onto each other creature", async ({ page }) => {
  const s0 = scene({ hand: ["Contractual Safeguard"], board: [...LANDS, "Grizzly Bears", "Hill Giant", "Llanowar Elves"] });
  const [bears, giant, elves] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Llanowar Elves")];
  s0.objects[giant]!.counters = { "+1/+1": 1, flying: 1 };
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Contractual Safeguard"))));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "counters", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: /^(Done|Choose|Put)/ }).first().click();
  const choosing = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "choose");
  expect([...(choosing.pending as { options: string[] }).options].sort()).toEqual([bears, giant].sort());
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: /^(Done|Choose)/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind");
  await bar.getByRole("button", { name: "A flying counter", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[elves]!.counters.flying === 1);
  expect(after.objects[bears]!.counters).toMatchObject({ shield: 1, flying: 1 });
  expect(after.objects[giant]!.counters).toMatchObject({ "+1/+1": 1, flying: 1 });
  expect(characteristics(after, after.objects[elves]!).keywords).toContain("Flying");
  expect(pageErrors(page)).toEqual([]);
});

test("Bounty of Skemfar: Forest onto the battlefield tapped, then Llanowar Elves into your hand; Hill Giant can't be taken", async ({ page }) => {
  const s0 = scene({ hand: ["Bounty of Skemfar"], board: LANDS, library: ["Hill Giant", "Llanowar Elves", "Forest", "Grizzly Bears", "Island", "Mountain"] });
  const [giant, elves, forest] = [one(s0, "Hill Giant"), one(s0, "Llanowar Elves"), s0.players[0]!.library[2]!];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Bounty of Skemfar"))));
  expect(s.pending?.player).toBe(0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/\bdim\b/);
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.objects[forest]!.zone === "battlefield" && st.pending?.player === 0);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/\bdim\b/);
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[elves]!.zone === "hand");
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.players[0]!.library.slice(-4)).toContain(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Cursecloth Wrappings: Grizzly Bears in your graveyard gains embalm; the graveyard's menu makes a 3/3 white Zombie token", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Cursecloth Wrappings"], yard: ["Grizzly Bears"] });
  const [wraps, bears] = [one(s0, "Cursecloth Wrappings"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planActivate(s0, 0, wraps, 0, [{ kind: "object", id: bears }])));
  expect(s.pending).toBeNull();
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Graveyard" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Embalm/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  const tok = after.battlefield.find((id) => after.objects[id]!.isToken && characteristics(after, after.objects[id]!).name === "Grizzly Bears")!;
  const ch = characteristics(after, after.objects[tok]!);
  expect(ch.colors).toEqual(["W"]);
  expect(ch.subtypes).toContain("Zombie");
  expect(`${ch.power}/${ch.toughness}`).toBe("3/3");
  expect(pageErrors(page)).toEqual([]);
});
