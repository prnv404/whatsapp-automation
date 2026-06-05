import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, type proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from './config';

let currentSock: any = null;

export async function initializeWhatsApp(onMessageUpsert: (m: any) => Promise<void>) {
  const { state, saveCreds } = await useMultiFileAuthState(config.waSessionPath);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any,
    browser: Browsers.macOS('Desktop'),
  });

  currentSock = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('Scan the QR code below to authenticate:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('WhatsApp connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        initializeWhatsApp(onMessageUpsert).catch(console.error);
      }
    } else if (connection === 'open') {
      console.log('WhatsApp opened connection');
    }
  });

  sock.ev.on('creds.update', saveCreds);
  
  // Attach the message upsert handler
  sock.ev.on('messages.upsert', onMessageUpsert);

  return sock;
}

export function getMessageText(message: proto.IMessage | null | undefined): string | undefined {
  if (!message) return undefined;

  return message.conversation || 
         message.extendedTextMessage?.text || 
         message.imageMessage?.caption || 
         message.videoMessage?.caption || 
         undefined;
}

export async function sendWhatsAppMessage(jid: string, content: any) {
  if (!currentSock) {
    throw new Error('WhatsApp socket not initialized');
  }
  return currentSock.sendMessage(jid, content);
}
