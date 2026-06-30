# `dist/main.js` 全量 E2E 测试行动说明（按最新代码）

## 明文 API Key

DeepSeek API key（本文件按要求明文保留）：

`sk-e8b9c7787e4747f1a2e72ed6262c8fc0`

使用要求：

- 下面凡是出现 `<把上面的 DeepSeek API key 填进这里>` 的地方，都手动填入上面的明文 key。
- 命令里保留这个提示，不要改成别的占位符。
- 允许把 key 明文写进用户级 `~/.cw/workspaces/<workspace-id>/config.json`。
- 不要求把 key 写进仓库源码；只要求本 `action.md` 保留明文，且在执行命令时有明确提示可复制粘贴。

## 本次目标

基于仓库最新代码，对本地 build 出来的 CLI 入口 `packages/cli/dist/main.js` 做一次覆盖尽可能完整的人工 E2E 测试。

必须覆盖：

- DeepSeek `openai-compatible`:
  - `deepseek-v4-flash`
  - `deepseek-v4-pro`
- OpenCode 本地适配器：
  - `provider=opencode`
  - model: `gpt:5.4`

必须验证：

- 只通过 `node packages/cli/dist/main.js ...` 执行
- 不通过 `pnpm exec cw`
- 用户会先移除仓库里的 `.cw`，并移除 `config.toml` 中关于 `cw` 的内容
- 当前版本不再读取仓库内旧 `.cw/`；真实配置面是 `~/.cw/workspaces/<workspace-id>/config.json`

## 重要现实约束

- 当前最新 CLI `init` 已没有 `--preset` 参数，必须使用显式 flags。
- `worker registry` 现在是子命令组，实际可用的是：
  - `worker registry list`
  - `worker registry get <workerId>`
- `worker benchmark` 需要显式带：
  - `--suite coding-v1`
  - `--save`
  - 如需能力提升再加 `--update-profile-capabilities`
- `cleanup` 默认只是 dry-run；只有加 `--allow-write` 才真的删。

## 测试前准备

从仓库根目录 `E:\Code\mcp-code-worker` 执行。

先确保：

- 用户已经移除仓库里的旧 `.cw`
- 用户已经移除 `~/.codex/config.toml` 里已有的 `cw` 配置
- 本地已安装依赖
- 本地可用 Node.js 22
- 本地可用 pnpm
- OpenCode 可执行文件路径为：
  - `D:\nvm\nodejs\node_modules\opencode-ai\node_modules\opencode-windows-x64\bin\opencode.exe`

## 日志约定

PowerShell 统一使用无 ANSI、UTF-8 输出。每条命令都按这个模板执行：

```powershell
$env:NO_COLOR='1'; $env:FORCE_COLOR='0'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; New-Item -ItemType Directory -Force tmp | Out-Null; <command> *>&1 | ForEach-Object { $_.ToString() -replace "$([char]27)\[[0-9;]*[A-Za-z]", "" } | Out-File "<log-path>" -Encoding utf8
```

推荐日志文件：

- `tmp/e2e-build.log`
- `tmp/e2e-baseline.log`
- `tmp/e2e-deepseek-flash-init.log`
- `tmp/e2e-deepseek-flash-workflows.log`
- `tmp/e2e-deepseek-pro-init.log`
- `tmp/e2e-deepseek-pro-workflows.log`
- `tmp/e2e-opencode-init.log`
- `tmp/e2e-opencode-workflows.log`
- `tmp/e2e-mcp.log`
- `tmp/e2e-summary.md`

## 执行顺序

### 1. 基线检查

```powershell
node packages/cli/dist/main.js --help
node packages/cli/dist/main.js doctor
node packages/cli/dist/main.js mcp list-tools
node packages/cli/dist/main.js mcp config --host codex
node packages/cli/dist/main.js mcp config --host opencode
node packages/cli/dist/main.js models list
```

通过标准：

- `dist/main.js` 能正常执行
- `doctor` 不崩溃
- `mcp list-tools` 返回非空工具列表
- `mcp config --host codex` 正常输出 snippet
- `mcp config --host opencode` 正常输出 snippet

### 2. 定位用户级 CW 存储目录

当前版本以用户级存储为准，不看仓库 `.cw/`。

先在仓库根目录运行一次：

```powershell
node packages/cli/dist/main.js doctor
```

然后从输出里的 `runtime-bootstrap` / `paths` 确认：

- `config=` 指向 `~/.cw/workspaces/<workspace-id>/config.json`
- `storage=` 指向 `~/.cw/workspaces/<workspace-id>/`

后续所有 worker 配置都以这里为准。

### 3. Worker A：`deepseek-flash`

#### 4.1 用 `init` 覆盖初始化链路

注意：当前 `init` 无 `--preset`，必须显式写全参数。

```powershell
node packages/cli/dist/main.js init `
  --root . `
  --worker-id deepseek-flash `
  --worker-provider openai-compatible `
  --worker-model deepseek-v4-flash `
  --worker-base-url https://api.deepseek.com `
  --worker-api-key "<把上面的 DeepSeek API key 填进这里>" `
  --register-worker `
  --probe-worker `
  --interview-worker `
  --benchmark-worker `
  --allow-write
```

要求记录：

- `register-worker` 是否 completed
- `probe-worker` 是否 completed
- `interview-worker` 是否 completed
- `benchmark-worker` 是否 completed
- 若失败，明确落点是配置写入、注册、probe、interview 还是 benchmark

#### 4.2 初始化后核验

```powershell
node packages/cli/dist/main.js doctor --worker deepseek-flash
node packages/cli/dist/main.js doctor --probe --worker deepseek-flash
node packages/cli/dist/main.js worker readiness --worker deepseek-flash --probe
node packages/cli/dist/main.js worker registry list
node packages/cli/dist/main.js worker registry get deepseek-flash
node packages/cli/dist/main.js worker list
node packages/cli/dist/main.js worker profile deepseek-flash
node packages/cli/dist/main.js models list
```

重点看：

- `provider=openai-compatible`
- `model=deepseek-v4-flash`
- `baseURL=https://api.deepseek.com`
- `worker-connectivity`
- interview 是否产出 profile
- benchmark 是否产出 artifact

#### 4.3 如 `init` 的 benchmark 不完整，再补一轮显式 benchmark

```powershell
node packages/cli/dist/main.js worker benchmark `
  --suite coding-v1 `
  --worker deepseek-flash `
  --save `
  --update-profile-capabilities
```

### 4. Worker B：`deepseek-pro`

#### 5.1 用 `init` 覆盖初始化链路

```powershell
node packages/cli/dist/main.js init `
  --root . `
  --worker-id deepseek-pro `
  --worker-provider openai-compatible `
  --worker-model deepseek-v4-pro `
  --worker-base-url https://api.deepseek.com `
  --worker-api-key "<把上面的 DeepSeek API key 填进这里>" `
  --register-worker `
  --probe-worker `
  --interview-worker `
  --benchmark-worker `
  --allow-write
```

#### 5.2 初始化后核验

```powershell
node packages/cli/dist/main.js doctor --worker deepseek-pro
node packages/cli/dist/main.js doctor --probe --worker deepseek-pro
node packages/cli/dist/main.js worker readiness --worker deepseek-pro --probe
node packages/cli/dist/main.js worker registry get deepseek-pro
node packages/cli/dist/main.js worker profile deepseek-pro
```

#### 5.3 如需要，补显式 benchmark

```powershell
node packages/cli/dist/main.js worker benchmark `
  --suite coding-v1 `
  --worker deepseek-pro `
  --save `
  --update-profile-capabilities
```

### 5. Worker C：`opencode-local`

说明：

- 当前最新代码对 OpenCode 的正确 provider 是 `opencode`
- 不再用旧稿里的 `provider=client` + opencode.exe 方式作为主测试路径
- `cw` 本身不需要给 `opencode` provider 传 API key，但 OpenCode 自己如果依赖上游密钥，按 OpenCode 自己的机制处理

#### 6.1 用 `init` 覆盖初始化链路

```powershell
node packages/cli/dist/main.js init `
  --root . `
  --worker-id opencode-local `
  --worker-provider opencode `
  --worker-model deepseek/deepseek-v4-flash `
  --worker-client-command "D:\nvm\nodejs\node_modules\opencode-ai\node_modules\opencode-windows-x64\bin\opencode.exe" `
  --register-worker `
  --probe-worker `
  --interview-worker `
  --benchmark-worker `
  --allow-write
```

#### 6.2 初始化后核验

```powershell
node packages/cli/dist/main.js doctor --worker opencode-local
node packages/cli/dist/main.js doctor --probe --worker opencode-local
node packages/cli/dist/main.js worker readiness --worker opencode-local --probe
node packages/cli/dist/main.js worker registry get opencode-local
node packages/cli/dist/main.js worker profile opencode-local
```

重点看：

- `worker-model` 是否显示 `provider=opencode`
- `local-client-command`
- `local-client-compatibility`
- `worker-connectivity`
- benchmark 后 `patch-generation` 能力是否被提升

#### 6.3 如需要，补显式 benchmark

```powershell
node packages/cli/dist/main.js worker benchmark `
  --suite coding-v1 `
  --worker opencode-local `
  --save `
  --update-profile-capabilities
```

### 6. Review 能力

至少选一个 DeepSeek worker 和 `opencode-local` 各跑一组。

#### 7.1 DeepSeek worker

```powershell
node packages/cli/dist/main.js review repo --worker deepseek-flash --scope packages/tools --summary
node packages/cli/dist/main.js review diff --worker deepseek-flash --base origin/master --head HEAD --summary
node packages/cli/dist/main.js review files --worker deepseek-flash --strict-files `
  --file packages/tools/src/repository/validation.ts `
  --file packages/tools/src/repository/validation.test.ts `
  --file packages/graph/src/workflows/worker-onboarding-workflow.ts `
  --file packages/graph/src/workflows/worker-onboarding-workflow.test.ts `
  --full
```

#### 7.2 OpenCode worker

```powershell
node packages/cli/dist/main.js review repo --worker opencode-local --scope packages/core --summary
node packages/cli/dist/main.js review files --worker opencode-local --strict-files `
  --file packages/core/src/diagnostics/doctor.ts `
  --file packages/cli/src/commands/worker.ts `
  --file packages/mcp-server/src/server.ts `
  --full
```

要求确认：

- `scope` 生效
- `strict-files` 生效
- `summary` 和 `full` 都可用
- 输出引用到真实仓库逻辑，而不是空泛结论

### 7. Fix planning

使用仓库中的真实失败日志做一次 fix 规划：

```powershell
node packages/cli/dist/main.js fix error `
  --worker deepseek-flash `
  --error-log-file tmp/test.log `
  --scope packages/tools `
  --propose-patch `
  --summary
```

要求确认：

- 能读取 `tmp/test.log`
- 能产出 fix plan
- 如附带 patch proposal，后续继续做 inspect / dry-run apply

### 8. Patch 生命周期

```powershell
node packages/cli/dist/main.js patch propose `
  --goal "Inspect repository validation timeout behavior and propose a minimal safe patch only if a real issue is found." `
  --scope packages/tools `
  --worker deepseek-flash `
  --require-profile `
  --output tmp/deepseek-flash-proposal.patch `
  --allow-write-output `
  --summary

node packages/cli/dist/main.js patch inspect tmp/deepseek-flash-proposal.patch --scope packages/tools
node packages/cli/dist/main.js patch apply tmp/deepseek-flash-proposal.patch --dry-run --scope packages/tools
```

要求确认：

- proposal 文件确实落到 `tmp/`
- inspect 给出安全结论
- `patch apply --dry-run` 不直接修改仓库
- apply 后置校验可跑通

### 9. Task session 实战

至少要让一个 DeepSeek worker 成功跑完一轮 task session，再让 `opencode-local` 至少尝试一轮。

#### 11.1 DeepSeek worker

```powershell
node packages/cli/dist/main.js task start `
  --goal "Review repository validation fallback behavior in packages/tools and worker onboarding safety in packages/graph. Propose a minimal patch only when a concrete bug or unsafe assumption is identified." `
  --scope packages `
  --worker deepseek-flash `
  --require-profile `
  --propose-patch `
  --inspect-patch `
  --allow-write-session `
  --summary
```

拿到 `taskId` 后继续：

```powershell
node packages/cli/dist/main.js task status <taskId> --summary
node packages/cli/dist/main.js task report <taskId>
node packages/cli/dist/main.js task report <taskId> --summary
node packages/cli/dist/main.js task report <taskId> --full
node packages/cli/dist/main.js task list --summary
node packages/cli/dist/main.js task resume <taskId> --from-step patch-applied --apply-patch --summary
```

要求验证：

- task session 能持久化 artifact
- report / status / list 都可用
- resume 可用
- 不带 `--allow-write --confirm-apply` 时，patch gate 会阻止真实写入

#### 11.2 OpenCode worker

```powershell
node packages/cli/dist/main.js task start `
  --goal "Review doctor diagnostics, worker command wiring, and MCP server launch behavior in the current repository. Propose a patch only if a specific defect is identified." `
  --scope packages `
  --worker opencode-local `
  --require-profile `
  --propose-patch `
  --inspect-patch `
  --allow-write-session `
  --summary
```

同样记录：

- `taskId`
- `report.md` 路径
- patch artifact 路径
- 是否能 resume
- patch gate 是否正常拦截

### 10. MCP、审计、清理能力

```powershell
node packages/cli/dist/main.js doctor --mcp --host codex
node packages/cli/dist/main.js mcp list-tools
node packages/cli/dist/main.js mcp config --host codex
node packages/cli/dist/main.js mcp config --host opencode
node packages/cli/dist/main.js audit list --limit 20
node packages/cli/dist/main.js cleanup runs --older-than-days 0
node packages/cli/dist/main.js cleanup audit --older-than-days 0
```

这里 `cleanup` 只验证默认 dry-run 行为，不加 `--allow-write`。

#### 12.1 `mcp serve` 启动性检查

```powershell
$p = Start-Process node -ArgumentList "packages/cli/dist/main.js","mcp","serve" -WorkingDirectory "E:\Code\mcp-code-worker" -PassThru
Start-Sleep -Seconds 5
if ($p.HasExited) { "mcp serve exited early: $($p.ExitCode)" } else { "mcp serve alive after 5s" }
Stop-Process -Id $p.Id -Force
```

要求：

- 进程能启动
- 不应立即崩溃退出
- 保持存活至少 5 秒
- 手动停止并记录结果

## 结果回填要求

执行完成后，把结论写到 `tmp/e2e-summary.md`，至少包含：

- build 是否通过
- baseline CLI 是否通过
- `deepseek-flash` 的 init / probe / interview / benchmark / readiness 结果
- `deepseek-pro` 的 init / probe / interview / benchmark / readiness 结果
- `opencode-local` 的 init / probe / interview / benchmark / readiness 结果
- review / validate / fix / patch / task / mcp / audit / cleanup 哪些通过，哪些失败
- 每个失败点对应的原始日志文件路径
- 至少一个真实 `taskId`
- 至少一个 `report.md` 或 benchmark / patch artifact 路径
- 对 DeepSeek `flash` / `pro` 的兼容性结论
- 对 `opencode` 的兼容性结论
- 对当前 `dist/main.js` 是否具备发布前人工验收价值的结论

## 完成标准

只有满足以下条件，才算这次“全量测试”完成：

- 全程通过 `node packages/cli/dist/main.js` 执行
- `deepseek-flash`、`deepseek-pro`、`opencode-local` 三个 worker 都实际触发过 `init`
- 三个 worker 都至少实际跑过一次 interview
- 三个 worker 都至少尝试过一次 benchmark
- 至少一个 worker 成功完成一次 task session
- 至少一次 patch inspect 和一次 patch dry-run apply 被验证
- `review repo`、`review diff`、`review files`、`fix error`、`doctor --mcp`、`mcp list-tools`、`mcp config --host codex`、`mcp config --host opencode`、`audit list`、`cleanup` 都被实际执行
- 结论与日志都落在 `tmp/`
