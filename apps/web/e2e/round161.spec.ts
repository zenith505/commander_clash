// Round 161: craft's picker of what to exile (Tithing Blade), Zara's pick from the defending player's hand, and Mission
// Briefing's choice of a card in your graveyard to cast this turn.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planCast, waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, menu, modal, passTo, resolveUntil } from "./ui";

test("Tithing Blade: craft with a creature card from your graveyard, picked in the craft window", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Tithing Blade // Consuming Sepulcher", "Llanowar Elves"], yard: ["Grizzly Bears"] });
  const [blade, bears, elves] = [one(s, "Tithing Blade"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Tithing Blade", s).click();
  const craft = menu(page).getByRole("button", { name: /^Craft/ });
  if (await craft.count()) await craft.click();
  const pick = modal(page);
  await expect(pick).toContainText("craft: exile a creature you control or from your graveyard");
  // A creature you control or a creature card in your graveyard; never Tithing Blade itself.
  await expect(pick.locator(`[data-pick="${elves}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${blade}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[blade]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(after.objects[blade]!.face).toBe(1);
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Zara, Renegade Recruiter: put a creature card from the defending player's hand onto the battlefield attacking them", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Zara, Renegade Recruiter"] }, [{ hand: ["Grizzly Bears", "Divination"] }]);
  const [zara, bears] = [one(s, "Zara, Renegade Recruiter"), one(s, "Grizzly Bears")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[zara, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  // Their whole hand is shown; only the creature card can be picked.
  await expect(pick).toContainText("Divination");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: /^(Done|Put)/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]).toMatchObject({ controller: 0, owner: 1, tapped: true, attacking: 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("Mission Briefing: choose an instant or sorcery card in your graveyard to cast this turn", async ({ page }) => {
  const s0 = scene({ hand: ["Mission Briefing"], board: LANDS, yard: ["Divination", "Forest"] });
  const [briefing, divination, forest] = [one(s0, "Mission Briefing"), one(s0, "Divination"), one(s0, "Forest")];
  // Cast it and surveil with the engine, up to the choice.
  let s = s0;
  for (const a of planCast(s, 0, briefing)!) s = applyAction(s, a);
  for (let i = 0; i < 40 && s.pending?.kind !== "searchLibrary"; i++) s = applyAction(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
  await open(page, s);
  const pick = modal(page);
  await expect(page.locator("body")).toContainText("choose an instant or sorcery card in your graveyard; you may cast it this turn");
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${divination}"]`).click();
  await pick.getByRole("button", { name: /^(Done|Put|Take)/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[briefing]!.zone === "graveyard" && st.stack.length === 0 && !st.pending);
  expect(after.objects[divination]).toMatchObject({ zone: "graveyard", mayPlay: { player: 0, until: "thisTurn", exileAfter: true } });
  expect(pageErrors(page)).toEqual([]);
});
