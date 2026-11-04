import { createContext, useContext, type ReactNode } from 'react';

/** Opens the case's team chat with text already typed (e.g. "@דני "). */
export interface ChatDockApi {
  openWith: (text: string) => void;
}

const ChatDockContext = createContext<ChatDockApi | null>(null);

/** Provided by the tender workspace, which owns the chat. Outside a case there is no chat (plan D14). */
export function ChatDockProvider({ value, children }: { value: ChatDockApi; children: ReactNode }) {
  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

/** null when there is no case chat here: callers hide their chat button. */
export function useChatDock(): ChatDockApi | null {
  return useContext(ChatDockContext);
}
