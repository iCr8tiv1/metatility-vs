import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const schemaRoot = new URL("../../../supabase/", import.meta.url);
const read = (relative) => readFile(new URL(relative, schemaRoot), "utf8");
const fixture = await read("tests/genesis_foundation_base_fixture.sql");
const workforce = (await read("genesis_v01_workforce.sql")).replace(/^create extension if not exists pgcrypto;\s*$/mi, "");
const migration = await read("migrations/20261017214829_genesis_foundation_v1.sql");

// PGlite is an isolated PostgreSQL engine. The base fixture is reconstructed
// from app usage, NOT a recovered production schema or a production migration.
for (const suite of ["genesis_foundation_lifecycle.sql", "genesis_foundation_gates.sql"]) {
  const database = new PGlite();
  try {
    await database.exec(fixture);
    await database.exec(workforce);
    await database.exec(migration);
    await database.exec(migration); // The additive migration can be reapplied safely.
    await database.exec(await read(`tests/${suite}`));
    console.log(`PASS ${suite} (isolated PostgreSQL fixture)`);
  } catch (error) {
    console.error(`FAIL ${suite}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
    break;
  } finally {
    await database.close();
  }
}
