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
  if (!config.geminiApiKey) {
    return 'NO';
  }

  const prompt = `Classify the message.

    Return ONLY:

    LEAD
    or
    NO

    A LEAD is someone asking about:

    * Houseboat booking
    * Houseboat availability
    * Rates
    * Packages
    * Alleppey cruise
    * Backwater cruise
    * Stay options
    * Tourism enquiries
    * Reservation requests

      Message:
      ${message}`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
            temperature: 0.0,
            maxOutputTokens: 5,
        }
    }); 

    const result = response.text?.trim().toUpperCase();
    
    if (result === 'LEAD') {
      return 'LEAD';
    }
    
    return 'NO';
  } catch (error) {
    console.error("Gemini API error:", error);
    return 'NO';
  }
}
