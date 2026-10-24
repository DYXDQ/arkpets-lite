# ArkPets Lite

基于 [AutoX.js](https://github.com/kkevsekk1/AutoX) 的 Android 桌宠应用，使用 Spine 动画在桌面上渲染明日方舟风格的模型。

灵感与素材来自 [Ark-Pets](https://github.com/isHarryh/Ark-Pets) 和 [ArkPets-Web](https://github.com/fuyufjh/ArkPets-Web) 项目。

## 功能

- 在桌面显示 Spine 动画桌宠，支持随机动作（待机 / 行走 / 坐下 / 睡眠 / 特殊动作）
- 模型库浏览、搜索、随机选择，支持按角色保存独立的个人配置
- 一键从 Ark-Models 下载模型库（支持国内代理），可中途取消
- 动作开关、AI 活跃度、行走速度、方向切换、缩放、不透明度等行为与显示设置
- 可选「独立触控窗口」：角色正常渲染，额外叠加一个可调的透明窗口负责拖动与点击，避免点在空白处也被判定为点到角色

## 运行要求

- Android 设备（arm64-v8a / armeabi-v7a）
- 悬浮窗权限（首次启动会提示申请）

## 安装

下载 `build/` 目录下构建好的 APK 安装即可，或使用 AutoX.js 导入本工程后自行打包。

## 使用说明

1. 首次启动会加载内置角色「白面鸮」，可在「模型」页切换其它模型
2. 点击「从模型库下载更多」可拉取 [Ark-Models](https://github.com/isHarryh/Ark-Models) 的模型包，下载完成后自动解压到 `res/`
3. 在「行为」「显示」页调整桌宠的动作与外观
4. 点击底部按钮启动 / 停止桌宠

### 独立触控窗口

在「显示 → 独立触控窗口」中开启后：

- 「渲染窗口宽度 / 高度」决定角色绘制范围
- 「触控窗口比例」决定拖动 / 点击判定区域相对渲染窗口的大小
- 「触控窗口水平 / 垂直偏移」微调判定区域相对角色中心的位置

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

打包：在 AutoX.js 中导入工程目录，按 `project.json` 配置生成 APK，产物输出到 `build/`。

## 已知限制

- 触控窗口在小尺寸下可能覆盖角色边缘，需通过比例与偏移微调
- 模型解析依赖 Spine 运行时版本，极少数模型可能无法显示

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
![fuck-me](./res/fuck-me.png)

