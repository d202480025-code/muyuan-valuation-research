# 猪周期与牧原经营估值研究

资料冻结：2026-10-24。当前计算引擎1.3.0。

- [公开计算网页](https://d202480025-code.github.io/muyuan-valuation-research/)
- [完整PPT（55页，含逐页口播备注）](docs/downloads/lecture.pptx)
- [PPT的PDF版](docs/downloads/lecture.pdf) / [独立行业篇](docs/downloads/industry.pdf) / [独立牧原篇](docs/downloads/muyuan.pdf)
- [录制、分界与剪辑说明](research/2026-10-24/recording-guide.md)
- [完整讲稿Word](docs/downloads/script.docx) / [Markdown](docs/docs/video-script.md)
- [修订报告](research/2026-10-24/report-v3.md)
- [算法核查与限制](research/2026-10-24/audit.md)
- [冻结数据、来源登记、价格图和复算材料](research/2026-10-24/materials/)
- [演示文稿内容与可编辑表格图表制作源](research/2026-10-24/authoring/)

视频约58分钟。第1—26页是猪周期行业篇，约29分钟并完整收尾；第27—49页为牧原案例，第50—55页为查阅附录。可在第26页结束后剪开，两部分有独立开场与收尾。首个内容页讲养殖成本，企业篇先按同一假设完整推导利润与高位PE，再比较其他方法。FCFF、FCFE的逻辑出发点放在现金流演算之前。

当前年度成本直接由首年及长期基础成本给出。参照均为11.8元/kg，2027—2036各年相同，折旧及维护投资另外列示。没有额外利润调整参数。已废止旧字段仅在导入时丢弃，当前125项参数中不存在。

正常成本中枢15.7333元/kg。另设全年20元/kg、8000万头、120kg、成本11.8、归属95%及PE10，得到利润747.84亿元、外推129.54元/股。高位年度价格是额外假设。需求价格逐年恢复15.5元/kg的FCFE平量参照58.15元/股，2031年9000万头61.23元/股。这些是不同条件的计算结果，不是同一经济假设下可直接平均的价格。

## 本地复算

```sh
node docs/tests/engine.test.js
node docs/tests/revised.test.js
node research/2026-10-24/materials/academic_work/price_assumptions.js
node research/2026-10-24/materials/academic_work/reproduce_valuation.js
```

37组回归、51项独立会计检查及估值复算121项检查通过。价格复算覆盖1764个月度点、15876个季度量字段、63组参数的189条价格路线。详见核查报告及日志。

网页为静态网站，无需服务端、密钥或用户登录。打开`docs/index.html`，或用任意静态服务器托管`docs/`。GitHub Pages发布目录为main分支的docs。

原有仓库根目录历史研究文档保留；本次材料以本页链接和research/2026-10-24为准。用户提供的冻结源文件未在本机覆盖。
