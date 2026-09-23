import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Code,
  Play,
  Save,
  FileCode,
  Layers,
  BarChart2,
  Terminal,
  RotateCcw,
  ChevronDown,
  Maximize2,
  Minimize2,
  X,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Sliders,
  Download,
  Upload,
  PlusCircle,
} from 'lucide-react';
import { FormattedCandle } from '../types';
import { PineExecutionResult, PineTemplate, PineInputParam } from '../types/pine';
import { PINE_TEMPLATES } from '../utils/pineTemplates';
import { executePineScript, extractPineInputs } from '../utils/pineEngine';

interface PineEditorProps {
  isOpen: boolean;
  onClose: () => void;
  candles: FormattedCandle[];
  currentTimeframe?: number;
  activeExecutionResult: PineExecutionResult | null;
  onApplyScriptResult: (result: PineExecutionResult | null, code: string) => void;
  theme: 'dark' | 'light';
}

type EditorTab = 'editor' | 'inputs' | 'strategy-tester' | 'plots' | 'console' | 'templates';

export const PineEditor: React.FC<PineEditorProps> = ({
  isOpen,
  onClose,
  candles,
  currentTimeframe = 60,
  activeExecutionResult,
  onApplyScriptResult,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<EditorTab>('editor');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('ict-fvg-orderblocks');
  const [code, setCode] = useState<string>(PINE_TEMPLATES[0].code);
  const [isCompiled, setIsCompiled] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [height, setHeight] = useState<number>(380);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lastExecution, setLastExecution] = useState<PineExecutionResult | null>(activeExecutionResult);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);
  const [customInputValues, setCustomInputValues] = useState<Record<string, any>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  // Load saved custom script from localStorage on init
  useEffect(() => {
    try {
      const savedCode = localStorage.getItem('binomo_pine_custom_script');
      if (savedCode) {
        setCode(savedCode);
      }
    } catch {}
  }, []);

  // Sync inputs dynamically when code changes
  const extractedInputs = useMemo(() => {
    return extractPineInputs(code);
  }, [code]);

  // Handle template selection
  const handleSelectTemplate = (template: PineTemplate) => {
    setSelectedTemplateId(template.id);
    setCode(template.code);
    setCustomInputValues({});
    setActiveTab('editor');
  };

  // Compile and Apply Script to Live Chart
  const handleCompileAndApply = (overrideInputs?: Record<string, any>) => {
    if (!code.trim()) return;

    const inputOverrides = overrideInputs || customInputValues;
    const res = executePineScript(code, candles, currentTimeframe, inputOverrides);

    setLastExecution(res);
    setIsCompiled(true);
    onApplyScriptResult(res, code);

    if (res.scriptType === 'strategy' && res.trades && res.trades.length > 0) {
      setActiveTab('strategy-tester');
    } else if (res.errors.length > 0) {
      setActiveTab('console');
    }
  };

  // Update a single input parameter dynamically
  const handleInputChange = (varName: string, value: any) => {
    const updated = { ...customInputValues, [varName]: value };
    setCustomInputValues(updated);
    if (isCompiled) {
      handleCompileAndApply(updated);
    }
  };

  // Remove active script from chart
  const handleRemoveFromChart = () => {
    setIsCompiled(false);
    setLastExecution(null);
    onApplyScriptResult(null, code);
  };

  // Save script locally
  const handleSaveScript = () => {
    try {
      localStorage.setItem('binomo_pine_custom_script', code);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2000);
    } catch {}
  };

  // Export / Download .pine file
  const handleExportScript = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(lastExecution?.scriptName || 'script').replace(/[^a-zA-Z0-9_-]/g, '_')}.pine`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import / Upload .pine or .txt file
  const handleImportScript = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCode(content);
        setCustomInputValues({});
        setActiveTab('editor');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Reset to template code
  const handleResetCode = () => {
    const t = PINE_TEMPLATES.find((item) => item.id === selectedTemplateId) || PINE_TEMPLATES[0];
    setCode(t.code);
    setCustomInputValues({});
  };

  // Insert code snippet
  const handleInsertSnippet = (snippet: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newCode = code.substring(0, start) + snippet + code.substring(end);
    setCode(newCode);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    }, 0);
  };

  // Code editor cursor tracking
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    updateCursorPos(e.target);
  };

  const handleTextareaKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    updateCursorPos(e.currentTarget);
  };

  const updateCursorPos = (target: HTMLTextAreaElement) => {
    const textBefore = target.value.substring(0, target.selectionStart);
    const lines = textBefore.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    setCursorPos({ line, col });
  };

  // Support Tab key indentation inside editor
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      setCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCompileAndApply();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveScript();
    }
  };

  const lineCount = useMemo(() => {
    return code.split('\n').length;
  }, [code]);

  // Drag resizing for dock
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 200 && newHeight <= window.innerHeight - 100) {
        setHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const currentResult = lastExecution || activeExecutionResult;

  return (
    <div
      id="tradingview-pine-editor-panel"
      style={{ height: isMaximized ? '88vh' : `${height}px` }}
      className={`fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t shadow-2xl backdrop-blur-md transition-[height] duration-75 ${
        isDark
          ? 'bg-[#131722]/98 border-[#2a2e39] text-[#d1d4dc]'
          : 'bg-white/98 border-slate-200 text-slate-900'
      }`}
    >
      {/* Resizer Handle */}
      {!isMaximized && (
        <div
          onMouseDown={handleMouseDownResize}
          className={`h-1.5 w-full cursor-ns-resize transition-colors ${
            isDragging ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-500/50'
          }`}
          title="Drag to resize Pine Editor"
        />
      )}

      {/* Pine Editor Header Toolbar */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b text-xs select-none overflow-x-auto no-scrollbar gap-2 shrink-0 ${
          isDark ? 'border-[#2a2e39] bg-[#1e222d]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {/* Left: Tabs */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-slate-700/30 dark:border-slate-700 shrink-0">
            <Code className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="font-bold tracking-tight text-xs">Pine Editor</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold bg-blue-500/10 text-blue-500 shrink-0">
              v5 Full
            </span>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-200/50 dark:bg-[#131722] p-0.5 rounded-md shrink-0">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>

            <button
              onClick={() => setActiveTab('inputs')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTab === 'inputs'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Inputs</span>
              {extractedInputs.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded text-[10px] bg-blue-500/20 text-blue-400 font-bold">
                  {extractedInputs.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('strategy-tester')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTab === 'strategy-tester'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Strategy</span>
              {currentResult?.strategyStats && (
                <span className="ml-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('plots')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTab === 'plots'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Plots</span>
              {currentResult?.plots && currentResult.plots.length > 0 && (
                <span className="ml-0.5 px-1 py-0.2 rounded text-[10px] bg-slate-300 dark:bg-slate-700">
                  {currentResult.plots.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('templates')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTab === 'templates'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Library ({PINE_TEMPLATES.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTab === 'console'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Console</span>
              {currentResult?.errors && currentResult.errors.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded text-[10px] bg-rose-500 text-white font-bold">
                  {currentResult.errors.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isCompiled && currentResult?.success && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[11px] font-medium border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Active</span>
            </div>
          )}

          {/* Quick template selector */}
          <div className="relative shrink-0">
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                const found = PINE_TEMPLATES.find((t) => t.id === e.target.value);
                if (found) handleSelectTemplate(found);
              }}
              className={`text-xs rounded px-2 py-1 border appearance-none pr-6 cursor-pointer font-medium max-w-[140px] truncate ${
                isDark
                  ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] hover:border-slate-600'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              {PINE_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.shortTitle || tpl.title}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-1.5 top-2 pointer-events-none opacity-60" />
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportScript}
            accept=".pine,.txt"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import script (.pine or .txt)"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleExportScript}
            title="Export / Download .pine script"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleResetCode}
            title="Reset code"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleSaveScript}
            title="Save script locally (Ctrl+S)"
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors font-medium shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 shrink-0" />
            <span>Save</span>
          </button>

          <button
            onClick={() => handleCompileAndApply()}
            title="Compile & Apply to Chart (Ctrl+Enter)"
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current shrink-0" />
            <span>Add to Chart</span>
          </button>

          {isCompiled && (
            <button
              onClick={handleRemoveFromChart}
              title="Remove from chart"
              className="px-2 py-1 rounded text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 font-medium transition-colors shrink-0 cursor-pointer"
            >
              Remove
            </button>
          )}

          <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0" />

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors shrink-0 cursor-pointer"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Save Success Toast */}
      {saveSuccessNotice && (
        <div className="absolute top-12 right-6 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>Pine Script saved!</span>
        </div>
      )}

      {/* Main Tab Views */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* TAB 1: CODE EDITOR */}
        {activeTab === 'editor' && (
          <div className="flex-1 flex flex-col overflow-hidden relative font-mono text-xs">
            {/* Quick snippet toolbar */}
            <div className={`flex items-center gap-1.5 px-3 py-1 border-b text-[11px] overflow-x-auto no-scrollbar ${
              isDark ? 'border-[#2a2e39] bg-[#141822] text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'
            }`}>
              <span className="font-semibold text-slate-500 select-none mr-1">Insert:</span>
              <button
                onClick={() => handleInsertSnippet('ta.sma(close, 14)')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                ta.sma
              </button>
              <button
                onClick={() => handleInsertSnippet('ta.ema(close, 20)')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                ta.ema
              </button>
              <button
                onClick={() => handleInsertSnippet('ta.rsi(close, 14)')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                ta.rsi
              </button>
              <button
                onClick={() => handleInsertSnippet('[macd_line, sig_line, hist] = ta.macd(close, 12, 26, 9)\n')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                ta.macd
              </button>
              <button
                onClick={() => handleInsertSnippet('[st, dir] = ta.supertrend(3, 10)\n')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                ta.supertrend
              </button>
              <button
                onClick={() => handleInsertSnippet('plot(close, "Line", color=color.blue, linewidth=2)\n')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                plot()
              </button>
              <button
                onClick={() => handleInsertSnippet('plotshape(ta.crossover(close, open), "Buy", shape.arrowup, location.belowbar, color.green, text="BUY")\n')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                plotshape()
              </button>
              <button
                onClick={() => handleInsertSnippet('strategy.entry("Long", strategy.long)\n')}
                className="px-1.5 py-0.5 rounded bg-slate-500/10 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                strategy.entry
              </button>
            </div>

            {/* Error banner if any */}
            {currentResult?.errors && currentResult.errors.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-500 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-semibold">Line {currentResult.errors[0].line}:</span>
                <span className="truncate">{currentResult.errors[0].message}</span>
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              {/* Line Numbers Gutter */}
              <div
                className={`w-11 select-none py-2 text-right pr-2 font-mono text-[11px] border-r ${
                  isDark ? 'bg-[#181c27] text-slate-600 border-[#2a2e39]' : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}
              >
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div
                    key={i}
                    className={`leading-[20px] ${
                      cursorPos.line === i + 1
                        ? 'text-blue-500 font-bold'
                        : currentResult?.errors?.some((e) => e.line === i + 1)
                        ? 'text-rose-500 font-bold'
                        : ''
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Code TextArea */}
              <div className="flex-1 relative overflow-hidden bg-transparent">
                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={handleTextareaChange}
                  onKeyUp={handleTextareaKeyUp}
                  onClick={(e) => updateCursorPos(e.currentTarget)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className={`w-full h-full p-2 font-mono text-[12px] leading-[20px] resize-none outline-none focus:ring-0 ${
                    isDark
                      ? 'bg-[#131722] text-[#d1d4dc] selection:bg-blue-600/30'
                      : 'bg-white text-slate-900 selection:bg-blue-100'
                  }`}
                  placeholder="// Paste or write any TradingView Pine Script v1-v5 here..."
                />
              </div>
            </div>

            {/* Bottom Status Bar */}
            <div
              className={`flex items-center justify-between px-3 py-1 text-[11px] border-t select-none ${
                isDark ? 'border-[#2a2e39] bg-[#181c27] text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span>
                  Ln <span className="font-semibold">{cursorPos.line}</span>, Col{' '}
                  <span className="font-semibold">{cursorPos.col}</span>
                </span>
                <span>•</span>
                <span>{lineCount} lines</span>
                <span>•</span>
                <span>Pine Script v5 Compatible</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-slate-500">
                  <kbd className="px-1 py-0.5 rounded bg-slate-700/20 dark:bg-slate-700/50 text-[10px]">Ctrl+Enter</kbd> to execute
                </span>
                <span className="text-blue-500 font-medium">
                  {currentResult?.scriptName || 'Pine Engine Ready'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DYNAMIC SCRIPT INPUTS */}
        {activeTab === 'inputs' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/30">
              <div>
                <h4 className="text-sm font-bold">Interactive Script Parameters</h4>
                <p className="text-xs text-slate-400">
                  Adjust script inputs live with instant chart updates without modifying Pine code
                </p>
              </div>
              <button
                onClick={() => handleCompileAndApply()}
                className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Apply Changes
              </button>
            </div>

            {extractedInputs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extractedInputs.map((inp) => {
                  const val = customInputValues[inp.varName] !== undefined ? customInputValues[inp.varName] : inp.defval;
                  return (
                    <div
                      key={inp.id}
                      className={`p-3 rounded-xl border space-y-2 ${
                        isDark ? 'bg-[#181c27] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">{inp.title}</label>
                        <span className="text-[10px] font-mono text-slate-500">{inp.varName}</span>
                      </div>

                      {inp.type === 'bool' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(val)}
                            onChange={(e) => handleInputChange(inp.varName, e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                          />
                          <span className="text-xs">{val ? 'Enabled' : 'Disabled'}</span>
                        </div>
                      ) : inp.type === 'color' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={typeof val === 'string' && val.startsWith('#') ? val : '#3b82f6'}
                            onChange={(e) => handleInputChange(inp.varName, e.target.value)}
                            className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                          />
                          <span className="text-xs font-mono">{String(val)}</span>
                        </div>
                      ) : inp.type === 'int' || inp.type === 'float' ? (
                        <input
                          type="number"
                          value={val}
                          step={inp.type === 'float' ? '0.1' : '1'}
                          min={inp.minval}
                          max={inp.maxval}
                          onChange={(e) => handleInputChange(inp.varName, parseFloat(e.target.value) || 0)}
                          className={`w-full text-xs font-mono px-2.5 py-1.5 rounded border ${
                            isDark
                              ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]'
                              : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(val)}
                          onChange={(e) => handleInputChange(inp.varName, e.target.value)}
                          className={`w-full text-xs px-2.5 py-1.5 rounded border ${
                            isDark
                              ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]'
                              : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500">
                <Sliders className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No <code className="text-blue-500">input()</code> variables detected in the script.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STRATEGY TESTER */}
        {activeTab === 'strategy-tester' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {currentResult?.strategyStats ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Net Profit</div>
                    <div className={`text-base font-extrabold font-mono mt-0.5 ${currentResult.strategyStats.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {currentResult.strategyStats.netProfit >= 0 ? '+' : ''}${currentResult.strategyStats.netProfit.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {currentResult.strategyStats.netProfitPercent >= 0 ? '+' : ''}{currentResult.strategyStats.netProfitPercent.toFixed(2)}%
                    </div>
                  </div>

                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Win Rate</div>
                    <div className="text-base font-extrabold font-mono text-blue-500 mt-0.5">
                      {currentResult.strategyStats.winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {currentResult.strategyStats.winningTrades}W / {currentResult.strategyStats.losingTrades}L
                    </div>
                  </div>

                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Trades</div>
                    <div className="text-base font-extrabold font-mono text-purple-400 mt-0.5">
                      {currentResult.strategyStats.totalTrades}
                    </div>
                    <div className="text-[10px] text-slate-400">Simulated</div>
                  </div>

                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Profit Factor</div>
                    <div className="text-base font-extrabold font-mono text-amber-500 mt-0.5">
                      {currentResult.strategyStats.profitFactor.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">Gross Gain/Loss</div>
                  </div>

                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Max Drawdown</div>
                    <div className="text-base font-extrabold font-mono text-rose-400 mt-0.5">
                      ${currentResult.strategyStats.maxDrawdown.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      -{currentResult.strategyStats.maxDrawdownPercent.toFixed(2)}%
                    </div>
                  </div>

                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Final Equity</div>
                    <div className="text-base font-extrabold font-mono text-emerald-400 mt-0.5">
                      ${currentResult.strategyStats.finalEquity.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Initial: ${currentResult.strategyStats.initialCapital}
                    </div>
                  </div>
                </div>

                {/* List of Trades Log Table */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                    <span>List of Executed Trades ({currentResult.trades?.length || 0})</span>
                  </div>

                  <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#2a2e39] bg-[#181c27]' : 'border-slate-200 bg-white'}`}>
                    <table className="w-full text-left text-xs">
                      <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${isDark ? 'border-[#2a2e39] bg-[#1e222d] text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Entry Price</th>
                          <th className="py-2 px-3">Exit Price</th>
                          <th className="py-2 px-3">Profit/Loss</th>
                          <th className="py-2 px-3">Return %</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2a2e39]">
                        {currentResult.trades && currentResult.trades.length > 0 ? (
                          currentResult.trades.slice().reverse().map((trade) => {
                            const isWin = trade.pnl >= 0;
                            return (
                              <tr key={trade.id} className="hover:bg-slate-500/5 font-mono text-[11px]">
                                <td className="py-2 px-3 text-slate-400">#{trade.id}</td>
                                <td className="py-2 px-3">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    trade.type === 'long' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
                                  }`}>
                                    {trade.type === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {trade.type}
                                  </span>
                                </td>
                                <td className="py-2 px-3">${trade.entryPrice.toFixed(2)}</td>
                                <td className="py-2 px-3">{trade.exitPrice !== undefined ? `$${trade.exitPrice.toFixed(2)}` : '—'}</td>
                                <td className={`py-2 px-3 font-bold ${isWin ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {isWin ? '+' : ''}${trade.pnl.toFixed(2)}
                                </td>
                                <td className={`py-2 px-3 font-semibold ${isWin ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {isWin ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                                </td>
                                <td className="py-2 px-3 text-slate-400">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-800">
                                    {trade.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-500">
                              No trades triggered with current strategy settings.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                <BarChart2 className="w-12 h-12 mb-3 text-slate-400 opacity-60" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Active Strategy Backtest</h4>
                <p className="text-xs max-w-sm mt-1 text-slate-400">
                  Switch to a strategy script (e.g., EMA Golden Cross Strategy or Supertrend Strategy) and click "Add to chart" to run backtests.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PLOTS & SIGNALS */}
        {activeTab === 'plots' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Active Plotted Series ({currentResult?.plots?.length || 0})
              </h4>
              {currentResult?.plots && currentResult.plots.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {currentResult.plots.map((p) => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: p.color }} />
                        <div>
                          <div className="text-xs font-bold">{p.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {p.style} • Width: {p.lineWidth}px • {p.data.length} pts
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-semibold">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No plots found. Use <code className="text-blue-500">plot(series, ...)</code> in your script.</p>
              )}
            </div>

            {currentResult?.hlines && currentResult.hlines.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Reference Levels (hlines)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {currentResult.hlines.map((hl) => (
                    <div
                      key={hl.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-bold font-mono">{hl.title}: ${hl.price}</div>
                      <div className="w-3 h-1 rounded" style={{ backgroundColor: hl.color }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Triggered Signals ({currentResult?.markers?.length || 0})
              </h4>
              <div className="text-xs text-slate-400">
                {currentResult?.markers && currentResult.markers.length > 0
                  ? `Generated ${currentResult.markers.length} chart markers (BUY / SELL arrows)`
                  : 'No marker signals triggered yet.'}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: TEMPLATES LIBRARY */}
        {activeTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold">Built-in Pine Script Templates</h4>
                <p className="text-xs text-slate-400">Select any trading script preset to backtest & analyze instantly</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {PINE_TEMPLATES.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/20 ' + (isDark ? 'bg-[#1e222d]' : 'bg-blue-50/50')
                        : isDark
                        ? 'border-[#2a2e39] bg-[#181c27] hover:border-slate-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold">{tpl.title}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          tpl.type === 'strategy'
                            ? 'bg-purple-500/15 text-purple-400'
                            : 'bg-blue-500/15 text-blue-500'
                        }`}
                      >
                        {tpl.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">
                      {tpl.description}
                    </p>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{tpl.category}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTemplate(tpl);
                        }}
                        className="px-2 py-0.5 rounded bg-blue-600/10 hover:bg-blue-600 hover:text-white text-blue-500 font-semibold transition-colors"
                      >
                        Load Script
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: CONSOLE */}
        {activeTab === 'console' && (
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-700/40 text-[11px] text-slate-400">
              <span>Execution Logs</span>
              <span>{currentResult?.executionTimeMs ? `${currentResult.executionTimeMs}ms` : 'Ready'}</span>
            </div>

            {currentResult?.errors && currentResult.errors.length > 0 && (
              <div className="p-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span>Compilation / Runtime Errors:</span>
                </div>
                {currentResult.errors.map((e, idx) => (
                  <div key={idx} className="pl-5">
                    • Line {e.line}: {e.message}
                  </div>
                ))}
              </div>
            )}

            {currentResult?.logs && currentResult.logs.length > 0 ? (
              currentResult.logs.map((log, idx) => (
                <div key={idx} className="text-slate-300 dark:text-slate-400 text-[11px]">
                  <span className="text-slate-600 dark:text-slate-500 select-none">[{idx + 1}]</span> {log}
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-6">
                Pine Script console idle. Click "Add to chart" to compile and see output.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
