// Round 407 in the browser: The Flood of Mars's attack trigger aimed at an opponent's creature, Grub, Notorious Auntie's
// "you may blight 1" with the creature picked and its token copy attacking, Optimus Prime, Autobot Leader's bolster and
// convert, and Symbiote Spider-Man's Find New Host activated from the graveyard, then the gained trigger's pick.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

test("The Flood of Mars: it attacks, you target Ana's Grizzly Bears, and the Bears get a flood counter and become a copy of it", async ({ page }) => {
  const s = scene({ board: ["The Flood of Mars"] }, [{ board: ["Grizzly Bears"] }]);
  const [flood, bears] = [one(s, "The Flood of Mars"), one(s, "Grizzly Bears")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[flood, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".targeting")).toContainText("another target creature or land");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.counters.flood === 1);
  expect(ch(after, bears).name).toBe("The Flood of Mars");
  expect(ch(after, bears).keywords).toContain("Islandwalk");
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Grub, Notorious Auntie: blight 1 on Serra Angel, and a token copy of the Angel enters tapped and attacking Ana", async ({ page }) => {
  const s = scene({ board: ["Grub, Storied Matriarch // Grub, Notorious Auntie", "Serra Angel"] });
  const [grub, angel] = [one(s, "Grub, Storied Matriarch"), one(s, "Serra Angel")];
  s.objects[grub]!.face = 1; // transformed: Grub, Notorious Auntie
  invalidateCharacteristics(s);
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[grub, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Grub, Notorious Auntie: Blight 1?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await bar.getByRole("button", { name: "Put counter" }).click();
  // Three opponents: you choose whom the token attacks (CR 508.4).
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  const tok = after.battlefield.find((id) => after.objects[id]!.isToken)!;
  expect(ch(after, tok).name).toBe("Serra Angel");
  expect(after.objects[tok]!.tapped).toBe(true);
  expect(after.objects[tok]!.attacking).toBe(1);
  expect(after.objects[angel]!.counters["-1/-1"]).toBe(1);
  await expect(page.locator(`[data-obj="${angel}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Optimus Prime, Autobot Leader: you attack with Grizzly Bears, they bolster 2 and gain trample, and their combat damage converts Optimus", async ({ page }) => {
  const s = scene({ board: ["Optimus Prime, Hero // Optimus Prime, Autobot Leader", "Grizzly Bears"] });
  const [optimus, bears] = [one(s, "Optimus Prime, Hero"), one(s, "Grizzly Bears")];
  s.objects[optimus]!.face = 1; // converted: Optimus Prime, Autobot Leader
  invalidateCharacteristics(s);
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[bears, 1]]);
  const pumped = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.counters["+1/+1"] === 2);
  expect(ch(pumped, bears).keywords).toContain("Trample");
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 36);
  expect(after.objects[optimus]!.face ?? 0).toBe(0);
  expect(ch(after, optimus).name).toBe("Optimus Prime, Hero");
  expect(pageErrors(page)).toEqual([]);
});

test("Symbiote Spider-Man: Find New Host from your graveyard onto Grizzly Bears, which then deal 3 combat damage and you keep one of the top three cards", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears"], yard: ["Symbiote Spider-Man"], library: ["Lightning Bolt", "Divination", "Serra Angel"] });
  const [spidey, bears, bolt] = [one(s, "Symbiote Spider-Man"), one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Graveyard" }).click();
  await modal(page).locator(".card.playable", { hasText: "Symbiote Spider-Man" }).click();
  await menu(page).getByRole("button", { name: /Put a \+1\/\+1 counter on target creature you control/ }).click();
  await expect(page.locator(".targeting")).toContainText("target creature you control");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const hosted = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.counters["+1/+1"] === 1);
  expect(hosted.objects[spidey]!.zone).toBe("exile");
  await passTo(page, "declareAttackers");
  await attack(page, [[bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "hand");
  expect(after.players[1]!.life).toBe(37);
  expect(after.objects[one(s, "Divination")]!.zone).toBe("graveyard");
  expect(after.objects[one(s, "Serra Angel")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
