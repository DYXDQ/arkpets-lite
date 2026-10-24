/**
 * model-downloader.js - 模型下载管理
 */

function baseDir() { return files.join(files.cwd(), "res"); }
function tempDir() { return context.getCacheDir().getAbsolutePath() + "/dl"; }

var URLS = {
    github: "https://github.com/isHarryh/Ark-Models/archive/refs/heads/main.zip",
    ghproxy: "https://v4.gh-proxy.org/https://github.com/isHarryh/Ark-Models/archive/refs/heads/main.zip"
};

var currentTask = null; // {cancelled, conn, thread}

function isDownloading() {
    return currentTask !== null && !currentTask.cancelled;
}

function cancelDownload() {
    var task = currentTask;
    if (!task) return false;
    task.cancelled = true;
    currentTask = null;
    try { if (task.conn) task.conn.disconnect(); } catch(e) {}
    try { files.remove(tempDir() + "/models.zip"); } catch(e) {}
    return true;
}

function downloadModelPack(source, onProgress, onComplete) {
    if (isDownloading()) { onComplete && onComplete(false, "已有下载任务进行中"); return false; }

    var zipUrl = URLS[source] || URLS.ghproxy;
    var TEMP_DIR = tempDir();
    var zipPath = TEMP_DIR + "/models.zip";
    var task = { cancelled: false, conn: null, thread: null };
    currentTask = task;

    if (files.exists(TEMP_DIR)) { try { files.remove(TEMP_DIR); } catch(e) {} }
    files.createWithDirs(TEMP_DIR + "/");

    onProgress && onProgress(0, "正在连接...");

    task.thread = threads.start(function() {
        var conn = null, ins = null, outs = null;
        try {
            // Use java URLConnection with proper redirect and timeout settings
            var url = new java.net.URL(zipUrl);
            conn = url.openConnection();
            task.conn = conn;
            conn.setRequestProperty("User-Agent", "ArkPets-Lite/1.0");
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.connect();
            if (task.cancelled) return;

            var total = conn.getContentLengthLong();
            log("Download total=" + total);

            ins = new java.io.BufferedInputStream(conn.getInputStream(), 65536);
            outs = new java.io.FileOutputStream(new java.io.File(zipPath));
            var buf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 16384);
            var done = 0;
            var n = 0;
            var lastMb = -1;

            while ((n = ins.read(buf)) > 0) {
                if (task.cancelled) break;
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
            ins = null;
            outs = null;

            if (task.cancelled) { files.remove(zipPath); return; }

            log("Download finished, size=" + done);
            onProgress && onProgress(85, "下载完成，正在解压...");

            var result = extractModels(zipPath, function() { return task.cancelled; });
            files.remove(zipPath);
            if (task.cancelled) {
                if (result.cancelled) log(result.message);
                return;
            }
            currentTask = null;

            if (result.success) {
                onProgress && onProgress(100, "导入完成: " + result.message);
            } else {
                onProgress && onProgress(100, "解压失败");
            }
            onComplete && onComplete(result.success, result.message);
        } catch (e) {
            if (task.cancelled) return;
            currentTask = null;
            log("Download error: " + e);
            onComplete && onComplete(false, "出错: " + e);
        } finally {
            try { if (ins) ins.close(); } catch(e2) {}
            try { if (outs) outs.close(); } catch(e2) {}
            if (task.cancelled) {
                try { files.remove(zipPath); } catch(e2) {}
                if (currentTask === task) currentTask = null;
            }
        }
    });
    return true;
}

function extractModels(zipPath, shouldCancel) {
    try {
        var zip = new java.util.zip.ZipFile(new java.io.File(zipPath));
        var entries = zip.entries();
        var targetDir = new java.io.File(baseDir());
        var count = 0;

        while (entries.hasMoreElements()) {
            if (shouldCancel && shouldCancel()) {
                zip.close();
                return { success: false, cancelled: true, message: "已取消导入 " + count + " 个模型文件" };
            }
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
    downloadModelPack: downloadModelPack,
    cancelDownload: cancelDownload,
    isDownloading: isDownloading
};
