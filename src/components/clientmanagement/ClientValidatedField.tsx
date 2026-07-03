'use client';

import React from 'react';
import { CLIENT_FIELD_LABEL_CLASS, getClientInputClass } from './client-field-styles';
import { useClientFieldValidation } from './useClientFieldValidation';
import type { FieldValidationResult } from '@/utils/client-input-validation';

interface ClientValidatedFieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  validator?: (value: string) => FieldValidationResult;
  required?: boolean;
  submitAttempted?: boolean;
  externalError?: string;
  className?: string;
}

export function ClientValidatedField({
  label,
  type = 'text',
  value,
  onChange,
  validator,
  required = false,
  submitAttempted = false,
  externalError,
  className = '',
}: ClientValidatedFieldProps) {
  const { showError, displayError, handleBlur } = useClientFieldValidation(
    value,
    validator,
    submitAttempted,
    externalError,
  );

  return (
    <div className={className}>
      <label className={CLIENT_FIELD_LABEL_CLASS}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        className={getClientInputClass({ error: showError })}
        aria-invalid={showError || undefined}
      />
      {showError && <p className="text-red-500 text-xs mt-1">{displayError}</p>}
    </div>
  );
}
