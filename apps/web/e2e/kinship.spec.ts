// Kinship: at your upkeep you look at the top card of your library and may reveal it if it shares a creature type.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Mudbutton Clanger: a Goblin on top of your library is named in the prompt; revealing it gives +1/+1", async ({ page }) => {
  const s = scene({ board: ["Mudbutton Clanger"], library: ["Goblin Piker"] });
  const clanger = one(s, "Mudbutton Clanger");
  await open(page, s);
  // Pass through the opponents' turns to your next upkeep.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, 300);
  const bar = controls(page);
  await expect(bar).toContainText("Mudbutton Clanger:");
  await expect(bar).toContainText("Reveal Goblin Piker");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.log.some((l) => /reveals Goblin Piker/.test(l.text)));
  invalidateCharacteristics(after);
  const c = characteristics(after, after.objects[clanger]!);
  expect([c.power, c.toughness]).toEqual([2, 2]);
  expect(pageErrors(page)).toEqual([]);
});
