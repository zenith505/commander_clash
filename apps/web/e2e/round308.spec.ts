// Round 308's prompts: Axebane Ferox's ward—collect evidence 4 (pay, then pick the cards; or don't), and Doomsday
// Confluence's "Choose X" modes (X is how many are chosen, the same one more than once).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Axebane Ferox: Shock it, collect evidence 4 for its ward by picking Gray Ogre and Llanowar Elves", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: ["Mountain"], yard: ["Grizzly Bears", "Gray Ogre", "Llanowar Elves"] }, [{ board: ["Axebane Ferox"] }]);
  const [ferox, bears, ogre, elves] = ["Axebane Ferox", "Grizzly Bears", "Gray Ogre", "Llanowar Elves"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${ferox}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Axebane Ferox's ward: collect evidence 4 (exile cards with total mana value 4 or more from your graveyard) or Shock is countered.");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Axebane Ferox's ward: collect evidence 4, exiling cards with total mana value 4 or more from your graveyard");
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ferox!]!.damage === 2);
  expect([ogre, elves, bears].map((id) => after.objects[id!]!.zone)).toEqual(["exile", "exile", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Axebane Ferox: don't pay its ward, and Shock is countered", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: ["Mountain"], yard: ["Grizzly Bears", "Gray Ogre"] }, [{ board: ["Axebane Ferox"] }]);
  const [shock, ferox, bears, ogre] = ["Shock", "Axebane Ferox", "Grizzly Bears", "Gray Ogre"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${ferox}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[shock!]!.zone === "graveyard");
  expect(after.objects[ferox!]!.damage ?? 0).toBe(0);
  expect([bears, ogre].map((id) => after.objects[id!]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Doomsday Confluence: choose the Dalek mode twice, so X is 2 and it costs {2}{2}{B}", async ({ page }) => {
  const s = scene({ hand: ["Doomsday Confluence"], board: ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp"] }, [{ board: ["Grizzly Bears"] }]);
  const [dc, bears] = [one(s, "Doomsday Confluence"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Doomsday Confluence", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose X modes, X being how many you choose (up to 2 with your mana): X is 0");
  const dalek = modes.getByRole("button", { name: /Create a 3\/3 black Dalek/ });
  await dalek.click();
  await dalek.click();
  await expect(modes).toContainText("X is 2");
  // No more room: three would need seven mana.
  await expect(dalek).toBeDisabled();
  await modes.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dc]!.zone === "graveyard");
  const daleks = after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Dalek Token");
  expect(daleks).toHaveLength(2);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(5);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
