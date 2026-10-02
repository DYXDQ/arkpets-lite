var BASE_DIR = files.join(files.cwd(), "res");

function scanCharacters() {
    if (!files.exists(BASE_DIR)) return [];

    // 读取 models_data.json 构建完整模型索引
    var modelIndex = {}; // key -> {name, skinGroupName, appellation, type, style}
    var dataPath = files.join(BASE_DIR, "models_data.json");
    if (files.exists(dataPath)) {
        try {
            var raw = JSON.parse(files.read(dataPath));
            var data = raw.data || raw;
            for (var key in data) {
                var m = data[key];
                if (m) {
                    modelIndex[key] = {
                        name: m.name || key,
                        skinGroupName: m.skinGroupName || "默认服装",
                        appellation: m.appellation || "",
                        type: m.type || "",
                        style: m.style || ""
                    };
                }
            }
        } catch(e) { log("models_data.json parse error: " + e); }
    }

    // 内置角色皮肤名映射
    var BUILTIN_SKIN_NAMES = {
        "1": "原装",
        "2": "epoque#3",
        "3": "yun#4"
    };

    // 扫描所有目录
    var dirs = files.listDir(BASE_DIR);
    var charMap = {}; // name -> {id, name, appellation, type, skins:[]}

    for (var i = 0; i < dirs.length; i++) {
        var dirName = dirs[i];
        var dirPath = files.join(BASE_DIR, dirName);
        if (!files.isDir(dirPath)) continue;
        if (dirName === "picture" || dirName.indexOf(".") === 0) continue;

        // 检查目录下是否有模型文件
        var items = files.listDir(dirPath);
        var hadSkel = false;

        // 先检查子目录（内置模型风格）
        for (var j = 0; j < items.length; j++) {
            var sub = items[j];
            var subPath = files.join(dirPath, sub);
            if (!files.isDir(subPath)) continue;

            var subFiles = files.listDir(subPath);
            var s = findFirst(subFiles, function(f) { return f.endsWith(".skel"); });
            var a = findFirst(subFiles, function(f) { return f.endsWith(".atlas"); });
            var p = findFirst(subFiles, function(f) { return f.endsWith(".png"); });
            if (!s || !a || !p) continue;
            hadSkel = true;

            var mi = modelIndex[dirName];
            var charName = mi ? mi.name : dirName;
            var skinName = BUILTIN_SKIN_NAMES[sub] || sub;

            if (!charMap[charName]) charMap[charName] = { id: dirName, name: charName, appellation: mi ? mi.appellation : "", type: mi ? mi.type : "", skins: [] };
            charMap[charName].skins.push({ id: sub, name: skinName, path: dirName + "/" + sub, skel: s, atlas: a, png: p });
        }

        // 如果没有子目录，检查根目录（下载的模型风格）
        if (!hadSkel) {
            var skel = findFirst(items, function(f) { return f.endsWith(".skel"); });
            var atlas = findFirst(items, function(f) { return f.endsWith(".atlas"); });
            var png = findFirst(items, function(f) { return f.endsWith(".png"); });
            if (!skel || !atlas || !png) continue;

            var mi = modelIndex[dirName];
            var charName = mi ? mi.name : dirName;
            var skinName = mi ? mi.skinGroupName : "默认";

            if (!charMap[charName]) charMap[charName] = { id: dirName, name: charName, appellation: mi ? mi.appellation : "", type: mi ? mi.type : "", skins: [] };
            charMap[charName].skins.push({ id: dirName, name: skinName, path: dirName, skel: skel, atlas: atlas, png: png });
        }
    }

    // 转为数组
    var result = [];
    for (var cn in charMap) result.push(charMap[cn]);
    return result;
}

function findFirst(arr, predicate) {
    for (var i = 0; i < arr.length; i++) {
        if (predicate(arr[i])) return arr[i];
    }
    return null;
}

function getSkinFileInfo(skinPath) {
    var fullPath = files.join(BASE_DIR, skinPath);
    if (!files.exists(fullPath)) return null;
    var files_list = files.listDir(fullPath);
    var s = findFirst(files_list, function(f) { return f.endsWith(".skel"); });
    var a = findFirst(files_list, function(f) { return f.endsWith(".atlas"); });
    var p = findFirst(files_list, function(f) { return f.endsWith(".png"); });
    if (!s || !a || !p) return null;
    return { skel: s, atlas: a, png: p, skelPath: files.join(fullPath, s), atlasPath: files.join(fullPath, a), pngPath: files.join(fullPath, p) };
}

module.exports = {
    scanCharacters: scanCharacters,
    getSkinFileInfo: getSkinFileInfo,
    BASE_DIR: BASE_DIR
};
