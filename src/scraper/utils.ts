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
