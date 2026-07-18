import {
  DEFAULT_ROBOTS_CONTENT,
  normalizeRelatedProductIds,
  normalizeRobotsContent,
  normalizeSeoCollectionAttributes,
} from './seo-management';

describe('SEO management helpers', () => {
  it('keeps the default robots rules when the editor is empty', () => {
    expect(normalizeRobotsContent('  ')).toBe(DEFAULT_ROBOTS_CONTENT);
  });

  it('keeps only populated and unique collection attribute filters', () => {
    expect(
      normalizeSeoCollectionAttributes({
        Цвет: [' Синий ', 'Синий', ''],
        Память: [],
        ' ': ['128 ГБ'],
      }),
    ).toEqual({ Цвет: ['Синий'] });
  });

  it('removes the source product and duplicate manual recommendations', () => {
    expect(
      normalizeRelatedProductIds('source', ['source', 'target-1', 'target-1', '']),
    ).toEqual(['target-1']);
  });
});
