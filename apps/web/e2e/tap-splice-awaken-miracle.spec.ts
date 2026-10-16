// The prompts added in the round after overload: "tap or untap target permanent", buyback that isn't mana, the Awaken
// cast button, the Miracle cast prompt, and splicing Arcane cards onto a spell.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Twiddle: choose to tap the opponent's creature", async ({ page }) => {
  const s = scene({ hand: ["Twiddle"], board: ["Island"] }, [{ board: ["Gray Ogre"] }]);
  const ogre = one(s, "Gray Ogre");
  await open(page, s);
  await card(page, "Twiddle", s).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("tap or untap Gray Ogre");
  await expect(bar.getByRole("button", { name: "Neither" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Tap Gray Ogre", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[ogre]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Constant Mists: buyback by sacrificing a land returns it to your hand", async ({ page }) => {
  const s = scene({ hand: ["Constant Mists"], board: ["Forest", "Forest", "Forest"] });
  const mists = one(s, "Constant Mists");
  const b = idsOf(s, "Forest", "battlefield", 0)[2]!;
  await open(page, s);
  await card(page, "Constant Mists", s).click();
  const buy = page.locator(".targeting");
  await expect(buy).toContainText("pay buyback (sacrifice a land) too?");
  await buy.getByRole("button", { name: "Buy it back" }).click();
  await page.locator(`[data-obj="${b}"]`).click();
  await page.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[mists]!.zone === "hand");
  expect(after.objects[b]!.zone).toBe("graveyard");
  expect(after.preventCombatDamage).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Clutch of Currents: Awaken returns the creature and makes your land a 3/3 haste Elemental", async ({ page }) => {
  const s = scene({ hand: ["Clutch of Currents"], board: ["Island", "Island", "Island", "Island", "Island", "Forest"] }, [{ board: ["Gray Ogre"] }]);
  const ogre = one(s, "Gray Ogre");
  const land = idsOf(s, "Forest", "battlefield", 0)[0]!; // a land of its own, not under a pile of the same land
  await open(page, s);
  await card(page, "Clutch of Currents", s).click();
  await menu(page).getByRole("button", { name: /^Awaken/ }).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  await page.locator(`[data-obj="${land}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[ogre]!.zone === "hand");
  invalidateCharacteristics(after);
  const c = characteristics(after, after.objects[land]!);
  expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
  expect([c.power, c.toughness]).toEqual([3, 3]);
  expect(c.keywords).toContain("Haste");
  expect(pageErrors(page)).toEqual([]);
});

test("Thunderous Wrath: drawn first this turn, the Miracle prompt casts it for {R}", async ({ page }) => {
  const s = scene({ board: ["Mountain"], library: ["Thunderous Wrath"] }, [], { step: "upkeep" });
  const wrath = one(s, "Thunderous Wrath");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  const bar = controls(page);
  await expect(bar).toContainText("Miracle: cast Thunderous Wrath for");
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[wrath]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(35);
  expect(pageErrors(page)).toEqual([]);
});

test("Glacial Ray: splice Kodama's Might onto it from your hand; both happen and Kodama's Might stays in hand", async ({ page }) => {
  const s = scene({ hand: ["Glacial Ray", "Kodama's Might"], board: [...LANDS, "Grizzly Bears"] });
  const [ray, might, bears] = [one(s, "Glacial Ray"), one(s, "Kodama's Might"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Glacial Ray", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("Glacial Ray: splice onto it any number of cards from your hand");
  await pick.locator(`[data-pick="${might}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await clickPlayer(page, 1);
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[ray]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(38);
  expect(after.objects[might]!.zone).toBe("hand");
  invalidateCharacteristics(after);
  expect(characteristics(after, after.objects[bears]!).power).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Street Spasm: Overload asks for X, paid twice, and hits each creature without flying you don't control", async ({ page }) => {
  const s = scene({ hand: ["Street Spasm"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Grizzly Bears", "Hill Giant", "Birds of Paradise"] }]);
  const mine = idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!, theirs = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  const [giant, birds] = [one(s, "Hill Giant"), one(s, "Birds of Paradise")];
  await open(page, s);
  await card(page, "Street Spasm", s).click();
  await menu(page).getByRole("button", { name: /^Overload/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("choose X");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Street Spasm")]!.zone === "graveyard");
  expect([theirs, giant].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect([mine, birds].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped)).toHaveLength(8);
  expect(pageErrors(page)).toEqual([]);
});

test("Sram's Expertise: pick the card to cast free from your hand, then cast it", async ({ page }) => {
  const s = scene({ hand: ["Sram's Expertise", "Grizzly Bears", "Hill Giant"], board: LANDS });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Sram's Expertise", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell with mana value 3 or less from your hand without paying its mana cost?");
  await expect(bar.getByRole("button", { name: "Hill Giant" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped)).toHaveLength(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Endless Swarm: after it resolves, your other spells can't be cast", async ({ page }) => {
  const s = scene({ hand: ["Endless Swarm", "Grizzly Bears"], board: LANDS });
  const swarm = one(s, "Endless Swarm");
  await open(page, s);
  await card(page, "Endless Swarm", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[swarm]!.zone === "graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken)).toHaveLength(1);
  await card(page, "Grizzly Bears", s).click();
  await expect(page.locator(".error")).toContainText("can't cast spells for the rest of the game");
  expect(pageErrors(page)).toEqual([]);
});
