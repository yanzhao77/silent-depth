# 潜艇库展厅关卡（Submarine_Library）

## 这是什么

`/Game/Maps/Submarine_Library` 是一个**生成式关卡**：把潜艇库里的全部平台一次铺开在
同一个场景里，供人一眼看完 48 艘，不需要进游戏、也不需要选艇界面。

关卡内容全部由 `tools/ue4/build_submarine_showcase.py` 生成，**不是手工场景**，每次
运行都会先清空关卡再重建，避免它悄悄和资产库脱节：

- 每艘艇 = 1 个艇体 + 5 个可动部件（`propulsor` / `rudder` / `sternPlanes` /
  `bowPlanes` / `periscope`），部件按 `platform_assets.json` 的 `partOffsetsCm` 摆放；
- 平台清单直接读 `Config/SilentDepth/platform_assets.json`（Pawn 解析艇体用的同一张表），
  所以关卡里不会出现游戏加载不出来的船；
- 格距与龙骨高度由**网格实际包围盒**算出：列距 ≥ 最长艇全长 + 4 m，行距 ≥ 最大艇宽 +
  0.9 m，龙骨贴地而不是沉进地板；
- 场景另有地板、可移动主光/补光、天光、曝光体积和每艘一块文字标签。

当前布局：4 列 × 12 行（48 = 4 × 12），单元 220.4 m × 38 m，整块约 771 m × 456 m。

## 打开项目就能看到

`Config/DefaultEngine.ini` 的 `EditorStartupMap` 指向本关卡，所以打开工程直接落到展厅。
**游戏本体的入口不变**：`GameDefaultMap` 仍是 `/Game/Maps/Ocean_Main`，PIE 与打包启动
不受影响。

打开后如果想把整块收进一屏：在 World Outliner 里全选（Ctrl+A）后按 `F`，视口会框住全部
48 艘；也可以直接按 `G` 关闭网格、或用无光照视图检查轮廓。

## 如何重建

必须在**完整编辑器**里跑，不能用 `-run=pythonscript` 的 commandlet：commandlet 路径下
`spawn_actor_from_class` 会直接把 UnrealEd 打崩。

```powershell
& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  "-ExecutePythonScript=C:\workspace\ue4\silent-depth\tools\ue4\build_submarine_showcase.py" `
  "-ExecCmds=Quit" -unattended -nopause -nosplash -stdout
```

成功时日志里会有：

```
LogPython: [showcase] cell 22040 x 3800 cm for 48 boat(s)
LogPython: [showcase] SHOWCASE_DONE hulls=48 parts=230 level=/Game/Maps/Submarine_Library
```

`hulls=48` 对不上资产表条目数时脚本返回非 0，门禁会直接失败，不会留下半成品关卡。

## 已知边界与未验证项

- 本关卡是**离线、静态**的陈列：不接快照、不参与仿真，也不改任何玩法绑定。
- 关卡文件是生成物，不要手工编辑后提交；要改布局请改脚本再重建。
- 结构性结论（48 个艇体 + 230 个部件、格距、龙骨贴地、标签数量）已在编辑器里校验；
  整体观感、材质与光照效果**尚未逐艇目视确认**（NOT VERIFIED）。
- 自动截图链路在本机不可靠：启动期调用 `AutomationLibrary.take_high_res_screenshot` 会让
  编辑器崩溃，`SceneCapture2D` 在重建后的首个会话里偶发返回全黑图。脚本因此刻意不做
  截图；需要留档时请人工截图。
