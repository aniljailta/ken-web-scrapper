export const ALL_PRODUCT_LIST_URL =
  'https://www.cisco.com/c/en/us/products/a-to-z-series-index.html';

export const initialScraperConfig = {
  preTitle: '.cds-c-hero .cmp-teaser__pretitle',
  title: '.cds-c-hero .cmp-teaser__title',
  subtitle: '.cds-c-hero .cmp-teaser__description p',
  description: '.cds-c-detailblock__description p',
  benefits: {
    container: '.cds-c-detailblock__benefits-wrap .cds-c-cards',
    fields: {
      title: '.cds-c-cards__wrapper .cmp-teaser__title',
      description: '.cds-c-cards__wrapper .cmp-teaser__description p',
    },
  },
  dataModal: {
    modal:
      '.cmp-accordion__desktop-button-wrapper .cmp-accordion__desktop-button',
    fields: {
      title: '.cmp-accordion__item .cmp-teaser__title',
      content: '.cmp-accordion__item .cmp-teaser__description',
    },
  },
  overview: {
    container: '.cds-c-detailblock__benefits-wrap .cmp-accordion',
    fields: {
      title: '.cmp-accordion__item .cmp-accordion__title',
      content: '.cmp-accordion__item .cmp-text p',
    },
  },
  productList: {
    container: '.cds-model-comparison-carousel__slide-wrapper',
    slide: '.cds-c-model-comparison-carousel__slide',
    fields: {
      name: '.cds-c-product-detail-card__model-name',
      description: '.cds-c-product-detail-card__model-description ul',
    },
  },
  integrations: {
    container: '#container-integrations .cds-c-cards',
    fields: {
      title: '.cmp-teaser__title',
      description: '.cmp-teaser__description p',
    },
  },
  otherFeature: '.features-accordion',
  licensing: '.licensingtable',
  integrationsCards: '.cds-c-integrations__cards-wrap',
  spotLight: '.cds-c-spotlight',
};

export const retryScraperConfig = {
  preTitle: '#fw-pagetitle',
  title: '.info-content h2',
  subtitle: '.compact .large compact',
  description: '.info-content .info-description',
  benefits: {
    container: '#benefits',
    fields: {
      title: '.rte-txt h3',
      description: '.rte-txt p',
    },
  },
  dataModal: {
    modal: '#models .rte-txt',
    fields: {
      title: 'h3',
      content: 'li',
    },
  },
  features: {
    container: '#features .dm0', // The container for individual feature elements
    fields: {
      title: '.sl-title', // Selector for feature title
      description: 'p', // Selector for feature description
    },
  },
  resources: {
    container: '#resources .dmc-list-item',
    fields: {
      title: 'li a',
      url: 'li a[href]',
    },
  },
  licensing: '.licensingtable',
  integrations: '.cds-c-integrations__cards-wrap',
  spotLight: '.cds-c-spotlight',
};

export const retryForCompactScraperConfig = {
  preTitle: '#fw-pagetitle',
  title: '#fw-pagetitle',
  subtitle: '.info-description',
  description: '.dmc-text',
  benefits: {
    container: '#benefits',
    fields: {
      title: '',
      description: 'p',
    },
  },
  dataModal: {
    modal: '#models',
    fields: {
      title: 'h3',
      content: 'li',
    },
  },
  features: {
    container: '#features', // The container for individual feature elements
    fields: {
      title: 'h3', // Selector for feature title
      description: 'p', // Selector for feature description
    },
  },
  resources: {
    container: '#resources',
    fields: {
      title: 'li a',
      url: 'li a[href]',
    },
  },

  listing: {
    container: '.combination-listing',
    fields: {
      title: '.contentLink',
      url: '.contentLink[href]',
    },
  },
  otherDescription: '.mlb-pilot p',
  tableContent: '.table-columns p',
  licensing: '.licensingtable',
  integrations: '.cds-c-integrations__cards-wrap',
  spotLight: '.cds-c-spotlight',
};

export const prompts = {
  formatResponse: `
You are a Cisco Collaboration Endpoints Assistant. Your job is to process user queries by searching the uploaded document for details about product names or their alternative names. Do not use any other sources.

When a user provides a product name or alternative name, search the document and return the following details in plain text:

Product Name.
Status (e.g., End of Sale, End of Support).
EOL Announcement Date.
End of Support Date.
A link to the Cisco documentation.
If a field is missing, note it as "N/A." If no match is found, respond with: "No information available for the provided product name."

Handle variations in user input:

Normalize input by ignoring case, spaces, and hyphens.
If the input is ambiguous or partially matches multiple product names, ask the user for clarification.
If the user provides multiple product names, list the details for each product name in a separate section.
    `,
};

export const findDevToolFunction = {
  type: 'function',
  function: {
    name: 'fetch_sku_details',
    description: 'Find CISCO Product by  Name',
    parameters: {
      type: 'object',
      properties: {
        // sku: {
        //   type: 'string',
        //   description: 'The SKU ID to query product based upon',
        // },
        name: {
          type: 'string',
          description: 'The name of the product to query',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
};

export const CHATGPT_RESPONSE_PROMPT = `You are an assistant that formats JSON data into a clean, readable format with each field on a new line. 

Please extract and format the following details from the JSON data provided:
- Product Name
- PID's (from pIds or "Unavailable" if not present)
- Status
- Product Type
- End-of-Sale Date
- End-of-Support Date
- Link

Output the details exactly in this format:
Product Name: [value];
PID's: [value];
Status: [value];
Product Type: [value];
End-of-Sale Date: [value];
End-of-Support Date: [value];
Link: [value]

Ensure no additional text or formatting is included beyond this structure.`;
