# 计算引擎与界面契约1.3.0

按顺序加载data.js、engine.js、ui.js，无外部请求，适用于本地文件与GitHub Pages子目录。

globalThis.PigCycleModel导出VERSION、PARAMS、DEFAULTS、PRESETS、mergeConfig、validate、calculate、serialize、deserialize、csv及独立辅助计算。PARAMS共125项，为字段及单位的权威定义。

界面MAIN为完整高位PE主线，PAPER为需求路线平量现金流参照。引擎DEFAULTS保留2%增长三次、1000元当年投资的销量资本配置供现行模型比较，不包含旧版结果承诺。

calculate返回valid、errors、warnings、summary、monthly、quarterly、annual、valuation、growth及alternatives。年度cost直接反映首年与长期基础成本及明确融资调整，未包含其他自动利润扣减。annual中的da、sustainingCapex、growthCapex、deltaNwc、netBorrowing、fcfe分别列示。

历史价格口径分列，月度MSY不伪造。辅助期货和仔猪计算不自动改变主路径。错误输入应显示错误，不得继续显示旧结果。配置导入需要版本和字段检查，旧版本废止字段只在迁移时丢弃，不成为当前计算参数。
