import { Database } from "bun:sqlite";
import { config } from "./src/config";

const dbPath = config.dbPath;

console.log(`Connecting to database at ${dbPath}...`);
const db = new Database(dbPath);

console.log('Flushing leads table...');
try {
  // Delete all records from the leads table
  db.run('DELETE FROM leads;');
  
  // Reset the auto-increment counter for the leads table
  db.run('DELETE FROM sqlite_sequence WHERE name="leads";');
  
  console.log('Database flushed successfully.');
} catch (error) {
  console.error('Error flushing database:', error);
} finally {
  db.close();
}
