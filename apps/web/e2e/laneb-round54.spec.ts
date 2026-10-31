// Lane B round 54: Grip of Amnesia's "unless its controller exiles all cards from their graveyard". The prompt says
// what paying does; Pay exiles the whole graveyard and the spell resolves, Don't pay counters it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

for (const pay of [true, false]) {
  test(`Grip of Amnesia: ${pay ? "Pay exiles your graveyard and the spell resolves" : "Don't pay counters the spell"}`, async ({ page }) => {
    const s = scene({ hand: ["Divination", "Grip of Amnesia"], board: LANDS, yard: ["Opt", "Shock"] });
    const [divination, grip, opt, shock] = [one(s, "Divination"), one(s, "Grip of Amnesia"), one(s, "Opt"), one(s, "Shock")];
    await open(page, s);
    await card(page, "Divination", s).click();
    await expect.poll(async () => (await state(page)).stack.length).toBe(1);
    await card(page, "Grip of Amnesia", s).click();
    const top = (await state(page)).stack[0]!.id;
    await page.locator(`[data-stack="${top}"]`).click();
    await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
    await expect(controls(page)).toContainText("exile all cards from your graveyard or Divination is countered");
    await controls(page).getByRole("button", pay ? { name: "Pay", exact: true } : { name: "Don't pay" }).click();
    const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
    expect(after.objects[opt]!.zone).toBe(pay ? "exile" : "graveyard");
    expect(after.objects[shock]!.zone).toBe(pay ? "exile" : "graveyard");
    expect(after.objects[divination]!.zone).toBe("graveyard");
    expect(after.objects[grip]!.zone).toBe("graveyard");
    // Grip draws one card; Divination two more if it resolved.
    expect(after.players[0]!.hand).toHaveLength(pay ? 3 : 1);
    expect(pageErrors(page)).toEqual([]);
  });
}
