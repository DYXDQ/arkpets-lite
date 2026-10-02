const storage = storages.create("arkpets_lite_config");
const CONFIG_VERSION = 7;

const DEFAULT_CONFIG = {
    config_version: CONFIG_VERSION,
    character_asset: "Ptilopsis/3",
    character_label: "白面鸮 (yun#4)",

    behavior_allow_walk: true,
    behavior_allow_sit: true,
    behavior_allow_sleep: true,
    behavior_allow_special: true,
    behavior_ai_activation: 4,
    behavior_walk_speed: 30,
    behavior_allow_interact: true,
    behavior_direction_switching: 0,

    display_scale: 1.0,
    initial_position_x: -1,
    initial_position_y: -1,
    opacity: 1.0,

    render_animation_mixture: 0.3,

    network_proxy: "",
    download_source: "GHProxy"
};

function loadConfig() {
    const oldVersion = storage.get("config_version");
    if (oldVersion !== CONFIG_VERSION) {
        storage.clear();
        saveConfig(DEFAULT_CONFIG);
        return Object.assign({}, DEFAULT_CONFIG);
    }
    const keys = Object.keys(DEFAULT_CONFIG);
    const config = {};
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const stored = storage.get(key);
        if (stored !== undefined && stored !== null) {
            config[key] = stored;
        } else {
            config[key] = DEFAULT_CONFIG[key];
        }
    }
    return config;
}

function saveConfig(config) {
    const keys = Object.keys(config);
    for (let i = 0; i < keys.length; i++) {
        storage.put(keys[i], config[keys[i]]);
    }
    // 自动保存为当前角色的个人配置
    if (config.character_asset) {
        saveProfile(config.character_asset, config);
    }
}

function getProfilePath(characterAsset) {
    return files.join(files.cwd(), "res", characterAsset, "profile.json");
}

// 个人配置存为模型文件夹下的 profile.json，便于随模型迁移/清理
function saveProfile(characterAsset, cfg) {
    try {
        var dir = files.join(files.cwd(), "res", characterAsset);
        if (!files.exists(dir)) files.createWithDirs(dir + "/");
        files.write(files.join(dir, "profile.json"), JSON.stringify(cfg));
    } catch(e) {
        log("saveProfile 失败: " + e);
    }
}

function loadProfile(characterAsset) {
    try {
        var path = getProfilePath(characterAsset);
        if (!files.exists(path)) return null;
        return JSON.parse(files.read(path));
    } catch(e) {
        return null;
    }
}

function resetConfig() {
    storage.clear();
    return Object.assign({}, DEFAULT_CONFIG);
}

function getCharacterAssetPath(characterAsset) {
    return files.join(files.cwd(), "res", characterAsset);
}

function getCharacterFiles(characterAsset) {
    const dir = getCharacterAssetPath(characterAsset);
    if (!files.exists(dir)) return null;
    const files_list = files.listDir(dir);
    const s = files_list.find(function(f) { return f.endsWith(".skel"); });
    const a = files_list.find(function(f) { return f.endsWith(".atlas"); });
    const p = files_list.find(function(f) { return f.endsWith(".png"); });
    if (!s || !a || !p) return null;
    return { skel: s, atlas: a, png: p };
}

module.exports = {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    resetConfig: resetConfig,
    getCharacterAssetPath: getCharacterAssetPath,
    getCharacterFiles: getCharacterFiles,
    saveProfile: saveProfile,
    loadProfile: loadProfile,
    DEFAULT_CONFIG: DEFAULT_CONFIG
};
