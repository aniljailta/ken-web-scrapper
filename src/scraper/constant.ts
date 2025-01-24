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

export const findDevToolFunction = {
  type: 'function',
  function: {
    name: 'fetch_sku_details',
    description: 'Find CISCO Product by  Name',
    parameters: {
      type: 'object',
      properties: {
        pIds: {
          type: 'string',
          description:
            'The PID to query product based upon eg: WS-C2960X-48TS-L=, HS-W-322-USBA=, CS-T10-TS-L-K9+ ',
        },
        name: {
          type: 'string',
          description: 'The name of the product to query',
        },
      },
      required: ['name', 'pIds'],
      additionalProperties: false,
    },
  },
};

export const CHATGPT_RESPONSE_PROMPT = `You are an assistant that formats JSON data into a clean, readable format with each field on a new line. 

Please extract and format the following details from the JSON data provided:
- Product Name
- Product Category (from productCategory)
- Status
- Product Type
- End-of-Sale Date
- End-of-Support Date
- Series Release Date
- Link
- PID's (from pIds or "Unavailable" if not present as Pid example is like WS-C2960X-48TS-L=, HS-W-322-USBA=, CS-T10-TS-L-K9+, SPA 502G, C9504, WBPN)

Output the details exactly in this format, but include a field only if it has a valid, non-empty value:
Product Name: [value];
Product Category: [value];
Status: [value];
Product Type: [value];
End-of-Sale Date: [value];
End-of-Support Date: [value];
Series Release Date: [value];
Link: [value];
PID's: [value];

Do not include fields where the value is empty, null, or unavailable. Ensure no additional text or formatting is included beyond this structure.`;

export const headerVariations = [
  'End-of-Sale Product Part Number',
  'Part Number',
  'Product Number',
  'SKU',
  'Model',
  // 'Part #',
];

export const excludeVariation = [
  'End-of-Sale Product Part Number',
  'Part Number',
  'Product Number',
  'Part Numbers',
  'Product Numbers',
  'SKU',
  'Model',
  'Part #',
  '512 MB',
  'gb',
  'kb',
  'Gbps',
  'Mpps',
  'bytes',
  'Yes',
  'deg',
  'ft',
  'Hz',
  'kva',
  'Poe',
  'vac',
  'port',
  'upoe',
  'Models in Series',
  'Type',
  'Simultaneous connections',
  'Connectors',
  'Connectivity to phone model',
  'USB Cable',
  'Y-cable',
  'management',
  'memory',
  'ram',
  'tb',
  'cards',
  'power',
  'buffer',
  'loads',
  'Spare',
  'Optional',
  'Subscription',
  'Manage',
  'Monitored',
  'Migration',
  'speed',
  'virtual',
  'Model Name',
  'Fast Ethernet',
  'rate',
  'code',
  'level',
  'support',
  'unit',
  'ethernet',
  'data',
  'VLAN',
  'max',
  'min',
  'uplinks',
  'N/A',
  'auxiliary',
  'DNA',
  'chassis',
  'spares',
  'miscellaneous',
];
