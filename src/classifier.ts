import { GoogleGenAI } from "@google/genai";
import { config } from "./config";
import type { ClassificationResult } from "./types";

let ai: GoogleGenAI;

export function initClassifier() {
  if (!config.geminiApiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not set. Message classification will fail or return NO.");
  }
  ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

export async function classifyMessage(message: string): Promise<ClassificationResult> {
  console.log(`[DEBUG] classifyMessage called with message: "${message}"`);
  if (!config.geminiApiKey) {
    console.log(`[DEBUG] classifyMessage: No API key, returning 'NO'`);
    return 'NO';
  }

  const prompt = `Classify the message.

    Return ONLY:

    LEAD
    or
    NO

    A LEAD is someone showing interest in a product or service, asking for pricing, availability, making a booking, or any general business enquiry.

      Message:
      ${message}`;

  try {
    console.log(`[DEBUG] Sending request to Gemini with prompt length: ${prompt.length}`);
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
            temperature: 0.0,
            maxOutputTokens: 50,
        }
    }); 

    const result = response.text?.trim().toUpperCase() || '';
    console.log(`[DEBUG] Gemini raw response: "${response.text}"`);
    console.log(`[DEBUG] Gemini parsed result: "${result}"`);
    
    if (result.includes('LEAD')) {
      return 'LEAD';
    }
    
    return 'NO';
  } catch (error) {
    console.error("[DEBUG] Gemini API error:", error);
    return 'NO';
  }
}
