import { describe, expect, it } from 'vitest';
import { normalizeImportVariant } from '@/lib/catalog/importVariantMatching';

describe('spreadsheet variant matching', () => {
  it('matches pipe-delimited attributes regardless of order or whitespace', () => {
    expect(normalizeImportVariant('Size: 90 x 2 | Flavour: Spicy | Colour: Black'))
      .toBe(normalizeImportVariant('Colour: Black|Size: 90 x 2|Flavour: Spicy'));
  });

  it('accepts localized attribute names without guessing values', () => {
    expect(normalizeImportVariant('Ukuran: 30 x 2 | Warna: Blue'))
      .toBe(normalizeImportVariant('Size: 30 x 2 | Color: Blue'));
    expect(normalizeImportVariant('Rasa: Spicy')).toBe(normalizeImportVariant('Flavor: Spicy'));
  });

  it('does not conflate different variants', () => {
    expect(normalizeImportVariant('Size: 30 x 2 | Colour: Blue'))
      .not.toBe(normalizeImportVariant('Size: 90 x 2 | Colour: Blue'));
  });
});
