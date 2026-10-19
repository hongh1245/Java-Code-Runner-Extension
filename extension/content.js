(() => {
  if (globalThis.__javaSelectionRunnerLoaded) return;
  globalThis.__javaSelectionRunnerLoaded = true;

  const host = document.createElement('div');
  host.setAttribute('data-java-selection-runner', '');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { color-scheme: dark; }
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button, textarea { font: inherit; }
      button { cursor: pointer; }
      button:disabled { cursor: default; opacity: .5; }
      button:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid #87d8ff; outline-offset: 3px; }
      .chip, .panel { position: fixed; pointer-events: auto; font: 13px/1.55 system-ui, -apple-system, sans-serif; color: #e7edf1; }
      .chip { display:flex; align-items:center; gap:7px; padding:8px 13px; border:1px solid #476653; border-radius:9px; background:#1d2b25; color:#c4f0d9; box-shadow:0 5px 18px #0004; white-space:nowrap; }
      .chip:hover { background:#2a4035; }
      .panel { width:360px; max-width:calc(100vw - 24px); max-height:calc(100vh - 24px); display:flex; flex-direction:column; overflow:hidden; border:1px solid #3d4b51; border-radius:13px; background:#1b2226; box-shadow:0 10px 38px #0005,0 2px 5px #0003; text-align:left; }
      header { display:flex; align-items:center; gap:9px; padding:13px 14px 11px; flex-shrink:0; }
      .logo { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; background:#c5efda; color:#173b2c; font:700 15px monospace; }
      h2 { font-size:13px; margin:0; font-weight:650; flex:1; letter-spacing:.02em; }
      .version { font:10px monospace; color:#a6b9c2; background:#2b353b; padding:3px 6px; border-radius:4px; }
      .close { width:27px; height:27px; border:0; border-radius:5px; color:#aebcc2; background:transparent; font-size:21px; line-height:1; }
      .close:hover { background:#354149; color:white; }
      .tabs { display:flex; gap:18px; padding:0 16px; border-bottom:1px solid #354148; flex-shrink:0; }
      .tab { background:none; color:#92a4ae; border:0; border-bottom:2px solid transparent; padding:9px 0; font-size:12px; }
      .tab[aria-selected="true"] { color:#c3eed8; border-bottom-color:#b8ebce; }
      .body { overflow:auto; padding:15px; min-height:135px; }
      .summary { display:flex; align-items:center; gap:7px; font-size:12px; color:#bcebd2; margin-bottom:10px; }
      .dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex:none; }
      .summary[data-state="error"] { color:#ffb7aa; }
      .summary[data-state="loading"] { color:#a9cce6; }
      .summary[data-state="loading"] .dot { animation:pulse 1s ease-in-out infinite; }
      @keyframes pulse { 50% { opacity:.2; } }
      @media (prefers-reduced-motion:reduce) { .summary .dot { animation:none!important; } }
      pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; tab-size:4; font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .stdout { color:#e6f2ea; }
      .stderr { color:#ffc4b7; }
      .label { margin:12px 0 5px; font-size:11px; color:#9eafb9; }
      .empty { color:#8e9fa9; font:12px/1.7 system-ui,sans-serif; }
      .notice { color:#b8c7ce; font-size:11px; margin:10px 0 0; }
      textarea { display:block; width:100%; padding:9px; border:1px solid #41515a; border-radius:6px; background:#12191d; color:#dbe9ed; resize:vertical; font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .source { min-height:190px; max-height:300px; white-space:pre; tab-size:4; }
      .inputs { margin:0 15px 12px; flex-shrink:0; }
      summary { color:#adbdc5; cursor:pointer; font-size:11px; padding:4px 0; }
      .stdin { margin-top:6px; min-height:55px; max-height:100px; }
      .input-help { color:#8e9fa9; margin:5px 0 0; font-size:10px; }
      .actions { display:flex; gap:8px; padding:0 15px 14px; flex-shrink:0; }
      .run, .copy { border-radius:7px; padding:8px 12px; font-size:12px; }
      .run { flex:1; border:1px solid #b9ebd1; background:#b9ebd1; color:#183e2b; font-weight:650; }
      .run:hover { background:#d2f7e4; }
      .copy { background:transparent; border:1px solid #465a64; color:#c6d5dc; }
      footer { display:flex; justify-content:space-between; padding:9px 15px; background:#222c31; color:#8fa4ae; font-size:10px; border-top:1px solid #344149; flex-shrink:0; }
    </style>
    <button class="chip" type="button" hidden aria-label="執行選取的 Java 程式碼">▶ <span>執行 Java</span></button>
    <section class="panel" role="dialog" aria-label="Java 執行結果" hidden>
      <header><span class="logo" aria-hidden="true">{ }</span><h2>Java 執行結果</h2><span class="version">JAVA 21</span><button class="close" type="button" aria-label="關閉執行結果">×</button></header>
      <div class="tabs" role="tablist" aria-label="結果與程式碼">
        <button class="tab" type="button" role="tab" id="result-tab" aria-controls="result-panel" aria-selected="true">執行結果</button>
        <button class="tab" type="button" role="tab" id="source-tab" aria-controls="source-panel" aria-selected="false" tabindex="-1">程式碼</button>
      </div>
      <div class="body">
        <div id="result-panel" role="tabpanel" aria-labelledby="result-tab">
          <div class="summary" role="status" aria-live="polite"><span class="dot"></span><span class="status-text">準備執行</span></div>
          <pre class="stdout"></pre><p class="empty" hidden></p>
          <div class="errors" hidden><div class="label">錯誤訊息</div><pre class="stderr"></pre></div>
          <div class="diagnostics" hidden><div class="label">編譯訊息</div><pre class="compiler"></pre></div>
          <p class="notice" hidden></p>
        </div>
        <div id="source-panel" role="tabpanel" aria-labelledby="source-tab" hidden><textarea class="source" aria-label="Java 程式碼" spellcheck="false"></textarea><p class="notice">可以修改後重新執行。支援完整類別或簡單的敘述片段。</p></div>
      </div>
      <details class="inputs"><summary>輸入資料（stdin）</summary><textarea class="stdin" aria-label="標準輸入資料" placeholder="例如 Scanner 要讀取的數字，每筆一行" spellcheck="false"></textarea><p class="input-help">整份輸入會一次送出；需要更多資料時會讀到 EOF。</p></details>
      <div class="actions"><button class="run" type="button">▶ 重新執行</button><button class="copy" type="button" disabled>複製結果</button></div>
      <footer><span>本機沙箱 · 程式碼不傳雲端</span><span class="timing"></span></footer>
    </section>`;
  document.documentElement.append(host);
  const $ = selector => shadow.querySelector(selector);
  const panel = $('.panel');
  const chip = $('.chip');
  let selectedCode = '';
  let selectedRect;
  let currentRequest = null;
  let copyText = '';
  let focusBefore;

  function selection() {
    const value = window.getSelection();
    if (!value?.rangeCount || value.isCollapsed) return null;
    const code = value.toString().trim();
    if (!code) return null;
    return { code, rect: value.getRangeAt(0).getBoundingClientRect() };
  }
  function position(element, rect) {
    const bounds = element.getBoundingClientRect();
    const beside = element === panel && rect && rect.right + bounds.width + 24 <= innerWidth;
    const x = beside ? rect.right + 12 : rect?.left ?? (innerWidth - bounds.width - 20);
    let y = rect ? rect.bottom + 10 : 70;
    if (beside) y = rect.top;
    if (y + bounds.height > innerHeight - 12) y = (rect?.top ?? innerHeight) - bounds.height - 10;
    element.style.left = `${Math.max(12, Math.min(x, innerWidth - bounds.width - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(y, innerHeight - bounds.height - 12))}px`;
  }
  function setTab(source) {
    $('#source-panel').hidden = !source;
    $('#result-panel').hidden = source;
    for (const [selector, active] of [['#result-tab', !source], ['#source-tab', source]]) {
      $(selector).setAttribute('aria-selected', String(active));
      $(selector).tabIndex = active ? 0 : -1;
    }
    position(panel, selectedRect);
  }
  function cancel() {
    if (currentRequest) chrome.runtime.sendMessage({ type: 'CANCEL_JAVA', requestId: currentRequest }).catch(() => {});
    currentRequest = null;
  }
  function close() {
    cancel();
    panel.hidden = true;
    chip.hidden = true;
    if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
  }
  function showStatus(text, state) {
    $('.status-text').textContent = text;
    $('.summary').dataset.state = state;
  }
  async function run() {
    cancel();
    const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    currentRequest = requestId;
    setTab(false);
    $('.run').disabled = true;
    $('.copy').disabled = true;
    $('.stdout').textContent = '';
    $('.stderr').textContent = '';
    $('.compiler').textContent = '';
    $('.timing').textContent = '';
    for (const selector of ['.errors', '.diagnostics', '.empty', '#result-panel .notice']) $(selector).hidden = true;
    copyText = '';
    showStatus('正在編譯並執行…', 'loading');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'RUN_JAVA', requestId,
        code: $('.source').value, stdin: $('.stdin').value });
      if (currentRequest !== requestId) return;
      if (!response?.ok) throw new Error(response?.message || '本機服務沒有回應，請重試。');
      const result = response.result;
      const messages = { success: '執行成功', compile_error: '編譯失敗', runtime_error: '執行時發生例外',
        timeout: '超過執行時間限制', output_limit: '輸出超過上限，已停止', internal_error: '執行服務發生錯誤' };
      showStatus(messages[result.status] || '無法取得結果', result.status === 'success' ? 'success' : 'error');
      $('.stdout').textContent = result.stdout;
      $('.stderr').textContent = result.stderr;
      $('.errors').hidden = !result.stderr;
      $('.compiler').textContent = result.compileOutput || '';
      $('.diagnostics').hidden = !result.compileOutput;
      if (!result.stdout && !result.stderr && !result.compileOutput) {
        $('.empty').hidden = false;
        $('.empty').textContent = result.status === 'success' ? '程式已結束，沒有輸出。' : '程式已停止，沒有輸出。';
      }
      const notes = [];
      if (result.status === 'timeout') notes.push('執行限時 3 秒，編譯限時 8 秒。請檢查是否有無窮迴圈。');
      if (result.status === 'output_limit') notes.push('標準輸出及錯誤輸出各上限 32 KB，這裡顯示已保留的部分。');
      if (result.mode === 'snippet') notes.push('敘述片段已自動包進 Main.main；編譯行號以包裝後的程式為準。');
      $('#result-panel .notice').textContent = notes.join(' ');
      $('#result-panel .notice').hidden = !notes.length;
      $('.timing').textContent = `${result.durationMs} ms`;
      copyText = [result.stdout, result.stderr, result.compileOutput].filter(Boolean).join('\n');
      $('.copy').disabled = !copyText;
    } catch (error) {
      if (currentRequest !== requestId) return;
      showStatus('無法執行', 'error');
      $('.errors').hidden = false;
      $('.stderr').textContent = error.message || '請重新載入擴充套件後再試。';
    } finally {
      if (currentRequest === requestId) {
        currentRequest = null;
        $('.run').disabled = false;
        position(panel, selectedRect);
      }
    }
  }
  function open(code, rect) {
    if (!code?.trim()) return { ok: false, message: '請先在網頁上選取 Java 程式碼。' };
    focusBefore = document.activeElement;
    selectedRect = rect || selectedRect;
    $('.source').value = code;
    $('.stdin').value = '';
    panel.hidden = false;
    chip.hidden = true;
    position(panel, selectedRect);
    $('.close').focus({ preventScroll: true });
    run();
    return { ok: true };
  }

  document.addEventListener('mouseup', event => {
    if (event.composedPath().includes(host)) return;
    setTimeout(() => {
      const value = selection();
      if (!value || !panel.hidden || !/\b(class|interface|enum|record|System\s*\.|public\s+static|for\s*\(|while\s*\(|try\s*\{|int\s+\w|String\s+\w)/.test(value.code)) {
        chip.hidden = true;
        return;
      }
      selectedCode = value.code;
      selectedRect = value.rect;
      chip.hidden = false;
      position(chip, selectedRect);
    }, 0);
  });
  chip.addEventListener('mousedown', event => event.preventDefault());
  // The page can see DOM controls, but a synthetic page click must not start
  // local code execution. Context-menu messages arrive via the isolated API.
  chip.addEventListener('click', event => { if (event.isTrusted) open(selectedCode, selectedRect); });
  $('.close').addEventListener('click', close);
  $('.run').addEventListener('click', event => { if (event.isTrusted) run(); });
  $('#result-tab').addEventListener('click', () => setTab(false));
  $('#source-tab').addEventListener('click', () => setTab(true));
  $('.tabs').addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const source = event.key === 'End' || (event.key !== 'Home' && $('#source-panel').hidden);
      setTab(source);
      $(source ? '#source-tab' : '#result-tab').focus();
    }
  });
  $('.copy').addEventListener('click', async event => {
    if (!event.isTrusted) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copyText);
      else {
        const field = document.createElement('textarea');
        field.value = copyText;
        shadow.append(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('copy failed');
      }
      $('.copy').textContent = '已複製';
    } catch { $('.copy').textContent = '請手動選取複製'; }
    setTimeout(() => { $('.copy').textContent = '複製結果'; }, 1800);
  });
  shadow.addEventListener('keydown', event => {
    if (!event.isTrusted) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !$('.run').disabled) run();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
    if (event.key === 'Escape') chip.hidden = true;
  });
  document.addEventListener('scroll', () => { chip.hidden = true; }, { passive: true, capture: true });
  window.addEventListener('resize', () => { if (!panel.hidden) position(panel, selectedRect); chip.hidden = true; });
  $('.inputs').addEventListener('toggle', () => { if (!panel.hidden) position(panel, selectedRect); });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== 'OPEN_JAVA') return;
    const value = selection();
    respond(open(message.code || value?.code, value?.rect));
  });
})();
