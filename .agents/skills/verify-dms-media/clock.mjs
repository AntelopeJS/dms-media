import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * @typedef {import("./media.mjs").Ctx} Ctx
 * @typedef {{ updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ matchedCount: number }>, findOne: (filter: Record<string, unknown>) => Promise<Record<string, unknown> | null> }} Collection
 * @typedef {{ collection: (name: string) => Collection, listCollections: () => { toArray: () => Promise<{ name: string }[]> } }} Database
 * @typedef {{ connect: () => Promise<unknown>, db: (name: string) => Database, close: () => Promise<void> }} Client
 * @typedef {{ MongoClient: new (url: string, options?: Record<string, unknown>) => Client }} Driver
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DMS_PACKAGE = join(HERE, "../../../packages/dms-media/node_modules/@antelopejs/dms/package.json");
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {unknown} value A module namespace
 * @returns {value is Driver} Whether it is the MongoDB driver
 */
function isDriver(value) {
  return typeof value === "object" && value !== null && "MongoClient" in value && typeof value.MongoClient === "function";
}

/**
 * The MongoDB driver dms-control itself uses to drop a journey's database.
 *
 * @returns {Promise<Driver>} The driver
 */
async function driver() {
  const resolved = createRequire(DMS_PACKAGE).resolve("mongodb");
  /** @type {unknown} */
  const loaded = await import(pathToFileURL(resolved).href);
  if (isDriver(loaded)) return loaded;
  throw new Error("the MongoDB driver dms-control resolves has no MongoClient");
}

/**
 * Moves a stored row back in time: no request can age a file or an event, and the 24-hour, 7-day and 30-day
 * windows need rows older than the run. Writes straight to the run's database, in every collection of that table.
 *
 * @param {Ctx} ctx The journey
 * @param {"media_assets" | "media_events"} table The module's table
 * @param {string} id The row's id
 * @param {Record<string, number>} daysAgo Each date field and how many days back to set it
 * @returns {Promise<number>} How many rows it changed, 1 when the id exists
 */
export async function age(ctx, table, id, daysAgo) {
  const { MongoClient } = await driver();
  const client = new MongoClient(ctx.state.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const database = client.db(ctx.state.database);
    const names = (await database.listCollections().toArray()).map((entry) => entry.name).filter((name) => name.endsWith(table));
    const now = Date.now();
    const fields = Object.fromEntries(Object.entries(daysAgo).map(([field, days]) => [field, new Date(now - days * DAY_MS)]));
    let matched = 0;
    for (const name of names) matched += (await database.collection(name).updateOne({ _id: id }, { $set: fields })).matchedCount;
    return matched;
  } finally {
    await client.close();
  }
}

/**
 * Reads a stored row of the module's table as the run's database holds it, for a fact no request returns, such as
 * the storage key of a file.
 *
 * @param {Ctx} ctx The journey
 * @param {"media_assets" | "media_events"} table The module's table
 * @param {string} id The row's id
 * @returns {Promise<Record<string, unknown> | null>} The row, or null when no collection holds it
 */
export async function storedRow(ctx, table, id) {
  const { MongoClient } = await driver();
  const client = new MongoClient(ctx.state.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const database = client.db(ctx.state.database);
    const names = (await database.listCollections().toArray()).map((entry) => entry.name).filter((name) => name.endsWith(table));
    for (const name of names) {
      const row = await database.collection(name).findOne({ _id: id });
      if (row) return row;
    }
    return null;
  } finally {
    await client.close();
  }
}
