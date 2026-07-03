'use client';

import React from 'react';
import {
  CLIENT_FIELD_HINT_CLASS,
  CLIENT_FIELD_LABEL_CLASS,
  getClientInputClass,
} from './client-field-styles';
import { useClientFieldValidation } from './useClientFieldValidation';
import type { FieldValidationResult } from '@/utils/client-input-validation';

interface ClientFieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  validator?: (value: string) => FieldValidationResult;
  submitAttempted?: boolean;
  externalError?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
  inputClassName?: string;
  compact?: boolean;
  min?: number;
  max?: number;
  id?: string;
  'aria-describedby'?: string;
}

export function ClientField({
  label,
  hint,
  type = 'text',
  value,
  onChange,
  validator,
  submitAttempted = false,
  externalError,
  required = false,
  disabled = false,
  placeholder,
  rows,
  className = '',
  inputClassName = '',
  compact = false,
  min,
  max,
  id,
  'aria-describedby': ariaDescribedBy,
}: ClientFieldProps) {
  const { showError, displayError, handleBlur } = useClientFieldValidation(
    value,
    validator,
    submitAttempted,
    externalError,
  );

  const inputClass = getClientInputClass({
    disabled,
    compact,
    error: showError,
    className: inputClassName,
  });
  const hintId = hint && id ? `${id}-hint` : undefined;
  const errorId = showError && id ? `${id}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      {label != null && (
        <label className={CLIENT_FIELD_LABEL_CLASS} htmlFor={id}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {rows != null ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={validator ? handleBlur : undefined}
          className={inputClass}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={showError || undefined}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={validator ? handleBlur : undefined}
          className={inputClass}
          disabled={disabled}
          placeholder={placeholder}
          min={min}
          max={max}
          aria-describedby={describedBy}
          aria-invalid={showError || undefined}
        />
      )}
      {showError && (
        <p id={errorId} className="text-red-500 text-xs mt-1">
          {displayError}
        </p>
      )}
      {hint != null && !showError && (
        <p id={hintId} className={CLIENT_FIELD_HINT_CLASS}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface ClientInputProps {
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  className?: string;
  min?: number;
  max?: number;
}

export function ClientInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  compact = true,
  fullWidth = true,
  className = '',
  min,
  max,
}: ClientInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={getClientInputClass({ disabled, compact, fullWidth, className })}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
    />
  );
}
