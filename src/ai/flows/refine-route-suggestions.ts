'use server';

/**
 * @fileOverview Refines route suggestions from Google Maps based on user reviews.
 *
 * - refineRouteSuggestions - A function that refines route suggestions.
 * - RefineRouteSuggestionsInput - The input type for the refineRouteSuggestions function.
 * - RefineRouteSuggestionsOutput - The return type for the refineRouteSuggestions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RefineRouteSuggestionsInputSchema = z.object({
  googleMapsRoute: z.string().describe('The original route suggestion from Google Maps.'),
  poiId: z.string().describe('The ID of the point of interest.'),
  recentUserReviews: z.string().describe('Recent user reviews about routes to the POI.'),
});
export type RefineRouteSuggestionsInput = z.infer<typeof RefineRouteSuggestionsInputSchema>;

const RefineRouteSuggestionsOutputSchema = z.object({
  refinedRoute: z.string().describe('The refined route suggestion based on user reviews, considering safety, street closures and construction.'),
});
export type RefineRouteSuggestionsOutput = z.infer<typeof RefineRouteSuggestionsOutputSchema>;

export async function refineRouteSuggestions(input: RefineRouteSuggestionsInput): Promise<RefineRouteSuggestionsOutput> {
  return refineRouteSuggestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'refineRouteSuggestionsPrompt',
  input: {schema: RefineRouteSuggestionsInputSchema},
  output: {schema: RefineRouteSuggestionsOutputSchema},
  prompt: `You are an AI assistant designed to refine route suggestions for users based on recent user reviews.

  Given the original route suggestion from Google Maps and recent user reviews about routes to the point of interest, provide a refined route suggestion that avoids unsafe or unreliable paths.

  Consider factors such as safety, street closures, and unexpected construction as reported in the user reviews.

  Original Google Maps Route: {{{googleMapsRoute}}}
  Recent User Reviews: {{{recentUserReviews}}}

  Refined Route Suggestion:`,
});

const refineRouteSuggestionsFlow = ai.defineFlow(
  {
    name: 'refineRouteSuggestionsFlow',
    inputSchema: RefineRouteSuggestionsInputSchema,
    outputSchema: RefineRouteSuggestionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
