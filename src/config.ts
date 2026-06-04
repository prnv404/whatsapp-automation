export const config = {
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  waSessionPath: process.env.WHATSAPP_SESSION_PATH || 'auth_info_baileys',
  dbPath: 'leads.db',
  serverPort: process.env.PORT ? parseInt(process.env.PORT) : 3000,
};
