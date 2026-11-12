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

后端源码在 `supabase/functions/market-api/index.ts`，数据库脚本在 `supabase/sql/`。在自己的项目中按 schema.sql、02-rate-limits.sql、03-cancellations.sql、04-product-images.sql、05-order-rejections.sql、06-product-prices.sql 的顺序初始化数据库，并部署业务函数。仅在服务端使用 Supabase 提供的环境变量，不要把管理密钥或密码写入浏览器文件或提交到仓库。

这是独立实现，布局参考 dckxx/x-hub 的浅色背景、侧栏和圆角卡片。

新增功能：管理员可编辑商品名称、单位、MXN单价并上传图片；供应商可只读查看商品单价。客户与后台订单均显示单价、数量、行小计及双币合计。人民币按照Frankfurter最新交易日参考汇率折算，页面显示日期；MXN为主计价币。订单保存下单时单价和汇率，历史金额不会因改价而改变。

管理员与供应商可拒绝待配送订单，必须填写原因。客户凭原查询码查看已拒绝状态和原因；拒绝订单从备菜汇总中排除，不增加客户连续取消次数。订单联系方式显示在明细右侧。

运行 npm run check 验证商品表单、权限、订单状态、金额计算与价格快照。已有未定价商品需管理员填写真实单价后才开放下单。
