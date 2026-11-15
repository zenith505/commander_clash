// Lane B round B211 in the browser: Chromatic Armor's color as it enters and its {X} ability's new color, Call to Arms's
// color and opponent, the creature or land you move Nettlevine Blight onto at your end step, Strax, Sontaran Nurse's
// Grenades! with its fight target, and Merseine's ability on an opponent's Aura that only you, the creature's
// controller, may activate.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, power } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Chromatic Armor: red as it enters on your Grizzly Bears, then its {X} ability makes the last chosen color blue", async ({ page }) => {
  const s = scene({ hand: ["Chromatic Armor"], board: [...LANDS, "Grizzly Bears"] });
  const [armor, bears] = [one(s, "Chromatic Armor"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Chromatic Armor", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  await controls(page).locator('button[title="Red"]').click();
  const entered = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[armor]!.zone === "battlefield");
  expect(entered.objects[armor]!.chosen?.color).toBe("R");
  expect(entered.objects[armor]!.counters.sleight).toBe(1);
  await page.locator(`[data-obj="${armor}"]`).first().click({ position: { x: 6, y: 6 } });
  await menu(page).locator("button", { hasText: "Put a sleight counter on Chromatic Armor and choose a color" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  await controls(page).locator('button[title="Blue"]').click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[armor]!.chosen?.color === "U");
  expect(after.objects[armor]!.counters.sleight).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Call to Arms: you choose red and Ana, whose permanents are mostly red, and your Savannah Lions gets +1/+1", async ({ page }) => {
  const s = scene({ hand: ["Call to Arms"], board: [...LANDS, "Savannah Lions"] }, [{ board: ["Shivan Dragon", "Hill Giant", "Serra Angel"] }]);
  const [arms, lions] = [one(s, "Call to Arms"), one(s, "Savannah Lions")];
  await open(page, s);
  await card(page, "Call to Arms", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  await controls(page).locator('button[title="Red"]').click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "player" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[arms]!.chosen?.player === 1);
  expect(after.objects[arms]!.zone).toBe("battlefield");
  expect(after.objects[arms]!.chosen?.color).toBe("R");
  expect(power(after, after.objects[lions]!)).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Nettlevine Blight: at your end step you sacrifice your Grizzly Bears and move Ana's Aura onto your Llanowar Elves", async ({ page }) => {
  const s = scene({ board: ["Grizzly Bears", "Llanowar Elves", "Forest"] }, [{ board: ["Nettlevine Blight"] }]);
  const [blight, bears, elves] = [one(s, "Nettlevine Blight"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  s.objects[blight]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant" && st.pending.player === 0, 80);
  expect(asked.objects[bears]!.zone).toBe("graveyard");
  const bar = controls(page);
  await expect(bar).toContainText("choose creature or land you control to attach Nettlevine Blight to");
  await bar.getByRole("button", { name: "Llanowar Elves", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[blight]!.attachedTo === elves);
  expect(after.objects[blight]!.controller).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Strax, Sontaran Nurse: Grenades! sacrifices your Sol Ring, a player is chosen at random, and Strax fights the creature of theirs you target", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Strax, Sontaran Nurse", "Sol Ring", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }, { board: ["Hill Giant"] }, { board: ["Hill Giant"] }]);
  const [strax, ring] = [one(s, "Strax, Sontaran Nurse"), one(s, "Sol Ring")];
  await open(page, s);
  await page.locator(`[data-obj="${strax}"]`).first().click();
  await menu(page).locator("button", { hasText: "Grenades!" }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice an artifact" });
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const spec = (asked.pending as { specs: { controlledBy?: number }[] }).specs[0]!;
  expect(spec.controlledBy).toBeDefined();
  const victim = asked.battlefield.find((id) => id !== strax && asked.objects[id]!.controller === spec.controlledBy && ["Grizzly Bears", "Hill Giant"].includes(asked.cards[asked.objects[id]!.cardId]!.name))!;
  await page.locator(`[data-obj="${victim}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[victim]!.zone === "graveyard");
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(after.objects[strax]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Merseine: Ana's Aura holds your Grizzly Bears tapped, and you pay its mana cost to remove a net counter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Merseine"] }]);
  const [merseine, bears] = [one(s, "Merseine"), one(s, "Grizzly Bears")];
  s.objects[merseine]!.attachedTo = bears;
  s.objects[merseine]!.counters = { net: 3 };
  s.objects[bears]!.tapped = true;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${merseine}"]`).first().click({ position: { x: 6, y: 6 } });
  const button = menu(page).locator("button", { hasText: "Remove a net counter from Merseine" });
  await expect(button).toBeEnabled();
  await button.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[merseine]!.counters.net === 2);
  expect(after.objects[merseine]!.controller).toBe(1);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
