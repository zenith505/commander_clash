// Lane B round 89: moving Auras to "another creature/permanent with the same controller". The permanent is chosen as the
// ability resolves (Simic Guildmage, Glamer Spinners), with a button for each one that could take the Aura(s); your
// own creatures aren't offered when the Aura's host is an opponent's.
import { expect, test } from "@playwright/test";
import { LANDS, open, one, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Simic Guildmage: move Pacifism to another creature its host's controller controls", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Simic Guildmage", "Grizzly Bears"] }, [{ board: ["Hill Giant", "Pacifism", "Ornithopter", "Llanowar Elves"] }]);
  const pacifism = one(s, "Pacifism"), giant = one(s, "Hill Giant"), elves = one(s, "Llanowar Elves");
  s.objects[pacifism]!.attachedTo = giant;
  await open(page, s);
  await card(page, "Simic Guildmage", s).click();
  await menu(page).getByRole("button", { name: /Attach target Aura/ }).click();
  // The Aura is tucked behind Hill Giant: click the edge of it that shows.
  await page.locator(`[data-obj="${pacifism}"]`).first().click({ position: { x: 6, y: 6 } });
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("choose the creature to attach Pacifism to");
  await expect(pick.getByRole("button")).toHaveText(["Ornithopter (Ana)", "Llanowar Elves (Ana)"]);
  await pick.getByRole("button", { name: "Llanowar Elves (Ana)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pacifism]!.attachedTo === elves);
  expect(after.objects[pacifism]!.attachedTo).toBe(elves);
  expect(pageErrors(page)).toEqual([]);
});

test("Glamer Spinners: every Aura on the target goes to the one permanent you pick", async ({ page }) => {
  const s = scene({ hand: ["Glamer Spinners"], board: [...LANDS] }, [{ board: ["Hill Giant", "Pacifism", "Ornithopter", "Llanowar Elves"] }]);
  const pacifism = one(s, "Pacifism"), giant = one(s, "Hill Giant"), thopter = one(s, "Ornithopter");
  s.objects[pacifism]!.attachedTo = giant;
  await open(page, s);
  await card(page, "Glamer Spinners", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("choose the permanent to attach the Auras on Hill Giant to");
  await expect(pick.getByRole("button")).toHaveText(["Ornithopter (Ana)", "Llanowar Elves (Ana)"]);
  await pick.getByRole("button", { name: "Ornithopter (Ana)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pacifism]!.attachedTo === thopter);
  expect(after.objects[pacifism]!.attachedTo).toBe(thopter);
  expect(pageErrors(page)).toEqual([]);
});
