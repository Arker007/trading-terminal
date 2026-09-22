import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  className = '',
}) => {
  const baseClasses = 'inline-flex items-center gap-x-1.5 py-1 px-2.5 rounded-full text-xs font-semibold';
  
  const variantClasses = {
    primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
    secondary: 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-neutral-400',
    success: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-500',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-500',
  };

  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
};
