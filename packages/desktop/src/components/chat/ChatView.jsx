import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

export default function ChatView() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ChatMessages />
      <ChatInput />
    </div>
  );
}
