// Round 417 in the browser: Lodestone Bauble activated with no target asks for the player who draws (its ruling: "If you
// choose zero targets, you still choose a player"), and with targets from Ana's graveyard puts them on her library and
// she draws at her upkeep; Arcee, Sharpshooter's X counters removed for that much damage, then the Acrobatic Coupe
// trigger counting the creatures you control a spell targets; Helm of Kaldra's Kaldra token with all three Equipment.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

const ARCEE = "Arcee, Sharpshooter // Arcee, Acrobatic Coupe";
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
/** Ana drew at the beginning of her upkeep: the log says so in that step of her turn. */
const anaDrewAtUpkeep = (s: GameState, turn: number) => s.log.some((e) => e.turn === turn && e.step === "upkeep" && /^Ana draws/.test(e.text));

test("Lodestone Bauble: no target, then choose Ana in the player picker; Ana draws at her upkeep", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Lodestone Bauble"] });
  const bauble = one(s, "Lodestone Bauble");
  await open(page, s);
  await page.locator(`[data-obj="${bauble}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Put up to four target basic land cards" }).click();
  // No graveyard has a basic land card: close the empty graveyard picker, choosing no target.
  await modal(page).getByRole("button", { name: "Done" }).click();
  await expect(modal(page)).toHaveCount(0);
  const pick = page.locator(".x-opponent-pick");
  await expect(pick).toContainText("Lodestone Bauble");
  await expect(pick).toContainText("choose a player, who draws a card at the beginning of the next turn's upkeep");
  await expect(pick.getByRole("button", { name: "You", exact: true })).toHaveCount(1);
  await pick.getByRole("button", { name: "Ana", exact: true }).click();
  const gone = await resolveUntil(page, (st) => st.objects[bauble]!.zone === "graveyard" && st.stack.length === 0 && !st.pending);
  const turn = gone.turn + 1;
  const after = await resolveUntil(page, (st) => st.activePlayer === 1 && st.turn === turn && st.step !== "untap" && st.step !== "upkeep", 120);
  expect(anaDrewAtUpkeep(after, turn)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Lodestone Bauble: target Ana's Forest and Plains in her graveyard; they go on top of her library, she draws at her upkeep", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Lodestone Bauble"] }, [{ yard: ["Forest", "Plains", "Grizzly Bears"] }]);
  const bauble = one(s, "Lodestone Bauble");
  const yard = s.players[1]!.graveyard;
  const [forest, plains, bears] = ["Forest", "Plains", "Grizzly Bears"].map((n) => yard.find((id) => s.cards[s.objects[id]!.cardId]!.name === n)!) as [string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${bauble}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Put up to four target basic land cards" }).click();
  // The graveyard picker: only basic land cards, not the Bears.
  let pick = modal(page);
  await expect(pick).toContainText("basic land card");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${forest}"]`).click();
  pick = modal(page);
  await expect(pick.locator(`[data-pick="${plains}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${plains}"]`).click();
  // Two of the four: the picker opens again for a third; Done there finishes the targets.
  await expect(modal(page).locator(`[data-pick="${forest}"]`)).toHaveCount(0);
  await modal(page).getByRole("button", { name: "Done" }).click();
  await expect(modal(page)).toHaveCount(0);
  // A card is targeted: no player picker; its owner is that player.
  await expect(page.locator(".x-opponent-pick")).toHaveCount(0);
  const moved = await resolveUntil(page, (st) => st.objects[forest]!.zone === "library" && st.objects[plains]!.zone === "library" && st.stack.length === 0 && !st.pending);
  const lib = moved.players[1]!.library;
  expect(lib.slice(0, 2).sort()).toEqual([forest, plains].sort());
  expect(moved.objects[bears]!.zone).toBe("graveyard");
  const turn = moved.turn + 1;
  const after = await resolveUntil(page, (st) => st.activePlayer === 1 && st.turn === turn && st.step !== "untap" && st.step !== "upkeep", 120);
  expect(anaDrewAtUpkeep(after, turn)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Arcee, Sharpshooter: remove X = 2 of its 3 +1/+1 counters, 2 damage to Ana's Grizzly Bears, then it converts", async ({ page }) => {
  const s = scene({ board: [...LANDS, ARCEE] }, [{ board: ["Grizzly Bears"] }]);
  const [arcee, bears] = [one(s, "Arcee, Sharpshooter"), one(s, "Grizzly Bears")];
  s.objects[arcee]!.counters["+1/+1"] = 3;
  await open(page, s);
  await page.locator(`[data-obj="${arcee}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Remove one or more +1/+1 counters" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X +1/+1 counters");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[arcee]!.counters["+1/+1"]).toBe(1);
  expect(ch(after, arcee).name).toBe("Arcee, Acrobatic Coupe");
  expect(pageErrors(page)).toEqual([]);
});

test("Arcee, Acrobatic Coupe: Giant Growth on it puts one +1/+1 counter on it, then it converts back", async ({ page }) => {
  const s = scene({ hand: ["Giant Growth"], board: [...LANDS, ARCEE] });
  const arcee = one(s, "Arcee, Sharpshooter");
  s.objects[arcee]!.face = 1;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Giant Growth", s).click();
  await expect(page.locator(".targeting")).toContainText("choose target creature");
  await page.locator(`[data-obj="${arcee}"]`).first().click();
  const bar = page.locator(".targeting");
  if (await bar.getByRole("button", { name: "Done" }).count()) await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Giant Growth")]!.zone === "graveyard");
  expect(after.objects[arcee]!.counters["+1/+1"]).toBe(1);
  expect(ch(after, arcee).name).toBe("Arcee, Sharpshooter");
  // 2/2, +1 counter, +3/+3 from the spell.
  expect(ch(after, arcee).power).toBe(6);
  expect(pageErrors(page)).toEqual([]);
});

test("Helm of Kaldra: with the Sword and Shield too, {1} makes Kaldra with all three attached, a 9/9", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Helm of Kaldra", "Sword of Kaldra", "Shield of Kaldra"] });
  const [helm, sword, shield] = [one(s, "Helm of Kaldra"), one(s, "Sword of Kaldra"), one(s, "Shield of Kaldra")];
  await open(page, s);
  await page.locator(`[data-obj="${helm}"]`).first().click();
  await menu(page).locator("button", { hasText: "create Kaldra" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[helm]!.attachedTo !== undefined);
  const kaldra = after.objects[helm]!.attachedTo!;
  expect(after.objects[sword]!.attachedTo).toBe(kaldra);
  expect(after.objects[shield]!.attachedTo).toBe(kaldra);
  const c = ch(after, kaldra);
  expect(c.name).toBe("Kaldra");
  expect([c.power, c.toughness]).toEqual([9, 9]);
  expect(c.keywords).toEqual(expect.arrayContaining(["First strike", "Trample", "Haste", "Indestructible"]));
  await expect(page.locator(`[data-obj="${kaldra}"]`).first()).toContainText("9/9");
  expect(pageErrors(page)).toEqual([]);
});
