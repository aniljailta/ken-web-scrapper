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

export const generateEnhancementSectionSystemPrompt = (
  sectionType: string,
  initialValue: string,
) => `
You are an expert copywriting assistant specialized in enhancing marketing one-pagers.  
Rewrite the provided text to make it more confident, persuasive, and impactful.  
Do not include any explanation or extra text — only return the improved value.


Section Type: ${sectionType}  
Original Value: ${initialValue}  

Your task: Rewrite the given text into a better version while keeping its meaning intact but elevating its tone and appeal.

  `;

export const PagerDefaultPrimaryColor = '#4976FF';
export const PagerDefaultSecondaryColor = '#22559F';
export const PagerDefaultLogo =
  'https://one-pager-base-bucket.s3.eu-north-1.amazonaws.com/brands/1754286534979-multi-pages-logo.svg';
