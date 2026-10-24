# 引擎与界面契约1.4.0

按data.js、engine.js、ui.js顺序加载，无需外部API。PARAMS共131项，权威定义见引擎。旧配置导入补充恒定折旧默认，当前视频PAPER显式选择资产批次、终值现金维护explicit。

annual包含cost、profit、referenceDA、oldAssetDA、newAssetDA、da、sustainingCapex、growthCapex、deltaNwc、netBorrowing及fcfe。批次模式在利润和折旧加回中同步处理到期/新增差额，边际折旧税效应设零；不支持用固定利润现金转换比例替代现金桥。

终值维护选项继续独立生效：depreciation使维护等于终值D&A，explicit保持明确现金更新预算。两种预算不同会改变价值；不应将这种现金预算变化归因于非现金折旧本身。当前视频使用explicit，平量维护更新95亿元。

输入无效必须显示错误。当前版本支持1.0至1.4配置迁移，已废止字段只在迁移时丢弃，不再进入当前参数或计算。
