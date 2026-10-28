// Round 191's prompts: Vendilion Clique's pick from a revealed hand, put on the bottom of its owner's library, and
// Creeping Renaissance's choice of a permanent type.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Vendilion Clique: target Ana, pick a nonland card from her hand; it goes to the bottom of her library and she draws", async ({ page }) => {
  const s = scene({ hand: ["Vendilion Clique"], board: LANDS }, [{ hand: ["Grizzly Bears", "Forest", "Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  const forest = idsOf(s, "Forest", "hand", 1)[0]!;
  await open(page, s);
  await card(page, "Vendilion Clique", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[one(s, "Vendilion Clique")]!.zone === "battlefield");
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ana's hand");
  await expect(pick).toContainText("put on the bottom of their library");
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "library");
  const lib = after.players[1]!.library;
  expect(lib[lib.length - 1]).toBe(giant);
  expect(after.players[1]!.hand).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Creeping Renaissance: choose Artifact, and the artifact cards in your graveyard return to your hand", async ({ page }) => {
  const s = scene({ hand: ["Creeping Renaissance"], board: LANDS, yard: ["Ornithopter", "Sol Ring", "Grizzly Bears", "Lightning Bolt"] });
  const [thopter, ring, bears, bolt] = [one(s, "Ornithopter"), one(s, "Sol Ring"), one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Creeping Renaissance", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "cardType");
  expect(st.pending?.kind === "chooseOption" && st.pending.options).toEqual(["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"]);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Instant", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Artifact", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[ring]!.zone === "hand");
  expect([thopter, ring, bears, bolt].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
