import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  id?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  id = 'preline-switch',
  disabled = false,
}) => {
  return (
    <div className="flex items-center" id={id}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-neutral-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {(label || description) && (
        <label
          onClick={() => !disabled && onChange(!checked)}
          className="ml-3 text-xs text-gray-700 dark:text-neutral-300 cursor-pointer select-none"
        >
          {label && <p className="font-semibold">{label}</p>}
          {description && <p className="text-[10px] text-gray-400 dark:text-neutral-500 mt-0.5">{description}</p>}
        </label>
      )}
    </div>
  );
};
