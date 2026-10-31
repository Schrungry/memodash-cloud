# MemoDash

基于 FSRS 间隔重复算法的多人单词学习应用，运行于 Sites / Cloudflare Workers。

## 功能

- ChatGPT 账号登录，个人生词、设置、卡片与复习记录按用户隔离。
- 81 本词书、153009 个词条预置在服务端，使用 R2 缓存共享词书内容。
- FSRS-6 复习调度、四级评分、每日学习额度与目标保留率设置。
- 当前卡片附带下一张的只读预取；评分时立即切卡并保存，已展示的卡片保持固定，新到期词放到后续切卡。失效卡片提示手动刷新，保存失败恢复原卡，统计在后台刷新。
- 学习概览、复习统计、生词本、发音与学习历史。
- 「关于」页面介绍 FSRS 原理、四级评分与本站的调度方式，并展示当前学习设置。
- 个人学习数据导出及合并导入，仅接受从本站导出的 JSON 备份。
- 导入保留已有卡片进度，相同备份重复导入不会重复插入记录；分批提交，中断后可重试。
- 导入按生词、卡片、复习记录依次进行，每阶段最多并发 3 批；关联记录按批校验，并显示导入进度。
- 添加生词先检索全部词书，可选择词书来源或填写未收录词；美英音标、按词性分条的释义、例句与词组均可编辑。
- 编辑生词保留学习进度；删除生词同时清除该词的卡片及历史记录，执行前需要在编辑页确认。
- 「开始学习」角标包含今日剩余新词及复习额度内的到期词；顶部「反馈」链接指向 GitHub Issues。
- 词书广场显示各词书的已学词数；悬停描述可查看全文，托福 / TOEFL 等中英文分类与搜索名称兼容，空分类自动隐藏。

学习时按空格显示释义，按 1–4 评分。队列顺序为到期复习 → 自定义新词 → 词书新词；词书与生词本仍共享每日新词额度。

## 技术与存储

- Vinext、React、TypeScript。
- Cloudflare Workers 提供服务端运行时。
- Cloudflare D1 保存个人设置、生词、卡片和复习日志。
- Cloudflare R2 保存共享词书缓存。
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.2.3 提供 FSRS-6 调度。
- 词书资源来自有道词典及 [kajweb/dict](https://github.com/kajweb/dict)。运行时直接读取预置资源。

Sites 管理访问权限。当前网站仅所有者可访问，可在 Sites 中按需调整受众。

## 开发

需要 Node.js 22.13+。通过 Sites 的项目初始化、依赖安装和发布流程管理本站。

```powershell
node scripts/run-framework.mjs dev --hostname 127.0.0.1
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --experimental-strip-types scripts/test-backup.mjs
node --experimental-strip-types tests/study-session.mjs
node --test tests/backup-import.mjs tests/import-d1.mjs tests/word-fields.mjs tests/book-catalog.mjs tests/memory.mjs tests/quiz.mjs
node scripts/run-framework.mjs build
```

本地数据库初始化（仅首次执行）：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_light_changeling.sql
```

本地生产预览与接口检查：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --port 8787 --inspector-port 0
node scripts/qa.mjs
node scripts/qa-words.mjs
node scripts/qa-queue.mjs
node scripts/qa-prefetch.mjs
```

接口检查使用独立的本地测试账号，覆盖登录保护、数据隔离、跨站请求拒绝、输入校验、调度评分、重复及过期评分、并发额度、词书读取和备份往返。

开发预览提供仅 loopback 可用的模拟登录。生产身份由 Sites 网关验证并注入，部署时需保留该认证边界。

## 发布

`.openai/hosting.json` 声明 D1 `DB` 和 R2 `BUCKET`，由 Sites 配置。数据库结构变更使用 Drizzle 生成增量 SQL，由 Sites 在发布时应用。

通过 Sites 工作流同步源码、打包并发布。不要提交 `.wrangler/`、`.sites-runtime/`、`outputs/` 或任何凭据。
