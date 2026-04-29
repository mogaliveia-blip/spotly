'use server';
/**
 * @fileOverview Un flux simple pour tester la connectivité Gemini via Genkit.
 * 
 * - testAI - Une fonction qui retourne une salutation de Gemini.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export async function testAI(name: string = 'Utilisateur'): Promise<string> {
  return testAIFlow(name);
}

const testAIFlow = ai.defineFlow(
  {
    name: 'testAIFlow',
    inputSchema: z.string().optional(),
    outputSchema: z.string(),
  },
  async (input) => {
    const {text} = await ai.generate({
      prompt: `Dis bonjour à ${input || 'l\'utilisateur'} et confirme que toi (Gemini) tu es bien connecté au projet Spotly. Sois concis, amical et en français.`,
    });
    return text;
  }
);
