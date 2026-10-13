import { useState } from 'react';
import { useChat } from './hooks/useChat';
import { useSound } from './hooks/useSound';
import { useTheme } from './hooks/useTheme';
import { useUnreadTitle } from './hooks/useUnreadTitle';
import { ChatScreen } from './screens/ChatScreen';
import { JoinScreen } from './screens/JoinScreen';
import { getChatService, type ChatService } from './services';
import { readStorage, STORAGE_KEYS } from './utils/storage';

function loadService(): { service: ChatService } | { error: string } {
  try {
    return { service: getChatService() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '無法啟動聊天室' };
  }
}

export default function App() {
  const [loaded] = useState(loadService);
  if ('error' in loaded) {
    return (
      <main className="fatal" role="alert">
        <h1>無法啟動聊天室</h1>
        <p>{loaded.error}</p>
      </main>
    );
  }
  return <Chatroom service={loaded.service} />;
}

function Chatroom({ service }: { service: ChatService }) {
  const theme = useTheme();
  const sound = useSound();
  const [savedNickname] = useState(() => readStorage(STORAGE_KEYS.nickname) ?? '');

  // 頁面在背景時：分頁標題顯示未讀數，有開提示音就播放
  const [active, setActive] = useState(false);
  const unread = useUnreadTitle(active);
  const chat = useChat(service, {
    onIncoming: () => {
      if (unread.bump() && sound.enabled) sound.play();
    },
  });
  const inChat = chat.phase === 'chat';
  if (inChat !== active) setActive(inChat);

  if (!inChat) {
    return (
      <JoinScreen
        initialNickname={savedNickname}
        error={chat.joinError}
        busy={chat.phase === 'joining'}
        themeMode={theme.mode}
        onThemeChange={theme.setMode}
        onClearError={chat.clearJoinError}
        onSubmit={(nickname) => void chat.join(nickname)}
      />
    );
  }

  return (
    <ChatScreen
      service={service}
      chat={chat}
      themeMode={theme.mode}
      onThemeChange={theme.setMode}
      onThemeCycle={theme.cycle}
      soundEnabled={sound.enabled}
      onSoundToggle={sound.toggle}
    />
  );
}
