// "Destroy target creature. Its owner gains 4 life" (Path of Peace): the creature's owner, whoever controls it
// (rulings, CR 108.3). "Destroy target land. ~ deals 2 damage to that land's controller" (Melt Terrain): who controlled it
// as it last existed (CR 608.2h), dealt even if the land wasn't destroyed (Peak Eruption rulings).

import { describe, expect, it } from "vitest";
import { card, cast, putOnBattlefield, setup } from "./helpers";
import { isFullySupported } from "../src";

// Real oracle text (Scryfall).
const path = card("Path of Peace", "Sorcery", "{3}{W}", { oracleText: "Destroy target creature. Its owner gains 4 life." });
const gain = card("Misfortune's Gain", "Sorcery", "{3}{W}", { oracleText: "Destroy target creature. Its owner gains 4 life." });
const melt = card("Melt Terrain", "Sorcery", "{2}{R}{R}", { oracleText: "Destroy target land. Melt Terrain deals 2 damage to that land's controller." });
const peak = card("Peak Eruption", "Sorcery", "{2}{R}", { oracleText: "Destroy target Mountain. Peak Eruption deals 3 damage to that land's controller." });
const cryo = card("Cryoclasm", "Sorcery", "{2}{R}", { oracleText: "Destroy target Plains or Island. Cryoclasm deals 3 damage to that land's controller." });
const poison = card("Poison the Well", "Sorcery", "{2}{B}{B}", { oracleText: "Destroy target land. Poison the Well deals 2 damage to that land's controller." });
const citadel = card("Darksteel Citadel", "Artifact Land", "", { keywords: ["Indestructible"], oracleText: "Indestructible\n{T}: Add {C}." });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

describe("its owner, that land's controller", () => {
  it("parse", () => {
    for (const d of [path, gain, melt, peak, cryo, poison]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Path of Peace: the owner gains the life, not the controller", () => {
    const { s: s0, ap, opp, ids } = setup([path]);
    const b = putOnBattlefield(s0, ap, bear);
    s0.objects[b]!.owner = opp;
    const [mine, theirs] = [s0.players[ap]!.life, s0.players[opp]!.life];
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: b }]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(b);
    expect([s.players[ap]!.life, s.players[opp]!.life]).toEqual([mine, theirs + 4]);
  });

  it("Melt Terrain: 2 damage to the land's controller", () => {
    const { s: s0, ap, opp, ids } = setup([melt]);
    const l = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: l }]);
    expect(s.objects[l]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Melt Terrain: the damage is dealt even if the land isn't destroyed", () => {
    const { s: s0, ap, opp, ids } = setup([melt]);
    const l = putOnBattlefield(s0, opp, citadel);
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: l }]);
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Peak Eruption: only a Mountain can be targeted", () => {
    const { s: s0, ap, opp, ids } = setup([peak]);
    const m = putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
    const f = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    const life = s0.players[opp]!.life;
    expect(() => cast(s0, ap, ids[0]!, [{ kind: "object", id: f }])).toThrow();
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: m }]);
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});
