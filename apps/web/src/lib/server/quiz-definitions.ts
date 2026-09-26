/** Curated definitions supplied by the game author. Never included in the question sent to the browser. */
export const QUIZ_DEFINITIONS = {
  larp: {
    definition: "Pretending to be someone you are not, faking an interest, or putting on a performative act for an audience.",
    rubric: "Accept pretending, a fake persona, or performative interest. The intended slang meaning is not simply playing a live-action role-playing game.",
  },
  yap: {
    definition: "Talking excessively or rambling about trivial things without getting to the point.",
    rubric: "Look for excessive, rambling, or pointless talking. Do not require every synonym.",
  },
  hypergamy: {
    definition: "Marrying or dating someone with higher social status, greater wealth, or a higher educational level than oneself.",
    rubric: "Must involve dating or marrying upward in status, wealth, or education. Any one of those dimensions suffices; do not impose a gender restriction.",
  },
  tokenmaxxing: {
    definition: "Maximizing AI token usage through prompts, coding sessions, or parallel agents to signal productivity, AI proficiency, or status.",
    rubric: "Core idea: deliberately using more AI tokens as a measure or display of productivity or status. Examples of how are optional. This is not minimizing tokens or financial cryptocurrency speculation.",
  },
  clanker: {
    definition: "A derogatory term for robots or artificial intelligence.",
    rubric: "Accept a slur or insult aimed at robots or AI. Merely saying robot without the insulting sense is partial credit.",
  },
  cracked: {
    definition: "Highly skilled or exceptionally talented, especially at coding.",
    rubric: "Accept exceptionally skilled, talented, or very good at something. Coding is an example, not required. Broken or damaged is not the intended slang sense.",
  },
} as const;
