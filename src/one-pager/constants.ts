export const detectTopicClusterSystemPrompt = (chunkMap: any, prompt: string) =>
  `
${prompt}

${JSON.stringify(chunkMap, null, 2)}

Respond only with valid JSON.

example JSON Output:
{
  "content_generation": {
    "rank_index": 1,
    "chunk_ids": [
      "9b2fb8ad-8ca5-401b-8547-731539d27774",
      "0607aa88-ed76-4549-b53f-ffa93a3ee825"
    ]
  },
  "chatbot_development": {
    "rank_index": 2,
    "chunk_ids": [
      "9b2fb8ad-8ca5-401b-8547-731539d27774",
      "0607aa88-ed76-4549-b53f-ffa93a3ee825"
    ]
  }
}

- rank_index: A numerical value used to determine the order in which the chunk should be displayed on the front-end.

This structure is used to group content by topic and define the display order of chunks within each topic.

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
