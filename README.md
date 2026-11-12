# 邻里菜篮

适配手机和电脑的买菜需求网页，使用原生 HTML、CSS、JavaScript 和 Supabase。

功能：商品与数量选择、收货信息、区域筛选、专属订单查询码、取消订单、管理员商品维护、供应商账号管理及订单汇总。

## 本地运行

需要 Node.js，无需安装依赖。

```sh
npm run check
npm run preview
```

先将 `dist/config.js` 中的 `YOUR_PROJECT_REF` 替换为你自己的 Supabase 项目引用。公开仓库中的配置不包含实际部署项目标识或任何密钥。

后端源码在 `supabase/functions/market-api/index.ts`，数据库脚本在 `supabase/sql/`。在自己的项目中按 schema.sql、02-rate-limits.sql、03-cancellations.sql 的顺序初始化数据库，并部署业务函数。仅在服务端使用 Supabase 提供的环境变量，不要把管理密钥或密码写入浏览器文件或提交到仓库。

这是独立实现，布局参考 dckxx/x-hub 的浅色背景、侧栏和圆角卡片。
