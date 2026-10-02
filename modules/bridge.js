(function(){
    console.log("[bridge] running, hasConfig=" + (typeof _INIT_CONFIG !== 'undefined') + " hasChars=" + (typeof _INIT_CHARACTERS !== 'undefined'));

    var frame = document.createElement('iframe');
    frame.style.display = 'none';
    document.body.appendChild(frame);
    var cbIdx = 1, cbs = {};

    window.auto0 = {
        invoke: function(cmd, params, cb) {
            var id = cbIdx++;
            cbs[id] = cb || function(){};
            frame.src = 'jsbridge://' + cmd + '/' + id + '/' + encodeURIComponent(JSON.stringify(params));
        },
        callback: function(data) {
            var f = cbs[data.callId];
            if (f) { delete cbs[data.callId]; f(data.params); }
        }
    };

    window.AndroidBridge = {
        saveConfig: function(json) { auto0.invoke('saveConfig', json, function(){}); },
        startPet: function(cfg) {
            auto0.invoke('startPet', cfg, function(d) {
                if (window.onStartPetResult) window.onStartPetResult(d);
            });
        },
        stopPet: function() { auto0.invoke('stopPet', {}, function(){}); },
        startDownload: function(src) { auto0.invoke('startDownload', {source: src}, function(){}); },
        loadProfile: function(asset, cb) { auto0.invoke('loadProfile', {character_asset: asset}, cb); }
    };

    if (typeof _INIT_CONFIG !== 'undefined' && typeof window.onBridgeReady === 'function') {
        window.onBridgeReady(_INIT_CONFIG);
    }
    if (typeof _INIT_CHARACTERS !== 'undefined' && typeof window.onCharactersReady === 'function') {
        window.onCharactersReady(_INIT_CHARACTERS);
    }
})();
