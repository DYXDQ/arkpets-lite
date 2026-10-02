// 清除每个模型文件夹下的个人配置文件 profile.json
// 用法：在 AutoX.js 中直接运行本脚本
//
// 搜索范围：脚本同级 res/ 目录，递归查找名为 profile.json 的文件
// 仅删除 profile.json（个人配置），不会影响 .skel/.atlas/.png 等模型文件

var BASE_DIR = files.cwd() + "/res";
var TARGET = "profile.json";

function collect(dir, results) {
    if (!files.exists(dir)) return;
    var items = files.listDir(dir);
    for (var i = 0; i < items.length; i++) {
        var p = files.join(dir, items[i]);
        if (files.isDir(p)) {
            collect(p, results);
        } else if (items[i] === TARGET) {
            results.push(p);
        }
    }
}

var found = [];
collect(BASE_DIR, found);

if (found.length === 0) {
    toast("未找到任何配置文件 (" + TARGET + ")");
    log("未找到任何配置文件");
} else {
    var confirmed = dialogs.confirm("清除配置文件",
        "找到 " + found.length + " 个 " + TARGET + "，确定删除吗？\n\n" +
        "删除后所有桌宠的个人配置将恢复默认。");
    if (confirmed) {
        var removed = 0;
        for (var i = 0; i < found.length; i++) {
            try {
                files.remove(found[i]);
                removed++;
                log("已删除: " + found[i]);
            } catch (e) {
                log("删除失败: " + found[i] + " -> " + e);
            }
        }
        toast("已清除 " + removed + " 个配置文件");
        log("已清除 " + removed + " / " + found.length + " 个配置文件");
    } else {
        toast("已取消");
    }
}
