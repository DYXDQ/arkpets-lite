"ui";

var configManager = require("./modules/config-manager.js");
var characterManager = require("./modules/character-manager.js");
var petWindow = require("./modules/pet-window.js");
var modelDownloader = require("./modules/model-downloader.js");

var BASE_PATH = files.cwd() + "/";
var bridgeJs = files.read(BASE_PATH + "modules/bridge.js");

// 单次 layout：包含加载提示和 WebView，通过 visibility 切换
ui.layout(
    <frame>
        <vertical id="loadingPanel" gravity="center" bg="#1e1e2e" w="*" h="*">
            <text text="ArkPets Lite" textColor="#ff8c00" textSize="18sp" />
            <text id="loadStatus" text="正在初始化..." textColor="#a0a0b0" textSize="13sp" marginTop="8" />
        </vertical>
        <vertical id="mainPanel" visibility="gone" w="*" h="*">
            <webview id="webView" w="*" h="*" />
        </vertical>
    </frame>
);

if (!floaty.checkPermission()) {
    toast("需要悬浮窗权限以显示桌宠");
    floaty.requestPermission();
}

// 后台初始化
threads.start(function() {
    var html, config, characters, tmpPath;
    try {
        ui.run(function() { ui.loadStatus.setText("正在加载配置..."); });
        config = configManager.loadConfig();

        ui.run(function() { ui.loadStatus.setText("正在扫描模型..."); });
        characters = characterManager.scanCharacters();

        ui.run(function() { ui.loadStatus.setText("正在构建界面..."); });
        html = files.read(BASE_PATH + "ui/config.html");

        var inject = "<script>var _INIT_CONFIG = " + JSON.stringify(config) + ";var _INIT_CHARACTERS = " + JSON.stringify(characters) + ";</script>";
        html = html.replace("</head>", inject + "</head>");

        tmpPath = BASE_PATH + "ui/config_loaded.html";
        files.write(tmpPath, html);

        ui.run(function() {
            ui.loadingPanel.setVisibility(android.view.View.GONE);
            ui.mainPanel.setVisibility(android.view.View.VISIBLE);
            setupWebView(ui.webView);
            ui.webView.loadUrl("file:" + tmpPath);
        });
    } catch(e) {
        console.error("Init failed: " + e);
        ui.run(function() { ui.loadStatus.setText("加载失败: " + e); });
    }
});

events.on("exit", function() { petWindow.destroyPetWindow(); });

function callJS(wv, script) {
    try {
        wv.evaluateJavascript("javascript:" + script, new JavaAdapter(android.webkit.ValueCallback, {
            onReceiveValue: function(val) { log("JS ok: " + String(val).substring(0, 30)); }
        }));
    } catch(e) { log("JS error: " + e); }
}

function setupWebView(wv) {
    wv.webViewClient = new JavaAdapter(android.webkit.WebViewClient, {
        onPageFinished: function(webView, curUrl) {
            log("Page loaded: " + curUrl);
            callJS(webView, "(function(){" + bridgeJs + "})()");
        },
        shouldOverrideUrlLoading: function(webView, request) {
            var url = "";
            try {
                url = (request.a && request.a.a) || (request.url);
                if (url instanceof android.net.Uri) url = url.toString();
                if (url.indexOf("jsbridge://") !== 0) return false;

                var parts = url.split("/");
                var cmd = parts[2];
                var callId = parts[3];
                var rawParams = decodeURIComponent(parts[4]);
                var params = JSON.parse(rawParams);
                var result = null;

                if (cmd === "saveConfig") {
                    configManager.saveConfig(params);
                    result = {ok: true};
                } else if (cmd === "startPet") {
                    try {
                        if (!floaty.checkPermission()) {
                            result = {ok: false, msg: "需要悬浮窗权限，请在系统设置中开启"};
                        } else {
                            var skinInfo = characterManager.getSkinFileInfo(params.character_asset);
                            if (!skinInfo) { result = {ok: false, msg: "未找到模型文件"}; }
                            else {
                                petWindow.createPetWindow(Object.assign({}, params, {
                                    skel: skinInfo.skel, atlas: skinInfo.atlas, png: skinInfo.png,
                                    resourcePath: "file://" + BASE_PATH + "res/" + params.character_asset + "/"
                                }));
                                result = {ok: true};
                            }
                        }
                    } catch(e) { result = {ok: false, msg: String(e)}; }
                } else if (cmd === "stopPet") {
                    petWindow.destroyPetWindow();
                    result = {ok: true};
                } else if (cmd === "startDownload") {
                    modelDownloader.downloadModelPack(params.source,
                        function(pct, st) {
                            ui.run(function() { callJS(wv, "if(window.updateDownloadProgress)window.updateDownloadProgress(" + pct + ",'" + st.replace(/'/g, "\\'") + "')"); });
                        },
                        function(ok, msg) {
                            ui.run(function() { callJS(wv, "if(window.updateDownloadProgress)window.updateDownloadProgress(100,'" + msg.replace(/'/g, "\\'") + "')"); });
                            toast(msg);
                        }
                    );
                    result = {ok: true};
                }

                var resultExpr = result ? JSON.stringify(result) : "null";
                webView.loadUrl("javascript:auto0.callback({'callId':" + callId + ",'params':" + resultExpr + "})");
                return true;
            } catch(e) { console.trace(e); }
        }
    });
    wv.webChromeClient = new JavaAdapter(android.webkit.WebChromeClient, {
        onConsoleMessage: function(msg) { console.log("[WV:" + msg.lineNumber() + "]: " + msg.message()); }
    });
}
