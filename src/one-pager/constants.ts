export const detectTopicClusterSystemPrompt = (chunkMap: any, prompt: string) =>
  `
${prompt}

${JSON.stringify(chunkMap, null, 2)}

Respond only with valid JSON.
    `.trim();

export const generateOnePagerSystemPrompt = (
  chunkTexts: string[],
  prompt: string,
) =>
  `
${prompt}

Content:
${chunkTexts.join('\n\n')}

Respond with valid JSON only.
    `.trim();
