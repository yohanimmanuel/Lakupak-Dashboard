'use client';

import { useState, useCallback, useEffect } from 'react';
import type { FieldValidationResult } from '@/utils/client-input-validation';

export function useClientFieldValidation(
  value: string,
  validator?: (value: string) => FieldValidationResult,
  submitAttempted = false,
  externalError?: string,
) {
  const [touched, setTouched] = useState(false);
  const [validationError, setValidationError] = useState('');

  const runValidation = useCallback(
    (val: string) => {
      if (!validator) return { valid: true } as FieldValidationResult;
      return validator(val);
    },
    [validator],
  );

  useEffect(() => {
    if (submitAttempted || touched) {
      const result = runValidation(value);
      setValidationError(result.valid ? '' : result.error || '');
    }
  }, [submitAttempted, touched, value, runValidation]);

  const handleBlur = () => {
    setTouched(true);
    const result = runValidation(value);
    setValidationError(result.valid ? '' : result.error || '');
  };

  const displayError = externalError || validationError;
  const showError = Boolean((touched || submitAttempted) && displayError);

  return { showError, displayError, handleBlur };
}
