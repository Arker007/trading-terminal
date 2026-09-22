import React, { useState, useEffect } from 'react';
import { Check, Copy, ExternalLink, Globe, Terminal } from 'lucide-react';
import { BinomoApiResponse } from '../types';
import { Modal } from './shared/Modal';
import { Button } from './shared/Button';
import { Input } from './shared/Input';

interface ApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  rawResponse: BinomoApiResponse | null;
  onApplyCustomUrl?: (url: string) => void;
}

export const ApiModal: React.FC<ApiModalProps> = ({
  isOpen,
  onClose,
  currentUrl,
  rawResponse,
  onApplyCustomUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const [customInputUrl, setCustomInputUrl] = useState(currentUrl);

  useEffect(() => {
    setCustomInputUrl(currentUrl);
  }, [currentUrl]);

  const handleCopy = () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(currentUrl).catch(() => {
          fallbackCopy(currentUrl);
        });
      } else {
        fallbackCopy(currentUrl);
      }
    } catch {
      fallbackCopy(currentUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch {}
  };

  const handleApply = () => {
    if (customInputUrl.trim() && onApplyCustomUrl) {
      onApplyCustomUrl(customInputUrl.trim());
      onClose();
    }
  };

  const sampleCandle = rawResponse?.data?.[0];
  const lastCandle = rawResponse?.data?.[rawResponse.data.length - 1];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Binomo Candles API Endpoint"
      id="api-inspector-modal"
      icon={
        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
          <Globe className="w-4 h-4" />
        </div>
      }
      footerActions={
        <>
          <Button id="cancel-api-modal-btn" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button id="apply-api-url-btn" variant="primary" size="sm" onClick={handleApply}>
            Apply URL & Reload Chart
          </Button>
        </>
      }
    >
      <div className="space-y-4 font-sans text-slate-800 dark:text-[#d1d4dc]">
        {/* Target URL Box */}
        <div>
          <div className="flex items-center gap-2">
            <Input
              id="api-target-url-input"
              type="text"
              label="Active Request URL"
              value={customInputUrl}
              onChange={(e) => setCustomInputUrl(e.target.value)}
            />
            <div className="flex items-end gap-2 self-end mb-0.5 shrink-0">
              <Button
                id="copy-api-url-btn"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                title="Copy API URL"
                className="h-[34px]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </Button>
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="h-[34px] px-3 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-neutral-950 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-2">
            Endpoint format: <code className="font-mono text-[10px] bg-gray-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-gray-700 dark:text-neutral-300">/candles/v1/:asset/:date/:interval?locale=en</code>
          </p>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40">
            <span className="text-[11px] text-gray-500 dark:text-neutral-400 block">Status</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {rawResponse?.success ? '200 OK (Live)' : 'Pending'}
            </span>
          </div>
          <div className="p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40">
            <span className="text-[11px] text-gray-500 dark:text-neutral-400 block">Total Candles</span>
            <span className="font-mono font-bold text-slate-800 dark:text-neutral-200 mt-0.5 block">
              {rawResponse?.data?.length || 0} bars
            </span>
          </div>
          <div className="p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40">
            <span className="text-[11px] text-gray-500 dark:text-neutral-400 block">Asset Code</span>
            <span className="font-mono font-bold text-gray-800 dark:text-neutral-200 mt-0.5 block">
              Z-CRY/IDX
            </span>
          </div>
          <div className="p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40">
            <span className="text-[11px] text-gray-500 dark:text-neutral-400 block">Timeframe</span>
            <span className="font-mono font-bold text-gray-800 dark:text-neutral-200 mt-0.5 block">
              60s (1m)
            </span>
          </div>
        </div>

        {/* JSON Payload Sample */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
              <Terminal className="w-3.5 h-3.5" />
              <span>Response Data Sample (First & Last Bars)</span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto border border-gray-200 dark:border-neutral-700">
            <pre className="text-[11px] leading-relaxed">
{JSON.stringify(
  {
    success: rawResponse?.success,
    data_length: rawResponse?.data?.length,
    first_candle: sampleCandle,
    latest_candle: lastCandle,
  },
  null,
  2
)}
            </pre>
          </div>
        </div>
      </div>
    </Modal>
  );
};
