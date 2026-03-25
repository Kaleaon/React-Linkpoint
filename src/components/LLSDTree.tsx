import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Hash, Type, Calendar, Link, Binary, HelpCircle, Braces, List } from 'lucide-react';
import { LLSDValue } from '../lib/llsd';
import { format } from 'date-fns';

interface LLSDTreeProps {
  value: LLSDValue;
  label?: string;
  depth?: number;
}

const LLSDTree: React.FC<LLSDTreeProps> = ({ value, label, depth = 0 }) => {
  const [isOpen, setIsOpen] = useState(true);

  const getTypeIcon = (v: LLSDValue) => {
    if (v === null) return <HelpCircle className="w-4 h-4 text-gray-400" />;
    if (typeof v === 'boolean') return <Type className="w-4 h-4 text-blue-400" />;
    if (typeof v === 'number') return <Hash className="w-4 h-4 text-green-400" />;
    if (v instanceof Date) return <Calendar className="w-4 h-4 text-orange-400" />;
    if (v instanceof Uint8Array) return <Binary className="w-4 h-4 text-purple-400" />;
    if (Array.isArray(v)) return <List className="w-4 h-4 text-yellow-400" />;
    if (typeof v === 'object') return <Braces className="w-4 h-4 text-pink-400" />;
    if (typeof v === 'string') {
      if (v.startsWith('http://') || v.startsWith('https://')) return <Link className="w-4 h-4 text-cyan-400" />;
      return <Type className="w-4 h-4 text-blue-400" />;
    }
    return <HelpCircle className="w-4 h-4 text-gray-400" />;
  };

  const renderValue = (v: LLSDValue) => {
    if (v === null) return <span className="text-gray-500 italic">undef</span>;
    if (typeof v === 'boolean') return <span className="text-blue-500">{v.toString()}</span>;
    if (typeof v === 'number') return <span className="text-green-500">{v}</span>;
    if (v instanceof Date) return <span className="text-orange-500">{format(v, 'yyyy-MM-dd HH:mm:ss')}</span>;
    if (v instanceof Uint8Array) return <span className="text-purple-500">Binary ({v.length} bytes)</span>;
    if (typeof v === 'string') return <span className="text-gray-700">"{v}"</span>;
    return null;
  };

  const isExpandable = value !== null && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Uint8Array);

  return (
    <div className="ml-4 font-mono text-sm">
      <div 
        className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-100 cursor-pointer transition-colors ${depth === 0 ? 'bg-gray-50' : ''}`}
        onClick={() => isExpandable && setIsOpen(!isOpen)}
      >
        {isExpandable ? (
          isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
        ) : (
          <div className="w-4 h-4" />
        )}
        {getTypeIcon(value)}
        {label && <span className="font-bold text-gray-600">{label}:</span>}
        {!isExpandable && renderValue(value)}
        {isExpandable && (
          <span className="text-gray-400 text-xs">
            {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
          </span>
        )}
      </div>

      {isExpandable && isOpen && (
        <div className="border-l border-gray-200 ml-2">
          {Array.isArray(value) ? (
            value.map((v, i) => <LLSDTree key={i} value={v} label={i.toString()} depth={depth + 1} />)
          ) : (
            Object.entries(value as object).map(([k, v]) => <LLSDTree key={k} value={v} label={k} depth={depth + 1} />)
          )}
        </div>
      )}
    </div>
  );
};

export default LLSDTree;
