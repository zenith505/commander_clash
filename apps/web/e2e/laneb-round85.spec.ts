// Lane B round 85: Goblin Flectomancer's "You may change the targets of target instant or sorcery spell". The
// retarget bar says the change is all or none (CR 115.7a); clicking a new target moves the spell, Keep leaves it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

for (const change of [true, false]) {
  test(`Goblin Flectomancer: ${change ? "move Lightning Bolt to Grizzly Bears" : "keep Lightning Bolt's target"}`, async ({ page }) => {
    const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Goblin Flectomancer"] }, [{ board: ["Hill Giant", "Grizzly Bears"] }]);
    const [flecto, giant, bears] = [one(s, "Goblin Flectomancer"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
    await open(page, s);
    await card(page, "Lightning Bolt", s).click();
    await page.locator(`[data-obj="${giant}"]`).click();
    await expect.poll(async () => (await state(page)).stack.length).toBe(1);
    await page.locator(`[data-obj="${flecto}"]`).click();
    await menu(page).getByRole("button", { name: /change the targets of target instant or sorcery spell/ }).click();
    const top = (await state(page)).stack[0]!.id;
    await page.locator(`[data-stack="${top}"]`).click();
    await resolveUntil(page, (st) => st.pending?.kind === "newTargets");
    const bar = page.locator(".targeting");
    await expect(bar).toContainText("Goblin Flectomancer: new targets for Lightning Bolt (change all of them, or keep them)");
    if (change) await page.locator(`[data-obj="${bears}"]`).click();
    else await bar.getByRole("button", { name: /^Keep target/ }).click();
    const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
    expect(after.objects[flecto]!.zone).toBe("graveyard");
    expect(after.objects[bears]!.zone).toBe(change ? "graveyard" : "battlefield");
    expect(after.objects[giant]!.zone).toBe(change ? "battlefield" : "graveyard");
    expect(pageErrors(page)).toEqual([]);
  });
}
