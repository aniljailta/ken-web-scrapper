import * as puppeteer from 'puppeteer';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove non-alphanumeric characters
    .split(/\s+/) // Split by whitespace
    .filter(Boolean); // Remove empty strings
}

export function buildVocabulary(texts: string[]): string[] {
  const uniqueWords = new Set<string>();
  texts.forEach((text) => {
    const tokens = tokenize(text);
    tokens.forEach((word) => uniqueWords.add(word));
  });
  return Array.from(uniqueWords);
}

export async function flattenAndConcatenate(
  json: Record<string, any>,
): Promise<string> {
  const flatten = (obj: Record<string, any>, path: string[] = []): string[] => {
    return Object.entries(obj).flatMap(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return flatten(value, [...path, key]);
      }
      return `${[...path, key].join('.')}: ${value}`;
    });
  };
  return flatten(json).join(' ');
}

export function vectorize(text: string, vocabulary: string[]): number[] {
  const tokens = tokenize(text);
  const wordCounts = tokens.reduce(
    (counts, word) => {
      counts[word] = (counts[word] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  return vocabulary.map((word) => wordCounts[word] || 0);
}

// Calculate cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai ** 2, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi ** 2, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

export async function extractProductData(
  page: puppeteer.Page,
  url: string,
  text: string,
  config: any,
  isRetry: boolean = false,
): Promise<Record<string, any>> {
  const productData = await page.evaluate(
    (config, isRetry) => {
      const extractText = (selector, context = document) => {
        try {
          return Array.from(context.querySelectorAll(selector))
            .map((el) => el.textContent?.trim() || '')
            .filter(Boolean); // Remove empty strings
        } catch {
          return [];
        }
      };

      const data: Record<string, any> = {};

      // Extract single fields as strings
      for (const [key, selector] of Object.entries(config)) {
        if (typeof selector === 'string') {
          const elements = extractText(selector);
          data[key] = elements.length === 1 ? elements[0] : elements.join(' '); // Always a string
        }
      }

      // Extract structured fields (e.g., benefits, modals)
      if (config.benefits) {
        if (isRetry) {
          const benefitElements = document.querySelectorAll(
            config.benefits.container || null,
          );
          if (benefitElements?.length === 0) {
            console.warn(
              `No benefit elements found for: ${config.benefits.container}`,
            );
          } else {
            data.benefits = Array.from(benefitElements).map((benefit) => ({
              title:
                benefit
                  ?.querySelector(config.benefits.fields.title)
                  ?.textContent.trim() || null,
              description:
                benefit
                  ?.querySelector(config.benefits.fields.description)
                  ?.textContent.trim() || null,
            }));
          }
        } else {
          data.benefits = Array.from(
            document.querySelectorAll(config.benefits.container),
          ).map((container) => {
            const benefitData: Record<string, string> = {};
            for (const [field, fieldSelector] of Object.entries(
              config.benefits.fields,
            )) {
              const values = extractText(fieldSelector, container as any);
              benefitData[field] =
                values.length === 1 ? values[0] : values.join(' ') || null;
            }
            return benefitData;
          });
        }
      }

      if (config.dataModal) {
        if (isRetry) {
          const modalElement = document.querySelector(
            config.dataModal.modal || '',
          );

          if (!modalElement) {
            console.warn(
              `Modal element not found for: ${config.dataModal.modal}`,
            );
          } else {
            data.modal = {
              title:
                modalElement
                  ?.querySelector(config.dataModal.fields.title)
                  ?.textContent.trim() || null,
              content: Array.from(
                modalElement?.querySelectorAll(config.dataModal.fields.content),
              ).map((item: any) => item.textContent.trim() || null),
            };
          }
        } else {
          data.dataModals = Array.from(
            document.querySelectorAll(config.dataModal.modal),
          )
            .map((button) => {
              const title =
                button.getAttribute('aria-label') ||
                button.textContent?.trim() ||
                '';
              const panel = document.querySelector(
                `#${button.getAttribute('aria-controls')}`,
              );
              if (!panel) return null;

              const content = Array.from(
                panel.querySelectorAll(config.dataModal.fields.content),
              )
                .map((el) => el.textContent?.trim() || '')
                .join(' '); // Combine content as a single string
              return { title, content };
            })
            .filter(Boolean);
        }
      }

      if (config.overview) {
        const accordionItems = document.querySelectorAll(
          `${config.overview.container} .cmp-accordion__item`,
        );

        if (!accordionItems || accordionItems.length === 0) {
          console.warn(
            `No accordion items found for: ${config.overview.container}`,
          );
        } else {
          data.overview = Array.from(accordionItems).map((item) => ({
            title:
              item
                ?.querySelector(config.overview.fields.title)
                ?.textContent.trim() || '',
            content:
              item
                ?.querySelector(config.overview.fields.content)
                ?.textContent.trim() || '',
          }));
        }
      }

      if (config.productList) {
        const productSlides = document.querySelectorAll(
          config.productList.slide,
        );

        if (productSlides.length === 0) {
          console.warn(
            `No product slides found for: ${config.productList.slide}`,
          );
        } else {
          data.productList = Array.from(productSlides).map((slide) => {
            const productData: Record<string, any> = {};

            for (const [field, fieldSelector] of Object.entries(
              config.productList.fields,
            )) {
              const element = slide.querySelector(fieldSelector);

              if (field === 'description') {
                // Extract list items from the description
                const listItems = element
                  ? Array.from(element.querySelectorAll('li')).map(
                      (item: any) => item.textContent.trim(),
                    )
                  : [];
                productData[field] = listItems;
              } else {
                productData[field] = element?.textContent.trim() || '';
              }
            }

            return productData;
          });
        }
      }

      if (config.features) {
        const featureElements = document.querySelectorAll(
          config.features.container,
        );
        if (featureElements?.length === 0) {
          console.warn(
            `No feature elements found for: ${config.features.container}`,
          );
        } else {
          data.features = Array.from(featureElements).map((feature) => ({
            title:
              feature
                ?.querySelector(config.features.fields.title)
                ?.textContent.trim() || '',
            description:
              feature
                ?.querySelector(config.features.fields.description)
                ?.textContent.trim() || '',
          }));
        }
      }

      if (config.resources) {
        const resourceElements = document.querySelectorAll(
          config.resources.container,
        );
        if (resourceElements?.length === 0) {
          console.warn(
            `No resource elements found for: ${config.resources.container}`,
          );
        } else {
          data.resources = Array.from(resourceElements).map((resource) => ({
            title:
              resource
                ?.querySelector(config.resources.fields.title)
                ?.textContent.trim() || '',
            url: (() => {
              const href =
                resource
                  ?.querySelector(config.resources.fields.url)
                  ?.getAttribute('href') || '';

              // Check if the href is valid, and if not, prepend "https://www.cisco.com"
              if (
                href &&
                !href.startsWith('http://') &&
                !href.startsWith('https://')
              ) {
                return `https://www.cisco.com${href}`;
              }

              return href;
            })(),
          }));
        }
      }

      if (config.integrations) {
        const integrationElements = document.querySelectorAll(
          config.integrations.container || null,
        );
        if (!integrationElements || integrationElements.length === 0) {
          console.warn(
            `No integration elements found for: ${config.integrations.container}`,
          );
        } else {
          data.integrations = Array.from(integrationElements).map(
            (integration) => ({
              title:
                integration
                  ?.querySelector(config.integrations.fields.title)
                  ?.textContent.trim() || '',
              description:
                integration
                  ?.querySelector(config.integrations.fields.description)
                  ?.textContent.trim() || '',
            }),
          );
        }
      }

      if (config.listing) {
        const resourceElements = document.querySelectorAll(
          config.listing.container,
        );

        if (resourceElements?.length === 0) {
          console.warn(
            `No resource elements found for: ${config.listing.container}`,
          );
        } else {
          // Map over each resource element to extract titles and URLs
          data.listing = Array.from(resourceElements).flatMap((resource) => {
            // Find all links inside this specific resource
            const links = resource.querySelectorAll(config.listing.fields.url);

            // Return an array of objects for each link
            return Array.from(links).map((link: any) => ({
              title: link?.textContent.trim() || '',
              url: (() => {
                const href = link.getAttribute('href') || '';

                // Prepend base URL if the link is relative
                if (
                  href &&
                  !href.startsWith('http://') &&
                  !href.startsWith('https://')
                ) {
                  return `https://www.cisco.com${href}`;
                }
                return href;
              })(),
            }));
          });
        }
      }

      return data;
    },
    config,
    isRetry,
  );

  // Add URL and link text to the extracted data
  productData.productUrl = url;
  productData.linkText = text;

  // Ensure single fields are strings
  ['preTitle', 'title', 'subtitle', 'description'].forEach((key) => {
    if (Array.isArray(productData[key])) {
      productData[key] = productData[key].join(' ').trim() || null;
    }
  });

  return productData;
}

export async function extractDataSheetContent(page) {
  // Static configurations
  const linkSelector = 'a'; // Selector to identify links
  const partialText = 'sheet'; // Text to include for partial match
  const contentSelector = '#fw-content'; // Target container for content

  // Find the data sheet link
  const dataSheetLink = await page.evaluate(
    (selector, text) => {
      const links = Array.from(document.querySelectorAll(selector));
      const matchingLink = links.find((link) =>
        link.textContent.trim().toLowerCase().includes(text.toLowerCase()),
      );
      return matchingLink ? matchingLink.href : null;
    },
    linkSelector,
    partialText,
  );

  if (dataSheetLink) {
    try {
      await page.goto(dataSheetLink, {
        waitUntil: 'networkidle2',
        timeout: 1000,
      });

      // Try to extract content from #fw-content
      const content = await page.evaluate((selector) => {
        const container = document.querySelector(selector);
        return container ? container.innerText.trim() : null;
      }, contentSelector);

      // If #fw-content is not found, scrape the entire body
      if (!content) {
        console.warn(
          `#fw-content not found. Scraping entire body as fallback.`,
        );
        const fallbackContent = await page.evaluate(() => {
          return document.body.innerText.trim();
        });
        return fallbackContent || null;
      }

      return content || null;
    } catch (error) {
      console.error(`Failed to fetch Data Sheet content: ${error.message}`);
      return null;
    }
  } else {
    console.warn('No Data Sheet link found on the page.');
    return null;
  }
}

// Merge and remove duplicates based on the 'productUrl' field
export function mergeAndDeduplicate(
  existingProducts: any[],
  newProducts: any[],
): any[] {
  const productMap = new Map();

  // Add existing products to the map, keyed by productUrl
  existingProducts.forEach((product) => {
    productMap.set(product.productUrl, product);
  });

  // Add new products to the map, keyed by productUrl (this prevents duplicates)
  newProducts.forEach((product) => {
    // If a product with the same productUrl exists, skip it; otherwise, add it
    if (!productMap.has(product.productUrl)) {
      productMap.set(product.productUrl, product);
    }
  });

  // Convert the map back to an array
  return Array.from(productMap.values());
}
