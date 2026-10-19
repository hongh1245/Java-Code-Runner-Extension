const status = document.querySelector('#status');
chrome.runtime.sendMessage({ type: 'HEALTH' }).then(response => {
  status.textContent = response.ok ? '● Java 21 本機沙箱已就緒' : response.message;
  status.dataset.ready = String(response.ok);
}).catch(() => { status.textContent = '無法檢查服務，請重新開啟擴充套件。'; });
document.querySelector('#run').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_SELECTION' });
    if (response.ok) window.close();
    else status.textContent = response.message;
  } catch { status.textContent = '無法讀取網頁，請重新整理後再試。'; }
  finally { document.querySelector('#run').disabled = false; }
});
