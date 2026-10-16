// Outrageous Robbery: cards exiled face down from an opponent's library that you may look at and play, spending mana as
// though it were mana of any type (CR 406.3, 609.4b). Their exile shows ✦; you see the card, they see a card back.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil, seat } from "./ui";

test("Outrageous Robbery: cast Ana's face-down Grizzly Bears from her exile with only Islands", async ({ page }) => {
  // As if you had cast Outrageous Robbery with X = 1 targeting Ana.
  const s = scene({ board: ["Island", "Island"] }, [{ exile: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  s.objects[bears]!.hiddenExile = { by: "", seen: [0], label: "Face down" };
  s.objects[bears]!.mayPlay = { player: 0, zc: s.objects[bears]!.zoneChanges ?? 0, until: "exiled", turn: s.turn, anyType: true };
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-title")).toHaveText("Exile ✦");
  await theirs.click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("face down");
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[bears]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
