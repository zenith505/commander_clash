// Round 448 in the browser: Dinosaur Headdress (Paleontologist's Pick-Axe crafted), which asks, each time it becomes
// attached to a creature, which exiled creature card used to craft it the equipped creature is a copy of: a button for
// each card, after its enters trigger attaches it and again when it's equipped to another creature.
import { expect, test } from "@playwright/test";
import { characteristics, power, toughness } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Dinosaur Headdress: crafted with Serra Angel and Llanowar Elves, you click Serra Angel for Grizzly Bears, then equip Hill Giant and click Llanowar Elves", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Paleontologist's Pick-Axe // Dinosaur Headdress", "Grizzly Bears", "Hill Giant"], yard: ["Serra Angel", "Llanowar Elves"] });
  const [axe, bears, giant, angel, elves] = [one(s, "Paleontologist's Pick-Axe"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Serra Angel"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Paleontologist's Pick-Axe", s).click();
  const craft = menu(page).getByRole("button", { name: /^Craft/ });
  if (await craft.count()) await craft.click();
  const pick = modal(page);
  await expect(pick).toContainText("craft: exile 1 or more creatures you control or from your graveyard");
  await pick.locator(`[data-pick="${angel}"]`).click();
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Its enters trigger: "attach it to target creature you control", the Grizzly Bears.
  const asked = await resolveUntil(page, (st) => st.pending?.player === 0 && (st.pending.kind === "chooseTargets" || (st.pending.kind === "chooseOption" && st.pending.what === "attachCopy")));
  if (asked.pending?.kind === "chooseTargets") {
    await page.locator(`[data-obj="${bears}"]`).first().click();
    await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attachCopy" && st.pending.player === 0);
  }
  const bar = controls(page);
  await expect(bar).toContainText("Dinosaur Headdress: choose an exiled creature card used to craft Dinosaur Headdress: the equipped creature is a copy of it");
  await expect(bar.getByRole("button", { name: "Llanowar Elves", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Serra Angel", exact: true }).click();
  const first = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[axe]!.attachedTo === bears && characteristics(st, st.objects[bears]!).name === "Serra Angel");
  expect(characteristics(first, first.objects[bears]!).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
  expect(power(first, first.objects[bears]!)).toBe(4);
  expect(toughness(first, first.objects[bears]!)).toBe(4);
  expect(first.objects[angel]!.zone).toBe("exile");

  // Equip {2} to the Hill Giant: asked again.
  // Attached, it peeks out above the Grizzly Bears: click the part that shows.
  await page.locator(`[data-obj="${axe}"]`).first().click({ position: { x: 20, y: 8 } });
  await menu(page).getByRole("button", { name: /Equip/ }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attachCopy" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Llanowar Elves", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[axe]!.attachedTo === giant && characteristics(st, st.objects[giant]!).name === "Llanowar Elves");
  expect(power(after, after.objects[giant]!)).toBe(1);
  expect(characteristics(after, after.objects[bears]!).name).toBe("Grizzly Bears");
  expect(after.log.some((l) => l.text === "Hill Giant is a copy of Llanowar Elves (Dinosaur Headdress).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
