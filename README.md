# ArkPets Lite

基于 [AutoX.js](https://github.com/autox-community/AutoX) 的 Android 桌宠应用，使用 Spine 动画在桌面上渲染明日方舟风格的模型。

灵感与素材来自 [Ark-Pets](https://github.com/isHarryh/Ark-Pets) 和 [ArkPets-Web](https://github.com/fuyufjh/ArkPets-Web) 项目。

## 功能

- 在桌面显示 Spine 动画桌宠，支持随机动作（待机 / 行走 / 坐下 / 睡眠 / 特殊动作）
- 模型库浏览、搜索、随机选择，支持按角色保存独立的个人配置
- 一键从 Ark-Models 下载模型库（支持国内代理），可中途取消
- 动作开关、AI 活跃度、行走速度、方向切换、缩放、不透明度等行为与显示设置
- 可选「独立触控窗口」：角色正常渲染，额外叠加一个可调的透明窗口负责拖动与点击，避免点在空白处也被判定为点到角色(由于安卓系统固有限制，使用这种双层渲染模式的时候，渲染出来的人物不可避免的会具有一定透明度；可授予无障碍来使不透明)

## 运行要求

- Android 设备（arm64-v8a）
- 悬浮窗权限（首次启动会提示申请）
- 可选无障碍（用于分层渲染去掉默认的80%透明度）

## 安装

下载release中的安装包，或使用 [AutoX.js](https://github.com/autox-community/AutoX) 导入本工程后自行打包。

## 使用说明

1. 首次启动会加载内置角色「白面鸮」，可在「模型」页切换其它模型
2. 点击「从模型库下载更多」可拉取 [Ark-Models](https://github.com/isHarryh/Ark-Models) 的模型包，下载完成后(打包后为内部目录)自动解压到 `res/`
3. 在「行为」「显示」页调整桌宠的动作与外观
4. 点击底部按钮启动 / 停止桌宠

### 独立触控窗口

在「显示 → 独立触控窗口」中开启后：

- 「渲染窗口宽度 / 高度」决定角色绘制范围
- 「触控窗口置顶」决定两层的上下顺序：
  - 开启（默认）：透明触控层压在渲染层上方，触控区域即所见，行为与旧版本一致
  - 关闭：渲染层在最上层，避免上层透明窗口把角色压淡；渲染层本身不接收触摸，拖动 / 点击仍由下方触控窗口处理
- 「触控窗口比例」决定拖动 / 点击判定区域相对渲染窗口的大小
- 「触控窗口水平 / 垂直偏移」微调判定区域相对角色中心的位置

#### 关于分层模式的轻微透明（Android 12+ 的 0.8 限制）

从 Android 12 开始，系统对「浮在其他应用上、但自己不接收触摸」的悬浮窗有安全限制：这类窗口的遮挡不透明度必须 ≤ 0.8，否则触摸无法穿透到下层应用（AOSP 常量 `MAX_OBSCURING_OPACITY = 0.8`）。桌宠的渲染窗口正属于这种情况，所以分层模式下角色会掉到约 80% 不透明度——**这和两层的上下顺序无关**，把渲染层放上面也一样。

想同时要「完全不透明 + 空白处不挡手」，需要换用可信覆盖层：开启「显示 → 无障碍覆盖层」（使用 `TYPE_ACCESSIBILITY_OVERLAY`，由无障碍服务添加窗口）。开启后窗口保持 alpha = 1.0，`FLAG_NOT_TOUCHABLE` 的穿透依然有效。前提是系统设置里已为 ArkPets Lite 打开无障碍服务；若创建失败会自动回退成普通悬浮窗并提示。

调试时可打开系统「开发者选项 → 显示布局边界」，直观看到触控区域的位置与大小。

## 目录结构

```
├── main.js                      # 入口：加载配置、扫描模型、注入初始数据、桥接命令分发
├── modules/
│   ├── bridge.js                # 注入 WebView 的 JS 桥接层
│   ├── config-manager.js        # 全局配置与按角色保存的个人配置
│   ├── character-manager.js     # 扫描 res/ 下的模型文件
│   ├── model-downloader.js      # 模型库下载与解压
│   ├── pet-window.js            # 桌宠悬浮窗、Spine 渲染与拖动/点击/行走
│   ├── overlay-window.js        # 无障碍覆盖层窗口(TYPE_ACCESSIBILITY_OVERLAY)，绕开 0.8 不透明度限制
│   └── spine-viewer.html        # 独立的 Spine 预览页（开发调试用）
├── ui/
│   └── config.html              # 设置界面
├── libs/
│   └── spine-webgl.js           # Spine WebGL 运行时
├── res/
│   ├── Ptilopsis/               # 内置模型（白面鸮）
│   ├── logo.png
│   └── splashIcon.png
├── clear_profiles.js            # 工具：清理各模型目录下的 profile.json
└── backup_models.sh             # 工具：把下载的模型移出仓库目录
```

## 模型目录

每个模型放在 `res/<角色>/` 或 `res/<角色>/<皮肤>/` 下，需要包含同名的 `.skel`、`.atlas`、`.png` 三个文件。

每个角色的个人配置保存在该角色目录下的 `profile.json` 中，不纳入版本管理。清理方式：

- 运行 `clear_profiles.js`
- 手动删除对应的 `profile.json`

## 开发者说明

- 配置版本号在 `modules/config-manager.js` 的 `CONFIG_VERSION`，提升后会清空并重建全局配置
- WebView 与原生端通过 `jsbridge://<命令>/<id>/<参数>` 自定义 URL 通信，结果通过 `window.auto0.callback` 回传
- 行走位移由原生定时器积分，WebView 只上报状态变化（`ML` / `MR`），减少跨进程调用
- 渲染窗口尺寸固定为角色大小；Spine 运行时的 `3.8.75` 版本校验已在 `libs/spine-webgl.js` 中注释，以兼容部分模型

打包：在 AutoX.js 中导入工程目录（导入功能可能不可用，手动放入脚本文件夹），按 `project.json` 配置生成 APK，产物输出到 `build/`。

## 已知限制

- 触控窗口在小尺寸下可能覆盖角色边缘，需通过比例与偏移微调
- 模型解析依赖 Spine 运行时版本，极少数模型可能无法显示。不建议使用大动态立绘。

## 致谢

- [Ark-Pets](https://github.com/isHarryh/Ark-Pets)
- [ArkPets-Web](https://github.com/fuyufjh/ArkPets-Web)
- [Ark-Models](https://github.com/isHarryh/Ark-Models)
- [AutoX.js](https://github.com/autox-community/AutoX)
- [白饭提供者](3922731272@qq.com)

## 项目地址

https://github.com/DYXDQ/arkpets-lite

B 站：地月系地球
你可以奖励我
[投币](https://b23.tv/mCVXQ6E)

