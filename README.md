# MemoDash 记忆日常

基于 FSRS 间隔重复算法的单词学习应用，部署在 WorkBuddy Sites，使用 WorkBuddy 云服务做认证与数据存储。

## 功能

- 四种登录方式：邮箱验证码、手机验证码、微信扫码、WorkBuddy 账号，学习数据按用户隔离。
- 81 本词书、153009 个词条，作为静态资源（`public/wordbooks`）所有用户共享。
- FSRS-6 复习调度、四级评分、每日学习额度与目标保留率设置。
- 当前卡片附带下一张的只读预取；评分时立即切卡并保存，已展示的卡片保持固定，新到期词放到后续切卡。失效卡片提示手动刷新，保存失败恢复原卡，统计在后台刷新。
- 学习概览、复习统计、生词本、发音与学习历史。
- 「关于」页面介绍 FSRS 原理、四级评分与本站的调度方式，并展示当前学习设置。
- 个人学习数据导出及合并导入，仅接受从本站导出的 JSON 备份；重复导入幂等，中断可重试。
- 导入按生词、卡片、复习记录依次进行，每阶段最多并发 3 批；关联记录按批校验，并显示导入进度。
- 添加生词先检索全部词书，可选择词书来源或填写未收录词；美英音标、按词性分条的释义、例句与词组均可编辑。
- 编辑生词保留学习进度；删除生词同时清除该词的卡片及历史记录，执行前需要在编辑页确认。
- 「开始学习」角标包含今日剩余新词及复习额度内的到期词；顶部「反馈」链接指向 GitHub Issues。
- 词书广场显示各词书的已学词数；悬停描述可查看全文，托福 / TOEFL 等中英文分类与搜索名称兼容，空分类自动隐藏。

学习时按空格显示释义，按 1–4 评分。队列顺序为到期复习 → 自定义新词 → 词书新词；词书与生词本仍共享每日新词额度。

## 技术与存储

- 纯客户端 SPA：Vite + React 19 + TypeScript，`server.mjs` 提供静态文件服务。
- 认证与数据库：WorkBuddy 云服务（`@tencent-ai/workbuddy-cloud-sdk`）。
- 云数据库 Postgres 保存个人设置、卡片、复习日志、历史词条与生词本，RLS 按 `owner_id = auth.uid()` 隔离。
- 事务性逻辑（评分提交的幂等与乐观锁、每日额度、历史查询）由数据库函数 `submit_review` / `daily_review_counts` / `review_history` / `missing_history_words` 承担。
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.2.3 提供 FSRS-6 调度（浏览器端计算）。
- 词书资源来自有道词典及 [kajweb/dict](https://github.com/kajweb/dict)。

## 开发

```bash
npm install
npm run dev    # vite 开发服务器
npm run build  # 生成词书检索索引 + 产出 dist/
npm start      # node server.mjs，伺服 dist + public（默认 3000 端口）
node --test tests/backup-import.mjs tests/word-fields.mjs tests/book-catalog.mjs tests/study-session.mjs tests/memory.mjs tests/quiz.mjs  # 单元测试
```

注意：微信扫码与 WorkBuddy 登录只在已发布域名上可用，localhost 会被平台拒绝。

## 目录

- `index.html` / `src/` — SPA 入口、云 SDK 初始化、登录页、云数据访问层
- `app/` — 主界面组件（学习页、生词本、生词编辑器、历史、关于）与样式
- `lib/` — FSRS 调度、测验、词条字段、学习会话、备份等纯逻辑与词书目录
- `public/wordbooks/` — 共享词书静态资源（gzip JSON）
- `public/word-index/` — 构建时生成的词书检索索引（16 个分片，仅供查词读取单个分片）
- `scripts/prepare-word-index.mjs` — 生成上述检索索引，`npm run build` 自动执行
- `server.mjs` — 生产静态服务器
- `tests/` — 导入分批、词条字段、词书分类、学习会话与调度测验逻辑的单元测试
>>>>>>> 3340202 (Migrate to WorkBuddy Sites + cloud service, drop ChatGPT/Cloudflare stack)
