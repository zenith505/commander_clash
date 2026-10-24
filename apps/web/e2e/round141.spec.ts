// Round 141: Hunting Velociraptor gives Dinosaur spells a Prowl button once a Dinosaur hit a player this turn,
// Metalworker's mana buttons say how many artifact cards they reveal, and Nils's end-step trigger picks one creature
// for each player, you included.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Hunting Velociraptor: Carnage Tyrant's Prowl button is greyed out until a Dinosaur of yours dealt combat damage", async ({ page }) => {
  const s = scene({ hand: ["Carnage Tyrant"], board: ["Hunting Velociraptor", "Mountain", "Mountain", "Mountain"] });
  const tyrant = one(s, "Carnage Tyrant");
  await open(page, s);
  await card(page, "Carnage Tyrant", s).click();
  await expect(menu(page).getByRole("button", { name: /^Prowl/ })).toBeDisabled();
  // Now a Dinosaur of yours has dealt a player combat damage this turn.
  const t = structuredClone(s);
  t.turnLog = { ...t.turnLog, combatDamageTypesBy: { 0: ["Dinosaur"] } };
  await open(page, t);
  await card(page, "Carnage Tyrant", t).click();
  const prowl = menu(page).getByRole("button", { name: /^Prowl/ });
  await expect(prowl).toBeEnabled();
  await prowl.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[tyrant]!.zone === "battlefield");
  // Paid {2}{R} with the three Mountains.
  expect(Object.values(after.objects).filter((o) => o.zone === "battlefield" && o.owner === 0 && o.tapped)).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Metalworker: one mana button for each number of artifact cards revealed", async ({ page }) => {
  const s = scene({ hand: ["Sol Ring", "Ornithopter"], board: ["Metalworker"] });
  await open(page, s);
  await card(page, "Metalworker", s).click();
  const m = menu(page);
  await expect(m.getByRole("button", { name: /reveal 1 artifact card: add/ })).toHaveCount(1);
  await m.getByRole("button", { name: /reveal 2 artifact cards: add/ }).click();
  await expect.poll(async () => Object.values((await state(page)).players[0]!.manaPool).reduce((a, b) => a + b, 0)).toBe(4);
  const after = await state(page);
  expect(after.log.some((l) => /reveals Sol Ring, Ornithopter for Metalworker|reveals Ornithopter, Sol Ring for Metalworker/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Nils, Discipline Enforcer: at your end step, up to one creature for each player, in any order", async ({ page }) => {
  const s = scene({ board: ["Nils, Discipline Enforcer", "Grizzly Bears"] }, [{ board: ["Llanowar Elves"] }, {}, { board: ["Hill Giant"] }], { step: "main2" });
  const [bears, elves, giant] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" || st.step === "end");
  const panel = page.locator(".targeting", { hasText: "Nils" });
  await expect(panel).toContainText("one for each player: You —, Ana —, Ben —, Cy —");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(panel).toContainText("You Grizzly Bears, Ana —, Ben —, Cy Hill Giant");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && (st.objects[bears]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[elves]!.counters["+1/+1"]).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
