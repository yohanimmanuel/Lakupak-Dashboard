export const CLIENT_FIELD_LABEL_CLASS = 'block text-xs font-medium text-gray-700 mb-1';

export const CLIENT_FIELD_HINT_CLASS = 'text-xs text-gray-500 mt-1';

export const CLIENT_SELECT_BUTTON_CLASS =
  'w-full px-3 py-2 text-xs border border-gray-200 rounded-lg text-black text-left flex items-center justify-between transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

type InputClassOptions = {
  error?: boolean;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  className?: string;
};

export function getClientInputClass({
  error = false,
  disabled = false,
  compact = false,
  fullWidth = true,
  className = '',
}: InputClassOptions = {}): string {
  const size = compact ? 'px-2 py-1' : 'px-3 py-2';
  const state = error
    ? 'border-red-300 focus:ring-red-500 bg-red-50'
    : 'border-gray-200 focus:ring-blue-500 focus:border-blue-500';
  const disabledClass = disabled ? 'disabled:bg-gray-100 disabled:cursor-not-allowed' : '';

  return [
    'text-black text-xs border rounded-lg transition-colors focus:outline-none focus:ring-2',
    fullWidth ? 'w-full' : '',
    size,
    state,
    disabledClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
