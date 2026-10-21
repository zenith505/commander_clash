import { parseGroup } from "../packages/engine/src/oracle/targets";
for (const t of process.argv.slice(2)) console.log(t, "=>", JSON.stringify(parseGroup(t)));
