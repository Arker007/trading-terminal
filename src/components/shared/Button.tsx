import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center gap-x-2 font-medium rounded-lg border focus:outline-hidden disabled:opacity-50 disabled:pointer-events-none transition-all';
  
  const variantClasses = {
    primary: 'border-transparent bg-blue-600 text-white hover:bg-blue-700 focus:bg-blue-700 active:bg-blue-800',
    secondary: 'border-transparent bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
    success: 'border-transparent bg-teal-600 text-white hover:bg-teal-700 focus:bg-teal-700 active:bg-teal-800',
    danger: 'border-transparent bg-red-600 text-white hover:bg-red-700 focus:bg-red-700 active:bg-red-800',
    ghost: 'border-transparent text-gray-800 hover:bg-gray-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
    outline: 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
  };

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2 px-4 text-sm',
    lg: 'py-3 px-5 text-sm',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
