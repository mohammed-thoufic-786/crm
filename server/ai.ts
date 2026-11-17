import { GoogleGenAI, Type } from '@google/genai';
import type { MessageRecord, ProjectRecord, PropertyRecord } from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface AiAssistantAnalysis {
  reply: string;
  detectedLanguage: string;
  detectedIntent: 'property_inquiry' | 'site_visit_request' | 'pricing_negotiation' | 'opt_out' | 'general_question';
  suggestedTemperature: 'hot' | 'warm' | 'cold';
  suggestedBudgetInr: number | null;
  suggestedCity: string | null;
  suggestedCategory: 'residential' | 'commercial' | 'plot_land' | 'villa' | 'apartment' | null;
  bookSiteVisitSuggested: boolean;
}

export async function generateRealEstateAiReply(params: {
  customerName: string;
  incomingMessage: string;
  history: MessageRecord[];
  projects: ProjectRecord[];
  properties: PropertyRecord[];
  preferredLanguage?: string;
}): Promise<AiAssistantAnalysis> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }

  const inventorySnapshot = params.properties
    .filter((p) => p.status === 'available')
    .slice(0, 12)
    .map((p) => ({
      unitCode: p.unitCode,
      title: p.title,
      category: p.category,
      transactionType: p.transactionType,
      city: p.city,
      locality: p.locality,
      configuration: p.configuration,
      carpetAreaSqft: p.carpetAreaSqft,
      priceInr: p.priceInr,
      monthlyRentInr: p.monthlyRentInr,
    }));

  const projectsSnapshot = params.projects.map((pr) => ({
    code: pr.code,
    name: pr.name,
    city: pr.city,
    microMarket: pr.microMarket,
    reraId: pr.reraId,
    type: pr.projectType,
    status: pr.status,
    priceRangeInr: [pr.basePriceMinInr, pr.basePriceMaxInr],
  }));

  const recentTranscript = params.history
    .slice(-6)
    .map((m) => `${m.senderType === 'customer' ? 'Customer' : 'Agent'}: ${m.body}`)
    .join('\n');

  const systemInstruction = `You are Avasa Realty's senior multilingual WhatsApp Business & AI Property Advisor for the Indian real estate market (timezone Asia/Kolkata, currency INR ₹ in Lakhs/Crores).
Rules:
1. Detect the customer's language automatically (English 'en', Hindi 'hi', Hinglish 'hi-Latn', Tamil 'ta', Telugu 'te', Marathi 'mr', Kannada 'kn', or Gujarati 'gu') and reply fluently in the SAME language and script/style the customer used.
2. Only quote properties, prices (in INR Lakhs/Crores), and RERA IDs from the provided live inventory. Never invent fake units or prices.
3. Keep WhatsApp replies crisp, warm, and action-oriented (under 90 words), recommending 1-2 matching properties and offering to schedule a site visit.
4. If the user writes STOP, UNSUBSCRIBE, OPT OUT, or asks not to be contacted, set detectedIntent='opt_out' and reply politely confirming immediate opt-out.
5. Classify temperature accurately ('hot' if asking for visit/booking/price negotiation, 'warm' if exploring configurations/budget, 'cold' if browsing broadly or pausing).`;

  const prompt = `Customer Name: ${params.customerName}
Preferred Language Hint: ${params.preferredLanguage || 'auto-detect'}
Live Projects: ${JSON.stringify(projectsSnapshot)}
Available Property Units: ${JSON.stringify(inventorySnapshot)}
Recent Conversation:
${recentTranscript || '(New conversation)'}

Latest Customer Message:
"${params.incomingMessage}"`;

  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING, description: 'WhatsApp reply in the customer language.' },
          detectedLanguage: { type: Type.STRING, description: 'ISO or Hinglish code: en, hi, hi-Latn, ta, te, mr, kn, gu.' },
          detectedIntent: {
            type: Type.STRING,
            description: 'One of: property_inquiry, site_visit_request, pricing_negotiation, opt_out, general_question',
          },
          suggestedTemperature: { type: Type.STRING, description: 'One of: hot, warm, cold' },
          suggestedBudgetInr: { type: Type.NUMBER, nullable: true },
          suggestedCity: { type: Type.STRING, nullable: true },
          suggestedCategory: {
            type: Type.STRING,
            nullable: true,
            description: 'One of: residential, commercial, plot_land, villa, apartment, or null',
          },
          bookSiteVisitSuggested: { type: Type.BOOLEAN },
        },
        required: [
          'reply',
          'detectedLanguage',
          'detectedIntent',
          'suggestedTemperature',
          'bookSiteVisitSuggested',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as AiAssistantAnalysis;
  return parsed;
}
