import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  id?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footerActions,
  id = 'preline-modal',
}) => {
  if (!isOpen) return null;

  return (
    <div
      id={id}
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border border-gray-200 rounded-xl shadow-lg dark:bg-neutral-900 dark:border-neutral-700 text-slate-800 dark:text-[#d1d4dc] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            {icon && <div className="shrink-0">{icon}</div>}
            <h3 className="font-semibold text-sm text-gray-800 dark:text-neutral-200">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="inline-flex justify-center items-center size-8 text-xs font-semibold rounded-lg border border-transparent text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-neutral-700 dark:focus:bg-neutral-700"
          >
            <svg className="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto max-h-[70vh]">
          {children}
        </div>

        {/* Footer */}
        {footerActions && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 flex items-center justify-end gap-2 text-xs">
            {footerActions}
          </div>
        )}
      </div>
    </div>
  );
};
