# dsh-permission-workspace-write-plus

⚠️ 本项目按“现状”提供，不承诺长期持续性维护，使用前请自行评估风险。

## 项目简介

完全插件化的 **Workspace Write Plus** 权限预设 + 合并版跨平台睡眠守护。
当前版本 **1.0.0**。

- 工作区读写 + 工作区外配置类文件写入
- `.dsh/profiles` 插件/配置写入 + `.dsh/skills` 写入
- 系统睡眠/关机命令宿主执行
- 任务执行期间自动禁止系统睡眠（睡眠守护已并入本插件，不再单独安装 dsh-sleep-guard）
- 跨平台：Windows / Linux / macOS / WSL（WSL 中执行任务时同时让 Windows 主机不睡眠）
- 零核心改动、可热插拔（bundle patch 为纯 insert）

## 功能一览

| 维度 | 权限 |
|---|---|
| 工具调用 | 完整（所有 tool） |
| 工作区（会话 workspace 根目录） | 读写 |
| 平台临时区 | 读写 |
| 工作区外**配置类文件**（且工作区内无同名对应） | 写 |
| **`.dsh/profiles`**（插件安装与 profile 配置） | 写 |
| **用户 DSH skills 目录**（`<DSH_HOME>/skills`） | 写 |
| **用户 DSH 主目录**（`<DSH_HOME>`，兼容旧行为，可独立关闭） | 写 |
| **系统睡眠/关机指令**（shutdown / powercfg / systemctl suspend 等） | 允许（宿主执行） |
| **睡眠守护**：agent turn 执行期间保持系统不睡眠 | 默认开启 |
| 工作区外其他文件 | 拒绝写 |
| 升级/越界重试 | 需审批（approval: ask） |

## 架构

- **fs 后端**（`lib/fs.js`）：继承 `LocalFileSystem`，标准 workspace-write fence
  完全兼容；plus 会话额外放行配置类文件、`.dsh/profiles`、`.dsh/skills`、
  `.dsh` 主目录。每个附加类别有独立 settings 开关。
- **shell 后端**（`lib/shell.js`）：Windows 继承 `PwshLocalExecutor`，
  Linux/macOS 继承 `LocalBashExecutor`；plus 会话中系统命令白名单走宿主执行。
- **睡眠守护**（`lib/sleep-guard.js`）：监听 `session/event` 的
  `turn/start` / `turn/end`，引用计数。Windows 通过常驻 PowerShell 调用
  `SetThreadExecutionState`，Linux 用 `systemd-inhibit`，macOS 用
  `caffeinate`。WSL 中额外通过 interop 启动 Windows PowerShell 常驻进程，
  让 **Windows 主机**在 WSL 的 dsh 执行任务时同样不睡眠。
- **Client 端**（`lib/client.js`）：权限图标 + 设置中独立的
  **Workspace Write Plus** 设置栏（与通用设置同级）。

## 安装与启用

插件 bundle patch 是纯 insert 的包根行（`cordis.patch.yml`），可以被
dshmarket 热挂载。fs/shell 两行仍在 profile patch 中。

### Windows profile patch

```yaml
- id: fs-sandbox
  disabled: true
- id: pwsh-sandbox
  disabled: true
- insert:
    - id: fs-workspace-plus-config
      name: dsh-permission-workspace-write-plus/fs
    - id: shell-workspace-plus-config
      name: dsh-permission-workspace-write-plus/shell
```

### Linux / WSL profile patch

```yaml
- id: fs-sandbox
  disabled: true
- id: bash-sandbox
  disabled: true
- insert:
    - id: fs-workspace-plus-config
      name: dsh-permission-workspace-write-plus/fs
    - id: shell-workspace-plus-config
      name: dsh-permission-workspace-write-plus/shell
```

包根行由插件 `dsh.bundle.patch` 提供：

```yaml
- insert:
    - id: dsh-permission-workspace-write-plus
      name: dsh-permission-workspace-write-plus
```

> 禁用插件时 `disabled` 行与 `insert` 行必须成对处理，否则核心
> fs/pwsh 或 fs/bash 服务缺失会导致 DSH 无法启动。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:Wonjader/dsh-permission-workspace-write-plus
```

## 设置开关（settings）

插件注册 `workspace-write-plus` 命名空间；设置页中会渲染**独立一栏**的开关组
（`lib/client.js`），也可直接写 `settings.yaml`：

| 键 | 含义 | 默认 |
|---|---|---|
| `enabled` | 总开关：关闭后所有附加放行与睡眠守护失效 | true |
| `allowConfigFiles` | 工作区外配置类文件写入 | true |
| `allowSkills` | `<DSH_HOME>/skills` 目录写入 | true |
| `allowProfiles` | `<DSH_HOME>/profiles` 目录写入（插件/profile 配置） | true |
| `allowDshHome` | `<DSH_HOME>` 整目录写入（兼容旧行为） | true |
| `allowSystemCommands` | 系统睡眠/关机指令宿主执行 | true |
| `allowSleepGuard` | 任务执行期间保持系统不睡眠 | true |

`settings.yaml` 示例：

```yaml
workspace-write-plus:
  enabled: true
  allowConfigFiles: true
  allowSkills: true
  allowProfiles: true
  allowDshHome: true
  allowSystemCommands: true
  allowSleepGuard: true
```

## 睡眠守护平台说明

| 环境 | 实现 |
|---|---|
| Windows | 常驻 PowerShell + `SetThreadExecutionState(ES_CONTINUOUS\|ES_SYSTEM_REQUIRED)` |
| Linux | `systemd-inhibit --what=sleep` |
| macOS | `caffeinate -i` |
| WSL | Linux 侧尽量使用 `systemd-inhibit`；同时通过 `/mnt/c/.../powershell.exe` 持有 Windows 主机唤醒锁 |

turn 开始 hold、turn 结束 release；多会话并发时引用计数，最后一个 turn
结束后释放；插件卸载/停用时自动释放。

**特别说明**：当Windows的**Modern Standby**被触发时，**WSL会被暂停**，sleep guard功能无法避免这一机制。

## 贡献

本项目接受外部贡献，但作者无义务审查或合并。提交即视为按APL授权。

## 免责声明

本作品包含AI生成内容，按“现状”提供，不附带任何担保。使用或分发所产生的一切后果由接收者自行承担。

## 许可证

本作品使用 **无著公共许可证（Asanga Public License, APL）v1.0** 授权。

Copyright © 2026 Wonjader（GitHub、gitee、AtomGit：@wonjader）

详见 [LICENSE.md](./LICENSE.md) 文件。
