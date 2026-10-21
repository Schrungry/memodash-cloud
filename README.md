# MemoDash 网站版

从原 MemoDash FastAPI 单用户应用移植到 Sites / Cloudflare Workers 的多人版本。保留暖色纸张、陶土橙的原有视觉方向。

## 使用

- 用 ChatGPT 账号登录，平台提供受信任的账号身份。
- 在「词书广场」选择词书，在「开始学习」中回忆和评分。空格显示释义，1–4 评分。
- 81 本原有词书目录；81 本、153009 个词条全部随站点预置为压缩服务端资源，首次使用由服务端写入 R2 缓存，无需运行时访问旧下载源。
- 生词、设置、FSRS 卡片和复习记录保存在 D1，全部按登录用户 ID 隔离。词书内容共享，进度独立。
- 「学习设置」提供个人数据导出、合并导入。导入不会覆盖已有卡片，重复导入相同备份不会重复插入记录。导入分批提交，中断后可以重试。
- 保留 FSRS-6 默认参数和目标保留率设置；移除了 AI 生成功能、AI 接口设置、参数训练及其依赖。

新网站按用户要求仅所有者可访问。应用数据层已支持多人；未来可通过 Sites 访问设置开放受众。

## 迁移原学习数据

```powershell
python scripts/export-legacy.py 'D:\BaiduSyncdisk\code\python\memodash'
```

该命令只读原数据库，生成 `outputs/legacy-migration.json`，在网站「学习设置 → 导入学习数据」中选择此文件即可。仅导出允许保留的设置，不导出 AI 凭据、训练参数或其他旧设置。`outputs/` 不进入 Git 或部署包。原数据库不被修改。

`scripts/import-source.py` 只提取公开词书和目录，不复制个人学习数据。词书来源：原项目 bookLists.json / 有道词典 / [kajweb/dict](https://github.com/kajweb/dict)。调度依赖 [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)，锁定 5.2.3，以使用与原应用对应的 FSRS-6。

## 开发

需要 Node 22.13+。通过 Sites 项目初始化、依赖安装和发布流程管理本站；Windows 若 npm shim 无法定位自身，使用 Node 直接调用系统 npm 的 `npm-cli.js`。

```powershell
node scripts/run-framework.mjs dev --hostname 127.0.0.1
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/run-framework.mjs build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_light_changeling.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --port 8787 --inspector-port 0
node scripts/qa.mjs
```

开发预览提供仅 loopback 的模拟登录；生产身份由 Sites 网关验证并注入。生产 API 信任网关注入的身份头，部署时必须保留 Sites 网关边界，不应把 Worker 作为无网关认证的公网站点直接暴露。

测试使用随机的本地测试账号，验证未登录访问拒绝、跨用户数据隔离、跨站请求拒绝、参数验证、四级评分、重复及过期提交、并发额度、词书 R2 读取、备份往返以及完整旧数据迁移。完整迁移测试需要先运行导出脚本。

部署需要 D1 `DB` 和 R2 `BUCKET`，由 `.openai/hosting.json` 声明并由 Sites 自动配置。数据库迁移由 Drizzle 生成并随源代码发布。不要提交 `.wrangler/`、`.sites-runtime/`、`outputs/` 或任何凭据。

