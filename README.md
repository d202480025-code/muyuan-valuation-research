# 猪周期与牧原：可追溯的条件推演

当前模型1.4.0，资料冻结2026-10-24。本轮修正叙述衔接、逐项来源和资产折旧外推。

- [在线计算网页](https://d202480025-code.github.io/muyuan-valuation-research/)
- [完整PPT](docs/downloads/lecture.pptx) / [PDF](docs/downloads/lecture.pdf)
- [完整讲稿Word](docs/downloads/script.docx) / [逐页文本](docs/docs/video-script.md)
- [逐页数据与假设账本](research/2026-10-24/slide-data-ledger.md)
- [现行修订报告](research/2026-10-24/report-v4.md) / [算法核查](research/2026-10-24/audit.md)
- [独立行业篇PDF](docs/downloads/industry.pdf) / [独立牧原篇PDF](docs/downloads/muyuan.pdf)
- [冻结材料与复算](research/2026-10-24/materials/) / [制作源](research/2026-10-24/authoring/)

57页，49页主讲、8页附录，约57分钟。行业篇第1—26页，约28:26完整结束；第27页开始独立公司案例。22张原生可编辑数据图，另有周期反馈、退出和生产时滞图。逐页账本列出488个画面数字字段，说明披露、情景和计算依据，PPT页脚可点击。

第9页只说明15.73元成本中枢为何不等于短期价格；第17页推导历史条件年均20.81元，第25页才说明20元是源报告的整值演算。它接近历史情景的量级，但不是成本公式或已验证预测。企业篇固定20元先完成利润747.84亿元、PE10外推129.54元/股，再比较其他条件。

资产外推分别计算存量到期、新增和更新资产折旧，并同步修正利润及加回。年龄1—10年均匀和更新类别均为明确情景，未冒充披露资产台账。平量批次FCFE59.502314元/股，2031年9000万头62.743877元/股。原恒定折旧对照58.153279与本次差额来自终值现金维护115.2→95亿元，非仅改变非现金折旧创造现金。

## 复算

```sh
node docs/tests/engine.test.js
node docs/tests/revised.test.js
node research/2026-10-24/materials/academic_work/reproduce_asset_cohorts.js
node research/2026-10-24/materials/academic_work/price_assumptions.js
```

37组回归、51项恒定折旧独立会计检查、163项资产批次卷积和现金恒等式检查通过。价格复算1764个月度点、15876个数量/锚字段，63组/189条路线。旧恒定模型的121项检查保留作对照。所有未来价格、利润及价值结果都附条件，未赋客观预测概率。

仓库原有根目录历史文档保留。本轮以本页链接及research/2026-10-24为准。网站为静态文件，无需密钥或登录。
