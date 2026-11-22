// Round 446 in the browser: Psychic Paper's creature card name and creature type, asked one after the other as it becomes
// attached by its equip ability; Vesuvan Shapeshifter's creature to copy, asked with Turn face up and when an ability turns
// it face up, and its upkeep "you may turn it face down".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";
import { applyAction, characteristics, invalidateCharacteristics, planCast, waitingOn, type GameState } from "@cc/engine";

test("Psychic Paper: equipped to your Llanowar Elves, you name it Grizzly Bears and make it a Wizard; it has ward {1} and can't be blocked", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Psychic Paper", "Llanowar Elves", "Grizzly Bears"] });
  const [paper, elves] = [one(s, "Psychic Paper"), one(s, "Llanowar Elves")];
  await open(page, s);
  await page.locator(`[data-obj="${paper}"]`).first().click();
  await menu(page).getByRole("button", { name: /Equip/ }).click();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName" && st.pending.player === 0);
  const names = modal(page);
  await expect(names).toContainText("Psychic Paper: choose a creature card name: the name Llanowar Elves has while equipped");
  await names.locator("input").fill("grizzly");
  await names.locator('[data-name="Grizzly Bears"]').click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "creatureType" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Psychic Paper: choose a creature type.");
  await modal(page).locator('[data-type="Wizard"]').first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[paper]!.attachedTo === elves);
  const c = characteristics(after, after.objects[elves]!);
  expect(c.name).toBe("Grizzly Bears");
  expect(c.subtypes).toEqual(["Wizard"]);
  expect(c.cantBeBlocked).toBe(true);
  expect([...c.keywords, ...c.grantedAbilities].some((k) => /^Ward \{1\}$/i.test(k))).toBe(true);
  expect(after.objects[paper]!.chosen).toMatchObject({ name: "Grizzly Bears", type: "Wizard" });
  expect(pageErrors(page)).toEqual([]);
});

/** Your face-down Vesuvan Shapeshifter (cast as a morph), with Grizzly Bears and a Hill Giant on the battlefield. */
function faceDownVesuvan(extra: string[] = []) {
  const s = scene({ board: [...LANDS, "Vesuvan Shapeshifter", "Grizzly Bears", "Hill Giant", ...extra] });
  const v = one(s, "Vesuvan Shapeshifter");
  s.objects[v]!.faceDown = "morph";
  invalidateCharacteristics(s);
  return { s, v, giant: one(s, "Hill Giant") };
}

test("Vesuvan Shapeshifter: Turn face up for its morph asks for a creature to copy; you click the Hill Giant", async ({ page }) => {
  const { s, v, giant } = faceDownVesuvan();
  await open(page, s);
  await page.locator(`[data-obj="${v}"]`).first().click();
  await menu(page).getByRole("button", { name: /^Turn face up/ }).click();
  await expect(page.locator(".targeting")).toContainText("choose another creature for it to become a copy of, or don't");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.getByRole("button", { name: "Copy and turn face up", exact: true }).click();
  let after = s;
  await expect.poll(async () => characteristics((after = await state(page)), after.objects[v]!).name).toBe("Hill Giant");
  expect(after.objects[v]!.faceDown).toBeFalsy();
  expect(after.objects[v]!.copyEffects?.map((e) => e.until)).toEqual(["faceDown"]);
  expect(after.log.some((l) => l.text === "Vesuvan Shapeshifter becomes a copy of Hill Giant until it's turned face down.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Vesuvan Shapeshifter: Turn face up without copying, and it's a 0/0 that dies", async ({ page }) => {
  const { s, v } = faceDownVesuvan();
  await open(page, s);
  await page.locator(`[data-obj="${v}"]`).first().click();
  await menu(page).getByRole("button", { name: /^Turn face up/ }).click();
  await page.getByRole("button", { name: "Turn face up without copying", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[v]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Vesuvan Shapeshifter turned face up by Ixidor's ability: you click Copy Hill Giant", async ({ page }) => {
  const { s, v } = faceDownVesuvan(["Ixidor, Reality Sculptor"]);
  const ix = one(s, "Ixidor, Reality Sculptor");
  await open(page, s);
  await page.locator(`[data-obj="${ix}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn target face-down creature face up/ }).click();
  await page.locator(`[data-obj="${v}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "faceUpCopy" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("you may choose another creature for Vesuvan Shapeshifter to become a copy of as it's turned face up");
  await bar.getByRole("button", { name: "Copy Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !st.objects[v]!.faceDown);
  expect(characteristics(after, after.objects[v]!).name).toBe("Hill Giant");
  expect(pageErrors(page)).toEqual([]);
});

test("Vesuvan Shapeshifter at your upkeep: Yes turns it face down, a 2/2 again with no copy", async ({ page }) => {
  let s = scene({ hand: ["Vesuvan Shapeshifter"], board: [...LANDS, "Hill Giant"] });
  const v = one(s, "Vesuvan Shapeshifter");
  for (const a of planCast(s, 0, v)!) s = applyAction(s, a);
  // It resolves and enters as a copy of the Hill Giant (your answer given here in the engine).
  s = playUntilCopy(s);
  s = applyAction(s, { type: "chooseOption", player: 0, choice: one(s, "Hill Giant") });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Hill Giant: Turn Hill Giant face down?");
  await bar.getByRole("button", { name: "Yes" }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[v]!.faceDown).toBe("morph");
  expect(after.objects[v]!.copyEffects).toBeUndefined();
  const c = characteristics(after, after.objects[v]!);
  expect([c.power, c.toughness]).toEqual([2, 2]);
  expect(pageErrors(page)).toEqual([]);
});

/** Passes until your Vesuvan Shapeshifter asks what it enters as a copy of. */
function playUntilCopy(s: GameState): GameState {
  for (let i = 0; i < 50 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  if (!(s.pending?.kind === "chooseOption" && s.pending.what === "copy")) throw new Error("no copy question");
  return s;
}
