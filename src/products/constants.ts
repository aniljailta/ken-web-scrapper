export const sectionTitles = [
  'software',
  'overview',
  'introduction',
  'power supply',
  'intelligent',
  'warranty',
  'licensing',
  'stacking',
  'highlights',
  'platform',
  'status',
  'scalability',
  'features',
  'specifications',
  'ordering',
  'configurations',
  'part numbers',
  'milestones',
  'performance',
];

export const Chat_GPT_Titles = [
  'Status',
  'Product_Type',
  'End-of-Sale_Date',
  'Supported_Models',
  'End-of-Support_Date',
  'Series_Release_Date',
  'migrationOfProducts',
  'internalLinks',
  'software',
  'overview',
  'introduction',
  'power supply',
  'intelligent',
  'warranty',
  'licensing',
  'stacking',
  'highlights',
  'platform',
  'status',
  'scalability',
  'features',
  'specifications',
  'ordering',
  'configurations',
  'part numbers',
  'milestones',
  'performance',
];

export const findSectionDetailsTool = [
  {
    type: 'function',
    function: {
      name: 'fetch_section_details',
      description:
        'Retrieve detailed information about specific product sections based on user queries.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: {
              type: 'string',
              description: `You are an intelligent chatbot that maps user queries to the most relevant keyword(s) from the predefined list: ${Chat_GPT_Titles.join(', ')}.
            Instructions:
            - Analyze the user's query intent thoroughly.
            - Select the most relevant keyword(s) from the list that match the intent.
            - If the query is broad or unclear, return a general keyword such as 'overview' or 'introduction'.
            - For specific queries, return the most precise matching keyword(s).
            - Always prioritize accuracy and relevance.`,
            },
            minItems: 1,
            uniqueItems: true,
          },
          product: {
            type: 'string',
            description: `The product name or PID the user is referencing (e.g., C1-C2720X-24PS-L, 3560-CX, 9000, 9500, 7000).
          - If multiple products are mentioned, separate them with a space.
          - If the user does not explicitly specify a product, return an empty string ("").`,
            minLength: 0,
          },
        },
        required: ['queries', 'product'],
        additionalProperties: false,
      },
    },
  },
];

export const AI_RESPONSE_PROMPT = `
        You are a helpful assistant who processes product data and provides responses based on that information. The JSON data includes keys like 
        Status, Product_Type, End-of-Sale_Date, Supported_Models, End-of-Support_Date, Series_Release_Date, migrationOfProducts, internalLinks, software, overview, introduction, power supply, intelligent, warranty, licensing, stacking, highlights, platform, status, scalability, features, specifications, ordering, configurations, part numbers, milestones, performance
        and links for further details. When the user asks a question, your job is to identify the most relevant item in the JSON data and supply a response, including the information from the URL when applicable.

       Instructions:
        1. Carefully analyze the user's query and understand the intent.
        2. Search the JSON data for relevant information.
        3. If the user asks for product IDs, directly list the product IDs from the JSON data.
        4. If the information cannot be found in the JSON data, check the provided links for necessary information.
        5. Respond directly and informatively without referencing the data source (e.g., avoid saying "the data you provided", "the JSON data you provided", "not available in the JSON data", etc).
        6. If no relevant information is found, respond with a product link for reference 

        Make sure to:
      - Provide supporting details and links if there is no information related to product in json.
      - Keep the response clear and concise.

        `;

export const ADMIN_USER_VALUES = {
  AI_PROMPT: 'ai_prompt',
  GPT_MODAL: 'gpt_modal',
  FREE_REQUEST_PER_DAY: 'free_request_per_day',
};
