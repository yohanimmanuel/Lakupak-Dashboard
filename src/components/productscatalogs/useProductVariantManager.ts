
import type { Dispatch, SetStateAction } from 'react';
import type { CatalogVariant, Combination } from './productCatalogHelpers';

type UseProductVariantManagerArgs = {
  variants: CatalogVariant[];
  setVariants: Dispatch<SetStateAction<CatalogVariant[]>>;
  variantDrafts: CatalogVariant[];
  setVariantDrafts: Dispatch<SetStateAction<CatalogVariant[]>>;
  setCombinations: Dispatch<SetStateAction<Combination[]>>;
};

export function useProductVariantManager({
  variants,
  setVariants,
  variantDrafts,
  setVariantDrafts,
  setCombinations,
}: UseProductVariantManagerArgs) {
  const updateCombinationVariantValue = (combo: Combination, variantId: string, nextValue: string): Combination => {
    return { ...combo, [`variant_${variantId}`]: nextValue };
  };

  const addVariant = () => {
    const variantId = `variant-${Date.now()}`;
    const newVariant = {
      id: variantId,
      variantType: '',
      moq: undefined,
      options: [{
        id: `${variantId}-option-1`,
        name: ''
      }]
    };
    setVariants(prev => [...prev, newVariant]);
  };

  const removeVariant = (variantId: string) => {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((variant) => variant.id !== variantId));
  };

  const updateVariant = (variantId: string, field: string, value: string | number | undefined) => {
    // Keep typing fast: update drafts only for label edits.
    if (field === 'variantType') {
      setVariantDrafts((prev) =>
        prev.map((variant) => (variant.id === variantId ? { ...variant, variantType: String(value ?? '') } : variant)),
      );
      return;
    }

    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return { ...variant, [field]: value };
      }
      return variant;
    }));
  };

  const commitVariantTypeRename = (variantId: string) => {
    const draft = variantDrafts.find((variant) => variant.id === variantId);
    const next = String(draft?.variantType || '');
    setVariants((prev) => prev.map((variant) =>
      variant.id === variantId ? { ...variant, variantType: next } : variant,
    ));
  };

  const addVariantOption = (variantId: string, initialName = '') => {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newOptionId = `${variantId}-option-${uniq}`;
    setVariants((prev) =>
      prev.map((variant) => {
        if (variant.id === variantId) {
          const newOption = { id: newOptionId, name: initialName };
          return { ...variant, options: [...variant.options, newOption] };
        }
        return variant;
      }),
    );

    // Keep drafts aligned so the input doesn't snap back.
    setVariantDrafts((prev) =>
      prev.map((variant) =>
        variant.id === variantId
          ? { ...variant, options: [...variant.options, { id: newOptionId, name: initialName }] }
          : variant,
      ),
    );
  };

  const removeVariantOption = (variantId: string, optionId: string) => {
    setVariants((prev) => prev.map((variant) =>
      variant.id === variantId
        ? { ...variant, options: variant.options.filter((option) => option.id !== optionId) }
        : variant,
    ));
    setVariantDrafts((prev) => prev.map((variant) =>
      variant.id === variantId
        ? { ...variant, options: variant.options.filter((option) => option.id !== optionId) }
        : variant,
    ));
  };

  const updateVariantOption = (variantId: string, optionId: string, field: string, value: string) => {
    // Keep typing fast: update drafts only for label edits.
    if (field === 'name') {
      setVariantDrafts((prev) =>
        prev.map((variant) =>
          variant.id === variantId
            ? {
                ...variant,
                options: variant.options.map((opt) => (opt.id === optionId ? { ...opt, name: value } : opt)),
              }
            : variant,
        ),
      );
      return;
    }

    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return {
          ...variant,
          options: variant.options.map(opt => {
            if (opt.id === optionId) {
              return { ...opt, [field]: value };
            }
            return opt;
          })
        };
      }
      return variant;
    }));
  };

  const commitVariantOptionRename = (variantId: string, optionId: string) => {
    const draftVariant = variantDrafts.find((variant) => variant.id === variantId);
    const nextName = String(draftVariant?.options?.find((option) => option.id === optionId)?.name || '');
    const committedVariant = variants.find((variant) => variant.id === variantId);
    const previousName = String(committedVariant?.options?.find((option) => option.id === optionId)?.name || '');
    if (!committedVariant || previousName === nextName) return;

    setVariants((prev) => prev.map((variant) =>
      variant.id === variantId
        ? { ...variant, options: variant.options.map((option) => option.id === optionId ? { ...option, name: nextName } : option) }
        : variant,
    ));
    setCombinations((prev) => prev.map((combo) => {
      const current = combo[`variant_${variantId}`];
      return typeof current === 'string' && current === previousName
        ? updateCombinationVariantValue(combo, variantId, nextName)
        : combo;
    }));
  };

  // Validate numeric input (allows positive numbers, decimals, and empty string)

  return {
    addVariant,
    removeVariant,
    updateVariant,
    commitVariantTypeRename,
    addVariantOption,
    removeVariantOption,
    updateVariantOption,
    commitVariantOptionRename,
  };
}
