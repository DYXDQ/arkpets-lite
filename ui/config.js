/**
 * config.js - 配置界面交互逻辑
 */

// ========== State ==========
let config = {};
let characters = [];
let selectedCharacter = null;
let selectedSkin = null;
let isRunning = false;

// ========== DOM Ready ==========
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initSearch();
    initSettings();
    initLaunchButton();
    initDownloadDialog();
    initPositionPicker();
    loadData();
});

// ========== Tab Switching ==========
function initTabs() {
    const btns = document.querySelectorAll('.menu-btn');
    btns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            btns.forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-panel').forEach(function(p) {
                p.classList.remove('active');
            });
            document.getElementById('tab-' + tab).classList.add('active');
        });
    });
}

// ========== Data Loading ==========
function loadData() {
    // 从 Android 接口加载数据
    if (window.AndroidBridge) {
        config = JSON.parse(window.AndroidBridge.loadConfig());
        characters = JSON.parse(window.AndroidBridge.scanCharacters());
        renderModelList(characters);
        applyConfigToUI();
    }
}

// ========== Model List ==========
function renderModelList(list) {
    const container = document.getElementById('modelList');
    container.innerHTML = '';

    list.forEach(function(char) {
        char.skins.forEach(function(skin) {
            const item = document.createElement('div');
            item.className = 'model-item';
            item.dataset.path = skin.path;
            item.innerHTML = '<span class="name">' + char.name + '</span>' +
                           '<span class="skin">' + skin.name + '</span>';
            item.addEventListener('click', function() {
                selectModel(char, skin);
            });
            container.appendChild(item);
        });
    });
}

function selectModel(char, skin) {
    selectedCharacter = char;
    selectedSkin = skin;

    // 更新选中样式
    document.querySelectorAll('.model-item').forEach(function(item) {
        item.classList.remove('selected');
        if (item.dataset.path === skin.path) {
            item.classList.add('selected');
        }
    });

    // 更新信息面板
    document.getElementById('infoName').textContent = char.name;
    document.getElementById('infoSkin').textContent = skin.name;
    document.getElementById('infoPath').textContent = skin.path;

    // 保存到配置
    config.character_asset = skin.path;
    config.character_label = char.name;
    saveConfig();
}

// ========== Search ==========
function initSearch() {
    const input = document.getElementById('searchInput');
    const btnSearch = document.getElementById('btnSearch');
    const btnRandom = document.getElementById('btnRandom');
    const btnReload = document.getElementById('btnReload');

    btnSearch.addEventListener('click', doSearch);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doSearch();
    });

    btnRandom.addEventListener('click', function() {
        if (characters.length === 0) return;
        const char = characters[Math.floor(Math.random() * characters.length)];
        if (char.skins.length > 0) {
            const skin = char.skins[Math.floor(Math.random() * char.skins.length)];
            selectModel(char, skin);
        }
    });

    btnReload.addEventListener('click', function() {
        if (window.AndroidBridge) {
            characters = JSON.parse(window.AndroidBridge.scanCharacters());
            renderModelList(characters);
            showToast('已重新加载模型列表');
        }
    });
}

function doSearch() {
    const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!keyword) {
        renderModelList(characters);
        return;
    }

    const filtered = characters.filter(function(char) {
        return char.name.toLowerCase().includes(keyword) ||
               char.skins.some(function(s) { return s.name.toLowerCase().includes(keyword); });
    });
    renderModelList(filtered);
}

// ========== Settings Binding ==========
function initSettings() {
    // 开关
    bindSwitch('allowWalk', 'behavior_allow_walk');
    bindSwitch('allowSit', 'behavior_allow_sit');
    bindSwitch('allowSleep', 'behavior_allow_sleep');
    bindSwitch('allowSpecial', 'behavior_allow_special');
    bindSwitch('allowInteract', 'behavior_allow_interact');
    bindSwitch('windowTopmost', 'window_style_topmost');
    bindSwitch('windowToolwindow', 'window_style_toolwindow');

    // 滑块
    bindSlider('aiActivation', 'aiActivationVal', 'behavior_ai_activation', '', ' 级');
    bindSlider('walkSpeed', 'walkSpeedVal', 'behavior_walk_speed', '', ' px/s');
    bindSlider('marginBottom', 'marginBottomVal', 'display_margin_bottom', '', ' px');
    bindSlider('opacityNormal', 'opacityNormalVal', 'opacity_normal', '', '%', 0.01);
    bindSlider('opacityDim', 'opacityDimVal', 'opacity_dim', '', '%', 0.01);

    // 下拉框
    bindSelect('directionSwitch', 'behavior_direction_switching');
    bindSelect('displayScale', 'display_scale');
    bindSelect('displayFps', 'display_fps');
    bindSelect('transitionSpeed', 'render_animation_mixture');
    bindSelect('transitionType', 'transition_type');
    bindSelect('renderOutline', 'render_outline');
    bindSelect('outlineColor', 'render_outline_color');
    bindSelect('outlineWidth', 'render_outline_width');
    bindSelect('shadowColor', 'render_shadow_color');
    bindSelect('downloadSource', 'download_source');
}

function bindSwitch(id, configKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = !!config[configKey];
    el.addEventListener('change', function() {
        config[configKey] = el.checked;
        saveConfig();
    });
}

function bindSlider(id, valId, configKey, prefix, suffix, multiplier) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!el) return;

    let val = config[configKey];
    if (multiplier) val = val / multiplier;
    el.value = val;
    valEl.textContent = prefix + val + suffix;

    el.addEventListener('input', function() {
        let v = parseFloat(el.value);
        valEl.textContent = prefix + v + suffix;
        if (multiplier) v = v * multiplier;
        config[configKey] = v;
        saveConfig();
    });
}

function bindSelect(id, configKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = config[configKey];
    el.addEventListener('change', function() {
        let v = el.value;
        // 尝试转为数字
        if (!isNaN(parseFloat(v)) && isFinite(v)) v = parseFloat(v);
        config[configKey] = v;
        saveConfig();
    });
}

function applyConfigToUI() {
    for (const key in config) {
        if (!config.hasOwnProperty(key)) continue;
        const value = config[key];
        // 找到对应的 UI 元素
        const el = document.getElementById(getElementIdByKey(key));
        if (!el) continue;
        if (el.type === 'checkbox') {
            el.checked = !!value;
        } else {
            el.value = value;
        }
    }
}

function getElementIdByKey(key) {
    const map = {
        'behavior_allow_walk': 'allowWalk',
        'behavior_allow_sit': 'allowSit',
        'behavior_allow_sleep': 'allowSleep',
        'behavior_allow_special': 'allowSpecial',
        'behavior_allow_interact': 'allowInteract',
        'behavior_ai_activation': 'aiActivation',
        'behavior_walk_speed': 'walkSpeed',
        'behavior_direction_switching': 'directionSwitch',
        'display_scale': 'displayScale',
        'display_fps': 'displayFps',
        'display_margin_bottom': 'marginBottom',
        'window_style_topmost': 'windowTopmost',
        'window_style_toolwindow': 'windowToolwindow',
        'opacity_normal': 'opacityNormal',
        'opacity_dim': 'opacityDim',
        'render_outline': 'renderOutline',
        'render_outline_color': 'outlineColor',
        'render_outline_width': 'outlineWidth',
        'render_shadow_color': 'shadowColor',
        'render_animation_mixture': 'transitionSpeed',
        'transition_type': 'transitionType',
        'download_source': 'downloadSource'
    };
    return map[key] || key;
}

// ========== Position Picker ==========
function initPositionPicker() {
    const picker = document.getElementById('positionPicker');
    const crosshair = document.getElementById('crosshair');
    if (!picker || !crosshair) return;

    picker.addEventListener('click', function(e) {
        const rect = picker.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * 100;
        const y = (e.clientY - rect.top) / rect.height * 100;
        crosshair.style.left = x + '%';
        crosshair.style.top = y + '%';
        config.initial_position_x = x / 100;
        config.initial_position_y = y / 100;
        saveConfig();
    });
}

// ========== Launch Button ==========
function initLaunchButton() {
    const btn = document.getElementById('launchBtn');
    btn.addEventListener('click', function() {
        if (isRunning) {
            stopPet();
        } else {
            startPet();
        }
    });
}

function startPet() {
    if (!selectedSkin) {
        showToast('请先选择一个模型');
        return;
    }

    if (window.AndroidBridge) {
        const result = window.AndroidBridge.startPet(JSON.stringify(config));
        if (result) {
            isRunning = true;
            updateLaunchButton();
            showToast('桌宠已启动');
        } else {
            showToast('启动失败');
        }
    }
}

function stopPet() {
    if (window.AndroidBridge) {
        window.AndroidBridge.stopPet();
        isRunning = false;
        updateLaunchButton();
        showToast('桌宠已停止');
    }
}

function updateLaunchButton() {
    const btn = document.getElementById('launchBtn');
    if (isRunning) {
        btn.textContent = '停止桌宠';
        btn.classList.remove('start');
        btn.classList.add('stop');
    } else {
        btn.textContent = '启动桌宠';
        btn.classList.remove('stop');
        btn.classList.add('start');
    }
}

// ========== Download Dialog ==========
function initDownloadDialog() {
    const btnDownload = document.getElementById('btnDownload');
    const dialog = document.getElementById('downloadDialog');
    const btnConfirm = document.getElementById('btnConfirmDownload');
    const btnCancel = document.getElementById('btnCancelDownload');

    btnDownload.addEventListener('click', function() {
        dialog.classList.add('show');
        document.getElementById('downloadProgress').style.width = '0%';
        document.getElementById('downloadStatus').textContent = '准备下载...';
    });

    btnCancel.addEventListener('click', function() {
        dialog.classList.remove('show');
    });

    btnConfirm.addEventListener('click', function() {
        if (window.AndroidBridge) {
            window.AndroidBridge.startDownload(config.download_source || 'GHProxy');
            btnConfirm.disabled = true;
            btnConfirm.textContent = '下载中...';
        }
    });
}

// 从 Android 更新下载进度
window.updateDownloadProgress = function(percent, status) {
    document.getElementById('downloadProgress').style.width = percent + '%';
    document.getElementById('downloadStatus').textContent = status;
    if (percent >= 100) {
        document.getElementById('btnConfirmDownload').disabled = false;
        document.getElementById('btnConfirmDownload').textContent = '下载完成';
        setTimeout(function() {
            document.getElementById('downloadDialog').classList.remove('show');
            // 重新加载模型列表
            loadData();
        }, 1500);
    }
};

// ========== Toast ==========
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() {
        toast.classList.remove('show');
    }, 2000);
}

// ========== Config Persistence ==========
function saveConfig() {
    if (window.AndroidBridge) {
        window.AndroidBridge.saveConfig(JSON.stringify(config));
    }
}

// ========== Title Bar ==========
document.getElementById('btnMinimize').addEventListener('click', function() {
    if (window.AndroidBridge) window.AndroidBridge.minimizeWindow();
});

document.getElementById('btnClose').addEventListener('click', function() {
    if (isRunning) {
        stopPet();
    }
    if (window.AndroidBridge) window.AndroidBridge.closeWindow();
});
