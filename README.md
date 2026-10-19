# Java 選取執行器

Chrome Manifest V3 擴充套件。在網頁選取 Java 程式碼，點選「執行 Java」或使用右鍵選單，即可在約 360px 寬的小浮窗查看結果，類似 Google 翻譯的選取浮窗。

使用 **Java 21 真正編譯及執行**，例外捕捉與 `System.out` 的行為由 Java 決定。程式碼只送到電腦上的本機服務，在一次性的 Docker 容器執行，不使用雲端 API 或 API Key。

## 安裝與啟動

需要 **Node.js 22 以上**與 **Docker**。Windows / macOS 可用 Docker Desktop，請先啟動 Docker；不需要另裝本機 JDK。

在專案根目錄執行：

```sh
npm run sandbox:build
npm start
```

第一次建立沙箱會下載 JDK 映像檔。之後只需要 `npm start`，並保持終端機開啟；修改 `sandbox/` 後才需要重新建立映像檔。服務固定監聽 `127.0.0.1:43123`，不對區域網路開放。

在 Chrome 安裝擴充套件：

1. 開啟 `chrome://extensions`，開啟右上角「開發人員模式」。
2. 點選「載入未封裝項目」，選擇專案內的 **`extension/` 資料夾**。
3. 重新整理要使用的網頁。
4. 選取 Java 程式碼，點「執行 Java」，或按右鍵 →「執行選取的 Java 程式碼」。也可點工具列的擴充套件圖示，執行目前選取的程式。

正式使用不需要 `npm install`；服務沒有第三方執行依賴。

## 浮窗功能

- 結果、編譯訊息及未捕捉的例外分開顯示，保留換行及縮排。
- 切換「程式碼」可修改選取內容，再按「重新執行」。
- 展開「輸入資料（stdin）」可提供 `Scanner` / `BufferedReader` 需要的資料；整份資料一次送出，接著是 EOF。
- 「複製結果」複製輸出與診斷；`Esc` 關閉浮窗並取消執行。
- `Ctrl + Enter` / macOS `⌘ + Enter` 重新執行；方向鍵切換結果與程式碼頁籤。
- 自動靠近選取區域定位；空間足夠時放在程式碼旁邊，窄視窗會縮小。

## 支援範圍

支援單一來源檔案中的 Java 21 程式，包含 `package`、`import`、多個非 public 輔助類別，以及標準的 `public static void main(String[] args)`。來源檔名依 public 類別決定。也支援一般敘述片段：

```java
System.out.println(1 + 2);
```

片段會自動包進 `Main.main`，可含 `import`。編譯錯誤行號以包裝後的檔案為準，浮窗會提示。單獨的方法宣告、只有運算式的 `1 + 2`、互動式終端機、外部函式庫、Maven/Gradle 與多檔案專案不在第一版支援範圍。請避免把網頁行號一起選入。

Chrome 內建頁面、線上應用程式商店、PDF 檢視器及其他禁止注入的頁面無法使用。本版支援 HTTP / HTTPS 網頁。

## 你的例外處理範例

[`examples/Test.java`](examples/Test.java) 的結果是：

```text
Third Exception
```

`arr` 只有兩個元素，`num[2]` 先觸發 `ArrayIndexOutOfBoundsException`。內層 `ArithmeticException` 和外層 `IllegalArgumentException` 都不匹配，最後由外層 `catch (Exception e2)` 捕捉。將陣列改成 `{ 0, 200, 0 }`，才會因除以零輸出 `First Exception`。

可用以下指令啟動內附展示網頁，再於瀏覽器開啟終端機顯示的本機網址試用：

```sh
node examples/serve.mjs
```

## 隔離與限制

每次執行都建立新的非 root 容器，沒有主機目錄掛載，停用網路，使用唯讀根檔案系統、移除 Linux capabilities 並啟用 `no-new-privileges`。只有 `/work` 和 `/tmp` 可暫存檔案，執行後移除容器。

| 項目 | 上限 |
| --- | --- |
| Java 原始碼 | 32 KB（UTF-8） |
| stdin | 8 KB（UTF-8） |
| 編譯 / 程式執行 | 8 秒 / 3 秒 |
| stdout / stderr | 各 32 KB |
| 容器記憶體 / CPU / 行程數 | 256 MB / 1 CPU / 64 |
| 同時執行 | 2 個 |

編譯器停用 annotation processing。HTTP 服務拒絕一般網站的 Origin，執行請求須帶專用標頭。Docker 是隔離邊界，請保持 Docker 與基底映像檔更新；這是個人本機工具，不應直接公開成多人遠端執行服務。

## 開發與測試

```sh
npm ci
npm test
npm run sandbox:build
npm run test:integration
npx playwright install chromium
npm run test:ui
npm run test:browser
```

若已安裝 Chromium，可用 `CHROME_BIN=/usr/bin/chromium npm run test:browser`（Windows 請以對應方式設定環境變數）。瀏覽器測試載入真正的擴充套件並呼叫真正的 Docker 沙箱，使用 `43123` 連接埠；測試前先停止正在執行的 `npm start`。其他 HTTP 測試使用隨機連接埠。

單元測試涵蓋來源辨識及 HTTP 邊界；Docker 整合測試涵蓋範例例外、stdin、錯誤、逾時、輸出上限、檔案／網路隔離及取消後清理。Chromium 測試涵蓋選取、浮窗、編輯、stdin、複製、關閉、窄視窗及服務狀態；原生 Chrome 右鍵選單需手動點選確認，測試驗證其訊息處理路徑。

`test:ui` 使用真正的浮窗、背景處理程式與 Java 服務，只在測試頁替換 Chrome 擴充套件 API；`test:browser` 則實際安裝擴充套件，需允許載入未封裝擴充套件的 Chromium。兩者分開執行，且都需要先建立 Java 沙箱。

本次雲端環境的 Chromium 設有 `ExtensionInstallBlocklist: ["*"]`，無法驗證真正的擴充套件載入；Playwright 瀏覽器下載網域也被網路政策封鎖。因此以 `test:ui` 驗證實際浮窗與 Java 結果，保留完整原生擴充套件測試供不受此政策限制的開發電腦執行。執行畫面見 [`docs/preview.png`](docs/preview.png)。

```text
extension/    Chrome 擴充套件：選取 UI、浮窗及背景請求
server/       本機 Node.js HTTP 服務、Java 來源辨識
sandbox/      Java 21 映像與容器內編譯／執行 harness
examples/     Java 範例及展示網頁
test/         單元、Docker 整合、Chromium 測試
```
