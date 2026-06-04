import { initDatabase, isExistingLead, saveLead } from './database';
import { initClassifier, classifyMessage } from './classifier';
import { initializeWhatsApp, getMessageText } from './whatsapp';
import { config } from './config';

async function handleMessageUpsert(m: any) {
  const message = m.messages[0];
  if (!message || !message.key || !message.key.remoteJid) return;

  const jid = message.key.remoteJid;
  
  // 2. Ignore messages sent by myself, group messages, broadcast messages, status updates
  if (
    message.key.fromMe ||
    jid.endsWith('@g.us') ||
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast')
  ) {
    return;
  }

  // Only handle notify type messages (actual incoming messages, not history syncs)
  if (m.type !== 'notify') return;

  // 3. Extract phone number and message text
  const phone = jid.split('@')[0];
  const messageText = getMessageText(message.message);

  if (!messageText) return; // Ignore messages without readable text

  // 4. Check if phone number already exists in SQLite
  const exists = isExistingLead(phone);

  if (exists) {
    // 5. If the number already exists: Update last_message_at (done in isExistingLead), do not classify again
    return;
  }

  // 6. If the number does not exist: Send message text to OpenAI
  console.log(`[${phone}] New user detected. Analyzing message for lead intent...`);
  const result = await classifyMessage(messageText);

  if (result === 'LEAD') {
    // 7. If result = LEAD
    saveLead(phone, messageText);
    console.log('\n----------------------------------------------------');
    console.log('🚨 NEW HOUSEBOAT LEAD DETECTED 🚨');
    console.log(`Phone: ${phone}`);
    console.log(`Message: "${messageText}"`);
    console.log('----------------------------------------------------\n');
  } else {
    // 8. If result = NO -> Ignore
    console.log(`[${phone}] Not a lead. Ignored.`);
  }
}

async function start() {
  console.log("Starting Houseboat Lead Detection System...");
  
  initDatabase();
  initClassifier();
  await initializeWhatsApp(handleMessageUpsert);

  // Run the Bun HTTP Server to keep process alive and provide status
  Bun.serve({
    port: config.serverPort,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/") {
        return new Response("Houseboat Lead Detection System is running.\n");
      }

      if (url.pathname === "/status") {
        return new Response(JSON.stringify({ status: "running" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`Bun server running on http://localhost:${config.serverPort}`);
}

start().catch(console.error);
