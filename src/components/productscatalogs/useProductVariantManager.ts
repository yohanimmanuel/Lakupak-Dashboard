
import type { Dispatch, SetStateAction } from 'react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import type { CatalogVariant, Combination } from './productCatalogHelpers';

type VariantGuardModal = {
  title: string;
  intro?: string;
  items?: Array<{ variantName: string; orderItemCount: number; orderIds?: string[] }>;
  policy?: string;
  footer?: string;
  message?: string;
  action?: { kind: 'create_option'; variantId: string; initialName: string } | null;
} | null;

type UseProductVariantManagerArgs = {
  variants: CatalogVariant[];
  setVariants: Dispatch<SetStateAction<CatalogVariant[]>>;
  variantDrafts: CatalogVariant[];
  setVariantDrafts: Dispatch<SetStateAction<CatalogVariant[]>>;
  setCombinations: Dispatch<SetStateAction<Combination[]>>;
  currentMode: 'add' | 'view' | 'edit';
  userId?: number;
  productId?: string;
  getAffectedVariantOptionIds: (params: { variantType: string; optionName?: string }) => number[];
  setVariantGuardModal: Dispatch<SetStateAction<VariantGuardModal>>;
};

export function useProductVariantManager({
  variants,
  setVariants,
  variantDrafts,
  setVariantDrafts,
  setCombinations,
  currentMode,
  userId,
  productId,
  getAffectedVariantOptionIds,
  setVariantGuardModal,
}: UseProductVariantManagerArgs) {
  const { tCatalog } = useProductsTranslations();
  const updateCombinationVariantValue = (combo: Combination, variantId: string, nextValue: string): Combination => {
    return { ...combo, [`variant_${variantId}`]: nextValue };
  };

  const VARIANT_OPTION_USAGE_QUERY = `
    query VariantOptionUsage($userId: Int!, $productId: String!, $variantNames: [String!], $variantOptionIds: [Int!]) {
      variantOptionUsage(userId: $userId, productId: $productId, variantNames: $variantNames, variantOptionIds: $variantOptionIds) {
        variantName orderItemCount orderIds
      }
    }
  `;

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
    if (variants.length > 1) {
      // For existing products, only block if this deletion would affect variants tied to orders.
      if (currentMode === 'edit' && userId && productId) {
        const targetVariant = variants.find((v) => v.id === variantId);
        const targetType = targetVariant?.variantType ? String(targetVariant.variantType) : '';

        // If the variant type is empty (often a newly-added layer not yet configured),
        // deleting it cannot correspond to any persisted VariantOption, so don't block.
        const affectedVariantOptionIds = targetType ? getAffectedVariantOptionIds({ variantType: targetType }) : [];
        if (affectedVariantOptionIds.length > 0) {
          fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
            VARIANT_OPTION_USAGE_QUERY,
            {
              userId: userId,
              productId: String(productId),
              variantNames: null,
              variantOptionIds: affectedVariantOptionIds,
            },
          )
            .then((res) => {
              const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
              if (tied.length > 0) {
                setVariantGuardModal({
                  title: tCatalog('variantGuard.cannotDeleteTitle'),
                  intro: tCatalog('variantGuard.cannotDeleteIntro'),
                  items: tied.slice(0, 8).map((u) => ({
                    variantName: u.variantName,
                    orderItemCount: u.orderItemCount,
                    orderIds: u.orderIds ?? [],
                  })),
                  policy: tCatalog('variantGuard.policy'),
                  footer:
                    (tied.length > 8 ? tCatalog('variantGuard.footerMore', { count: tied.length - 8 }) : '') +
                    tCatalog('variantGuard.footerBlocked'),
                  action: null,
                });
                return;
              }
              setVariants((prev) => prev.filter((variant) => variant.id !== variantId));
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
              setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateDeletion'), message: msg });
            });
          return;
        }
      }
      setVariants(prev => prev.filter(variant => variant.id !== variantId));
    }
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

  const showRenameBlockedModal = (
    tied: Array<{ variantName: string; orderItemCount: number; orderIds?: string[] }>,
    action?: { kind: 'create_option'; variantId: string; initialName: string } | null,
  ) => {
    setVariantGuardModal({
      title: tCatalog('variantGuard.cannotRenameTitle'),
      intro: tCatalog('variantGuard.cannotRenameIntro'),
      items: tied.slice(0, 8).map((u) => ({
        variantName: u.variantName,
        orderItemCount: u.orderItemCount,
        orderIds: u.orderIds ?? [],
      })),
      policy: tCatalog('variantGuard.policy'),
      footer:
        tied.length > 8
          ? tCatalog('variantGuard.footerMoreCreateNew', { count: tied.length - 8 })
          : tCatalog('variantGuard.footerCreateNew'),
      action: action ?? null,
    });
  };

  const commitVariantTypeRename = (variantId: string) => {
    const draft = variantDrafts.find((v) => v.id === variantId);
    const committed = variants.find((v) => v.id === variantId);
    const next = draft?.variantType ? String(draft.variantType) : '';
    const prev = committed?.variantType ? String(committed.variantType) : '';

    if (!committed || prev === next) return;

    // Block renaming variant types when affected variants are used in past orders.
    if (currentMode === 'edit' && userId && productId && prev && next) {
      const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType: prev });
      if (affectedVariantOptionIds.length > 0) {
        fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
          VARIANT_OPTION_USAGE_QUERY,
          {
            userId: userId,
            productId: String(productId),
            variantNames: null,
            variantOptionIds: affectedVariantOptionIds,
          },
        )
          .then((res) => {
            const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
            if (tied.length > 0) {
              const lines = tied
                .slice(0, 8)
                .map((u) => `- ${u.variantName} (${u.orderItemCount})`)
                .join('\n');
              setVariantGuardModal({
                title: tCatalog('variantGuard.cannotRenameTitle'),
                message:
                  `${tCatalog('variantGuard.cannotRenameIntro')}\n\n${lines}` +
                  (tied.length > 8 ? `\n${tCatalog('variantGuard.renameMessageMore', { count: tied.length - 8 })}` : '') +
                  `\n\n${tCatalog('variantGuard.renameMessageSuffix')}`,
              });
              // revert draft back to committed
              setVariantDrafts((prevDrafts) =>
                prevDrafts.map((v) => (v.id === variantId ? { ...v, variantType: prev } : v)),
              );
              return;
            }

            setVariants((prevState) =>
              prevState.map((v) => (v.id === variantId ? { ...v, variantType: next } : v)),
            );
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
            setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateRename'), message: msg });
            setVariantDrafts((prevDrafts) =>
              prevDrafts.map((v) => (v.id === variantId ? { ...v, variantType: prev } : v)),
            );
          });
        return;
      }
    }

    setVariants((prevState) => prevState.map((v) => (v.id === variantId ? { ...v, variantType: next } : v)));
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
    if (currentMode === 'edit' && userId && productId) {
      const targetVariant = variants.find((v) => v.id === variantId);
      const opt = targetVariant?.options?.find((o) => o.id === optionId);
      const variantType = targetVariant?.variantType ? String(targetVariant.variantType) : '';
      const optionName = opt?.name ? String(opt.name) : '';

      const affectedVariantOptionIds =
        variantType && optionName ? getAffectedVariantOptionIds({ variantType, optionName }) : [];
      if (affectedVariantOptionIds.length > 0) {
        fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
          VARIANT_OPTION_USAGE_QUERY,
          {
            userId: userId,
            productId: String(productId),
            variantNames: null,
            variantOptionIds: affectedVariantOptionIds,
          },
        )
          .then((res) => {
            const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
            if (tied.length > 0) {
              setVariantGuardModal({
                title: tCatalog('variantGuard.cannotDeleteTitle'),
                intro: tCatalog('variantGuard.cannotDeleteOptionIntro'),
                items: tied.slice(0, 8).map((u) => ({
                  variantName: u.variantName,
                  orderItemCount: u.orderItemCount,
                  orderIds: u.orderIds ?? [],
                })),
                policy: tCatalog('variantGuard.policy'),
                footer:
                  (tied.length > 8 ? tCatalog('variantGuard.footerMore', { count: tied.length - 8 }) : '') +
                  tCatalog('variantGuard.footerBlocked'),
                action: null,
              });
              return;
            }
            setVariants((prev) =>
              prev.map((variant) =>
                variant.id === variantId
                  ? { ...variant, options: variant.options.filter((o) => o.id !== optionId) }
                  : variant,
              ),
            );
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
            setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateDeletion'), message: msg });
          });
        return;
      }
    }
    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return {
          ...variant,
          options: variant.options.filter(opt => opt.id !== optionId)
        };
      }
      return variant;
    }));
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
    const committedVariant = variants.find((v) => v.id === variantId);
    const draftVariant = variantDrafts.find((v) => v.id === variantId);
    const prevOpt = committedVariant?.options?.find((o) => o.id === optionId);
    const nextOpt = draftVariant?.options?.find((o) => o.id === optionId);

    const prevName = prevOpt?.name ? String(prevOpt.name) : '';
    const nextName = nextOpt?.name ? String(nextOpt.name) : '';
    const variantType = committedVariant?.variantType ? String(committedVariant.variantType) : '';

    if (!committedVariant || prevName === nextName) return;

    if (currentMode === 'edit' && userId && productId && prevName && nextName && variantType) {
      const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType, optionName: prevName });
      if (affectedVariantOptionIds.length > 0) {
        fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
          VARIANT_OPTION_USAGE_QUERY,
          {
            userId: userId,
            productId: String(productId),
            variantNames: null,
            variantOptionIds: affectedVariantOptionIds,
          },
        )
          .then((res) => {
            const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
            if (tied.length > 0) {
              setVariantGuardModal({
                title: tCatalog('variantGuard.cannotRenameTitle'),
                intro: tCatalog('variantGuard.cannotRenameIntro'),
                items: tied.slice(0, 8).map((u) => ({
                  variantName: u.variantName,
                  orderItemCount: u.orderItemCount,
                  orderIds: u.orderIds ?? [],
                })),
                policy: tCatalog('variantGuard.policy'),
                footer:
                  (tied.length > 8 ? tCatalog('variantGuard.footerMoreCreateNew', { count: tied.length - 8 }) : '') +
                  tCatalog('variantGuard.footerCreateNew'),
                action: { kind: 'create_option', variantId, initialName: nextName },
              });
              // revert draft back to committed
              setVariantDrafts((prevDrafts) =>
                prevDrafts.map((v) =>
                  v.id === variantId
                    ? { ...v, options: v.options.map((o) => (o.id === optionId ? { ...o, name: prevName } : o)) }
                    : v,
                ),
              );
              return;
            }

            // Commit rename
            setVariants((prevState) =>
              prevState.map((variant) =>
                variant.id === variantId
                  ? {
                      ...variant,
                      options: variant.options.map((o) => (o.id === optionId ? { ...o, name: nextName } : o)),
                    }
                  : variant,
              ),
            );

            // Preserve row inputs: update existing combinations that used the old option name
            setCombinations((prevCombos) =>
              prevCombos.map((combo) => {
                const current = combo[`variant_${variantId}`];
                if (typeof current === 'string' && current === prevName) {
                  return updateCombinationVariantValue(combo, variantId, nextName);
                }
                return combo;
              }),
            );
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
            setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateRename'), message: msg });
            setVariantDrafts((prevDrafts) =>
              prevDrafts.map((v) =>
                v.id === variantId
                  ? { ...v, options: v.options.map((o) => (o.id === optionId ? { ...o, name: prevName } : o)) }
                  : v,
              ),
            );
          });
        return;
      }
    }

    // No blocking: commit rename
    setVariants((prevState) =>
      prevState.map((variant) =>
        variant.id === variantId
          ? { ...variant, options: variant.options.map((o) => (o.id === optionId ? { ...o, name: nextName } : o)) }
          : variant,
      ),
    );
    setCombinations((prevCombos) =>
      prevCombos.map((combo) => {
        const current = combo[`variant_${variantId}`];
        if (typeof current === 'string' && current === prevName) {
          return updateCombinationVariantValue(combo, variantId, nextName);
        }
        return combo;
      }),
    );
  };

  const guardVariantTypeEditOnFocus = async (variantId: string): Promise<boolean> => {
    const committed = variants.find((v) => v.id === variantId);
    const prev = committed?.variantType ? String(committed.variantType) : '';
    if (!(currentMode === 'edit' && userId && productId && prev)) return false;

    const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType: prev });
    if (affectedVariantOptionIds.length === 0) return false;

    try {
      const res = await fetchGraphQL<{
        variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }>;
      }>(VARIANT_OPTION_USAGE_QUERY, {
        userId: userId,
        productId: String(productId),
        variantNames: null,
        variantOptionIds: affectedVariantOptionIds,
      });
      const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
      if (tied.length > 0) {
        // Block rename, but allow creating a new option instead.
        showRenameBlockedModal(tied, { kind: 'create_option', variantId, initialName: '' });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const guardVariantOptionEditOnFocus = async (variantId: string, optionId: string): Promise<boolean> => {
    const committedVariant = variants.find((v) => v.id === variantId);
    const committedOpt = committedVariant?.options?.find((o) => o.id === optionId);
    const prevName = committedOpt?.name ? String(committedOpt.name) : '';
    const variantType = committedVariant?.variantType ? String(committedVariant.variantType) : '';

    if (!(currentMode === 'edit' && userId && productId && prevName && variantType)) return false;

    const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType, optionName: prevName });
    if (affectedVariantOptionIds.length === 0) return false;

    try {
      const res = await fetchGraphQL<{
        variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }>;
      }>(VARIANT_OPTION_USAGE_QUERY, {
        userId: userId,
        productId: String(productId),
        variantNames: null,
        variantOptionIds: affectedVariantOptionIds,
      });
      const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
      if (tied.length > 0) {
        showRenameBlockedModal(tied);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Validate numeric input (allows positive numbers, decimals, and empty string)

  return {
    addVariant,
    removeVariant,
    updateVariant,
    showRenameBlockedModal,
    commitVariantTypeRename,
    addVariantOption,
    removeVariantOption,
    updateVariantOption,
    commitVariantOptionRename,
    guardVariantTypeEditOnFocus,
    guardVariantOptionEditOnFocus,
  };
}
