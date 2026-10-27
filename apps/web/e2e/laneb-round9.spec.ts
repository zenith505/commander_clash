// Lane B round 9's cards through existing prompts: Priest of the Wakening Sun reveals up to one Dinosaur card from your
// hand at your upkeep (the reveal picker, at most one card).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { modal, resolveUntil } from "./ui";

for (const reveal of [true, false]) {
  test(`Priest of the Wakening Sun: ${reveal ? "reveal a Dinosaur card to gain 2 life" : "reveal none, no life"}`, async ({ page }) => {
    let s = scene({ hand: ["Colossal Dreadmaw", "Grizzly Bears"], board: ["Priest of the Wakening Sun"] });
    s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.activePlayer === 0);
    const [dino, bears] = [one(s, "Colossal Dreadmaw"), one(s, "Grizzly Bears")];
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, fromHand: true, min: 0, max: 1 });
    const life = s.players[0]!.life;
    await open(page, s);
    const pick = modal(page);
    await expect(pick).toContainText("Priest of the Wakening Sun: you may reveal a Dinosaur card from your hand");
    await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
    if (reveal) {
      await pick.locator(`[data-pick="${dino}"]`).click();
      await expect(pick).toContainText("Revealing 1.");
      await pick.getByRole("button", { name: "Reveal", exact: true }).click();
    } else await pick.getByRole("button", { name: "Reveal none" }).click();
    const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
    expect(after.players[0]!.life).toBe(life + (reveal ? 2 : 0));
    expect(after.objects[dino]!.zone).toBe("hand");
    expect(pageErrors(page)).toEqual([]);
  });
}
