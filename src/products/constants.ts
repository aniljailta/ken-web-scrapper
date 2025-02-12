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
              'The product name or PID the user is referencing (e.g., C1-C2720X-24PS-L, 3560-CX, 9000 , 9500, 7000 etc. as these are cisco product series) and if there are multiple product so separate them with space. If the user does not explicitly mention a product, return an empty string ("").',
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
