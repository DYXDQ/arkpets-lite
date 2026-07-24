var petWindow = null;
var isPetRunning = false;
var currentConfig = null;
var SPINE_JS = null;
var CACHE_DIR = context.getCacheDir().getAbsolutePath();

function ensureSpineJs() {
    if (SPINE_JS) return true;
    try { SPINE_JS = files.read(files.cwd() + "/libs/spine-webgl.js"); return true; }
    catch(e) { return false; }
}

function createPetWindow(config) {
    if (isPetRunning) { toast("桌宠已在运行中"); return; }
    if (!ensureSpineJs()) { toast("缺少 spine-webgl.js"); return; }
    currentConfig = config;

    var cfg_scale = config.display_scale || 1.0;
    var cfg_allowWalk = config.behavior_allow_walk !== false;
    var cfg_allowSit = config.behavior_allow_sit !== false;
    var cfg_allowSleep = config.behavior_allow_sleep !== false;
    var cfg_allowSpecial = config.behavior_allow_special !== false;
    var cfg_allowInteract = config.behavior_allow_interact !== false;
    var cfg_dirSwitch = config.behavior_direction_switching || 0;
    var cfg_baseW = config.window_width || 200;
    var cfg_baseH = config.window_height || 220;
    var cfg_posX = config.position_x; // null means default: c.width/2
    var cfg_posY = config.position_y; // null means default: c.height/5+c.height/20

    var baseW = Math.max(50, cfg_baseW);
    var baseH = Math.max(50, cfg_baseH);
    var sizeW = Math.round(baseW * cfg_scale);
    var sizeH = Math.round(baseH * cfg_scale);

    var px = config.initial_position_x;
    var py = config.initial_position_y;
    var wx, wy;
    if (px !== undefined && px >= 0 && py !== undefined && py >= 0) {
        wx = Math.round(px * (device.width - sizeW));
        wy = Math.round(py * (device.height - sizeH));
    } else {
        wx = Math.round((device.width - sizeW) / 2);
        wy = Math.round((device.height - sizeH) / 3);
    }

    threads.start(function() {
        try {
            var skinDir = files.join(files.cwd(), "res", config.character_asset);
            var fl = files.listDir(skinDir);
            var skF = null, atF = null, pnF = null;
            for (var i = 0; i < fl.length; i++) {
                if (fl[i].endsWith(".skel")) skF = fl[i];
                else if (fl[i].endsWith(".atlas")) atF = fl[i];
                else if (fl[i].endsWith(".png")) pnF = fl[i];
            }
            if (!skF || !atF || !pnF) { ui.run(function() { toast("模型文件不完整"); }); return; }

            var skelB64 = android.util.Base64.encodeToString(
                files.readBytes(files.join(skinDir, skF)), android.util.Base64.NO_WRAP);
            var atlasB64 = android.util.Base64.encodeToString(
                java.lang.String(files.read(files.join(skinDir, atF))).getBytes("UTF-8"), android.util.Base64.NO_WRAP);
            var pngB64 = android.util.Base64.encodeToString(
                files.readBytes(files.join(skinDir, pnF)), android.util.Base64.NO_WRAP);

            var renderMix = config.render_animation_mixture || 0.3;
            var walkSpd = config.behavior_walk_speed || 30;
            var aiAct = config.behavior_ai_activation !== undefined ? config.behavior_ai_activation : 4;
            var opacity = config.opacity !== undefined ? config.opacity : 1.0;
            var aiFactor = Math.max(0.2, 1 - aiAct / 16);

            // 构建 JS 位置表达式
            var posXExpr = (cfg_posX !== null && cfg_posX !== undefined) ? cfg_posX : "c.width/2";
            var posYExpr = (cfg_posY !== null && cfg_posY !== undefined) ? cfg_posY : "c.height/5+c.height/20";

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pet</title>';
            html += '<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:transparent}#c{display:block;width:100%;height:100%}</style>';
            html += '</head><body><canvas id="c"></canvas><script>' + SPINE_JS + ';</script><script>';
            html += '(function(){var c=document.getElementById("c"),dpr=window.devicePixelRatio||2;';
            html += 'c.width=' + baseW + '*dpr*' + cfg_scale + ';c.height=' + baseH + '*dpr*' + cfg_scale + ';';
            html += 'c.style.width="' + sizeW + 'px";c.style.height="' + sizeH + 'px";c.style.opacity=' + opacity + ';';
            html += 'var gl=c.getContext("webgl",{alpha:true,premultipliedAlpha:true});if(!gl)return;';
            html += 'gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);';
            html += 'fetch("data:application/octet-stream;base64,' + skelB64 + '").then(function(r){return r.arrayBuffer()}).then(function(b){var u8=new Uint8Array(b);var b2=u8;';
            html += 'var img=new Image();img.onload=function(){';
            html += 'var mgr=new spine.webgl.ManagedWebGLRenderingContext(gl);var tex=new spine.webgl.GLTexture(mgr,img);';
            html += 'var atxt=atob("' + atlasB64 + '");var atl=new spine.TextureAtlas(atxt,function(p){return tex;});';
            html += 'var al=new spine.AtlasAttachmentLoader(atl);var sb=new spine.SkeletonBinary(al);sb.scale=0.4*dpr;var sd=sb.readSkeletonData(b2);';
            html += 'function ca(n){if(/^((Id.?le)|(Relax)).{0,2}$/i.test(n))return"I";if(/^Move.{0,2}$/i.test(n))return"M";if(/^Sit$/i.test(n))return"S";if(/^Sleep$/i.test(n))return"L";if(/^Special$/i.test(n))return"P";if(/^Interact$/i.test(n))return"A";if(/^Default.{0,2}$/i.test(n))return"D";return"O";}';
            html += 'var ag={};for(var i=0;i<sd.animations.length;i++){var n=sd.animations[i].name;var t=ca(n);if(!ag[t])ag[t]=[];ag[t].push(n);}';
            html += 'var ST="I,S,L,ML,MR,P".split(",");var WT=[[40,20,10,10,10,10],[30,40,20,10,10,10],[20,20,60,0,0,0],[40,10,0,20,20,10],[40,10,0,20,20,10],[50,20,10,10,10,0]];';
            html += 'var bind={},dis={};bind.I=ag.I?ag.I[0]:(ag.D?ag.D[0]:sd.animations[0].name);if(ag.A)bind.A=ag.A[0];';
            html += 'if(ag.M&&' + cfg_allowWalk + '){bind.ML=ag.M[0];bind.MR=ag.M[0];}else{dis.ML=true;dis.MR=true;}';
            html += 'if(ag.S&&' + cfg_allowSit + '){bind.S=ag.S[0];}else{dis.S=true;}if(ag.L&&' + cfg_allowSleep + '){bind.L=ag.L[0];}else{dis.L=true;}';
            html += 'if(ag.P&&' + cfg_allowSpecial + '){bind.P=ag.P[0];}else{dis.P=true;}';
            html += 'var aiF=' + aiFactor + ';for(var i=0;i<WT[0].length;i++)WT[0][i]=Math.round(WT[0][i]*aiF);';
            html += 'function ns(cur){var idx=ST.indexOf(cur);if(idx<0)idx=0;var row=WT[idx];var sum=0;for(var i=0;i<row.length;i++){if(!dis[ST[i]])sum+=row[i];}var r=Math.random()*sum,acc=0;for(var i=0;i<row.length;i++){if(dis[ST[i]])continue;acc+=row[i];if(r<acc)return ST[i];}return"I";}';
            html += 'var sk=new spine.Skeleton(sd);var mv=new spine.webgl.Matrix4();mv.ortho2d(0,0,c.width,c.height);gl.viewport(0,0,c.width,c.height);';
            html += 'sk.x=' + posXExpr + ';sk.y=' + posYExpr + ';';
            html += 'var asd=new spine.AnimationStateData(sk.data);asd.defaultMix=' + renderMix + ';var as=new spine.AnimationState(asd);';
            html += 'var curSt="I";var dir=1;as.setAnimation(0,bind.I,true);';
            html += 'as.addListener({complete:function(entry){var en=entry.animation?entry.animation.name:"";if(ca(en)==="A"){curSt="I";as.setAnimation(0,bind.I,true);return;}if(curSt==="ML"||curSt==="MR")return;var nxt=ns(curSt);curSt=nxt;if(nxt==="ML"||nxt==="MR"){dir=nxt==="MR"?1:-1;as.setAnimation(0,bind.ML,true);}else if(bind[nxt])as.setAnimation(0,bind[nxt],true);else as.setAnimation(0,bind.I,true);}});';
            html += 'window._as=as;window._bind=bind;window._dir=function(){return dir;};window._setDir=function(d){dir=d;};';
            html += 'var sh=spine.webgl.Shader.newTwoColoredTextured(gl);var ba=new spine.webgl.PolygonBatcher(gl);var sr=new spine.webgl.SkeletonRenderer(new spine.webgl.ManagedWebGLRenderingContext(gl));';

            // 行走移动窗口
            html += 'var _wox=0;var _wlk=0;var _ml=0;var _bf=document.createElement("iframe");_bf.style.display="none";document.body.appendChild(_bf);var _bid=0;';
            html += 'function _walk(dx){_bid++;_bf.src="jsbridge://walk/"+_bid+"/"+encodeURIComponent(JSON.stringify({dx:dx}));}';

            html += 'var render=function(){requestAnimationFrame(render);_ml=c.width*0.25;var now=Date.now()/1000,dt=Math.min(now-(window._lt||0),0.1);window._lt=now;';
            html += 'if(curSt==="ML"){_wox-=' + walkSpd + '*dt;if(_wox<-_ml){_wox=-_ml;dir=1;curSt="I";as.setAnimation(0,bind.I,true);}_wlk+=dt;if(_wlk>0.03){_wlk=0;_walk(_wox);_wox=0;}}';
            html += 'if(curSt==="MR"){_wox+=' + walkSpd + '*dt;if(_wox>_ml){_wox=_ml;dir=-1;curSt="I";as.setAnimation(0,bind.I,true);}_wlk+=dt;if(_wlk>0.03){_wlk=0;_walk(_wox);_wox=0;}}';
            html += 'sk.x=' + posXExpr + '+_wox;sk.scaleX=dir*' + cfg_scale + ';sk.scaleY=' + cfg_scale + ';';
            html += 'gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);';
            html += 'as.update(dt);as.apply(sk);sk.updateWorldTransform();';
            html += 'sh.bind();sh.setUniformi(spine.webgl.Shader.SAMPLER,0);sh.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX,mv.values);';
            html += 'ba.begin(sh);sr.premultipliedAlpha=true;sr.draw(ba,sk);ba.end();sh.unbind();};requestAnimationFrame(render);';
            html += '};img.src="data:image/png;base64,' + pngB64 + '";});})();</script></body></html>';

            var tmpPath = CACHE_DIR + "/pet.html";
            files.write(tmpPath, html);

            ui.run(function() {
                try {
                    if (petWindow) { try { petWindow.close(); } catch(e) {} }

                    petWindow = floaty.rawWindow(
                        <vertical><webview id="wv" w={sizeW + "px"} h={sizeH + "px"} /></vertical>
                    );
                    petWindow.setPosition(wx, wy);

                    var wv = petWindow.wv;
                    wv.setBackgroundColor(android.graphics.Color.TRANSPARENT);
                    var ws = wv.getSettings();
                    ws.setJavaScriptEnabled(true);
                    ws.setAllowFileAccess(true);
                    ws.setDomStorageEnabled(true);

                    wv.setWebChromeClient(new JavaAdapter(android.webkit.WebChromeClient, {
                        onConsoleMessage: function(msg) { log("[PET:" + msg.lineNumber() + "]: " + msg.message()); }
                    }));

                    // 接收行走桥接
                    wv.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
                        shouldOverrideUrlLoading: function(webView, request) {
                            var url = "";
                            try {
                                url = (request.a && request.a.a) || (request.url);
                                if (url instanceof android.net.Uri) url = url.toString();
                                if (url.indexOf("jsbridge://") !== 0) return false;
                                var parts = url.split("/");
                                var cmd = parts[2];
                                var params = JSON.parse(decodeURIComponent(parts[4]));
                                if (cmd === "walk") {
                                    var dx = Math.round(params.dx);
                                    if (dx !== 0) {
                                        petWindow.setPosition(Math.max(0, Math.max(-Math.round(sizeW/2), Math.min(device.width - Math.round(sizeW/2), petWindow.getX() + dx))), petWindow.getY());
                                    }
                                    return true;
                                }
                            } catch(e) {}
                            return false;
                        }
                    }));

                    var ds = {dx:0, dy:0, dw:false, wx:0, wy:0, wt:0};
                    wv.setOnTouchListener(new android.view.View.OnTouchListener({
                        onTouch: function(view, ev) {
                            var rx = ev.getRawX(), ry = ev.getRawY();
                            switch (ev.getAction()) {
                                case android.view.MotionEvent.ACTION_DOWN:
                                    ds.dx = rx; ds.dy = ry;
                                    ds.wx = petWindow.getX(); ds.wy = petWindow.getY();
                                    ds.dw = false; ds.wt = Date.now();
                                    return true;
                                case android.view.MotionEvent.ACTION_MOVE:
                                    if (Math.abs(rx - ds.dx) > 10 || Math.abs(ry - ds.dy) > 10) {
                                        ds.dw = true;
                                        var ndx=Math.round(ds.wx + rx - ds.dx);var ndy=Math.round(ds.wy + ry - ds.dy);
                                        var hw=Math.round(sizeW/2);var hh=Math.round(sizeH/2);
                                        ndx=Math.max(-hw,Math.min(device.width-hw,ndx));
                                        ndy=Math.max(-hh,Math.min(device.height-hh,ndy));
                                        petWindow.setPosition(ndx,ndy);
                                    }
                                    return true;
                                case android.view.MotionEvent.ACTION_UP:
                                    if (!ds.dw && Date.now() - ds.wt < 500) {
                                        try { var _js = ""; if(cfg_dirSwitch === 1) { _js += "window._setDir(window._dir()*-1);"; } if(cfg_allowInteract) { _js += "if(window._bind&&window._bind.A)window._as.setAnimation(0,window._bind.A,false)"; } if(_js) { wv.evaluateJavascript("javascript:" + _js, null); } }
                                        catch(e) {}
                                    }
                                    return true;
                            }
                            return false;
                        }
                    }));

                    wv.loadUrl("file:" + tmpPath);
                    isPetRunning = true;
                    toast("桌宠已启动");
                } catch(e) {
                    console.error("创建失败: " + e);
                    toast("创建失败");
                    isPetRunning = false;
                }
            });
        } catch(e) {
            console.error("后台准备失败: " + e);
        }
    });
}

function destroyPetWindow() {
    if (petWindow) { try { petWindow.close(); } catch(e) {} petWindow = null; }
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
