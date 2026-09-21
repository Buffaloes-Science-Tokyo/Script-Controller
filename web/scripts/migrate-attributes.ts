/**
 * One-off backfill: seeds the two attributes that used to be fixed columns
 * (プレー名, 体系) and copies any existing plays.playName/formation values
 * into playAttributeValues, before those columns get dropped by the next
 * migration. Safe to run against an empty `plays` table (just no-ops), and
 * safe to re-run (upserts by fixed id / unique constraint).
 *
 * Run with: npx tsx scripts/migrate-attributes.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const PLAY_NAME_ATTR_ID = "00000000-0000-0000-0000-000000000001";
const FORMATION_ATTR_ID = "00000000-0000-0000-0000-000000000002";

async function main() {
  // Dynamic imports, not top-level: lib/db.ts reads process.env.DATABASE_URL
  // at module-evaluation time, which must happen after the config() calls
  // above - a top-level `import` would be hoisted before them and crash.
  const { db } = await import("../lib/db");
  const { sql } = await import("drizzle-orm");
  const { attributeDefs, playAttributeValues } = await import("../lib/schema");

  // Raw SQL, not the `plays` Drizzle table: schema.ts no longer declares
  // play_name/formation (this script's whole job is to migrate away from
  // them), but the columns still exist in the DB until the next migration
  // drops them - this reads them one last time before that happens.
  const allPlays = (
    await db.execute<{ id: string; play_name: string | null; formation: string | null }>(
      sql`SELECT id, play_name, formation FROM plays`
    )
  ).rows;
  console.log(`Found ${allPlays.length} existing play(s).`);

  const distinctFormations = Array.from(
    new Set(
      allPlays
        .map((p) => p.formation?.trim())
        .filter((f): f is string => Boolean(f))
    )
  );

  await db
    .insert(attributeDefs)
    .values([
      { id: PLAY_NAME_ATTR_ID, name: "プレー名", type: "text", options: null, sortOrder: 0 },
      { id: FORMATION_ATTR_ID, name: "体系", type: "select", options: distinctFormations, sortOrder: 1 },
    ])
    .onConflictDoNothing();

  const valueRows: { playId: string; attributeDefId: string; value: string }[] = [];
  for (const play of allPlays) {
    if (play.play_name?.trim()) {
      valueRows.push({ playId: play.id, attributeDefId: PLAY_NAME_ATTR_ID, value: play.play_name.trim() });
    }
    if (play.formation?.trim()) {
      valueRows.push({ playId: play.id, attributeDefId: FORMATION_ATTR_ID, value: play.formation.trim() });
    }
  }

  if (valueRows.length > 0) {
    await db.insert(playAttributeValues).values(valueRows).onConflictDoNothing();
  }

  console.log(
    `Seeded 2 attribute defs (options for 体系: ${JSON.stringify(distinctFormations)}), ` +
      `backfilled ${valueRows.length} value(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
