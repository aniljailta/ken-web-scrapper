import * as puppeteer from 'puppeteer';
import { sectionTitles } from './constants';
import { headerVariations } from 'src/scraper/constant';
import { cleanHtml, refineTable } from 'src/scraper/utils';

export async function scrapeInternalSection(link: string): Promise<{
  content: Record<string, { text: string; tables: string[] }>;
  pidData: string[];
}> {
  let browser: puppeteer.Browser | null = null;
  const initialTimeout = 20000; // Initial timeout in milliseconds
  const extendedTimeout = 50000; // Extended timeout in milliseconds

  const scrapeData = async (timeout: number) => {
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();

      await page.goto(link, { waitUntil: 'networkidle2', timeout });

      // Collect all <p> elements and their text
      const paragraphsData = await page.evaluate(() => {
        const paragraphs = Array.from(document.querySelectorAll('p'));
        return paragraphs.map((p) => ({
          className: p.className,
          text: p.textContent?.trim() || '',
          id: p.id || null,
        }));
      });

      const results: Record<string, { text: string; tables: string[] }> = {};

      for (const title of sectionTitles) {
        const targetParagraph = paragraphsData.find(
          (p) =>
            new RegExp(`\\b${title.replace(/\s+/g, '\\s*')}\\b`, 'i').test(
              p.text.toLowerCase(),
            ) &&
            (p.className.includes('pSubhead2CMT') ||
              p.className.includes('pSubhead1CMT') ||
              p.className.includes('pToC_Subhead1')),
        );

        if (targetParagraph) {
          const sectionHTML = await page.evaluate((startText) => {
            const extractContentUntilBoundary = (
              startElement: HTMLElement,
            ): string => {
              let fullHTML = '';
              let current = startElement.nextElementSibling;

              while (current) {
                const id = current.getAttribute('id');
                const classList = Array.from(current.classList);

                // Stop if we encounter a boundary element
                if (
                  (current.tagName.toLowerCase() === 'p' ||
                    current.tagName.toLowerCase() === 'div') &&
                  (id ||
                    classList.includes('pToC_Subhead1') ||
                    classList.includes('pSubhead2CMT') ||
                    classList.includes('pSubhead1CMT'))
                ) {
                  break;
                }

                fullHTML += current.outerHTML + '\n';
                current = current.nextElementSibling;
              }

              return fullHTML.trim();
            };

            // Find the starting element
            const paragraphs = Array.from(
              document.querySelectorAll(
                'p.pSubhead2CMT, p.pSubhead1CMT, p.pToC_Subhead1, div',
              ),
            );
            for (const p of paragraphs) {
              if (p.textContent?.trim() === startText) {
                return extractContentUntilBoundary(p as HTMLElement);
              }
            }

            return null;
          }, targetParagraph.text);
          if (sectionHTML) {
            const processContent = (
              html: string,
            ): { text: string; tables: string[] } => {
              const container = document.createElement('div');
              container.innerHTML = html;

              const tables: string[] = [];
              const tableElements = container.querySelectorAll('table');

              tableElements.forEach((table) => {
                tables.push(table?.outerHTML);
                table.remove();
              });

              const text = container.textContent?.trim() || '';
              return { text, tables };
            };

            const pageSectionData = await page.evaluate(
              processContent,
              sectionHTML,
            );

            const sectionText = cleanHtml(pageSectionData.text);
            const sectionTables = pageSectionData.tables.map((table) =>
              refineTable(table),
            );

            const formattedKey = title.toLowerCase().replace(/\s+/g, '_');
            results[formattedKey] = {
              text: sectionText,
              tables: sectionTables,
            };
          }
        }
      }

      const pidData = await page.evaluate((headerVariations) => {
        try {
          const tables = document.querySelectorAll('table');
          const extractedSet = new Set<string>(); // Use a Set directly to store unique data

          tables.forEach((table) => {
            const headerCells = Array.from(
              table.querySelectorAll('tr:first-child td, tr:first-child th'),
            );

            // Find the relevant column index
            const columnIndex = headerCells.findIndex((cell: any) => {
              const normalizedText = cell.innerText
                ?.trim()
                .replace(/\s+/g, ' ')
                .toLowerCase();

              return headerVariations.some((header) =>
                normalizedText.includes(header.toLowerCase()),
              );
            });

            if (columnIndex !== -1) {
              // Extract data from rows for the relevant column
              const rows = Array.from(table.querySelectorAll('tbody tr'));
              rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                const value = cells[columnIndex]?.textContent?.trim();

                if (value) {
                  const cleanedValue = value
                    .replace(/\s+/g, ' ') // Normalize spaces
                    .replace(/\n/g, '') // Remove newline characters
                    .trim();

                  extractedSet.add(cleanedValue); // Add unique value to the Set
                }
              });
            }
          });

          return Array.from(extractedSet); // Convert Set back to array
        } catch (error) {
          console.error('Error during content extraction:', error.message);
          return [];
        }
      }, headerVariations);

      return {
        content: Object.keys(results).length > 0 ? results : null,
        pidData: pidData,
      };
    } catch (error) {
      console.error('Error scraping sections:', error.message);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  };

  try {
    // Attempt with initial timeout
    return await scrapeData(initialTimeout);
  } catch (error) {
    if (error?.message?.includes('Navigation timeout')) {
      console.warn(
        `Navigation timeout with ${initialTimeout}ms exceeded. Retrying with ${extendedTimeout}ms...`,
      );
      try {
        // Retry with extended timeout
        return await scrapeData(extendedTimeout);
      } catch (retryError) {
        console.error(
          'Error during retry with extended timeout:',
          retryError.message,
        );
        return null;
      }
    } else {
      console.error('Unexpected error during scraping process:', error.message);
      return null;
    }
  }
}
