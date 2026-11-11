'use client';

import React from 'react';

export default function ImportSelectionCheckbox({
  checked,
  indeterminate = false,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  const isActive = checked || indeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center shrink-0 ${
        isActive ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
      }`}
    >
      {checked && !indeterminate ? (
        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : null}
      {indeterminate ? <span className="block w-2.5 h-0.5 bg-white rounded-full" /> : null}
    </button>
  );
}
