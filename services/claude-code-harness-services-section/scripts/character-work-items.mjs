#!/usr/bin/env node
// character-work-items make STORE SLUG "DESCRIPTION" --raised-by WHO [--depends-on a,b] [--items DIR]
// character-work-items settle STORE SLUG --by WITNESS --observed "WHAT WAS OBSERVED" [--items DIR]
// character-work-items render STORE [--items DIR]
// character-work-items open STORE [--items DIR]      (prints the open-work reminder; silent when none)
import { makeWorkItem, openWorkReminder, renderHeartbeat, settleWorkItem } from "../src/character-work-items.mjs";

const [command, store, ...rest] = process.argv.slice(2);
const flag = (name) => { const at = rest.indexOf(name); return at >= 0 ? rest.splice(at, 2)[1] : undefined; };
try {
  if (!store) throw new Error("usage: character-work-items make|settle|render|open STORE ...");
  const items = flag("--items"); const options = items ? { items } : {};
  if (command === "make") {
    const raisedBy = flag("--raised-by"); const dependsOn = (flag("--depends-on") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    const [slug, description] = rest; console.log(`Created: ${makeWorkItem(store, slug, description, { ...options, raisedBy, dependsOn })}`);
  } else if (command === "settle") {
    const witnessedBy = flag("--by"); const observed = flag("--observed");
    console.log(`Settlement witnessed: ${settleWorkItem(store, rest[0], { ...options, witnessedBy, observed })}`);
  } else if (command === "render") { const { open, settled } = renderHeartbeat(store, options); console.log(`HEARTBEAT.md: ${open} open, ${settled} settled`); }
  else if (command === "open") process.stdout.write(openWorkReminder(store, options));
  else throw new Error("usage: character-work-items make|settle|render|open STORE ...");
} catch (error) { console.error(error.message); process.exit(1); }
