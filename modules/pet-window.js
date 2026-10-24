var petWindow = null;
var hitWindow = null;
var isPetRunning = false;
var currentConfig = null;
var SPINE_JS = null;
function cacheDir() { return context.getCacheDir().getAbsolutePath(); }

// 窗口模式：
//  false - 单窗口，WebView 与渲染区域同大小（旧行为，热区等于窗口）
//  true  - 双层，全屏透明 WebView 负责渲染，小窗口负责触摸判定
var useFullscreen = false;

// 行走控制：位移由原生定时器积分，WebView 只上报状态变化（低频、可靠）
var petWv = null;          // 渲染 WebView
var walkTimer = null;      // 行走定时器
var isDragging = false;    // 用户正在拖拽桌宠
var walkSpeed = 30;        // 行走速度 px/s（启动时从配置读取）
var winSizeW = 200;        // 判定窗口宽度（用于边界计算）
var winSizeH = 220;        // 判定窗口高度
var petPos = {x: 0, y: 0}; // 角色坐标（像素，屏幕坐标系）；双层模式下为热区窗口中心
var petCenterOff = {x: 0, y: 0}; // 双层模式下热区中心相对窗口左上角的偏移
var walk = { active: false, dir: 0, edge: 0, edgeSince: 0, lastNotify: 0, lastT: 0 };

// 设备尺寸：悬浮窗定位、setPosition、触摸事件的 rawX/Y 都基于 device.width/height 的坐标系，
// 全屏渲染窗口必须使用同一套尺寸，否则会出现拉伸、方向错误和拖动速度不一致
function realScreen() {
    return { w: device.width, h: device.height };
}

function ensureSpineJs() {
    if (SPINE_JS) return true;
    try { SPINE_JS = files.read(files.cwd() + "/libs/spine-webgl.js"); return true; }
    catch(e) { return false; }
}

function startWalkTimer() {
    stopWalkTimer();
    walkTimer = setInterval(function() { ui.run(walkTick); }, 30);
}

function stopWalkTimer() {
    if (walkTimer) { clearInterval(walkTimer); walkTimer = null; }
    walk.active = false;
    walk.lastT = 0;
}

// WebView 上报的行走状态："ML" 左行 / "MR" 右行 / 其他 停止
function setWalkState(st) {
    if (st === "ML" || st === "MR") {
        walk.active = true;
        walk.dir = (st === "MR") ? 1 : -1;
        walk.edge = 0;
        walk.lastT = 0;
    } else {
        walk.active = false;
    }
}

// petPos 为渲染窗口左上角；双层模式下触控窗口跟随移动并保持相对偏移
function movePet(x, y) {
    petPos.x = x;
    petPos.y = y;
    if (petWindow) {
        try { petWindow.setPosition(Math.round(x), Math.round(y)); } catch(e) {}
    }
    if (hitWindow) {
        try { hitWindow.setPosition(Math.round(x + petCenterOff.x), Math.round(y + petCenterOff.y)); } catch(e) {}
    }
}

function walkTick() {
    if (!isPetRunning || !walk.active || isDragging) { walk.lastT = 0; return; }
    var now = java.lang.System.currentTimeMillis();
    if (!walk.lastT) { walk.lastT = now; return; }
    var dt = Math.min((now - walk.lastT) / 1000, 0.2);
    walk.lastT = now;
    if (dt <= 0) return;

    var screen = realScreen();
    var hw = Math.round(winSizeW / 2);
    var minX = -hw, maxX = screen.w - hw;
    var dx = walk.dir * walkSpeed * dt;
    var wasX = petPos.x;
    var wantX = wasX + dx;
    var newX = Math.round(Math.max(minX, Math.min(maxX, wantX)));
    if (newX !== wasX) movePet(newX, petPos.y);

    if (wantX < minX || wantX > maxX) {
        var side = wantX < minX ? -1 : 1;
        if (walk.edge !== side) {
            // 首次撞墙：通知掉头
            walk.edge = side;
            walk.edgeSince = now;
            walk.lastNotify = now;
            notifyEdge(side);
        } else {
            // 持续抵墙：每 1s 重发一次通知（幂等，WebView 已掉头则忽略）
            if (now - walk.lastNotify > 1000) { walk.lastNotify = now; notifyEdge(side); }
            // 卡墙超 5 秒（WebView 无响应，如渲染进程被杀）：停止移动自我保护
            if (now - walk.edgeSince > 5000) walk.active = false;
        }
    } else {
        walk.edge = 0;
    }
}

function notifyEdge(side) {
    if (!petWv || !isPetRunning) return;
    try { petWv.evaluateJavascript("javascript:window._onEdge&&window._onEdge(" + side + ")", null); } catch(e) {}
}

// 配置值一律按数字处理，非法值回落到默认值（同时避免拼接进内联 JS 造成注入）
function num(v, def) {
    var n = Number(v);
    return (v === null || v === undefined || isNaN(n)) ? def : n;
}

function makeWebViewSettings(wv) {
    wv.setBackgroundColor(android.graphics.Color.TRANSPARENT);
    var ws = wv.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setAllowFileAccess(true);
    ws.setDomStorageEnabled(true);
    // 固定 1:1 显示比例，避免 WebView 缩放导致画布与窗口坐标不一致（拉伸/反向/速度不符）
    try {
        ws.setUseWideViewPort(false);
        ws.setLoadWithOverviewMode(false);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setTextZoom(100);
    } catch(e) {}
    try { wv.setInitialScale(100); } catch(e) {}
    wv.setWebChromeClient(new JavaAdapter(android.webkit.WebChromeClient, {
        onConsoleMessage: function(msg) { log("[PET:" + msg.lineNumber() + "]: " + msg.message()); }
    }));
    wv.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
        onPageFinished: function(webView, url) {
            // 加载完成后再设一次透明，否则部分设备会保留默认白底（全屏模式下表现为半透明）
            try { webView.setBackgroundColor(android.graphics.Color.TRANSPARENT); } catch(e) {}
        },
        shouldOverrideUrlLoading: function(webView, request) {
            var url = "";
            try {
                url = (request.a && request.a.a) || (request.url);
                if (url instanceof android.net.Uri) url = url.toString();
                if (url.indexOf("jsbridge://") !== 0) return false;
                var parts = url.split("/");
                var cmd = parts[2];
                var params = JSON.parse(decodeURIComponent(parts[4]));
                if (cmd === "state") {
                    setWalkState(String(params.st));
                    return true;
                }
            } catch(e) {}
            return false;
        }
    }));
}

function createPetWindow(config) {
    if (isPetRunning) { toast("桌宠已在运行中"); return; }
    if (!ensureSpineJs()) { toast("缺少 spine-webgl.js"); return; }
    stopWalkTimer();
    currentConfig = config;
    useFullscreen = config.fullscreen_render === true;

    var cfg_scale = num(config.display_scale, 1.0);
    var cfg_allowWalk = config.behavior_allow_walk !== false;
    var cfg_allowSit = config.behavior_allow_sit !== false;
    var cfg_allowSleep = config.behavior_allow_sleep !== false;
    var cfg_allowSpecial = config.behavior_allow_special !== false;
    var cfg_allowInteract = config.behavior_allow_interact !== false;
    var cfg_dirSwitch = num(config.behavior_direction_switching, 0);

    var screen = realScreen();
    var baseW = Math.max(50, num(config.window_width, 200));
    var baseH = Math.max(50, num(config.window_height, 220));
    var sizeW = Math.round(baseW * cfg_scale);
    var sizeH = Math.round(baseH * cfg_scale);
    // 触控窗口：略小于角色窗口，尺寸比例与偏移可配置（仅双层模式生效）
    var hitRatio = Math.min(3, Math.max(0.2, num(config.hit_area_ratio, 0.7)));
    var hitOffsetX = num(config.hit_area_offset_x, 0);
    var hitOffsetY = num(config.hit_area_offset_y, 0);
    var hitsizeW = Math.max(24, Math.round(sizeW * hitRatio));
    var hitsizeH = Math.max(24, Math.round(sizeH * hitRatio));
    // 边界与拖动都按渲染窗口（角色窗口）尺寸计算
    winSizeW = sizeW;
    winSizeH = sizeH;

    // petPos 始终是渲染窗口（角色窗口）左上角
    var px = num(config.initial_position_x, -1);
    var py = num(config.initial_position_y, -1);
    var startX, startY;
    if (px >= 0 && py >= 0) {
        startX = Math.round(px * (screen.w - sizeW));
        startY = Math.round(py * (screen.h - sizeH));
    } else {
        startX = Math.round((screen.w - sizeW) / 2);
        startY = Math.round((screen.h - sizeH) / 3);
    }
    // 触控窗口相对角色窗口中心的偏移
    petCenterOff.x = Math.round((sizeW - hitsizeW) / 2) - hitOffsetX;
    petCenterOff.y = Math.round((sizeH - hitsizeH) / 2) - hitOffsetY;
    petPos.x = startX;
    petPos.y = startY;

    var cfg_posX = config.position_x; // null means default: c.width/2
    var cfg_posY = config.position_y; // null means default: c.height/5+c.height/20

    threads.start(function() {
        try {
            var skinDir = files.join(files.cwd(), "res", config.character_asset);
            var fl;
            try { fl = files.listDir(skinDir) || []; }
            catch(e) { ui.run(function() { toast("读取模型目录失败"); }); return; }
            var skF = null, atF = null, pnF = null;
            for (var i = 0; i < fl.length; i++) {
                if (fl[i].endsWith(".skel")) skF = fl[i];
                else if (fl[i].endsWith(".atlas")) atF = fl[i];
                else if (fl[i].endsWith(".png")) pnF = fl[i];
            }
            if (!skF || !atF || !pnF) {
                var miss = [];
                if (!skF) miss.push(".skel");
                if (!atF) miss.push(".atlas");
                if (!pnF) miss.push(".png");
                ui.run(function() { toast("模型文件不完整，缺少: " + miss.join(" ")); });
                return;
            }

            var skelB64 = android.util.Base64.encodeToString(
                files.readBytes(files.join(skinDir, skF)), android.util.Base64.NO_WRAP);
            var atlasB64 = android.util.Base64.encodeToString(
                java.lang.String(files.read(files.join(skinDir, atF))).getBytes("UTF-8"), android.util.Base64.NO_WRAP);
            var pngB64 = android.util.Base64.encodeToString(
                files.readBytes(files.join(skinDir, pnF)), android.util.Base64.NO_WRAP);

            var renderMix = num(config.render_animation_mixture, 0.3);
            var walkSpd = num(config.behavior_walk_speed, 30);
            walkSpeed = walkSpd;
            var aiAct = num(config.behavior_ai_activation, 4);
            var opacity = num(config.opacity, 1.0);
            var aiFactor = Math.max(0.2, 1 - aiAct / 16);

            // 单层：沿用原逻辑（位图按 dpr 放大，窗口即画布）
            // 双层：强制使用物理像素坐标系（窗口尺寸 = 画布位图 = CSS 尺寸，dpr 视为 1），
            //       这样屏幕坐标、悬浮窗坐标和绘制坐标完全一致，不会出现拉伸/反向/速度不一致
            var canvasW = sizeW;
            var canvasH = sizeH;
            // 渲染窗口始终为角色大小，角色位置沿用单层的画布内坐标
            var drawBaseX = "c.width/2", drawBaseY = "c.height/5+c.height/20";
            if (cfg_posX !== null && cfg_posX !== undefined && !isNaN(Number(cfg_posX))) drawBaseX = Number(cfg_posX);
            if (cfg_posY !== null && cfg_posY !== undefined && !isNaN(Number(cfg_posY))) drawBaseY = Number(cfg_posY);

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
            html += '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no">';
            html += '<title>Pet</title>';
            html += '<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:transparent}#c{display:block;width:100%;height:100%}</style>';
            html += '</head><body><canvas id="c"></canvas><script>' + SPINE_JS + ';</script><script>';
            html += '(function(){var c=document.getElementById("c");';
            html += 'var dpr=(window.devicePixelRatio||2);var sc=0.4*dpr;';
            html += 'c.width=' + canvasW + '*dpr;c.height=' + canvasH + '*dpr;';
            html += 'c.style.width="' + canvasW + 'px";c.style.height="' + canvasH + 'px";c.style.opacity=' + opacity + ';';
            html += 'var gl=c.getContext("webgl",{alpha:true,premultipliedAlpha:true});if(!gl)return;';
            html += 'gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);';
            html += 'var cw=c.width,ch=c.height;';
            html += 'fetch("data:application/octet-stream;base64,' + skelB64 + '").then(function(r){return r.arrayBuffer()}).then(function(b){var u8=new Uint8Array(b);var b2=u8;';
            html += 'var img=new Image();img.onload=function(){';
            html += 'var mgr=new spine.webgl.ManagedWebGLRenderingContext(gl);var tex=new spine.webgl.GLTexture(mgr,img);';
            html += 'var atxt=atob("' + atlasB64 + '");var atl=new spine.TextureAtlas(atxt,function(p){return tex;});';
            html += 'var al=new spine.AtlasAttachmentLoader(atl);var sb=new spine.SkeletonBinary(al);sb.scale=sc;var sd=sb.readSkeletonData(b2);';
            html += 'function ca(n){if(/^((Id.?le)|(Relax)).{0,2}$/i.test(n))return"I";if(/^Move.{0,2}$/i.test(n))return"M";if(/^Sit$/i.test(n))return"S";if(/^Sleep$/i.test(n))return"L";if(/^Special$/i.test(n))return"P";if(/^Interact$/i.test(n))return"A";if(/^Default.{0,2}$/i.test(n))return"D";return"O";}';
            html += 'var ag={};for(var i=0;i<sd.animations.length;i++){var n=sd.animations[i].name;var t=ca(n);if(!ag[t])ag[t]=[];ag[t].push(n);}';
            html += 'var ST="I,S,L,ML,MR,P".split(",");var WT=[[40,20,10,10,10,10],[30,40,20,10,10,10],[20,20,60,0,0,0],[40,10,0,20,20,10],[40,10,0,20,20,10],[50,20,10,10,10,0]];';
            html += 'var bind={},dis={};bind.I=ag.I?ag.I[0]:(ag.D?ag.D[0]:sd.animations[0].name);if(ag.A)bind.A=ag.A[0];';
            html += 'if(ag.M&&' + cfg_allowWalk + '){bind.ML=ag.M[0];bind.MR=ag.M[0];}else{dis.ML=true;dis.MR=true;}';
            html += 'if(ag.S&&' + cfg_allowSit + '){bind.S=ag.S[0];}else{dis.S=true;}if(ag.L&&' + cfg_allowSleep + '){bind.L=ag.L[0];}else{dis.L=true;}';
            html += 'if(ag.P&&' + cfg_allowSpecial + '){bind.P=ag.P[0];}else{dis.P=true;}';
            html += 'var aiF=' + aiFactor + ';for(var i=0;i<WT[0].length;i++)WT[0][i]=Math.round(WT[0][i]*aiF);';
            html += 'function ns(cur){var idx=ST.indexOf(cur);if(idx<0)idx=0;var row=WT[idx];var sum=0;for(var i=0;i<row.length;i++){if(!dis[ST[i]])sum+=row[i];}var r=Math.random()*sum,acc=0;for(var i=0;i<row.length;i++){if(dis[ST[i]])continue;acc+=row[i];if(r<acc)return ST[i];}return"I";}';
            html += 'var sk=new spine.Skeleton(sd);var mv=new spine.webgl.Matrix4();mv.ortho2d(0,0,cw,ch);gl.viewport(0,0,c.width,c.height);';
            html += 'var _px=' + drawBaseX + ',_py=' + drawBaseY + ';window._setPos=function(x,y){_px=x;_py=y;};';
            html += 'sk.x=_px;sk.y=_py;';
            html += 'var asd=new spine.AnimationStateData(sk.data);asd.defaultMix=' + renderMix + ';var as=new spine.AnimationState(asd);';
            html += 'var curSt="I";var dir=1;as.setAnimation(0,bind.I,true);';
            html += 'as.addListener({complete:function(entry){var en=entry.animation?entry.animation.name:"";if(ca(en)==="A"){_setSt("I");as.setAnimation(0,bind.I,true);return;}if(curSt==="ML"||curSt==="MR")return;var nxt=ns(curSt);_wacc=0;_setSt(nxt);if(nxt==="ML"||nxt==="MR"){dir=nxt==="MR"?1:-1;as.setAnimation(0,bind.ML,true);}else if(bind[nxt])as.setAnimation(0,bind[nxt],true);else as.setAnimation(0,bind.I,true);}});';
            html += 'window._as=as;window._bind=bind;window._dir=function(){return dir;};window._setDir=function(d){dir=d;if(curSt==="ML"&&d>0){_wacc=0;_setSt("MR");as.setAnimation(0,bind.MR,true);}else if(curSt==="MR"&&d<0){_wacc=0;_setSt("ML");as.setAnimation(0,bind.ML,true);}};';
            html += 'var sh=spine.webgl.Shader.newTwoColoredTextured(gl);var ba=new spine.webgl.PolygonBatcher(gl);var sr=new spine.webgl.SkeletonRenderer(new spine.webgl.ManagedWebGLRenderingContext(gl));';

            // 行走状态桥接：仅状态变化时通知原生端，窗口位移由原生定时器完成
            html += 'var _ml=Math.max(100,c.width*0.25);var _wacc=0;var _bid=0;var _bf=document.createElement("iframe");_bf.style.display="none";document.body.appendChild(_bf);';
            html += 'function _nf(s){_bid++;_bf.src="jsbridge://state/"+_bid+"/"+encodeURIComponent(JSON.stringify({st:s}));}';
            html += 'function _setSt(s){curSt=s;_nf(s);}';
            html += 'window._onEdge=function(b){if(curSt==="ML"&&b<0){dir=1;_wacc=0;_setSt("MR");as.setAnimation(0,bind.MR,true);}else if(curSt==="MR"&&b>0){dir=-1;_wacc=0;_setSt("ML");as.setAnimation(0,bind.ML,true);}};';
            html += 'window._doInteract=function(){if(bind.A){as.setAnimation(0,bind.A,false);}};';

            html += 'var render=function(){requestAnimationFrame(render);var now=Date.now()/1000,dt=Math.min(now-(window._lt||0),0.1);window._lt=now;';
            html += 'if(curSt==="ML"){_wacc+=' + walkSpd + '*dt;if(_wacc>=_ml){dir=1;_setSt("I");as.setAnimation(0,bind.I,true);}}';
            html += 'if(curSt==="MR"){_wacc+=' + walkSpd + '*dt;if(_wacc>=_ml){dir=-1;_setSt("I");as.setAnimation(0,bind.I,true);}}';
            html += 'sk.x=_px;sk.y=_py;sk.scaleX=dir*' + cfg_scale + ';sk.scaleY=' + cfg_scale + ';';
            html += 'gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);';
            html += 'as.update(dt);as.apply(sk);sk.updateWorldTransform();';
            html += 'sh.bind();sh.setUniformi(spine.webgl.Shader.SAMPLER,0);sh.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX,mv.values);';
            html += 'ba.begin(sh);sr.premultipliedAlpha=true;sr.draw(ba,sk);ba.end();sh.unbind();};requestAnimationFrame(render);';
            html += '};img.src="data:image/png;base64,' + pngB64 + '";});})();</script></body></html>';

            var tmpPath = cacheDir() + "/pet.html";
            files.write(tmpPath, html);

            ui.run(function() {
                try {
                    // 只关闭上一轮的窗口，不改变本次的运行状态
                    closeWindows();

                    var wv, hitWv = null;
                    // 渲染窗口始终为角色大小（与单层一致），双层额外叠加一个触控窗口
                    petWindow = floaty.rawWindow(
                        <vertical><webview id="wv" w={sizeW + "px"} h={sizeH + "px"} /></vertical>
                    );
                    petWindow.setPosition(Math.round(petPos.x), Math.round(petPos.y));
                    wv = petWindow.wv;
                    makeWebViewSettings(wv);

                    if (useFullscreen) {
                        // 触控窗口：略小于角色窗口，只负责拖动与点击，内容完全透明
                        hitWindow = floaty.rawWindow(
                            <vertical><frame id="hit" w={hitsizeW + "px"} h={hitsizeH + "px"} bg="#00000000" /></vertical>
                        );
                        hitWindow.setPosition(Math.round(petPos.x + petCenterOff.x), Math.round(petPos.y + petCenterOff.y));
                        hitWv = hitWindow.hit;
                        hitWv.setBackgroundColor(android.graphics.Color.TRANSPARENT);
                    }

                    var touchView = hitWv || wv;
                    var ds = {dx:0, dy:0, dw:false, wx:0, wy:0, wt:0};
                    touchView.setOnTouchListener(new android.view.View.OnTouchListener({
                        onTouch: function(view, ev) {
                            var rx = ev.getRawX(), ry = ev.getRawY();
                            switch (ev.getAction()) {
                                case android.view.MotionEvent.ACTION_DOWN:
                                    ds.dx = rx; ds.dy = ry;
                                    ds.wx = petPos.x; ds.wy = petPos.y;
                                    ds.dw = false; ds.wt = Date.now();
                                    isDragging = false;
                                    return true;
                                case android.view.MotionEvent.ACTION_MOVE:
                                    if (Math.abs(rx - ds.dx) > 10 || Math.abs(ry - ds.dy) > 10) {
                                        ds.dw = true;
                                        isDragging = true;
                                        var scr = realScreen();
                                        var ndx = Math.round(ds.wx + rx - ds.dx);
                                        var ndy = Math.round(ds.wy + ry - ds.dy);
                                        var hw = Math.round(winSizeW / 2), hh = Math.round(winSizeH / 2);
                                        ndx = Math.max(-hw, Math.min(scr.w - hw, ndx));
                                        ndy = Math.max(-hh, Math.min(scr.h - hh, ndy));
                                        movePet(ndx, ndy);
                                    }
                                    return true;
                                case android.view.MotionEvent.ACTION_UP:
                                    isDragging = false;
                                    if (!ds.dw && Date.now() - ds.wt < 500) {
                                        try {
                                            var _js = "";
                                            if (cfg_dirSwitch === 1) _js += "window._setDir(window._dir()*-1);";
                                            if (cfg_allowInteract) _js += "window._doInteract&&window._doInteract();";
                                            if (_js) wv.evaluateJavascript("javascript:" + _js, null);
                                        } catch(e) {}
                                    }
                                    return true;
                                case android.view.MotionEvent.ACTION_CANCEL:
                                    isDragging = false;
                                    return true;
                            }
                            return false;
                        }
                    }));

                    wv.loadUrl("file:" + tmpPath);
                    petWv = wv;
                    isPetRunning = true;
                    startWalkTimer();
                    toast("桌宠已启动");
                } catch(e) {
                    console.error("创建失败: " + e);
                    toast("创建失败: " + e);
                    destroyPetWindow();
                }
            });
        } catch(e) {
            console.error("后台准备失败: " + e);
            ui.run(function() { toast("渲染准备失败: " + e); });
        }
    });
}

function closeWindows() {
    if (hitWindow) { try { hitWindow.close(); } catch(e) {} hitWindow = null; }
    if (petWindow) { try { petWindow.close(); } catch(e) {} petWindow = null; }
    petWv = null;
    isDragging = false;
}

function destroyPetWindow() {
    stopWalkTimer();
    closeWindows();
    isPetRunning = false;
    currentConfig = null;
}

function isPetActive() { return isPetRunning && petWindow !== null; }

module.exports = {
    createPetWindow: createPetWindow,
    destroyPetWindow: destroyPetWindow,
    isPetActive: isPetActive,
    triggerInteract: function() {}
};
