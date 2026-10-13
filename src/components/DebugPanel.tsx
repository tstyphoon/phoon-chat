import type { DebugControls } from '../services/chatService';

/** 只有假後端、而且網址帶 ?debug 時才會出現，用來測試斷線等情境 */
export function DebugPanel({ controls }: { controls: DebugControls }) {
  return (
    <div className="debug-panel" role="group" aria-label="測試用工具">
      <div className="debug-title">測試工具（只有示範版有）</div>
      <button type="button" onClick={controls.disconnect}>
        模擬斷線
      </button>
      <button type="button" onClick={controls.reconnect}>
        恢復連線
      </button>
      <button type="button" onClick={controls.botSpeak}>
        讓機器人說話
      </button>
    </div>
  );
}
