// Lane B round B255 in the browser: Whims of the Fates asks you for your three piles (the first, then the second from the
// rest), and Gift of Doom's "Turn face up" asks what to sacrifice and then the creature to attach it to, or none.
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planCast, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene, state } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Whims of the Fates: you click your first pile, then your second; one of the three is sacrificed at random", async ({ page }) => {
  let s = scene({ hand: ["Whims of the Fates"], board: ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Mountain", "Island", "Swamp", "Forest", "Plains", "Wastes"] });
  const [bears, giant, elves] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  const before = s.battlefield.filter((id) => s.objects[id]!.controller === 0);
  for (const a of planCast(s, 0, one(s, "Whims of the Fates"))!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("separate all permanents you control into three piles");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "First pile: 1", exact: true }).click();
  let mid: GameState = s;
  await expect.poll(async () => ((mid = await state(page)).pending?.kind === "pickPermanents" ? mid.pending.piles3 : undefined)).toBe(2);
  expect(mid.pending?.kind === "pickPermanents" && mid.pending.options.includes(bears)).toBe(false);
  await expect(bar).toContainText("click the permanents for the second pile");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const rest = before.length - 2;
  await bar.getByRole("button", { name: `Second pile: 1, third pile: ${rest}`, exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[one(st, "Whims of the Fates")]!.zone === "graveyard");
  expect(after.log.some((l) => l.text.startsWith("You separates their permanents into three piles: Grizzly Bears; Hill Giant; and "))).toBe(true);
  // Exactly one pile is gone: the Bears, the Giant, or all the rest (the Elves among them).
  const gone = before.filter((id) => after.objects[id]!.zone !== "battlefield");
  const piles = [[bears], [giant], before.filter((id) => id !== bears && id !== giant)];
  expect(piles.some((p) => p.length === gone.length && p.every((id) => gone.includes(id)))).toBe(true);
  expect(after.objects[elves]!.zone === "battlefield").toBe(!gone.includes(elves));
  expect(pageErrors(page)).toEqual([]);
});

/** Your face-down Gift of Doom, with Grizzly Bears to sacrifice and a Hill Giant to attach it to. */
function faceDownGift() {
  const s = scene({ board: ["Gift of Doom", "Grizzly Bears", "Hill Giant", "Swamp"] });
  const gift = one(s, "Gift of Doom");
  s.objects[gift]!.faceDown = "morph";
  invalidateCharacteristics(s);
  return { s, gift, bears: one(s, "Grizzly Bears"), giant: one(s, "Hill Giant") };
}

test("Gift of Doom: Turn face up sacrifices the Bears, then you click the Giant to attach it to", async ({ page }) => {
  const { s, gift, bears, giant } = faceDownGift();
  await open(page, s);
  await page.locator(`[data-obj="${gift}"]`).first().click();
  await menu(page).getByRole("button", { name: /^Turn face up: morph sacrifice another creature/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.getByRole("button", { name: "Sacrifice and turn face up", exact: true }).click();
  await expect(page.locator(".targeting")).toContainText("attach it to a creature, or don't");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.getByRole("button", { name: "Attach and turn face up", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[gift]!.attachedTo).toBe(giant);
  expect(after.objects[gift]!.faceDown).toBeFalsy();
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.log.some((l) => l.text === "Gift of Doom is attached to Hill Giant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Gift of Doom: Turn face up without attaching, and it's put into your graveyard", async ({ page }) => {
  const { s, gift, bears, giant } = faceDownGift();
  await open(page, s);
  await page.locator(`[data-obj="${gift}"]`).first().click();
  await menu(page).getByRole("button", { name: /^Turn face up: morph sacrifice another creature/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.getByRole("button", { name: "Sacrifice and turn face up", exact: true }).click();
  await page.getByRole("button", { name: "Turn face up without attaching", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[gift]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text === "Gift of Doom isn't attached to a creature.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Gift of Doom turned face up by Ana's Break Open: you choose the creature to attach it to", async ({ page }) => {
  let s = scene({ board: ["Gift of Doom", "Grizzly Bears", "Hill Giant"] }, [{ hand: ["Break Open"], board: ["Mountain", "Mountain"] }]);
  const [gift, giant] = [one(s, "Gift of Doom"), one(s, "Hill Giant")];
  s.objects[gift]!.faceDown = "morph";
  invalidateCharacteristics(s);
  // Ana holds priority in your main phase (as after you pass) and casts it at your Gift.
  s.priority = 1;
  for (const a of planCast(s, 1, one(s, "Break Open"), [{ kind: "object", id: gift }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "faceUpAttach", about: gift });
  await open(page, s);
  await expect(page.getByText("choose a creature to attach Gift of Doom to as it's turned face up")).toBeVisible();
  await page.getByRole("button", { name: "Attach it to Hill Giant", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[gift]!.attachedTo).toBe(giant);
  expect(after.objects[gift]!.faceDown).toBeFalsy();
  expect(after.log.some((l) => l.text === "You chooses to attach Gift of Doom to Hill Giant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
