import { initDatabase, isExistingLead, saveLead } from './database';
import { initClassifier, classifyMessage } from './classifier';
import { initializeWhatsApp, getMessageText, sendWhatsAppMessage } from './whatsapp';
import { config } from './config';
import { FrappeClient } from './services/frappe.service';

const frappeClient = new FrappeClient();

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

  if (exists) {
    // 5. If the number already exists: Update last_message_at (done in isExistingLead), do not classify again
    console.log(`[DEBUG] Ignored: ${phone} is an existing lead. Not classifying again.`);
    
    // Send subsequent messages as comments to Frappe CRM (DISABLED)
    // try {
    //   const response = await frappeClient.createOrGetLead({
    //     name: pushName,
    //     phone: phone,
    //     description: messageText
    //   });
    //   console.log(`[Frappe CRM] Existing lead follow-up. Action: ${response.action}, Lead ID: ${response.leadId}`);
    // } catch (error) {
    //   console.error(`[Frappe CRM] Failed to update lead:`, error);
    // }
    return;
  }

  // 6. If the number does not exist: Send message text to Gemini
  console.log(`[${phone}] New user detected. Analyzing message for lead intent...`);
  const result = await classifyMessage(messageText);
  console.log(`[DEBUG] Classification result for ${phone}: ${result}`);

  if (result === 'LEAD') {
    // 7. If result = LEAD
    saveLead(phone, messageText, pushName);
    
    let frappeLeadId = '';
    // Create lead in Frappe CRM (DISABLED)
    // try {
    //   const response = await frappeClient.createOrGetLead({
    //     name: pushName,
    //     phone: phone,
    //     description: messageText
    //   });
    //   frappeLeadId = response.leadId;
    //   console.log(`[Frappe CRM] Processed new lead. Action: ${response.action}, Lead ID: ${frappeLeadId}`);
    // } catch (error) {
    //   console.error(`[Frappe CRM] Failed to create lead:`, error);
    // }

    console.log('\n----------------------------------------------------');
    console.log('🚨 NEW HOUSEBOAT LEAD DETECTED 🚨');
    console.log(`Phone: ${phone}`);
    console.log(`Name:  ${pushName}`);
    console.log(`Message: "${messageText}"`);
    console.log('----------------------------------------------------\n');

    // Send notification to the specific WhatsApp group
    try {
      const groupMsg = `🚨 *NEW HOUSEBOAT LEAD DETECTED* 🚨\n\n*Name:* ${pushName}\n*Phone:* ${phone}\n*Message:* "${messageText}"${frappeLeadId ? `\n*CRM Lead ID:* ${frappeLeadId}` : ''}`;
      await sendWhatsAppMessage('120363427759437268@g.us', { text: groupMsg });
      console.log(`[DEBUG] Sent lead notification to WhatsApp group.`);
    } catch (err) {
      console.error(`[DEBUG] Failed to send message to group:`, err);
    }
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
