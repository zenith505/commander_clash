// Lane B round B249's prompt: with Essence of the Wild and Infinite Reflection both making a creature you cast enter as a
// copy, you choose which copy effect applies last (CR 616.1, rulings), and it enters as that copy.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Essence of the Wild and Infinite Reflection: Hill Giant enters as the copy you click, Ana's Shivan Dragon", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, "Essence of the Wild", "Infinite Reflection"] }, [{ board: ["Shivan Dragon"] }]);
  const [giant, aura, dragon] = [one(s, "Hill Giant"), one(s, "Infinite Reflection"), one(s, "Shivan Dragon")];
  // Infinite Reflection already enchants Ana's Shivan Dragon (its enters trigger long resolved).
  s.objects[aura]!.attachedTo = dragon;
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyLast");
  // How it enters waits for the choice.
  expect(asked.objects[giant]!.copyOf).toBeUndefined();
  const pick = page.locator("[data-copy-last]");
  await expect(pick).toContainText("Hill Giant: it enters as a copy: choose which copy effect applies last");
  await expect(pick.getByRole("button")).toHaveText(["A copy of Essence of the Wild (Essence of the Wild)", "A copy of Shivan Dragon (Infinite Reflection)"]);
  await pick.getByRole("button", { name: "A copy of Shivan Dragon (Infinite Reflection)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[giant]!.zone === "battlefield" && !!st.objects[giant]!.copyOf);
  const c = characteristics(after, after.objects[giant]!);
  expect(c.name).toBe("Shivan Dragon");
  expect(c.keywords).toContain("Flying");
  expect(after.log.some((l) => l.text === "Hill Giant enters as a copy of Shivan Dragon.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
