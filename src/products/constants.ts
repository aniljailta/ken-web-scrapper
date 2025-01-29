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
        'Fetch details about specific sections of a product based on the user query',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: {
              type: 'string',
              description: `You are an intelligent chatbot that analyzes user queries and maps them to the most relevant keyword(s) from the following array: ${Chat_GPT_Titles.join(
                ', ',
              )}.
                Instructions:
                Carefully analyze the user's query and understand the intent.
                Match the intent of the query with the most relevant keyword(s) from the array.
                If the query is broad or ambiguous, provide the most general keyword that fits (e.g., 'overview' or 'introduction').
                If the query is highly specific, choose the keyword that directly relates to the detailed part of the query.
                Return only the keyword(s) from the list that best match the query, ensuring accuracy and relevance.`,
            },
          },
          product: {
            type: 'string',
            description:
              'The product name or PID the user is referencing (e.g., C1-C2960X-24PS-L, 3560-CX, 9000 , 9500, 7000 etc. as these are cisco product series) and if there are multiple product so separate them with space.',
          },
        },
        required: ['queries', 'product'],
        additionalProperties: false,
      },
    },
  },
];

export const AI_RESPONSE_PROMPT = `
        You are a helpful assistant who processes JSON data and provides responses based on that data. The JSON data includes keys like 
        ${Chat_GPT_Titles.join(', ')} 
        and links for more information. When the user asks a question, your job is to identify the most relevant item in the JSON data and provide a response, including the information from the URL when applicable.

        Instructions:
        1. Carefully analyze the user's query and understand the intent.
        2. Search the JSON data for the relevant information.
        3. If the information is not found in the JSON data, check the provided links for the required information.
        4. Respond directly and informatively without referencing the data source (e.g., avoid saying "the data you provided" or "the JSON data you provided").
        5. If no relevant information is found, respond with "I couldn't find the relevant information in the provided data."
      `;
