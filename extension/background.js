const BASE = 'http://127.0.0.1:43123';
const running = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'run-java', title: '執行選取的 Java 程式碼', contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  });
});

async function openSelection(tabId, code, frameId = 0) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tabId, { type: 'OPEN_JAVA', code }, { frameId });
  } catch {
    return { ok: false, message: '請在一般網頁選取程式碼。Chrome 內建頁面及擴充功能商店無法使用。' };
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'run-java' && tab?.id) openSelection(tab.id, info.selectionText, info.frameId || 0);
});

async function fetchService(path, options = {}, timeout = 24000, controller = new AbortController()) {
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '本機執行服務暫時無法使用。');
    return data;
  } finally { clearTimeout(timer); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'OPEN_SELECTION') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      if (!tabs[0]?.id) return { ok: false, message: '找不到目前的網頁。' };
      // Prefer the frame with the user's selection, including embedded frames.
      try {
        const selections = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id, allFrames: true },
          func: () => window.getSelection()?.toString() || '' });
        const selected = selections.find(frame => frame.result?.trim());
        return openSelection(tabs[0].id, selected?.result, selected?.frameId || 0);
      } catch { return openSelection(tabs[0].id); }
    }).then(respond).catch(() => respond({ ok: false, message: '無法讀取這個網頁，請重新整理後再試。' }));
    return true;
  }
  if (message?.type === 'HEALTH') {
    fetchService('/health', {}, 4000).then(data => respond({ ok: true, ...data }))
      .catch(error => respond({ ok: false, message: error.name === 'TypeError'
        ? '尚未連線，請先啟動本機服務。' : error.message }));
    return true;
  }
  const key = `${sender.tab?.id}:${sender.frameId}:${message?.requestId}`;
  if (message?.type === 'CANCEL_JAVA') {
    running.get(key)?.abort();
    respond({ ok: true });
    return;
  }
  if (message?.type !== 'RUN_JAVA' || !sender.tab) return;
  if (typeof message.code !== 'string' || typeof message.stdin !== 'string' ||
      typeof message.requestId !== 'string' || message.code.length > 40000 || message.stdin.length > 8192) {
    respond({ ok: false, message: '請縮小程式碼或輸入資料。' });
    return;
  }
  const controller = new AbortController();
  running.set(key, controller);
  fetchService('/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Java-Runner': '1' },
    body: JSON.stringify({ code: message.code, stdin: message.stdin }) }, 24000, controller)
    .then(result => respond({ ok: true, result }))
    .catch(error => respond({ ok: false, message: error.name === 'AbortError'
      ? '已停止或執行逾時，請縮短程式後重試。'
      : error.name === 'TypeError'
        ? '無法連線到本機 Java 服務。請在專案資料夾執行 npm start，再按「重新執行」。'
        : error.message }))
    .finally(() => running.delete(key));
  return true;
});
