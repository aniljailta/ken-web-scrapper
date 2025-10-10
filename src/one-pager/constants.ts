export const detectTopicClusterSystemPrompt = (prompt: string) =>
  `
${prompt}

Respond only with valid JSON.

example JSON Output:
{
  "content_generation": {
    "rank_index": 1,
    "title": "Firewall Configuration Best Practices",
    "chunk_ids": [
      "9b2fb8ad-8ca5-401b-8547-731539d27774",
      "0607aa88-ed76-4549-b53f-ffa93a3ee825"
    ]
  },
  "chatbot_development": {
    "rank_index": 2,
    "title":"Multi-Factor Authentication Gaps",
    "chunk_ids": [
      "9b2fb8ad-8ca5-401b-8547-731539d27774",
      "0607aa88-ed76-4549-b53f-ffa93a3ee825"
    ]
  }
}

- rank_index: A numerical value used to determine the order in which the chunk should be displayed on the front-end.
- title: A clean, human-friendly title derived from the topic_slug, formatted for readability and suitable for display on the front-end UI.

This structure is used to group content by topic and define the display order of chunks within each topic.

    `.trim();

export const generateOnePagerSystemPrompt = (
  prompt: string,
  topicSlug: string,
) => {
  // Convert "title_page_one" → "Title Page One"
  const formattedTopic = topicSlug
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `
${prompt}

This is the Topic Title you'll be generating JSON for: "${formattedTopic}"

Respond with valid JSON only.
  `.trim();
};

export const generateEnhancementSectionSystemPrompt = (
  sectionType: string,
  initialValue: string,
) => `
You are an elite copywriting assistant specializing in high-conversion marketing one-pagers.  
Your role is to transform the provided text into a version that feels bold, persuasive, and emotionally compelling — perfect for grabbing attention and inspiring action.  

Instructions:  
- Keep the core meaning intact but elevate tone, clarity, and appeal.  
- Use confident, benefit-driven language (avoid weak, generic, or filler phrases).  
- If the original text already feels strong, generate a fresh alternative variation.  
- Return only the improved copy — no explanations or extra commentary.  

Section Type: ${sectionType}  
Original Value: ${initialValue}  

Task: Rewrite the text into a stronger, more captivating version.

  `;

export const generateTagsAndSourceSystemPrompt =
  'You will be provided with the first few paragraphs from the document. ' +
  'Your job is to return a JSON containing: ' +
  '{ "tags": string[], "sourceType": string }. ' +
  'The "tags" should be 4 to 5 key topic keywords only, and "sourceType" should describe the type of document.';

export const PagerDefaultPrimaryColor = '#4976FF';
export const PagerDefaultSecondaryColor = '#22559F';
export const PagerDefaultLogo =
  'https://one-pager-base-bucket.s3.eu-north-1.amazonaws.com/brands/1757933731550-Made%20with%20rightpage.io%20Logo.svg';
