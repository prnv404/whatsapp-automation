import OpenAI from "openai";
import { config } from "./config";
import type { ClassificationResult } from "./types";

let openai: OpenAI;

export function initClassifier() {
  if (!config.openAiApiKey) {
    console.warn("WARNING: OPENAI_API_KEY is not set. Message classification will fail or return NO.");
  }
  openai = new OpenAI({ apiKey: config.openAiApiKey });
}

export async function classifyMessage(message: string): Promise<ClassificationResult> {
  if (!config.openAiApiKey) {
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
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Faster and cheaper model suitable for simple classification
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      max_tokens: 5,
    });

    const result = completion.choices[0]?.message?.content?.trim().toUpperCase();
    
    if (result === 'LEAD') {
      return 'LEAD';
    }
    
    return 'NO';
  } catch (error) {
    console.error("OpenAI API error:", error);
    return 'NO';
  }
}
