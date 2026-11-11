// 用 WindowManager 直接添加悬浮窗，可指定窗口类型。
//
// 为什么需要它：
// Android 12+（API 31）起有「不受信任的触摸事件」限制，SAW 应用添加的
// TYPE_APPLICATION_OVERLAY 窗口，只有在遮挡不透明度 <= 0.8（AOSP: MAX_OBSCURING_OPACITY）
// 时触摸才能穿透到下层窗口，否则事件会被直接屏蔽。
// 桌宠的渲染窗口必须不可触摸（FLAG_NOT_TOUCHABLE），于是被这条限制压到 80% 不透明度，
// 表现就是「分层渲染后角色总是带一点透明」。
//
// TYPE_ACCESSIBILITY_OVERLAY(2032) 是可信覆盖层，不受该限制：
// alpha 可以保持 1.0（画面不被压淡），FLAG_NOT_TOUCHABLE 依然能穿透触摸。
// 代价是需要无障碍服务处于开启状态。

var TYPE_ACCESSIBILITY_OVERLAY = 2032;

// 无障碍覆盖层是否可用（需要 auto.service 存在，即无障碍服务已开启）
function canUse() {
    try {
        if (typeof auto === "undefined" || !auto.service) return false;
        return !!auto.service.getSystemService(android.content.Context.WINDOW_SERVICE);
    } catch (e) {
        return false;
    }
}

// 创建一个无障碍覆盖层窗口，view 需已通过 ui.inflate 构建
// 返回的对象与 floaty 窗口保持相同调用面：setPosition / setTouchable / close / view
function create(view, width, height, x, y) {
    if (!canUse()) throw new Error("无障碍服务未开启");

    var LP = android.view.WindowManager.LayoutParams;
    var wm = auto.service.getSystemService(android.content.Context.WINDOW_SERVICE);

    var lp = new LP(
        Math.max(1, Math.round(width)),
        Math.max(1, Math.round(height)),
        TYPE_ACCESSIBILITY_OVERLAY,
        LP.FLAG_NOT_FOCUSABLE | LP.FLAG_LAYOUT_IN_SCREEN | LP.FLAG_LAYOUT_NO_LIMITS,
        android.graphics.PixelFormat.TRANSLUCENT
    );
    lp.gravity = android.view.Gravity.TOP | android.view.Gravity.LEFT;
    lp.x = Math.round(x);
    lp.y = Math.round(y);
    // 关键：保持完全不透明，可信覆盖层不会被系统压到 0.8
    lp.alpha = 1.0;

    wm.addView(view, lp);

    return {
        view: view,
        setPosition: function (px, py) {
            lp.x = Math.round(px);
            lp.y = Math.round(py);
            try { wm.updateViewLayout(view, lp); } catch (e) {}
        },
        setTouchable: function (touchable) {
            if (touchable) lp.flags = lp.flags & ~LP.FLAG_NOT_TOUCHABLE;
            else lp.flags = lp.flags | LP.FLAG_NOT_TOUCHABLE;
            try { wm.updateViewLayout(view, lp); } catch (e) {}
        },
        close: function () {
            try { wm.removeView(view); } catch (e) {}
        }
    };
}

module.exports = {
    canUse: canUse,
    create: create
};
