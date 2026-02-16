import { useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import MessageBubble from './MessageBubble';
import ThinkingIndicator from './ThinkingIndicator';
import PermissionCard from './PermissionCard';

function ToolIndicator({ tool }) {
  if (!tool) return null;
  const name = tool.toolName?.split('__').pop()?.replace(/_/g, ' ') || 'Working';
  return (
    <div className="flex items-center gap-2 px-4 py-2 animate-fade-in">
      <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
      <span className="text-xs text-text-muted capitalize">{name}...</span>
    </div>
  );
}

export default function ChatMessages() {
  const messages = useStore((s) => s.messages);
  const isThinking = useStore((s) => s.isThinking);
  const thinkingText = useStore((s) => s.thinkingText);
  const currentTool = useStore((s) => s.currentTool);
  const permissionRequest = useStore((s) => s.permissionRequest);
  const lastCost = useStore((s) => s.lastCost);
  const isStreaming = useStore((s) => s.isStreaming);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking, currentTool, permissionRequest]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full text-text-muted text-sm">
          Send a message to get started
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {/* Active tool */}
      {currentTool && <ToolIndicator tool={currentTool} />}

      {/* Thinking */}
      {isThinking && !currentTool && <ThinkingIndicator text={thinkingText} />}

      {/* Permission request */}
      {permissionRequest && <PermissionCard />}

      {/* Cost display after completion */}
      {!isStreaming && lastCost?.tokens && messages.length > 0 && (
        <div className="px-4 py-1.5">
          <span className="text-xs text-text-muted">
            {((lastCost.tokens.input || 0) + (lastCost.tokens.output || 0)).toLocaleString()} tokens
          </span>
        </div>
      )}
    </div>
  );
}
