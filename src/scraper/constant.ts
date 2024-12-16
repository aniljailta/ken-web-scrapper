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
};
