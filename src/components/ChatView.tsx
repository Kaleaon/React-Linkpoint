import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { app } from '../linkpoint/app';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sync initial messages
    setMessages([...app.chat.messages]);

    const handleChat = () => {
      setMessages([...app.chat.messages]);
      scrollToBottom();
    };

    app.chat.on('chat_message', handleChat);
    return () => {
      app.chat.off('chat_message', handleChat);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    app.chat.sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col bg-[#100f0e]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => {
          const isSystem = msg.sender === 'System';
          const isMe = msg.sender === `${(app.auth as any).firstName} ${(app.auth as any).lastName}`;

          return (
            <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              {!isMe && !isSystem && (
                <span className="mb-1 text-xs font-semibold text-[#4a9eff]">{msg.sender}</span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  isSystem
                    ? 'self-center bg-[#1b2a2d] text-[#e2e8f0]/70 border border-[#1e293b]'
                    : isMe
                    ? 'bg-[#3476ff] text-white rounded-br-sm'
                    : 'bg-[#101a1c] text-[#e2e8f0] border border-[#1e293b] rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="shrink-0 border-t border-[#1e293b] bg-[#101a1c] p-3">
        <div className="flex items-center gap-2 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-full border border-[#1e293b] bg-[#1b2a2d] py-3 pl-4 pr-12 text-sm text-[#e2e8f0] outline-none transition focus:border-[#6cff9a] focus:ring-1 focus:ring-[#6cff9a]"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#6cff9a] text-[#101a1c] disabled:opacity-50 disabled:bg-[#1e293b] disabled:text-[#e2e8f0]/30 transition-colors"
          >
            <Send size={18} className="ml-1" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatView;
