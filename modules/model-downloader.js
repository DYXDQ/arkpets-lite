/**
 * model-downloader.js - 模型下载管理
 */

var BASE_DIR = files.join(files.cwd(), "res");
var CACHE = context.getCacheDir().getAbsolutePath();
var TEMP_DIR = CACHE + "/dl";

var URLS = {
    github: "https://github.com/isHarryh/Ark-Models/archive/refs/heads/main.zip",
    ghproxy: "https://gh-proxy.com/https://github.com/isHarryh/Ark-Models/archive/refs/heads/main.zip"
};

function downloadModelPack(source, onProgress, onComplete) {
    var zipUrl = URLS[source] || URLS.ghproxy;
    var zipPath = TEMP_DIR + "/models.zip";

    if (files.exists(TEMP_DIR)) { try { files.remove(TEMP_DIR); } catch(e) {} }
    files.createWithDirs(TEMP_DIR + "/");

    onProgress && onProgress(0, "正在连接...");

    threads.start(function() {
        try {
            // Use java URLConnection with proper redirect and timeout settings
            var url = new java.net.URL(zipUrl);
            var conn = url.openConnection();
            conn.setRequestProperty("User-Agent", "ArkPets-Lite/1.0");
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.connect();

            var total = conn.getContentLengthLong();
            log("Download total=" + total);

            var ins = new java.io.BufferedInputStream(conn.getInputStream(), 65536);
            var outs = new java.io.FileOutputStream(new java.io.File(zipPath));
            var buf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 16384);
            var done = 0;
            var n = 0;
            var lastMb = -1;

            while ((n = ins.read(buf)) > 0) {
                outs.write(buf, 0, n);
                done += n;
                var mb = Math.round(done / 1048576);
                if (mb !== lastMb) {
                    lastMb = mb;
                    if (total > 0) {
                        var pct = Math.round(done * 80 / total);
                        onProgress && onProgress(pct, mb + "/" + Math.round(total/1048576) + " MB");
                    } else {
                        onProgress && onProgress(-1, "已下载 " + mb + " MB");
                    }
                }
            }
            ins.close();
            outs.close();

            log("Download finished, size=" + done);
            onProgress && onProgress(85, "下载完成，正在解压...");

            var result = extractModels(zipPath);
            files.remove(zipPath);

            if (result.success) {
                onProgress && onProgress(100, "导入完成: " + result.message);
            } else {
                onProgress && onProgress(100, "解压失败");
            }
            onComplete && onComplete(result.success, result.message);
        } catch (e) {
            log("Download error: " + e);
            onComplete && onComplete(false, "出错: " + e);
        }
    });
}

function extractModels(zipPath) {
    try {
        var zip = new java.util.zip.ZipFile(new java.io.File(zipPath));
        var entries = zip.entries();
        var targetDir = new java.io.File(BASE_DIR);
        var count = 0;

        while (entries.hasMoreElements()) {
            var entry = entries.nextElement();
            var entryName = entry.getName();
            if (entry.isDirectory()) continue;
            if (!entryName.match(/\.(skel|atlas|png|json)$/i)) continue;

            var relative = entryName.replace(/^[^/]+\//, "");
            relative = relative.replace(/^(models|models_enemies|models_illust)\//, "");

            if (!relative) continue;
            if (relative.indexOf("/") < 0 && relative !== "models_data.json") continue;

            var outFile = new java.io.File(targetDir, relative);
            outFile.getParentFile().mkdirs();

            var ins = zip.getInputStream(entry);
            var outs = new java.io.FileOutputStream(outFile);
            var buf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 8192);
            var n = 0;
            while ((n = ins.read(buf)) > 0) outs.write(buf, 0, n);
            ins.close();
            outs.close();
            count++;
        }
        zip.close();
        return { success: true, message: "成功导入 " + count + " 个模型文件" };
    } catch (e) {
        return { success: false, message: "解压失败: " + e };
    }
}

module.exports = {
    downloadModelPack: downloadModelPack
};
