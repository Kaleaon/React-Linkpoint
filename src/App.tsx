import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  FileJson, 
  FileCode, 
  FileText, 
  Copy, 
  Check, 
  Trash2, 
  Play, 
  Info, 
  Settings, 
  Zap, 
  Database, 
  Share2,
  Maximize2,
  Minimize2,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LLSDValue, 
  LLSDFormat, 
  parseXML, 
  serializeXML, 
  parseNotation, 
  serializeNotation, 
  toJSON, 
  fromJSON, 
  detectFormat 
} from './lib/llsd';
import LLSDTree from './components/LLSDTree';

const SAMPLES = [
  {
    name: 'Simple Map',
    format: LLSDFormat.NOTATION,
    data: "{ 'foo': 'bar', 'count': i123, 'price': r4.5, 'active': true }"
  },
  {
    name: 'Complex XML',
    format: LLSDFormat.XML,
    data: `<?xml version="1.0" encoding="UTF-8"?>
<llsd>
  <map>
    <key>agent_id</key>
    <uuid>774cf3d4-3f79-4b5d-9b7a-c8022c000000</uuid>
    <key>name</key>
    <string>Linkpoint Resident</string>
    <key>position</key>
    <array>
      <real>128.0</real>
      <real>128.0</real>
      <real>25.0</real>
    </array>
    <key>last_login</key>
    <date>2023-01-01T12:00:00Z</date>
    <key>inventory</key>
    <map>
      <key>folders</key>
      <array>
        <string>Clothing</string>
        <string>Objects</string>
      </array>
    </map>
  </map>
</llsd>`
  },
  {
    name: 'Mixed Types',
    format: LLSDFormat.NOTATION,
    data: "[ i42, r3.14159, u'550e8400-e29b-41d4-a716-446655440000', d'2023-12-25T00:00:00Z', l'https://secondlife.com', b'SGVsbG8gTExTRA==' ]"
  },
  {
    name: 'Nested Map',
    format: LLSDFormat.NOTATION,
    data: "{ 'user': { 'name': 'John', 'age': i30 }, 'meta': { 'version': i1, 'tags': [ 'test', 'llsd' ] } }"
  }
];

const App: React.FC = () => {
  const [input, setInput] = useState(SAMPLES[1].data);
  const [format, setFormat] = useState<LLSDFormat>(LLSDFormat.XML);
  const [parsedValue, setParsedValue] = useState<LLSDValue>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tree' | 'xml' | 'notation' | 'json'>('tree');
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    handleParse();
  }, [input]);

  const handleParse = () => {
    if (!input.trim()) {
      setParsedValue(null);
      setError(null);
      return;
    }
    try {
      const detected = detectFormat(input);
      setFormat(detected);
      let value: LLSDValue = null;
      if (detected === LLSDFormat.XML) {
        value = parseXML(input);
        if (value === null && input.includes('<llsd')) {
          throw new Error('Invalid LLSD XML structure');
        }
      }
      else if (detected === LLSDFormat.NOTATION) value = parseNotation(input);
      else if (detected === LLSDFormat.JSON) value = fromJSON(input);
      
      if (value === null && input.trim() !== '!') {
        throw new Error('Failed to parse LLSD data');
      }
      
      setParsedValue(value);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to parse LLSD');
      setParsedValue(null);
    }
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const renderOutput = () => {
    if (!parsedValue && !error) return <div className="p-8 text-center text-gray-400 italic">No data parsed</div>;
    if (error) return <div className="p-8 text-center text-red-500 font-mono">{error}</div>;

    switch (activeTab) {
      case 'tree':
        return <div className="p-4 overflow-auto max-h-full"><LLSDTree value={parsedValue} /></div>;
      case 'xml':
        return (
          <div className="relative h-full">
            <SyntaxHighlighter language="xml" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%' }}>
              {serializeXML(parsedValue)}
            </SyntaxHighlighter>
            <button 
              onClick={() => handleCopy(serializeXML(parsedValue), 'xml')}
              className="absolute top-2 right-2 p-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
            >
              {copied === 'xml' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        );
      case 'notation':
        return (
          <div className="relative h-full">
            <SyntaxHighlighter language="javascript" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%' }}>
              {serializeNotation(parsedValue)}
            </SyntaxHighlighter>
            <button 
              onClick={() => handleCopy(serializeNotation(parsedValue), 'notation')}
              className="absolute top-2 right-2 p-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
            >
              {copied === 'notation' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        );
      case 'json':
        return (
          <div className="relative h-full">
            <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%' }}>
              {toJSON(parsedValue)}
            </SyntaxHighlighter>
            <button 
              onClick={() => handleCopy(toJSON(parsedValue), 'json')}
              className="absolute top-2 right-2 p-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
            >
              {copied === 'json' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#141414] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">LLSD Playground</h1>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Linden Lab Structured Data Tool</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {SAMPLES.map((s, i) => (
              <button
                key={i}
                onClick={() => setInput(s.data)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md hover:bg-white hover:shadow-sm transition-all"
              >
                {s.name}
              </button>
            ))}
          </div>
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={`p-6 grid gap-6 transition-all duration-300 ${isFullScreen ? 'h-[calc(100vh-80px)]' : 'h-[calc(100vh-80px)] grid-cols-1 lg:grid-cols-2'}`}>
        {/* Input Section */}
        <section className={`flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${isFullScreen ? 'hidden' : ''}`}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-bold text-gray-700 uppercase tracking-tight">Input</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                format === LLSDFormat.XML ? 'bg-blue-100 text-blue-600' : 
                format === LLSDFormat.NOTATION ? 'bg-purple-100 text-purple-600' : 
                'bg-green-100 text-green-600'
              }`}>
                {format}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setInput('')}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
                title="Clear input"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 p-6 font-mono text-sm focus:outline-none resize-none bg-white leading-relaxed"
            placeholder="Paste LLSD XML, Notation, or JSON here..."
            spellCheck={false}
          />
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {input.length} characters
            </span>
            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase">
              <Zap className="w-3 h-3 text-yellow-500" />
              Auto-parsing enabled
            </div>
          </div>
        </section>

        {/* Output Section */}
        <section className={`flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden relative ${isFullScreen ? 'col-span-2' : ''}`}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setActiveTab('tree')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'tree' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Tree
              </button>
              <button 
                onClick={() => setActiveTab('xml')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'xml' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                XML
              </button>
              <button 
                onClick={() => setActiveTab('notation')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'notation' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Notation
              </button>
              <button 
                onClick={() => setActiveTab('json')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'json' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                JSON
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  if (!parsedValue) return;
                  const content = activeTab === 'xml' ? serializeXML(parsedValue) : 
                                activeTab === 'notation' ? serializeNotation(parsedValue) : 
                                toJSON(parsedValue);
                  const ext = activeTab === 'xml' ? 'xml' : activeTab === 'notation' ? 'llsd' : 'json';
                  handleDownload(content, `data.${ext}`);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
              >
                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden bg-[#1E1E1E]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={`h-full ${activeTab === 'tree' ? 'bg-white' : ''}`}
              >
                {renderOutput()}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Toast Container */}
      <div id="toast-container" className="fixed top-6 right-6 z-50 flex flex-col items-end pointer-events-none"></div>

      {/* Footer Info */}
      <div className="fixed bottom-6 right-6">
        <div className="group relative">
          <button className="w-12 h-12 bg-white border border-gray-200 rounded-full shadow-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-all">
            <Info className="w-6 h-6" />
          </button>
          <div className="absolute bottom-full right-0 mb-4 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl p-6 opacity-0 group-hover:opacity-100 pointer-events-none transition-all transform translate-y-2 group-hover:translate-y-0">
            <h3 className="font-bold text-gray-800 mb-2">About LLSD</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              Linden Lab Structured Data (LLSD) is a data serialization format used by Linden Lab for Second Life and other services.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                XML Serialization
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                Notation Serialization
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Binary Serialization
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
