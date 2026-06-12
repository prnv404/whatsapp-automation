import { initDatabase, isExistingLead, saveLead } from './database';
import { initClassifier, classifyMessage } from './classifier';
import { initializeWhatsApp, getMessageText } from './whatsapp';
import { config } from './config';

async function handleMessageUpsert(m: any) {
  console.log(`[DEBUG] Received message upsert event. Type: ${m.type}`);
  const message = m.messages[0];
  
  // Log the RAW message exactly as it comes from the library
  console.log("\n================ RAW MESSAGE START ================");
  console.log(JSON.stringify(message, null, 2));
  console.log("================ RAW MESSAGE END ================\n");
  
  if (!message || !message.key || !message.key.remoteJid) {
    console.log(`[DEBUG] Ignored: Invalid message format or missing remoteJid`);
    return;
  }

  const jid = message.key.remoteJid;
  console.log(`[DEBUG] Message from JID: ${jid}`);
  
  // 2. Ignore messages sent by myself, group messages, broadcast messages, status updates
  if (
    message.key.fromMe ||
    jid.endsWith('@g.us') ||
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast')
  ) {
    console.log(`[DEBUG] Ignored: Message is from me, group, or broadcast.`);
    return;
  }

  // Only handle notify type messages (actual incoming messages, not history syncs)
  if (m.type !== 'notify') {
    console.log(`[DEBUG] Ignored: Message type is not 'notify' (it is '${m.type}').`);
    return;
  }

  // 3. Extract phone number and message text
  let phone = jid.split('@')[0];
  
  if (jid.endsWith('@lid')) {
    console.log(`[DEBUG] Received message from LID: ${jid}. Checking for real phone number...`);
    
    // Check various places where the real phone number might be hidden
    if (message.key?.remoteJidAlt && typeof message.key.remoteJidAlt === 'string' && message.key.remoteJidAlt.includes('@s.whatsapp.net')) {
      phone = message.key.remoteJidAlt.split('@')[0];
      console.log(`[DEBUG] Found real phone number in message.key.remoteJidAlt: ${phone}`);
    } else if (message.remoteJidAlt && typeof message.remoteJidAlt === 'string' && message.remoteJidAlt.includes('@s.whatsapp.net')) {
      phone = message.remoteJidAlt.split('@')[0];
      console.log(`[DEBUG] Found real phone number in message.remoteJidAlt: ${phone}`);
    } else if (message.participant && typeof message.participant === 'string' && message.participant.includes('@s.whatsapp.net')) {
      phone = message.participant.split('@')[0];
      console.log(`[DEBUG] Found real phone number in message.participant: ${phone}`);
    } else if (message.key?.participant && typeof message.key.participant === 'string' && message.key.participant.includes('@s.whatsapp.net')) {
      phone = message.key.participant.split('@')[0];
      console.log(`[DEBUG] Found real phone number in message.key.participant: ${phone}`);
    } else {
      console.log(`[DEBUG] Could not find real phone number for LID.`);
    }
  }

  const messageText = getMessageText(message.message);

  if (!messageText) {
    console.log(`[DEBUG] Ignored: No readable text in message from ${phone}.`);
    return;
  }
  
  console.log(`[DEBUG] Extracted text from ${phone}: "${messageText}"`);

  const pushName = message.pushName || '';

  // 4. Check if phone number already exists in SQLite
  const exists = isExistingLead(phone);
  console.log(`[DEBUG] Lead exists in DB: ${exists}`);

  let classificationResult = 'EXISTING_LEAD';

  if (exists) {
    // 5. If the number already exists: Update last_message_at (done in isExistingLead), do not classify again
    console.log(`[DEBUG] Ignored: ${phone} is an existing lead. Not classifying again.`);
  } else {
    // 6. If the number does not exist: Send message text to Gemini
    console.log(`[${phone}] New user detected. Analyzing message for lead intent...`);
    classificationResult = await classifyMessage(messageText);
    console.log(`[DEBUG] Classification result for ${phone}: ${classificationResult}`);

    if (classificationResult === 'LEAD') {
      // 7. If result = LEAD
      saveLead(phone, messageText, pushName);

      console.log('\n----------------------------------------------------');
      console.log('🚨 NEW LEAD DETECTED 🚨');
      console.log(`Phone: ${phone}`);
      console.log(`Name:  ${pushName}`);
      console.log(`Message: "${messageText}"`);
      console.log('----------------------------------------------------\n');

      // Send webhook for new lead
      try {
        console.log(`[DEBUG] Sending webhook for new lead`);
        await fetch(config.dashboardApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: pushName || "Unknown",
            whatsappNumber: phone.startsWith('+') ? phone : '+' + phone,
            status: "New",
            lastMessage: messageText,
            source: "WhatsApp"
          })
        });
        console.log(`[DEBUG] Sent lead notification to webhook.`);
      } catch (err) {
        console.error(`[DEBUG] Failed to send webhook:`, err);
      }

    } else {
      // 8. If result = NO -> Ignore
      console.log(`[${phone}] Not a lead. Ignored.`);
    }
  }


}

async function start() {
  console.log("Starting Lead Detection System...");
  
  initDatabase();
  initClassifier();
  await initializeWhatsApp(handleMessageUpsert);

  // Run the Bun HTTP Server to keep process alive and provide status
  Bun.serve({
    port: config.serverPort,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/") {
        return new Response("Lead Detection System is running.\n");
      }

      if (url.pathname === "/status") {
        return new Response(JSON.stringify({ status: "running" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/api/demo-insert" && req.method === "POST") {
        try {
          const body = await req.json();
          console.log('\n================ DEMO API RECEIVED DATA ================');
          console.log(JSON.stringify(body, null, 2));
          console.log('========================================================\n');
          return new Response(JSON.stringify({ success: true, message: "Data received by demo API" }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`Bun server running on http://localhost:${config.serverPort}`);
}

start().catch(console.error);
