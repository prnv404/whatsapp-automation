import { Database } from "bun:sqlite";
import { config } from "./config";
import type { Lead } from "./types";

let db: Database;

export function initDatabase() {
  db = new Database(config.dbPath, { create: true });

  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      push_name TEXT,
      first_message TEXT,
      first_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'new'
    );
  `);
  
  // Add push_name column to existing database if it doesn't exist
  try {
    db.run(`ALTER TABLE leads ADD COLUMN push_name TEXT;`);
    console.log("Added push_name column to leads table.");
  } catch (err: any) {
    // Ignore error if column already exists
  }
  
  console.log("Database initialized successfully.");
}

export function isExistingLead(phone: string): boolean {
  const query = db.query(`SELECT id FROM leads WHERE phone = $phone`);
  const result = query.get({ $phone: phone });
  
  if (result) {
    const update = db.query(`UPDATE leads SET last_message_at = CURRENT_TIMESTAMP WHERE phone = $phone`);
    update.run({ $phone: phone });
    return true;
  }
  
  return false;
}

export function saveLead(phone: string, firstMessage: string, pushName: string = ''): void {
  const insert = db.query(`
    INSERT INTO leads (phone, first_message, push_name)
    VALUES ($phone, $firstMessage, $pushName)
  `);
  insert.run({
    $phone: phone,
    $firstMessage: firstMessage,
    $pushName: pushName,
  });
}
