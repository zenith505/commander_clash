// Round 138: The Necrobloom's "land cards in your graveyard have dredge 2" offers a land card in the dredge prompt.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("The Necrobloom: Divination's draw can dredge Evolving Wilds from the graveyard instead (mill 2)", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "The Necrobloom"], yard: ["Evolving Wilds"], library: ["Goblin Piker", "Hill Giant", "Shock", "Lightning Bolt"] });
  const wilds = one(s, "Evolving Wilds");
  const top = s.players[0]!.library.slice(0, 3);
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "dredge" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Dredge Evolving Wilds (mill 2)" }).click();
  // Divination's second draw: nothing left that can dredge, so it's drawn.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[wilds]!.zone).toBe("hand");
  expect(top.map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});
