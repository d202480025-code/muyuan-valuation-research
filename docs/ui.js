/* Pig Cycle Lab viewer. All model arithmetic is provided by engine.js. */
(function () {
  'use strict';

  var M = globalThis.PigCycleModel;
  var DATA = globalThis.PIG_DATA || {};
  var $ = function (id) { return document.getElementById(id); };
  var STORAGE_KEY = 'pig-cycle-lab.viewer.revised-1.3-20261024';
  var PAPER = M.mergeConfig(M.DEFAULTS, {companyGrowthMode:'flat',hogsPerYear:8000,companyWeight:120,growthCapexPerHead:2000,growthInvestmentTiming:'one_year_before',cashflowMode:'bridge',valuationMethod:'fcfe'});
  var MAIN = M.mergeConfig(PAPER,{priceMethod:'custom',customQ1:20,customQ2:20,customQ3:20,customQ4:20,valuationMethod:'pe',normalPigPrice:15.5,normalPriceMode:'manual',normalEarningsMode:'firstyear',normalPE:10});
  var COLORS = { demand: '#087f80', capacity: '#567b9f', cost: '#d78a50', custom: '#8a7caa', price: '#d78a50', sows: '#087f80' };
  var PRICE_METHODS = [
    { id: 'cost', label: '边际成本', short: '成本与正常回报', logic: '用不同养殖效率对应的完全成本，加上资本所需的正常回报，观察市场可能的长期价格锚。', formula: '价格锚 = 边际完全成本 + 正常资本回报', limits: '效率分层没有全国真实权重。选中的成本层，不会自动成为市场实际边际主体。' },
    { id: 'capacity', label: '历史振幅', short: '有效产能变化', logic: '把能繁、每头母猪的商品猪产出和出栏体重合并为有效供应，再用历史周期的振幅校准价格情景。', formula: '有效供应 ∝ 能繁 × MSY × 出栏体重', limits: '历史振幅同时包含需求、情绪和政策变化，不能当作已识别的因果弹性。' },
    { id: 'demand', label: '需求弹性', short: '供需与零售传导', logic: '先推演猪肉供给与需求的相对变化，再通过零售需求弹性与传导系数，计算生猪价格。', formula: '供应 / 需求 → 零售猪肉价 → 生猪价', limits: '年度居民购买弹性向季度生猪市场迁移，需要额外假设；非线性会放大极端情景。' },
    { id: 'custom', label: '自定义猪价', short: '直接输入四季度', logic: '直接填写自己的季度猪价，保留相同的企业经营与估值框架，检验这组判断的含义。', formula: '你的季度猪价 → 利润 → 现金流 → 价值', limits: '输入价格是用户判断；模型不会替这些价格提供供需证据。' }
  ];
  var VALUE_METHODS = [
    { id: 'fcfe', label: 'FCFE · 股权现金流折现', title: 'FCFE / DCF', logic: '逐年预测归属于股东的自由现金流，再用股权回报要求折现，并单独计算终值。', formula: '股权价值 = 各年 FCFE 现值 + 终值现值', limits: '完整成本含利息时，应保持股权现金流口径；不能再重复减去同一笔净债务。' },
    { id: 'pe', label: '正常利润 · PE', title: '正常利润 / PE', logic: '从跨周期的正常利润出发，选择与增长、风险和资本消耗相匹配的市盈率。', formula: '每股价值 = 正常每股收益 × 正常 PE', limits: '一年高位利润不等于正常利润。峰值年化与长期持续盈利需要分开判断。' },
    { id: 'ev_ebitda', label: '企业价值 · EV / EBITDA', title: 'EV / EBITDA', logic: '以正常经营 EBITDA 推导企业价值，再扣除净债务及适用的少数股权价值，得到股权价值。', formula: '股权价值 = EBITDA × 倍数 − 净债务 − 少数股权价值', limits: '重资产养殖需要持续再投资，EBITDA 本身并不是股东可以带走的现金。' },
    { id: 'roe_pb', label: '资本回报 · ROE / PB', title: 'ROE / PB', logic: '把账面净资产、正常资本回报、长期增长与股权回报要求放进同一个框架。', formula: '合理 PB 与持续 ROE、增长及回报要求相匹配', limits: '账面资产质量、成本优势的持续时间和资本回报的均值回归都会改变结论。' }
  ];
  var state = { config: {}, result: null, comparisons: [], scenarios: [], name: '我的猪周期判断', dirty: false, currentView: 'simulation', preset: '', invalidInputs: {}, hiddenSeries: {}, historyLagged: false, historyRange: 'five', highlightedSource: null, sourcePage: 0, sourceQuery: '', sourceIdsFilter: null, lastChartWidth: 0 };
  var defs = [];
  var definitionByKey = {};
  var sourceCatalog = [];
  var timer = null;
  var toastTimer = null;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (x) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]; }); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function fmt(value, places) { return finite(value) ? value.toLocaleString('zh-CN', { minimumFractionDigits: places == null ? 2 : places, maximumFractionDigits: places == null ? 2 : places }) : '—'; }
  function percent(value, places, signed) { return finite(value) ? ((signed && value > 0) ? '+' : '') + fmt(value * 100, places == null ? 1 : places) + '%' : '—'; }
  function textOf(value) { if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('；'); if (value && typeof value === 'object') return value.text || value.message || value.label || value.title || ''; return value == null ? '' : String(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function safeUrl(url) { try { var u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch (_) { return ''; } }
  function evidenceLabel(value) { return value === 'observed' || value === 'fact' ? '公开数据' : value === 'derived' ? '推导参数' : value === 'analogy' ? '历史类比' : value === 'user' ? '用户设定' : '研究假设'; }
  function evidenceClass(value) { return value === 'observed' || value === 'fact' ? 'tag-fact' : value === 'derived' || value === 'analogy' ? 'tag-analogy' : value === 'user' ? 'tag-user' : 'tag-assumption'; }
  function priceLabel(id) { return (PRICE_METHODS.find(function (x) { return x.id === id; }) || {}).label || id || '猪价推演'; }
  function valueLabel(id) { return (VALUE_METHODS.find(function (x) { return x.id === id; }) || {}).title || id || '估值'; }
  function normalEarningsLabel(config) { return ({ firstyear:'首年情景利润（高位外推）', operating: '修复后正常经营', terminal: '期末价差 × 当前销量', roe: '正常 ROE × 当前归母权益' })[config.normalEarningsMode] || '修复后正常经营'; }
  function valuationContext(config) { return config.valuationMethod === 'pe' ? '正常利润：' + normalEarningsLabel(config) : config.valuationMethod === 'fcfe' ? '基础成本及正常价格路径' : '各项输入均可调整'; }
  function arrayMean(values) { var a = values.filter(finite); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function showToast(message, error) { clearTimeout(toastTimer); $('toast-region').innerHTML = '<div class="toast' + (error ? ' is-error' : '') + '">' + esc(message) + '</div>'; toastTimer = setTimeout(function () { $('toast-region').innerHTML = ''; }, 4500); }
  function scrollTopSoft() { if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }

  function showView(view, scroll) {
    if (!['simulation', 'crosschecks', 'history', 'methods'].includes(view)) return;
    state.currentView = view;
    document.querySelectorAll('.view').forEach(function (node) { var active = node.id === 'view-' + view; node.hidden = !active; node.classList.toggle('is-active', active); });
    document.querySelectorAll('[data-view]').forEach(function (node) { var active = node.dataset.view === view; node.classList.toggle('is-active', active); if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
    if (view === 'history') renderHistory();
    if (view === 'crosschecks') renderCrossChecks();
    if (view === 'simulation' && state.result && state.result.valid !== false) renderForecast();
    if (scroll !== false) scrollTopSoft();
  }

  function sourceButtons(ids) {
    var list = asArray(ids);
    return list.slice(0, 3).map(function (id) { return '<button type="button" class="source-button" data-source="' + esc(id) + '" title="查看资料来源" aria-label="查看资料来源 ' + esc(id) + '">↗</button>'; }).join('') + (list.length > 3 ? '<button type="button" class="source-more" data-source-ids="' + esc(JSON.stringify(list)) + '" aria-label="查看这组全部 ' + list.length + ' 条来源">+' + (list.length - 3) + '</button>' : '');
  }

  function inactiveReason(key) {
    var route = state.config.priceMethod, mode = state.config.productivityMode;
    if(key==='marginalFullCost' && state.config.costBasis!=='manual')return '当前采用技术组合，此必要成本判断不生效。';
    if(['customPsy','customFcr','customSurvival','customUtilization','customDays','customLabor','customHealth','feedPricePct','marginalTier'].includes(key)&&state.config.costBasis==='manual')return '当前采用手动必要成本，此技术成本参数不生效。';
    if(['volumeGrowthPct','volumeGrowthYears'].includes(key)&&state.config.companyGrowthMode!=='rate')return '当前销量路径不使用复合增速。';
    var supplyRoute = route === 'demand' || route === 'capacity';
    var supplyKeys = ['sowQ2', 'sowQ3', 'q4DepletionPct', 'sowChange2027Pct', 'lagMonths', 'lagMode', 'capacityMetric', 'productivityMode'];
    var psyKeys = ['psyBase', 'psyCeiling', 'psyGapClosurePct', 'survivalBase', 'survivalTarget', 'commercialBase', 'commercialTarget', 'activeSowRatioBase', 'activeSowRatioTarget'];
    var demandKeys = ['demandForm', 'demandElasticity', 'demandTrendPct', 'importSharePct', 'importsGrowthPct', 'retailPassThrough', 'baseRetailPrice'];
    var historyKeys = ['historicalCycle', 'historicalMsyGrowthPct', 'historicalWeightChangePct', 'manualBeta', 'includeASF'];
    if (demandKeys.includes(key) && route !== 'demand') return '当前猪价主路径不使用；保留用于需求法对照。';
    if (historyKeys.includes(key) && route !== 'capacity') return '当前猪价主路径不使用；保留用于历史振幅对照。';
    if ((supplyKeys.includes(key) || psyKeys.includes(key) || ['msyBase', 'msyTarget', 'nationalWeightBase', 'nationalWeightTarget'].includes(key)) && !supplyRoute) return '当前猪价主路径不使用；保留用于供给类方法对照。';
    if (psyKeys.includes(key) && mode === 'direct') return '直接 MSY 已包含这些结构；当前效率路径不重复使用。';
    if ((psyKeys.includes(key) || ['msyBase', 'msyTarget'].includes(key)) && mode === 'flat') return '当前选择效率不变，忽略这些效率变化输入。';
    if ((psyKeys.includes(key) || ['msyBase', 'msyTarget'].includes(key)) && state.config.capacityMetric === 'heads') return '仅母猪头数口径不使用 MSY 与效率变化。';
    if (['nationalWeightBase', 'nationalWeightTarget'].includes(key) && state.config.capacityMetric !== 'tonnage') return '当前产能口径不使用出栏体重；吨肉口径时生效。';
    if (/^customQ[1-4]$/.test(key) && route !== 'custom') return '当前猪价主路径不使用；保留用于自定义价格对照。';
    if (/^seasonQ[1-4]$/.test(key) && route === 'custom') return '自定义季度价不再叠加季节因子。';
    if (['baseSows', 'baseHogPrice'].includes(key) && state.config.anchorMode !== 'custom') return '当前锚方式不使用此值；选择“自行设定基期锚”时生效。';
    if (key === 'anchorMode' && !supplyRoute) return '当前成本或自定义路线不使用供需价格锚。';
    if (key === 'normalPigPrice' && state.config.normalPriceMode === 'cost') return '长期中枢目前采用所选边际效率正常价，忽略手动中枢。';
    if (key === 'manualBeta' && state.config.historicalCycle !== 'manual') return '当前由历史周期校准；仅手动振幅模式使用。';
    if (key === 'normalEarningsMode' && state.config.valuationMethod !== 'pe') return '仅改变正常 PE 对照结果，不改变当前估值方法。';
    if (key === 'normalROEPct' && state.config.valuationMethod === 'pe' && state.config.normalEarningsMode !== 'roe') return '当前 PE 利润口径不使用该 ROE；保留用于 ROE-PB 对照。';
    return '';
  }

  function parameterMarkup(def) {
    var key = def.key, value = state.config[key];
    var id = 'param-' + key, helpId = id + '-help';
    var evidence = value === def.default ? def.evidence : 'user';
    var head = '<div class="label-row"><label class="field-label" for="' + esc(id) + '">' + esc(def.label || key) + '</label><span class="field-meta"><span data-input-evidence class="data-tag ' + evidenceClass(evidence) + '">' + evidenceLabel(evidence) + '</span>' + sourceButtons(def.sourceIds) + '</span></div>';
    var input;
    if (def.type === 'select') {
      input = '<select id="' + esc(id) + '" data-param="' + esc(key) + '" aria-describedby="' + esc(helpId) + '">' + asArray(def.options).map(function (op) { return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(value) ? ' selected' : '') + '>' + esc(op.label || op.value) + '</option>'; }).join('') + '</select>';
    } else if (def.type === 'boolean') {
      input = '<label class="boolean-input"><input type="checkbox" id="' + esc(id) + '" data-param="' + esc(key) + '"' + (value ? ' checked' : '') + ' aria-describedby="' + esc(helpId) + '"><span>' + esc(def.enabledLabel || '启用') + '</span></label>';
    } else if (def.type === 'text' || def.type === 'date') {
      var inputType = def.type === 'date' || def.inputType === 'date' ? 'date' : 'text';
      var placeholder = key === 'futuresObservedDate' ? 'YYYY-MM-DD' : key === 'futuresContract' ? '例如 LH2701' : key === 'futuresQuoteSource' ? '网址、资料名称或截图出处' : '';
      input = '<input type="' + inputType + '" id="' + esc(id) + '" data-param="' + esc(key) + '" value="' + esc(value == null ? '' : value) + '"' + (finite(def.maxLength) ? ' maxlength="' + def.maxLength + '"' : '') + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' autocomplete="off" spellcheck="false" aria-describedby="' + esc(helpId) + '">';
    } else {
      var displayedValue = key === 'futuresQuote' && value === 0 ? '' : value;
      input = '<div class="input-with-unit' + (String(def.unit || '').length > 4 ? ' unit-wide' : '') + '"><input type="number" inputmode="decimal" id="' + esc(id) + '" data-param="' + esc(key) + '" value="' + esc(displayedValue == null ? '' : displayedValue) + '"' + (finite(def.min) ? ' min="' + def.min + '"' : '') + (finite(def.max) ? ' max="' + def.max + '"' : '') + ' step="' + esc(def.step == null ? 'any' : def.step) + '"' + (key === 'futuresQuote' ? ' placeholder="填写合约报价"' : '') + ' aria-describedby="' + esc(helpId) + '"><span class="input-unit">' + esc(def.unit || '') + '</span></div>';
    }
    var context = inactiveReason(key);
    return '<div class="parameter-field' + (context ? ' is-context-inactive' : '') + (['futuresBasisScope', 'futuresQuoteSource'].includes(key) ? ' field-wide' : '') + '" data-field="' + esc(key) + '">' + head + input + '<p class="field-help" id="' + esc(helpId) + '">' + esc(def.description || '') + '</p><p class="parameter-context" data-parameter-context' + (context ? '' : ' hidden') + '>' + esc(context) + '</p></div>';
  }

  function renderParameters() {
    $('price-methods').innerHTML = PRICE_METHODS.map(function (method) { return '<button type="button" class="choice-button" data-price-method="' + method.id + '" aria-pressed="' + (method.id === state.config.priceMethod) + '"><strong>' + esc(method.label) + '</strong><small>' + esc(method.short) + '</small></button>'; }).join('');
    var valuationDef = definitionByKey.valuationMethod;
    var valueOptions = valuationDef && valuationDef.options ? valuationDef.options : VALUE_METHODS.map(function (x) { return { value: x.id, label: x.label }; });
    $('valuation-method').innerHTML = valueOptions.map(function (op) { return '<option value="' + esc(op.value) + '"' + (op.value === state.config.valuationMethod ? ' selected' : '') + '>' + esc(op.label) + '</option>'; }).join('');
    $('preset-select').innerHTML = '<option value="">自定义推演</option>' + asArray(M.PRESETS).map(function (preset) { return '<option value="' + esc(preset.id) + '"' + (preset.id === state.preset ? ' selected' : '') + '>' + esc(preset.name) + '</option>'; }).join('');
    var groups = [];
    defs.filter(function (def) { return !def.auxiliary && !['priceMethod', 'valuationMethod'].includes(def.key); }).forEach(function (def) {
      var groupName = textOf(def.group) || '其他参数';
      var group = groups.find(function (x) { return x.name === groupName; });
      if (!group) { group = { name: groupName, defs: [] }; groups.push(group); }
      group.defs.push(def);
    });
    $('parameter-sections').innerHTML = groups.map(function (group, i) {
      var ordinary = group.defs.filter(function (d) { return !d.advanced; });
      var advanced = group.defs.filter(function (d) { return d.advanced; });
      var body = ordinary.map(parameterMarkup).join('');
      if (advanced.length) body += '<details class="advanced-parameters"><summary>更多参数 <span>' + advanced.length + '</span></summary><div class="advanced-parameter-fields">' + advanced.map(parameterMarkup).join('') + '</div></details>';
      return '<details class="parameter-section" data-parameter-group="' + esc(group.name) + '"' + (i < 2 ? ' open' : '') + '><summary><span><span class="section-index">' + String(i + 1).padStart(2, '0') + '</span>' + esc(group.name) + '</span></summary><div class="parameter-fields">' + body + '</div></details>';
    }).join('');
    renderCrossCheckParameters();
    updateParameterVisibility();
    updatePresetDescription();
  }

  function updateParameterVisibility() {
    document.querySelectorAll('[data-field]').forEach(function (node) {
      var def = definitionByKey[node.dataset.field], when = def && def.showWhen;
      var visible = !when || (Array.isArray(when.value) ? when.value.some(function (v) { return v === state.config[when.key]; }) : state.config[when.key] === when.value);
      node.hidden = !visible;
      var badge = node.querySelector('[data-input-evidence]');
      if (badge && def) { var evidence = state.config[def.key] === def.default ? def.evidence : 'user'; badge.className = 'data-tag ' + evidenceClass(evidence); badge.textContent = evidenceLabel(evidence); }
      var context = inactiveReason(node.dataset.field), contextNode = node.querySelector('[data-parameter-context]');
      node.classList.toggle('is-context-inactive', !!context);
      if (contextNode) { contextNode.hidden = !context; contextNode.textContent = context; }
    });
    document.querySelectorAll('.advanced-parameters').forEach(function (node) { node.hidden = !Array.from(node.querySelectorAll('[data-field]')).some(function (x) { return !x.hidden; }); });
    document.querySelectorAll('[data-parameter-group]').forEach(function (node) { node.hidden = !Array.from(node.querySelectorAll('[data-field]')).some(function (x) { return !x.hidden; }); });
    document.querySelectorAll('[data-price-method]').forEach(function (node) { node.setAttribute('aria-pressed', String(node.dataset.priceMethod === state.config.priceMethod)); });
    $('valuation-method').value = state.config.valuationMethod;
  }

  function updatePresetDescription() {
    var preset = asArray(M.PRESETS).find(function (p) { return p.id === state.preset; });
    $('preset-description').textContent = preset ? textOf(preset.description || preset.logic) : '也可以直接调整下方参数，建立自己的判断。';
  }

  function applyConfig(config, name, preset) {
    state.config = M.mergeConfig(M.DEFAULTS, config);
    state.name = name || '我的猪周期判断';
    state.preset = preset || '';
    state.dirty = false;
    state.invalidInputs = {};
    state.hiddenSeries = {};
    renderParameters();
    recalculate();
    persist();
  }

  function updateParameter(key, rawValue, input) {
    var def = definitionByKey[key];
    var value = rawValue;
    if (def && def.type === 'number') {
      if (rawValue === '' || !Number.isFinite(Number(rawValue))) {
        if (def.auxiliary) value = null;
        else {
          state.invalidInputs[key] = (def.label || key) + '需要填写有效数字。';
          if (input) input.setAttribute('aria-invalid', 'true');
          recalculate();
          return;
        }
      } else value = Number(rawValue);
    }
    if (def && def.type === 'select') {
      var option = asArray(def.options).find(function (op) { return String(op.value) === String(rawValue); });
      if (!option) { state.invalidInputs[key] = (def.label || key) + '的选项无效。'; recalculate(); return; }
      value = option.value;
    }
    try {
      var patch = {}; patch[key] = value;
      state.config = M.mergeConfig(state.config, patch);
      delete state.invalidInputs[key];
      if (input) input.removeAttribute('aria-invalid');
      state.dirty = true;
      state.preset = '';
      $('preset-select').value = '';
      updatePresetDescription();
      updateParameterVisibility();
      clearTimeout(timer);
      if (def && def.auxiliary) renderCrossChecks();
      timer = setTimeout(function () { recalculate(); persist(); }, 100);
    } catch (error) { state.invalidInputs[key] = error.message || '参数格式无效。'; recalculate(); }
  }

  function recalculate() {
    try {
      var inputErrors = Object.keys(state.invalidInputs).filter(function (key) { return !(definitionByKey[key] && definitionByKey[key].auxiliary); }).map(function (key) { return { key: key, message: state.invalidInputs[key] }; });
      if (inputErrors.length) { renderInvalid(inputErrors); return; }
      var validation = M.validate(state.config, DATA);
      if (validation && validation.errors && validation.errors.length) { renderInvalid(validation.errors); return; }
      var result = M.calculate(state.config, DATA);
      state.result = result;
      if (!result || result.valid === false || asArray(result.errors).length) { renderInvalid(result && result.errors || [{ message: '当前参数无法计算，请检查输入范围。' }]); return; }
      state.comparisons = PRICE_METHODS.map(function (method) {
        if (method.id === state.config.priceMethod) return { id: method.id, label: method.label, result: result };
        try { var r = M.calculate(M.mergeConfig(state.config, { priceMethod: method.id }), DATA); return { id: method.id, label: method.label, result: r }; }
        catch (error) { return { id: method.id, label: method.label, result: { valid: false, errors: [{ message: error.message }] } }; }
      });
      $('validation-banner').hidden = true;
      document.querySelectorAll('[aria-invalid="true"]').forEach(function (input) { input.removeAttribute('aria-invalid'); });
      $('active-scenario-title').textContent = state.name + (state.dirty ? ' · 已调整' : '');
      $('active-method-description').textContent = priceLabel(state.config.priceMethod) + ' → ' + valueLabel(state.config.valuationMethod) + ' · ' + valuationContext(state.config);
      $('live-status').innerHTML = '<span class="status-dot" aria-hidden="true"></span>已按当前参数重算';
      renderMetrics();
      renderForecast();
      renderValuation();
      renderTransmission();
      renderModelNotes();
      renderScenarios();
      renderCrossChecks();
      if (state.currentView === 'history') renderHistory();
      $('save-scenario').disabled = false;
      $('download-results').disabled = false;
      $('copy-share').disabled = false;
      $('export-config').disabled = false;
    } catch (error) {
      renderInvalid([{ message: '暂时无法计算这组参数：' + (error.message || '请检查输入。') }]);
    }
  }

  function renderInvalid(errors) {
    state.result = null;
    state.comparisons = [];
    $('validation-banner').hidden = false;
    $('validation-banner').innerHTML = '<strong>请先调整这些参数</strong><ul>' + asArray(errors).map(function (e) { return '<li>' + esc(e.message || textOf(e)) + '</li>'; }).join('') + '</ul>';
    $('metric-grid').innerHTML = metricCard('全年生猪均价', null, '元 / 公斤', '等待有效参数') + metricCard('归母净利润', null, '亿元', '等待有效参数') + metricCard('每股价值', null, '元 / 股', '等待有效参数', true);
    $('forecast-chart').innerHTML = '<div class="empty-table calculation-empty">调整参数后，价格路径会显示在这里。</div>';
    $('forecast-legend').innerHTML = '';
    $('quarter-cards').innerHTML = '';
    $('forecast-table').innerHTML = '';
    $('valuation-content').innerHTML = '<p class="muted small-copy">当前输入无效，未显示旧的估值结果。</p>';
    $('transmission-content').innerHTML = '';
    $('model-notes').innerHTML = '';
    $('live-status').innerHTML = '<span class="status-dot" aria-hidden="true"></span>等待参数修正';
    $('save-scenario').disabled = true;
    $('download-results').disabled = true;
    $('copy-share').disabled = true;
    $('export-config').disabled = true;
    renderCrossChecks();
    asArray(errors).forEach(function (e) { var input = e.key && $('param-' + e.key); if (input) { input.setAttribute('aria-invalid', 'true'); var section = input.closest('.parameter-section'); if (section) section.open = true; var advanced = input.closest('.advanced-parameters'); if (advanced) advanced.open = true; } });
  }

  function renderCrossCheckParameters() {
    [['futures-fields', '期货与基差'], ['piglet-fields', '外购仔猪育肥']].forEach(function (pair) {
      var rows = defs.filter(function (def) { return def.auxiliary && def.group === pair[1]; });
      if (pair[0] === 'futures-fields') {
        var order = ['futuresObservedDate', 'futuresContract', 'futuresQuoteType', 'futuresQuote', 'futuresBasis', 'futuresBasisScope', 'futuresQuoteSource'];
        rows.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
      }
      $(pair[0]).innerHTML = rows.length ? rows.map(parameterMarkup).join('') : '<p class="loading-state">此版本尚未载入对照参数。</p>';
    });
  }

  function currentCrossChecks() {
    if (!M || typeof M.crossChecks !== 'function') return null;
    try {
      var checks = M.crossChecks(state.config);
      ['futures', 'piglet'].forEach(function (kind) {
        var group = kind === 'futures' ? '期货与基差' : '外购仔猪育肥';
        var extra = Object.keys(state.invalidInputs).filter(function (key) { var def = definitionByKey[key]; return def && def.auxiliary && def.group === group; }).map(function (key) { return { key: key, message: state.invalidInputs[key] }; });
        if (extra.length) {
          checks[kind].valid = false;
          checks[kind].errors = asArray(checks[kind].errors).concat(extra);
          if (kind === 'futures') checks[kind].referencePrice = null;
          else { checks[kind].breakEvenPrice = null; checks[kind].requiredPrice = null; checks[kind].expectedProfit = null; }
        }
      });
      return checks;
    } catch (_) { return null; }
  }

  function crossMessages(messages, error) {
    return asArray(messages).length ? '<div class="cross-warning' + (error ? ' cross-error' : '') + '"><ul>' + messages.map(function (message) { return '<li>' + esc(message.message || textOf(message)) + '</li>'; }).join('') + '</ul></div>' : '';
  }

  function crossApplication(kind, checks) {
    var quarter = $(kind + '-quarter').value, check = checks && checks[kind];
    var choice = kind === 'piglet' ? $('piglet-result-choice').value : 'reference';
    var value = check && (kind === 'futures' ? check.referencePrice : choice === 'breakEven' ? check.breakEvenPrice : check.requiredPrice);
    var label = kind === 'futures' ? '期货与基差参照' : choice === 'breakEven' ? '仔猪育肥保本价' : '仔猪育肥目标收益所需价';
    if (!check || !check.valid || kind === 'futures' && !check.configured || !finite(value)) return { valid: false, message: kind === 'futures' ? '请先填写完整、有效的合约报价与出处。' : '请先修正补栏参数，得到有效的所需售价。' };
    if (!/^[1-4]$/.test(quarter)) return { valid: false, message: '请明确选择要写入的 2027 年季度。' };
    var key = 'customQ' + quarter, def = definitionByKey[key];
    if (!def || value < def.min || value > def.max) return { valid: false, message: '当前参考值 ' + fmt(value) + ' 超出季度价允许范围 ' + fmt(def && def.min, 0) + '–' + fmt(def && def.max, 0) + ' 元/kg，不能直接采用。' };
    var mainDraft = Object.keys(state.invalidInputs).some(function (k) { return !(definitionByKey[k] && definitionByKey[k].auxiliary); });
    var patch = { priceMethod: 'custom' }; patch[key] = value;
    var candidate = M.mergeConfig(state.config, patch), validation = M.validate(candidate, DATA);
    if (mainDraft || asArray(validation.errors).length) return { valid: false, message: '主模型还有待修正的参数；修正后可以采用此季度价。' };
    return { valid: true, quarter: quarter, key: key, value: value, label: label, config: candidate, message: '仅将 ' + label + ' ' + fmt(value) + ' 元/kg 写入 2027 Q' + quarter + '，并切换到自定义猪价。' };
  }

  function updateCrossApplyButtons(checks) {
    ['futures', 'piglet'].forEach(function (kind) {
      var button = $('apply-' + kind + '-price'), quarter = $(kind + '-quarter').value;
      var application = crossApplication(kind, checks);
      button.disabled = !application.valid;
      button.textContent = /^[1-4]$/.test(quarter) ? '作为Q' + quarter + '均价假设使用' : '先选择季度';
      button.title = application.message;
      var status = $(kind + '-apply-status');
      if (status) { status.textContent = application.message; status.classList.toggle('is-blocked', !application.valid && !!quarter); }
    });
  }

  function renderCrossChecks() {
    if (!$('futures-check-result')) return;
    var checks = currentCrossChecks(), c = state.config;
    state.crossChecks = checks;
    document.querySelectorAll('#view-crosschecks [data-param][aria-invalid="true"]').forEach(function (input) { input.removeAttribute('aria-invalid'); });
    if (!checks) {
      $('futures-check-result').innerHTML = '<div class="cross-empty-state"><h3>等待对照计算器载入</h3><p>请确保当前目录包含配套的 engine.js。</p></div>';
      $('piglet-check-result').innerHTML = '<div class="cross-empty-state"><h3>等待对照计算器载入</h3></div>';
    } else {
      var f = checks.futures, p = checks.piglet, metadata = f.metadata || {};
      if (!f.valid) {
        $('futures-check-result').innerHTML = '<div class="cross-empty-state"><div class="cross-empty-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="5" y="7" width="22" height="20" rx="3"></rect><path d="M10 4v6M22 4v6M5 13h22M11 19h4M11 23h9"></path></svg></div><h3>' + (f.configured ? '待补齐或修正这组行情' : '等待你的合约报价') + '</h3><p>填写观察日期、LH 合约、报价类型、元/吨报价、基差及地区品质口径和来源后，显示合约月参考价。</p></div>' + crossMessages(f.errors, true);
      } else {
        var quoteLabel = { settlement: '结算价', close: '收盘价', user: '自填参考价' }[metadata.quoteType] || metadata.quoteType;
        $('futures-check-result').innerHTML = '<div class="cross-result-head"><span>基差调整后的合约月参考价</span><span class="data-tag tag-user">用户行情 · 未核验</span></div><div class="cross-hero-number">' + fmt(f.referencePrice) + '<small>元 / kg</small></div><p class="cross-formula">' + fmt(metadata.quote, 0) + ' 元/吨 ÷ 1,000 ' + (metadata.basis < 0 ? '− ' : '+ ') + fmt(Math.abs(metadata.basis)) + ' 元/kg = ' + fmt(f.referencePrice) + ' 元/kg</p><dl class="cross-metadata"><div><dt>报价观察日期</dt><dd>' + esc(metadata.observedDate) + '</dd></div><div><dt>合约 / 报价种类</dt><dd>' + esc(metadata.contract) + ' · ' + esc(quoteLabel) + '</dd></div><div class="metadata-wide"><dt>地区与品质口径</dt><dd>' + esc(metadata.basisScope) + '</dd></div><div class="metadata-wide"><dt>用户填写的来源</dt><dd class="cross-source-text">' + esc(metadata.quoteSource) + '</dd></div></dl>' + crossMessages(f.warnings, false);
      }
      var demo = defs.filter(function (def) { return def.auxiliary && def.group === '外购仔猪育肥'; }).every(function (def) { return c[def.key] === def.default; });
      var pigletHtml = '<div class="cross-result-head"><span>每头买入仔猪的回报门槛</span><span class="data-tag ' + (demo ? 'tag-assumption' : 'tag-user') + '">' + (demo ? '演示参数' : '你的补栏假设') + '</span></div><div class="cross-result-pair"><div class="cross-result-tile"><p>保本出栏价</p><div class="cross-hero-number">' + fmt(p.valid ? p.breakEvenPrice : null) + '<small>元 / kg</small></div></div><div class="cross-result-tile is-target"><p>含目标收益的所需售价</p><div class="cross-hero-number">' + fmt(p.valid ? p.requiredPrice : null) + '<small>元 / kg</small></div></div></div>';
      if (p.valid) {
        pigletHtml += '<p class="cross-formula">(' + fmt(c.pigletPurchasePrice, 0) + ' + ' + fmt(c.pigletGrowCost, 0) + ' + ' + fmt(c.pigletTargetProfit, 0) + ') ÷ (' + fmt(c.pigletSurvivalPct, 1) + '% × ' + fmt(c.pigletSaleWeight, 1) + ') = ' + fmt(p.requiredPrice) + ' 元/kg</p>';
        pigletHtml += '<div class="piglet-profit-result' + (finite(p.expectedProfit) && p.expectedProfit < 0 ? ' is-negative' : '') + '"><span>假设售价下预期利润</span><strong>' + (finite(p.expectedProfit) ? fmt(p.expectedProfit, 1) + ' <small>元 / 每头买入</small>' : '—') + '</strong></div><p class="cross-profit-note">' + (finite(p.expectedProfit) ? '按你填写的 ' + fmt(c.pigletExpectedSalePrice) + ' 元/kg 售价、' + fmt(c.pigletSurvivalPct, 1) + '% 成活率与 ' + fmt(c.pigletSaleWeight, 1) + ' kg 出栏体重计算。' : '填写“假设出栏售价”可查看每头买入仔猪的预期利润；填 0 时只显示回报门槛。') + '</p>';
      }
      $('piglet-check-result').innerHTML = pigletHtml + crossMessages(p.errors, true) + crossMessages(p.warnings, false);
      asArray(f.errors).concat(asArray(p.errors)).forEach(function (error) { var input = error.key && $('param-' + error.key); if (input) input.setAttribute('aria-invalid', 'true'); });
    }
    $('cross-custom-quarters').innerHTML = [1, 2, 3, 4].map(function (quarter) { return '<div class="cross-custom-quarter"><span>2027 Q' + quarter + '</span><strong>' + fmt(c['customQ' + quarter]) + '</strong><small>元 / kg</small></div>'; }).join('') + '<p class="cross-active-note">' + (c.priceMethod === 'custom' ? '当前主模型正在使用这四个季度价。' : '当前主路径为“' + esc(priceLabel(c.priceMethod)) + '”；采用参照后，上列四个自填价会一起进入主模型，其余季度不会自动沿用当前路线的计算值。') + '</p>';
    updateCrossApplyButtons(checks);
    var ready = !!(state.result && state.result.valid !== false);
    ['cross-save-scenario', 'cross-export-config', 'cross-copy-share'].forEach(function (id) { $(id).disabled = !ready; });
    $('download-crosschecks').disabled = !checks || !M || typeof M.csv !== 'function';
  }

  function applyCrossPrice(kind) {
    var application = crossApplication(kind, currentCrossChecks());
    if (!application.valid) { showToast(application.message, true); return; }
    clearTimeout(timer);
    state.config = application.config;
    state.dirty = true;
    state.preset = '';
    state.hiddenSeries = {};
    renderParameters();
    recalculate();
    persist();
    showToast('已将' + application.label + ' ' + fmt(application.value) + ' 元/kg 作为 2027 Q' + application.quarter + ' 均价假设；其余自填季度值保留。');
  }

  function downloadCrossChecks() {
    var checks = currentCrossChecks();
    if (!checks || typeof M.csv !== 'function') return;
    var result = { config: clone(state.config), crossChecks: checks, assumptions: defs.filter(function (def) { return def.auxiliary; }).map(function (def) { return { label: def.label, value: state.config[def.key], unit: def.unit || '', evidence: 'user' }; }) };
    download('猪周期研究台_市场与补栏对照.csv', '\ufeff' + String(M.csv(result)).replace(/^\ufeff/, ''), 'text/csv;charset=utf-8');
    showToast('对照参数、出处、有效性与计算结果已导出为 CSV。');
  }

  function metricCard(label, value, unit, note, accent, places) {
    return '<article class="metric-card' + (accent ? ' accent-card' : '') + '"><p>' + esc(label) + '</p><div class="metric-number">' + fmt(value, places == null ? 2 : places) + '<span>' + esc(unit) + '</span></div><small>' + esc(note || '') + '</small></article>';
  }

  function renderMetrics() {
    var s = state.result.summary || {}, v = state.result.valuation || {};
    var year = asArray(state.result.monthly).length ? String(state.result.monthly[0].month).slice(0, 4) : '首年';
    $('metric-grid').innerHTML = metricCard(year + ' 年生猪均价', s.annualPrice, '元 / 公斤', '月度价格平均 · Q4 ' + fmt(s.q4Price) + ' 元') + metricCard(year + ' 年归母净利润', s.year1Profit, '亿元', '现金流 ' + fmt(s.year1Cashflow, 1) + ' 亿元 · 当前经营假设', false, 1) + metricCard('每股价值', s.valuePerShare, '元 / 股', (v.label || valueLabel(state.config.valuationMethod)) + ' · 参数情景', true);
  }

  function renderForecast() {
    var monthly = asArray(state.result && state.result.monthly);
    if (!monthly.length) { $('forecast-chart').innerHTML = '<p class="empty-table">当前路径未提供月度价格。</p>'; return; }
    var active = state.config.priceMethod;
    var labels = monthly.map(function (m) { return m.month; });
    var series = state.comparisons.filter(function (c) { return c.result && c.result.valid !== false && asArray(c.result.monthly).length; }).map(function (c) {
      var byMonth = new Map(c.result.monthly.map(function (r) { return [r.month, r.price]; }));
      return { id: c.id, label: c.label, color: COLORS[c.id], values: labels.map(function (m) { return byMonth.get(m); }), active: c.id === active, hidden: !!state.hiddenSeries[c.id], unit: '元 / 公斤' };
    });
    $('forecast-period').textContent = labels[0].slice(0, 4) + ' 年 · 月度推演';
    $('forecast-legend').innerHTML = series.map(function (s) { return '<span class="legend-item' + (s.hidden ? ' is-muted' : '') + '" style="--series-color:' + s.color + '"><span class="legend-line"></span><button type="button" data-toggle-series="' + s.id + '" aria-pressed="' + !s.hidden + '">' + esc(s.label) + (s.active ? ' · 主路径' : '') + '</button></span>'; }).join('');
    drawLineChart($('forecast-chart'), { title: '不同方法下的月度生猪价格', labels: labels, series: series.filter(function (s) { return !s.hidden; }), unitLeft: '元 / 公斤', formatLabel: function (x) { return Number(String(x).slice(5, 7)) + '月'; }, decimals: 1 });
    var quarters = asArray(state.result.quarterly);
    $('quarter-cards').innerHTML = quarters.map(function (q) { return '<div class="quarter-card"><div class="quarter-label"><span>' + esc(String(q.quarter).replace(/^20\d{2}[-\s]?/, '')) + '</span><span>季度均价</span></div><div class="quarter-price">' + fmt(q.price) + '<span>元 / 公斤</span></div><div class="quarter-extra">归母利润 ' + fmt(q.profit, 1) + ' 亿元</div></div>'; }).join('');
    $('forecast-note').textContent = '选中的主路径用于下方利润与估值。其余曲线是同参数下的结构与敏感性对照，不是四个独立概率预测。适用条件请见“方法与来源”。';
    var table = '<table class="data-table"><thead><tr><th>猪价方法</th>' + quarters.map(function (q) { return '<th>' + esc(q.quarter) + '</th>'; }).join('') + '<th>全年均价</th><th>每股价值</th></tr></thead><tbody>';
    state.comparisons.forEach(function (c) {
      var valid = c.result && c.result.valid !== false && !asArray(c.result.errors).length;
      table += '<tr' + (c.id === active ? ' class="is-active-row"' : '') + '><td>' + esc(c.label) + (c.id === active ? ' <span class="cell-note">当前主路径</span>' : '') + '</td>';
      if (valid) {
        quarters.forEach(function (q, i) { var v = asArray(c.result.quarterly)[i]; table += '<td>' + fmt(v && v.price) + '</td>'; });
        table += '<td>' + fmt(c.result.summary && c.result.summary.annualPrice) + '</td><td>' + fmt(c.result.summary && c.result.summary.valuePerShare) + '</td>';
      } else table += '<td colspan="' + (quarters.length + 2) + '" class="wrap-cell">' + esc(asArray(c.result && c.result.errors).map(function (e) { return e.message; }).join('；') || '当前参数下不适用') + '</td>';
      table += '</tr>';
    });
    $('forecast-table').innerHTML = table + '</tbody></table>';
  }

  function renderValuation() {
    var result = state.result, v = result.valuation || {}, s = result.summary || {};
    var details = asArray(v.details).slice(0, 6);
    if (!details.length) details = [{ label: '长期正常猪价', value: s.normalPrice, unit: '元 / 公斤' }, { label: '长期完全成本', value: state.config.longRunCost, unit: '元 / 公斤' }, { label: '股权价值', value: v.equityValue, unit: '亿元' }];
    var content = '<div class="key-value-list">' + (state.config.valuationMethod === 'pe' ? '<div class="key-value"><span>正常利润口径</span><strong>' + esc(normalEarningsLabel(state.config)) + '</strong></div>' : '') + details.map(function (d) { return '<div class="key-value"><span>' + esc(d.label) + '</span><strong>' + (typeof d.value === 'string' ? esc(d.value) : fmt(d.value, d.unit === '%' ? 1 : 2)) + (d.unit ? ' <small>' + esc(d.unit) + '</small>' : '') + '</strong></div>'; }).join('');
    if (finite(v.terminalShare) && state.config.valuationMethod === 'fcfe') content += '<div class="key-value"><span>终值占总现值</span><strong>' + percent(v.terminalShare, 1) + '</strong></div>';
    content += '<div class="key-value is-total"><span>每股价值</span><strong>' + fmt(s.valuePerShare) + ' <small>元</small></strong></div></div>';
    var alternatives = asArray(result.alternatives);
    if (alternatives.length) content += '<details class="data-details"><summary>对照其他估值方法</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>方法</th><th>元 / 股</th></tr></thead><tbody>' + alternatives.map(function (a) { var methodNote = (a.id === 'pe' ? '正常利润口径：' + normalEarningsLabel(state.config) + '。' : '') + (a.note || ''); return '<tr><td>' + esc(a.label || valueLabel(a.id)) + (methodNote ? '<span class="cell-note">' + esc(methodNote) + '</span>' : '') + '</td><td>' + (a.applicable === false ? '不适用' : fmt(a.valuePerShare)) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
    var note = state.config.valuationMethod === 'fcfe' ? '先核对股东现金流，再判断终值。一次周期利润与持续盈利能力需要分别看待。' : state.config.valuationMethod === 'ev_ebitda' ? '此处先计算企业价值，再按模型中的净债务和少数股权参数转换为股权价值。' : '倍数与资本回报是你的估值假设。比较时请同时核对长期利润、增长与风险。';
    if (state.config.valuationMethod === 'pe') note = state.config.normalEarningsMode === 'firstyear' ? '当前将首年情景利润乘以PE，高位年度利润的外推不代表正常利润；后续长期价格仍按独立输入使用。' : state.config.normalEarningsMode === 'roe' ? '正常利润按正常 ROE × 当前归母账面权益计算，再乘以所选 PE。请与 ROE-PB 的回报要求和增长假设一起核对。' : state.config.normalEarningsMode === 'terminal' ? '正常利润以当前商品猪销量和期末单位价差计算，再乘以正常 PE。' : '正常利润以修复后的猪价、完全成本与当前商品猪销量计算，采用修复后的基础成本；再乘以正常 PE。';
    content += '<p class="valuation-caption">' + note + '</p>';
    if (state.config.marketPrice > 0) content += '<div class="implied-price"><span>你输入的股价 ' + fmt(state.config.marketPrice) + ' 元</span><p>' + (finite(s.impliedNormalPrice) ? '在相同 FCFE 假设下，对应长期猪价约 <strong>' + fmt(s.impliedNormalPrice) + '</strong> 元 / 公斤。' : '在模型搜索区间内，未找到匹配的长期猪价。') + '</p></div>';
    if(state.config.valuationMethod==='fcfe')content+='<details class="data-details"><summary>查看逐年成本、折旧与现金流</summary><p class="chart-note">基础成本直接采用设定；折旧已包含在完全成本并在现金桥中加回。未来实际折旧需要资产年限、更新和新增资产明细支持。</p><div class="table-scroll"><table class="data-table"><thead><tr><th>年</th><th>公司价</th><th>基础成本</th><th>利润</th><th>D&amp;A</th><th>必要维护</th><th>FCFE</th></tr></thead><tbody>'+asArray(result.annual).map(function(a){return '<tr><td>'+a.year+'</td>'+['price','cost','profit','da','sustainingCapex','fcfe'].map(function(k){return '<td>'+fmt(a[k])+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div></details>';
    $('valuation-content').innerHTML = content;
  }

  function renderTransmission() {
    var r = state.result, last = asArray(r.monthly).slice(-1)[0] || {}, first = asArray(r.monthly)[0] || {}, s = r.summary || {};
    var capacity = finite(last.effectiveCapacityRatio) ? '有效供应为基期的 <strong>' + percent(last.effectiveCapacityRatio, 1) + '</strong>' : '有效供应由能繁、商品猪产出与体重共同决定';
    var step1 = finite(last.sows) ? '期末对应能繁 <strong>' + fmt(last.sows, 0) + ' 万头</strong>，MSY 为基期的 <strong>' + percent(last.msyRatio, 1) + '</strong>。' : '能繁数量需要结合母猪效率、成活率与商品化率一起解释。';
    var step2 = capacity + '；当期价格还取决于所选方法及需求假设。';
    var step3 = '首年归母利润 <strong>' + fmt(s.year1Profit, 1) + ' 亿元</strong>，对应股东现金流 <strong>' + fmt(s.year1Cashflow, 1) + ' 亿元</strong>。';
    if (state.config.priceMethod === 'cost' && r.cost) { step1 = '当前效率层 <strong>' + esc(r.cost.tier || state.config.marginalTier) + '</strong>，完全成本 <strong>' + fmt(r.cost.fullCost) + ' 元 / 公斤</strong>。'; step2 = '正常资本回报 <strong>' + fmt(r.cost.normalReturn) + ' 元 / 公斤</strong>，合计价格锚 <strong>' + fmt(r.cost.normalPrice) + ' 元 / 公斤</strong>。'; }
    if (state.config.priceMethod === 'custom') step2 = '季度猪价由你直接设定，全年均价为 <strong>' + fmt(s.annualPrice) + ' 元 / 公斤</strong>。';
    var anchorStatus = { observed_or_user_override: '披露记录或用户改值', interpolated_scenario: '由观测间插值得到', weighted_scenario: '按时滞权重合成，包含插值或情景', scenario: '情景输入', user_assumption: '用户假设锚', unavailable: '缺少锚点资料' };
    var content = '';
    if (state.config.priceMethod === 'demand' || state.config.priceMethod === 'capacity') content = '<div class="anchor-summary"><div class="anchor-heading"><span>本次实际使用的锚</span><span class="data-tag ' + (first.baseStatus === 'observed_or_user_override' ? 'tag-fact' : 'tag-assumption') + '">' + (state.config.anchorMode === 'policy' ? '政策假设' : state.config.anchorMode === 'custom' ? '自定锚点' : '观测锚方式') + '</span></div><dl><div><dt>活猪价</dt><dd>' + fmt(first.basePrice) + '<small> 元/kg</small></dd></div><div><dt>零售猪肉价' + (state.config.priceMethod === 'capacity' ? ' · 未用于此路线' : '') + '</dt><dd>' + fmt(first.baseRetail) + '<small> 元/kg</small></dd></div><div><dt>对应能繁</dt><dd>' + fmt(first.baseSows, 1) + '<small> 万头</small></dd></div></dl><p>' + esc(anchorStatus[first.baseStatus] || first.baseStatus || '以模型所用基期为准') + (state.config.anchorMode === 'policy' && state.config.priceMethod === 'demand' ? '；零售锚由政策活猪假设与传导斜率推导，并非观测价。' : '。') + '</p></div>';
    content += chainStep(1, state.config.priceMethod === 'cost' ? '成本从效率而来' : '能繁转成可售商品猪', step1) + chainStep(2, state.config.priceMethod === 'cost' ? '资本需要正常回报' : '供应再传导到猪价', step2) + chainStep(3, '利润还要变成现金', step3);
    if (state.config.priceMethod === 'demand' || state.config.priceMethod === 'capacity') {
      var efficiencyText = state.config.productivityMode === 'direct' ? '直接 MSY：基期 ' + fmt(state.config.msyBase, 2) + ' 头，一年后 ' + fmt(state.config.msyTarget, 2) + ' 头；已包含繁殖、成活与商品化结构，不再重复相乘。' : state.config.productivityMode === 'flat' ? '效率不变：商品猪 MSY 相对基期固定为 1；PSY 与结构改善输入不生效。' : '基期结构：PSY ' + fmt(state.config.psyBase, 1) + ' × 断奶后成活 ' + fmt(state.config.survivalBase, 1) + '% × 商品化 ' + fmt(state.config.commercialBase, 1) + '% × 有效经产占比 ' + fmt(state.config.activeSowRatioBase, 1) + '%。这些结构比例是情景输入。';
      if (state.config.capacityMetric === 'heads') efficiencyText = '当前只用母猪头数计量产能，MSY 与体重变化没有进入供给。';
      content += '<details class="data-details"><summary>PSY 如何转成商品猪 MSY？</summary><p class="chart-note">' + esc(efficiencyText) + '</p><div class="efficiency-equation compact-equation">PSY × 断奶后成活 × 商品化 × 有效经产占比</div></details>';
    }
    if (r.cost && asArray(r.cost.components).length) content += '<details class="data-details"><summary>查看边际效率层的成本构成</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>分项</th><th>元 / 公斤</th></tr></thead><tbody>' + r.cost.components.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td>' + fmt(c.value) + '</td></tr>'; }).join('') + '<tr><th>完全成本合计</th><td>' + fmt(r.cost.fullCost) + '</td></tr></tbody></table></div><p class="chart-note">以神农披露的分项作结构校准，当前数值随效率和饲料等假设变化。各效率层不代表全国真实占比。</p></details>';
    $('transmission-content').innerHTML = content;
  }
  function chainStep(number, title, body) { return '<div class="chain-step"><span class="chain-index">' + number + '</span><h4>' + esc(title) + '</h4><p>' + body + '</p></div>'; }

  function renderModelNotes() {
    var notes = asArray(state.result.warnings).map(function (w) { return { text: w.message || textOf(w) }; });
    var diagnostics = state.result.diagnostics || {};
    if (diagnostics.probabilityNote) notes.push({ text: diagnostics.probabilityNote, info: true });
    if (state.config.priceMethod === 'capacity' && state.result.calibration && state.result.calibration.note) notes.push({ text: state.result.calibration.note, info: true });
    var noteMarkup = function (n) { return '<div class="model-note' + (n.info ? ' info' : '') + '"><span class="note-symbol" aria-hidden="true">i</span><p>' + esc(n.text) + '</p></div>'; };
    $('model-notes').innerHTML = notes.slice(0, 3).map(noteMarkup).join('') + (notes.length > 3 ? '<details class="additional-notes"><summary>其余 ' + (notes.length - 3) + ' 项口径与敏感性说明</summary><div>' + notes.slice(3).map(noteMarkup).join('') + '</div></details>' : '');
  }

  function niceScale(values, ticks) {
    var data = values.filter(finite);
    if (!data.length) return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    if (min === max) { var pad0 = Math.max(Math.abs(min) * 0.12, 1); min -= pad0; max += pad0; }
    else { var pad = (max - min) * 0.15; min -= pad; max += pad; }
    var rawStep = (max - min) / (ticks || 4), magnitude = Math.pow(10, Math.floor(Math.log10(rawStep))), fraction = rawStep / magnitude;
    var step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * magnitude;
    min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
    var list = []; for (var x = min, count = 0; x <= max + step / 10 && count < 12; x += step, count++) list.push(x);
    return { min: min, max: max, ticks: list };
  }

  function drawLineChart(container, opts) {
    var labels = opts.labels || [], series = opts.series || [];
    if (!labels.length || !series.some(function (s) { return s.values.some(finite); })) { container.innerHTML = '<div class="empty-table calculation-empty">暂无可绘制的数据。缺失值不会被补成预测。</div>'; return; }
    var width = Math.max(300, Math.round(container.getBoundingClientRect().width || 740));
    var height = opts.height || (width < 520 ? 235 : 275);
    var dual = series.some(function (s) { return s.axis === 'right'; });
    var margin = { left: width < 400 ? 35 : 43, right: dual ? 42 : 16, top: 28, bottom: 34 };
    var pw = width - margin.left - margin.right, ph = height - margin.top - margin.bottom;
    var left = niceScale(series.filter(function (s) { return s.axis !== 'right'; }).flatMap(function (s) { return s.values; }), 4);
    var right = dual ? niceScale(series.filter(function (s) { return s.axis === 'right'; }).flatMap(function (s) { return s.values; }), 4) : left;
    var xp = function (i) { return margin.left + (labels.length === 1 ? pw / 2 : i / (labels.length - 1) * pw); };
    var yp = function (value, axis) { var scale = axis === 'right' ? right : left; return margin.top + ph - (value - scale.min) / (scale.max - scale.min) * ph; };
    var tickFormat = function (n, axis) { if (axis === 'right' || Math.abs(n) < 100) return fmt(n, opts.decimals == null ? 1 : opts.decimals); return fmt(n, 0); };
    var chart = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(opts.title || '数据曲线') + '"><title>' + esc(opts.title || '数据曲线') + '</title>';
    chart += '<text x="' + margin.left + '" y="12" fill="#8fa0ab" font-size="9">' + esc(opts.unitLeft || '') + '</text>';
    if (dual) chart += '<text x="' + (width - margin.right) + '" y="12" fill="#9b8b7c" text-anchor="end" font-size="9">' + esc(opts.unitRight || '') + '</text>';
    left.ticks.forEach(function (t) { var y = yp(t); chart += '<line x1="' + margin.left + '" x2="' + (width - margin.right) + '" y1="' + y + '" y2="' + y + '" stroke="#e7eef0" stroke-width="1"' + (t === left.min ? '' : ' stroke-dasharray="3 4"') + '/><text x="' + (margin.left - 9) + '" y="' + (y + 3) + '" fill="#94a4ae" font-size="9" text-anchor="end">' + tickFormat(t) + '</text>'; });
    if (dual) right.ticks.forEach(function (t) { chart += '<text x="' + (width - margin.right + 9) + '" y="' + (yp(t, 'right') + 3) + '" fill="#a99989" font-size="9" text-anchor="start">' + tickFormat(t, 'right') + '</text>'; });
    var labelMax = width < 420 ? 5 : width < 700 ? 7 : 12;
    var interval = Math.max(1, Math.ceil((labels.length - 1) / (labelMax - 1)));
    labels.forEach(function (l, i) { if (i % interval !== 0 && i !== labels.length - 1) return; if (i === labels.length - 1 && i % interval !== 0 && i - Math.floor(i / interval) * interval < interval * .55) return; var label = opts.formatLabel ? opts.formatLabel(l, i) : l; chart += '<text x="' + xp(i) + '" y="' + (height - 10) + '" fill="#96a5ae" font-size="9" text-anchor="middle">' + esc(label) + '</text>'; });
    series.slice().sort(function (a, b) { return Number(!!a.active) - Number(!!b.active); }).forEach(function (s) {
      var path = '', inSegment = false;
      s.values.forEach(function (value, i) { if (!finite(value)) { inSegment = false; return; } path += (inSegment ? ' L ' : ' M ') + xp(i).toFixed(2) + ' ' + yp(value, s.axis).toFixed(2); inSegment = true; });
      chart += '<path d="' + path + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.active ? 3 : 1.65) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (s.active ? 1 : .78) + '"' + (s.dashed ? ' stroke-dasharray="5 4"' : '') + '/>';
      // A one-point segment produces only an SVG move command and has no visible stroke.
      // Preserve gaps while making every isolated observation visible in long histories.
      s.values.forEach(function (value, i) {
        if (!finite(value)) return;
        var isolated = !finite(s.values[i - 1]) && !finite(s.values[i + 1]);
        if (labels.length <= 14 || isolated) chart += '<circle cx="' + xp(i) + '" cy="' + yp(value, s.axis) + '" r="' + (s.active ? 3.2 : 2) + '" fill="#fff" stroke="' + s.color + '" stroke-width="' + (s.active ? 1.8 : 1.2) + '"/>';
      });
    });
    chart += '<line data-hover-line x1="0" x2="0" y1="' + margin.top + '" y2="' + (height - margin.bottom) + '" stroke="#92a8b5" stroke-dasharray="3 3" visibility="hidden"/><rect data-chart-hit x="' + margin.left + '" y="' + margin.top + '" width="' + pw + '" height="' + ph + '" fill="transparent"/></svg><div class="chart-tooltip" hidden></div>';
    container.innerHTML = chart;
    var hit = container.querySelector('[data-chart-hit]'), svg = container.querySelector('svg'), tooltip = container.querySelector('.chart-tooltip'), hoverLine = container.querySelector('[data-hover-line]');
    hit.addEventListener('pointermove', function (event) {
      var rect = svg.getBoundingClientRect(), localX = (event.clientX - rect.left) / rect.width * width;
      var i = Math.max(0, Math.min(labels.length - 1, Math.round((localX - margin.left) / pw * (labels.length - 1))));
      hoverLine.setAttribute('x1', xp(i)); hoverLine.setAttribute('x2', xp(i)); hoverLine.setAttribute('visibility', 'visible');
      tooltip.innerHTML = '<strong>' + esc(labels[i]) + '</strong>' + series.map(function (s) { return '<div><span style="color:' + s.color + '">●</span> ' + esc(s.label) + '　' + fmt(s.values[i], s.axis === 'left' ? 0 : 2) + (s.unit ? ' <small>' + esc(s.unit) + '</small>' : '') + '</div>'; }).join('');
      tooltip.hidden = false;
      var tooltipX = xp(i) / width * rect.width + 12;
      if (tooltipX + tooltip.offsetWidth > rect.width - 4) tooltipX = Math.max(0, xp(i) / width * rect.width - tooltip.offsetWidth - 12);
      tooltip.style.left = tooltipX + 'px'; tooltip.style.top = '24px';
    });
    hit.addEventListener('pointerleave', function () { tooltip.hidden = true; hoverLine.setAttribute('visibility', 'hidden'); });
  }

  function openScenarioDialog() {
    if (!state.result) return;
    if (state.scenarios.length >= 10) { showToast('最多保存 10 个对比情景。请先移除不再需要的情景。'); return; }
    $('scenario-name').value = state.name === '我的猪周期判断' ? priceLabel(state.config.priceMethod) + '情景 ' + (state.scenarios.length + 1) : state.name;
    if ($('scenario-dialog').showModal) $('scenario-dialog').showModal(); else $('scenario-dialog').setAttribute('open', '');
    setTimeout(function () { $('scenario-name').focus(); $('scenario-name').select(); }, 30);
  }
  function closeScenarioDialog() { if ($('scenario-dialog').close) $('scenario-dialog').close(); else $('scenario-dialog').removeAttribute('open'); }
  function saveScenario(event) {
    event.preventDefault();
    var name = $('scenario-name').value.trim();
    if (!name || !state.result) return;
    state.scenarios.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.slice(0, 40), config: clone(state.config), weight: null });
    closeScenarioDialog(); persist(); renderScenarios();
    showToast('“' + name + '”已加入情景对比。');
  }

  function scenarioResults() {
    return state.scenarios.map(function (s) { try { return { scenario: s, result: M.calculate(s.config, DATA) }; } catch (_) { return { scenario: s, result: { valid: false } }; } });
  }

  function renderScenarios() {
    var list = scenarioResults();
    $('scenario-count').textContent = list.length + ' 个情景';
    $('scenario-empty').hidden = list.length > 0;
    $('subjective-weights').hidden = list.length < 2;
    if (!list.length) { $('scenario-comparison').innerHTML = ''; $('weights-inputs').innerHTML = ''; $('weighted-result').innerHTML = ''; return; }
    var rows = [
      ['猪价路径', function (x) { return priceLabel(x.scenario.config.priceMethod); }],
      ['估值方法', function (x) { return valueLabel(x.scenario.config.valuationMethod); }],
      ['PE 正常利润口径', function (x) { return normalEarningsLabel(x.scenario.config); }],
      ['全年猪价 · 元 / kg', function (x) { return fmt(x.result.summary && x.result.summary.annualPrice); }],
      ['Q4 猪价 · 元 / kg', function (x) { return fmt(x.result.summary && x.result.summary.q4Price); }],
      ['长期猪价 · 元 / kg', function (x) { return fmt(x.result.summary && x.result.summary.normalPrice); }],
      ['归母利润 · 亿元', function (x) { return fmt(x.result.summary && x.result.summary.year1Profit, 1); }],
      ['股东现金流 · 亿元', function (x) { return fmt(x.result.summary && x.result.summary.year1Cashflow, 1); }],
      ['每股价值 · 元', function (x) { return fmt(x.result.summary && x.result.summary.valuePerShare); }]
    ];
    var html = '<table class="data-table scenario-table"><thead><tr><th>同一口径比较</th>' + list.map(function (x) { return '<th><span class="scenario-name">' + esc(x.scenario.name) + '</span><span class="scenario-header-actions"><button type="button" class="table-action" data-load-scenario="' + x.scenario.id + '">载入</button><button type="button" class="table-action delete" data-delete-scenario="' + x.scenario.id + '">移除</button></span></th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (row, index) { html += '<tr' + (index === rows.length - 1 ? ' class="scenario-value-row"' : '') + '><th>' + esc(row[0]) + '</th>' + list.map(function (x) { return '<td>' + (x.result.valid === false ? '参数需更新' : esc(row[1](x))) + '</td>'; }).join('') + '</tr>'; });
    $('scenario-comparison').innerHTML = html + '</tbody></table>';
    var focused = document.activeElement && document.activeElement.dataset.weight;
    if (!focused) $('weights-inputs').innerHTML = state.scenarios.map(function (s) { return '<div class="weight-field"><label for="weight-' + s.id + '">' + esc(s.name) + '</label><div class="input-with-unit"><input type="number" inputmode="decimal" id="weight-' + s.id + '" data-weight="' + s.id + '" min="0" max="100" step="1" placeholder="未设定" value="' + (finite(s.weight) ? s.weight : '') + '"><span class="input-unit">%</span></div></div>'; }).join('');
    renderWeightedResult(list);
  }

  function renderWeightedResult(list) {
    list = list || scenarioResults();
    var total = list.reduce(function (sum, x) { return sum + (finite(x.scenario.weight) ? x.scenario.weight : 0); }, 0);
    if (list.length < 2 || list.some(function (x) { return !finite(x.scenario.weight) || x.scenario.weight < 0 || x.scenario.weight > 100 || x.result.valid === false; }) || Math.abs(total - 100) > .000001) { $('weighted-result').textContent = '填写每个情景的非负主观权重，并使合计达到 100%，才显示加权结果。当前合计 ' + fmt(total, 1) + '%。'; return; }
    var weighted = function (key) { var values = list.map(function (x) { return x.result.summary && x.result.summary[key]; }); if (!values.every(finite)) return null; return list.reduce(function (sum, x, i) { return sum + values[i] * x.scenario.weight / total; }, 0); };
    $('weighted-result').innerHTML = '按你的主观权重：每股价值 <strong>' + fmt(weighted('valuePerShare')) + '</strong> 元，全年猪价 <strong>' + fmt(weighted('annualPrice')) + '</strong> 元 / 公斤。<br><span>合计 100%；这是个人判断的加权展示，不是模型识别的概率。</span>';
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, config: M.serialize(state.config), name: state.name, scenarios: state.scenarios.map(function (s) { return { id: s.id, name: s.name, serialized: M.serialize(s.config), weight: finite(s.weight) ? s.weight : null }; }) })); }
    catch (_) { /* Offline or private browser storage may be unavailable; export still works. */ }
  }

  function restore() {
    var stored;
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { stored = null; }
    if (stored && stored.version === 1) {
      try { state.config = M.deserialize(stored.config); state.name = typeof stored.name === 'string' ? stored.name.slice(0, 40) : state.name; } catch (_) { state.config = clone(M.DEFAULTS); }
      state.scenarios = asArray(stored.scenarios).slice(0, 10).map(function (s, i) {
        try { return { id: 'restored' + i, name: String(s.name || '保存情景 ' + (i + 1)).slice(0, 40), config: M.deserialize(s.serialized), weight: finite(s.weight) && s.weight >= 0 ? s.weight : null }; } catch (_) { return null; }
      }).filter(Boolean);
    }
    readSharedConfig(false);
  }

  function readSharedConfig(repaint) {
    var hash = location.hash.replace(/^#/, ''), token = null;
    if (hash.startsWith('config=')) token = new URLSearchParams(hash).get('config');
    if (!token) return;
    try { var config = M.deserialize(token); if (repaint) applyConfig(config, '分享链接中的推演'); else { state.config = config; state.name = '分享链接中的推演'; } showToast('已载入链接中的参数。'); }
    catch (error) { showToast('分享链接无效：' + (error.message || '参数未通过校验。'), true); }
  }

  function download(name, content, type) {
    var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportConfig() {
    var exported = { tool: 'Pig Cycle Lab', schemaVersion: 1, modelVersion: M.VERSION || DATA.meta && DATA.meta.version || '', dataAsOf: DATA.meta && DATA.meta.asOf || '', name: state.name, exportedAt: new Date().toISOString(), config: clone(state.config) };
    download('猪周期研究台_推演配置.json', JSON.stringify(exported, null, 2), 'application/json;charset=utf-8');
    showToast('完整参数配置已导出。');
  }

  function decodeImportedConfig(raw) {
    if (typeof raw === 'string') return M.deserialize(raw, DATA);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('应导入一个参数对象。');
    if (raw.schemaVersion != null && raw.schemaVersion !== 1) throw new Error('配置格式版本不兼容。');
    if (!raw.config && typeof raw.serialized === 'string') return M.deserialize(raw.serialized, DATA);
    var patch = raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config) ? raw.config : raw;
    var version = raw.modelVersion || (raw.config && typeof raw.version === 'string' ? raw.version : M.VERSION);
    var encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ version: version, config: patch })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return M.deserialize(encoded, DATA);
  }

  function importConfig(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('配置文件过大，请选择小于 2 MB 的 JSON。', true); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(reader.result), config = decodeImportedConfig(raw);
        applyConfig(config, typeof raw.name === 'string' ? raw.name.slice(0, 40) : '导入的推演');
        showView('simulation');
        showToast('配置已导入并重新计算。');
      } catch (error) { showToast('导入失败：' + (error.message || '文件格式不正确。'), true); }
      $('config-file').value = '';
    };
    reader.onerror = function () { showToast('无法读取这个文件，请重新选择。', true); };
    reader.readAsText(file, 'UTF-8');
  }

  async function copyShare() {
    try {
      var url = new URL(location.href); url.hash = 'config=' + M.serialize(state.config);
      var text = url.href, copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) { try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { /* Fall through to a local, user-triggered copy. */ } }
      if (!copied) { var box = document.createElement('textarea'); box.value = text; box.setAttribute('readonly', ''); box.style.position = 'fixed'; box.style.opacity = '0'; document.body.appendChild(box); box.select(); copied = document.execCommand('copy'); box.remove(); }
      if (!copied) { window.prompt('请复制下面的推演链接：', text); return; }
      showToast(location.protocol === 'file:' ? '本地推演链接已复制。跨设备分享时，请导出 JSON 配置。' : '推演链接已复制，对方打开即可复现当前参数。');
    } catch (error) { showToast('无法生成分享链接：' + error.message, true); }
  }

  function downloadResults() {
    if (!state.result) return;
    var current = M.calculate(state.config, DATA);
    if (!current || current.valid === false) { showToast('请先修正主模型参数，再导出推演结果。', true); return; }
    var csv;
    if (typeof M.csv === 'function') csv = M.csv(current);
    else {
      var rows = [['月份', '对应能繁月份', '能繁_万头', 'MSY_相对基期', '有效供应_相对基期', '猪价_元每公斤']].concat(asArray(current.monthly).map(function (m) { return [m.month, m.sourceMonth, m.sows, m.msyRatio, m.effectiveCapacityRatio, m.price]; }));
      csv = rows.map(function (row) { return row.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    }
    download('猪周期研究台_推演结果.csv', '\ufeff' + String(csv).replace(/^\ufeff/, ''), 'text/csv;charset=utf-8');
    showToast('当前推演结果已导出为 CSV。');
  }

  function addMonths(month, offset) {
    var m = /^(\d{4})-(\d{2})/.exec(String(month));
    if (!m) return month;
    var date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + offset, 1));
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  }

  function renderHistory() {
    var selectedSeries = state.config.priceSeries || 'mara';
    var history = asArray(DATA.history).filter(function (r) { return /^\d{4}-\d{2}/.test(String(r.month)) && r.priceSeries === selectedSeries; }).slice().sort(function (a, b) { return a.month.localeCompare(b.month); });
    if (state.historyRange === 'five' && history.length) { var firstMonth = addMonths(history[history.length - 1].month, -59); history = history.filter(function (r) { return r.month >= firstMonth; }); }
    document.querySelectorAll('[data-history-series]').forEach(function (button) { var active = button.dataset.historySeries === selectedSeries; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    document.querySelectorAll('[data-history-range]').forEach(function (button) { var active = button.dataset.historyRange === state.historyRange; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    if (!history.length) {
      $('history-chart').innerHTML = '<p class="empty-table calculation-empty">历史数据尚未载入。此处保留为空，不以模拟数据代替历史。</p>';
      $('history-table').innerHTML = '<p class="empty-table">暂无原始月度记录。</p>';
      $('history-legend').innerHTML = '';
    } else {
      var lag = state.historyLagged ? Number(state.config.lagMonths || 10) : 0;
      var map = new Map();
      history.forEach(function (r) {
        if (!map.has(r.month)) map.set(r.month, { month: r.month, sows: null, price: null });
        map.get(r.month).price = finite(r.price) ? r.price : null;
        var sowMonth = addMonths(r.month, lag);
        if (!map.has(sowMonth)) map.set(sowMonth, { month: sowMonth, sows: null, price: null });
        map.get(sowMonth).sows = finite(r.sows) && r.sowsUnit !== 'index' ? r.sows : null;
      });
      var months = Array.from(map.keys()).sort(), start = months[0], end = months[months.length - 1], labels = [];
      for (var cur = start, guard = 0; cur <= end && guard < 700; cur = addMonths(cur, 1), guard++) labels.push(cur);
      var series = [{ id: 'sows', label: lag ? '能繁后移 ' + lag + ' 个月' : '能繁母猪', color: COLORS.sows, axis: 'left', active: true, unit: '万头', values: labels.map(function (m) { return map.has(m) ? map.get(m).sows : null; }) }, { id: 'price', label: '生猪均价', color: COLORS.price, axis: 'right', active: true, unit: '元 / 公斤', values: labels.map(function (m) { return map.has(m) ? map.get(m).price : null; }) }];
      $('history-legend').innerHTML = series.map(function (s) { return '<span class="legend-item" style="--series-color:' + s.color + '"><span class="legend-line"></span>' + esc(s.label) + (s.axis === 'left' ? ' · 左轴' : ' · 右轴') + '</span>'; }).join('');
      drawLineChart($('history-chart'), { title: '能繁母猪与生猪均价的历史月度曲线', labels: labels, series: series, unitLeft: '能繁 · 万头', unitRight: '生猪均价 · 元 / 公斤', height: window.innerWidth < 700 ? 275 : 340, formatLabel: function (m) { return m; }, decimals: 0 });
      $('history-description').textContent = (selectedSeries === 'ndrc' ? '发改委全国生猪出场价' : '农业农村部集贸生猪价') + ' · ' + history[0].month + ' — ' + history[history.length - 1].month + ' · ' + history.length + ' 条月度记录';
      $('history-note').textContent = lag ? '只将已披露能繁记录后移 ' + lag + ' 个月进行观察；右侧延伸不代表新增历史价格。两条曲线采用不同纵轴，接近或交叉没有数值上的直接含义。' : '两条曲线采用不同纵轴，接近或交叉没有数值上的直接含义。月末能繁存栏与月均猪价的统计时点不同。';
      $('history-note').textContent += ' 孤立观测以圆点显示，缺失月份不连线。';
      if (history.some(function (r) { return finite(r.oldSowIndex); })) $('history-note').textContent += ' 旧监测指数在下表单列，不接到全国万头曲线上。';
      $('history-table').innerHTML = '<table class="data-table"><thead><tr><th>原始月份</th><th>能繁 · 万头</th><th>旧监测指数</th><th>生猪价 · 元 / kg</th><th>数据口径</th><th>来源</th></tr></thead><tbody>' + history.map(function (r) { return '<tr><td>' + esc(r.month) + '</td><td>' + (r.sowsUnit === 'index' ? '—' : fmt(r.sows, 0)) + '</td><td>' + fmt(r.oldSowIndex, 2) + '</td><td>' + fmt(r.price) + '</td><td>' + esc(regimeLabel(r.regime)) + '</td><td><span class="inline-sources">' + sourceButtons(r.sourceIds) + '</span></td></tr>'; }).join('') + '</tbody></table>';
    }
    $('history-lagged').textContent = '能繁后移 ' + Number(state.config.lagMonths || 10) + ' 个月';
    renderCycles(); renderCompanyHistory(); renderUS(); renderPsyBenchmarks();
  }

  function regimeLabel(regime) { return ({ old_2015_2016: '旧监测 · 2015基期', old_2018_2019: '旧监测 · 样本调整后', national_recent: '全国能繁统计', post_asf_national: '复产后全国统计', ASF: '非瘟特殊期', pre_asf_old_monitor: '非瘟前旧监测' })[regime] || regime || '原始披露'; }

  function renderPsyBenchmarks() {
    var rows = asArray(DATA.psyBenchmarks);
    var labels = { annual_mean_or_reported_level: '年度均值 / 报告水平', monthly_annualized: '单月水平折年', top_decile_group_mean: '前 10% 组均值', annual_sample_mean: '年度样本均值', '90th_percentile_threshold_not_group_mean': 'P90 分位门槛', top_quartile_group_median: '前 25% 组内中位数', top_5_farms_mean: '前 5 场均值', top_third_group_mean: '前 1/3 组均值', media_reference_with_unspecified_denominator: '媒体参照 · 分母未统一' };
    $('psy-benchmark-summary').textContent = '查看中国与国际 ' + rows.length + ' 项生产效率参照';
    $('psy-benchmark-table').innerHTML = rows.length ? '<table class="data-table"><thead><tr><th>地区 / 主体与期间</th><th>PSY · 头</th><th>分母与样本范围</th><th>统计性质</th><th>来源</th></tr></thead><tbody>' + rows.map(function (r) { var url = safeUrl(r.source_url); return '<tr><td>' + esc(r.label) + '</td><td>' + fmt(r.value, 2) + '</td><td class="wrap-cell">' + esc(r.scope || '') + '</td><td>' + esc(labels[r.statistic] || r.statistic || '') + '</td><td>' + (url ? '<a class="source-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">原文 ↗</a>' : '—') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty-table">生产效率基准资料待补充。</p>';
  }

  function renderCycles() {
    var cycles = asArray(DATA.cycles), calibrated = asArray(state.result && state.result.calibration && state.result.calibration.cycles);
    if (!cycles.length) { $('cycle-comparison').innerHTML = '<p class="empty-table">周期端点资料待补充，暂不生成振幅比较。</p>'; $('cycle-notes').innerHTML = ''; return; }
    var rows = cycles.map(function (c) {
      var cal = calibrated.find(function (x) { return x.id === c.id; }) || {};
      var sowChange = finite(cal.sowChange) ? cal.sowChange : finite(c.sowStart) && finite(c.sowEnd) && c.sowStart > 0 ? c.sowEnd / c.sowStart - 1 : null;
      var priceChange = finite(cal.priceChange) ? cal.priceChange : finite(c.priceLow) && finite(c.priceHigh) && c.priceLow > 0 ? c.priceHigh / c.priceLow - 1 : null;
      var eligible = cal.eligible == null ? c.eligible : cal.eligible;
      return '<tr><td>' + esc(c.label || c.id) + '<span class="cell-note">' + esc([c.priceSeries ? c.priceSeries.toUpperCase() : '', regimeLabel(c.regime)].filter(Boolean).join(' · ')) + '</span></td><td>' + esc(c.startMonth || '—') + ' → ' + esc(c.endMonth || '—') + '<span class="cell-note">' + fmt(c.sowStart, c.unit === 'index' ? 1 : 0) + ' → ' + fmt(c.sowEnd, c.unit === 'index' ? 1 : 0) + ' ' + (c.unit === 'index' ? '指数' : '万头') + '</span></td><td>' + percent(sowChange, 1, true) + '</td><td>' + percent(cal.effectiveChange, 1, true) + '</td><td>' + fmt(c.priceLow) + ' → ' + fmt(c.priceHigh) + '<span class="cell-note">' + esc(c.priceLowMonth || '') + ' → ' + esc(c.priceHighMonth || '') + '</span></td><td>' + percent(priceChange, 1, true) + '</td><td>' + (finite(cal.beta) ? fmt(cal.beta, 2) : '—') + '</td><td class="wrap-cell"><span class="data-tag ' + (eligible ? 'tag-fact' : 'tag-user') + '">' + (eligible ? '可作类比' : '暂不纳入') + '</span><span class="cell-note">' + esc(cal.note || textOf(c.limitations)) + '</span><span class="inline-sources">' + sourceButtons(c.sourceIds) + '</span></td></tr>';
    });
    $('cycle-comparison').innerHTML = '<table class="data-table"><thead><tr><th>周期</th><th>能繁去化区间</th><th>能繁变化</th><th>有效产能变化</th><th>猪价低点 → 高点</th><th>猪价涨幅</th><th>振幅系数</th><th>可比性与来源</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    var note = state.result && state.result.calibration && state.result.calibration.note || '不同统计制度、疫病冲击与价格端点会影响可比性。有效产能未收缩的区间，不能据此产生正的去化振幅系数。';
    $('cycle-notes').innerHTML = '<div class="model-note info"><span class="note-symbol" aria-hidden="true">i</span><p>' + esc(note) + '</p></div>';
  }

  function renderCompanyHistory() {
    var history = asArray(DATA.companyHistory);
    if (!history.length) { $('company-history').innerHTML = '<p class="empty-table">企业历史财务资料待补充。</p>'; return; }
    $('company-history').innerHTML = '<table class="data-table"><thead><tr><th>期间</th><th>收入</th><th>归母利润</th><th>经营现金流</th><th>资本开支</th><th>净资产</th><th>披露 ROE</th></tr><tr class="table-unit-row"><th>金额：亿元</th><th colspan="6">原披露口径 · 不把经营现金流直接当成 FCFE</th></tr></thead><tbody>' + history.map(function (r) { return '<tr><td>' + esc(r.year || r.period) + '<span class="inline-sources">' + sourceButtons(r.sourceIds) + '</span></td><td>' + fmt(r.revenue, 1) + '</td><td>' + fmt(r.netProfit, 1) + '</td><td>' + fmt(r.ocf, 1) + '</td><td>' + fmt(r.capex, 1) + '</td><td>' + fmt(r.equity, 1) + '</td><td>' + (finite(r.roePct) ? fmt(r.roePct, 1) + '%' : '—') + '</td></tr>'; }).join('') + '</tbody></table><p class="chart-note">ROE 为公司披露的加权平均口径，不以利润除以年末净资产替代。缺失资本开支与历史 PE 不补值。</p>';
  }

  function renderUS() {
    var data = asArray(DATA.usComparables);
    if (!data.length) { $('us-comparables').innerHTML = '<p class="empty-table">美国企业的可比资料待补充，不预设可直接套用的估值倍数。</p>'; return; }
    $('us-comparables').innerHTML = data.map(function (c) {
      var metrics = asArray(c.metrics);
      var name = c.name || c.company || c.title || c.ticker || '可比公司';
      var content = '<article class="us-company"><div class="us-company-heading"><div><h4>' + esc(name) + '</h4><div class="ticker">' + esc([c.ticker, c.period || c.asOf].filter(Boolean).join(' · ')) + '</div></div><span class="small-pill">' + esc(c.category || c.businessType || '经营背景对照') + '</span></div>';
      content += '<p>' + esc(textOf(c.scope || c.business || c.description || c.logic)) + '</p>';
      if (metrics.length) content += '<div class="us-metrics">' + metrics.map(function (m) { return '<span><small>' + esc(m.label) + '</small><strong>' + esc(finite(m.value) ? fmt(m.value) : m.value) + ' ' + esc(m.unit || '') + '</strong></span>'; }).join('') + '</div>';
      if (c.valuation || c.method || c.useFor) content += '<p><strong>可借鉴：</strong>' + esc(textOf(c.valuation || c.method || c.useFor)) + '</p>';
      if (c.limitations || c.limits || c.caveats) content += '<p><strong>差异：</strong>' + esc(textOf(c.limitations || c.limits || c.caveats)) + '</p>';
      var history = asArray(c.history);
      if (history.length) content += '<details class="data-details"><summary>查看 ' + history.length + ' 年财务记录 · 美元百万</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>财年</th><th>收入</th><th>归母利润</th><th>经营现金流</th><th>固定资产支出</th><th>历史 PE</th></tr></thead><tbody>' + history.map(function (h) { return '<tr><td>' + esc(h.fiscal_year || h.year) + '</td><td>' + fmt(h.revenue_usd_m, 1) + '</td><td>' + fmt(h.net_income_parent_usd_m, 1) + '</td><td>' + fmt(h.cash_from_operations_usd_m, 1) + '</td><td>' + fmt(h.ppe_cash_capex_usd_m, 1) + '</td><td>' + fmt(h.historical_pe, 1) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
      content += '<div class="inline-sources">' + sourceButtons(c.sourceIds) + '</div></article>';
      return content;
    }).join('');
  }

  function renderMethods() {
    var methods = asArray(DATA.methods);
    function matching(id, type) {
      var aliases = { fcfe: 'value_fcfe', pe: 'value_pe', ev_ebitda: 'value_ev', roe_pb: 'value_pb' };
      return methods.find(function (m) { var mid = m.id || ''; return (mid === id || mid === type + '_' + id || mid === aliases[id] || m.modelKey === id) && m.status !== 'candidate'; });
    }
    $('price-method-cards').innerHTML = PRICE_METHODS.map(function (m, i) { return methodCard(Object.assign({}, m, matching(m.id, 'price') || {}), i + 1); }).join('');
    $('valuation-method-cards').innerHTML = VALUE_METHODS.map(function (m, i) { return methodCard(Object.assign({}, m, matching(m.id, 'valuation') || {}), i + 1); }).join('');
    var reverseMethod = methods.find(function (m) { return m.id === 'value_reverse'; });
    if (reverseMethod) $('valuation-method-cards').innerHTML += '<div class="reverse-method-wrap">' + methodCard(reverseMethod, 5) + '</div>';
    var candidates = methods.filter(function (m) { return m.status === 'candidate'; });
    var appendCandidates = function (target, category, prefix) {
      var items = candidates.filter(function (m) { return m.category === category || String(m.id || '').startsWith(prefix); });
      if (items.length) $(target).innerHTML += '<div class="method-candidate-group"><div class="method-subheading"><span class="data-tag tag-analogy">候选方法</span><p>可用于交叉判断；所需资料未齐时，暂不生成计算结果。</p></div><div class="method-cards candidate-method-cards">' + items.map(function (m, i) { return methodCard(m, i + 1); }).join('') + '</div></div>';
    };
    appendCandidates('price-method-cards', '猪价', 'price_');
    appendCandidates('valuation-method-cards', '估值', 'value_');
    var claims = asArray(DATA.claims);
    if (!claims.length) claims = [
      { title: 'PSY 与商品猪 MSY 需要衔接', text: '断奶仔猪还要经过育肥成活、商品化与母猪分母口径调整，才能对应市场可售商品猪。' },
      { title: '高位利润与正常利润分开判断', text: '周期高价会推高一年的利润，长期价值还取决于价格回归、成本优势与再投资。' },
      { title: '现金流与估值口径必须匹配', text: 'FCFE 采用股权口径；企业价值倍数需要进一步扣除相应债务和其他资本索取权。' },
      { title: '情景不自带客观概率', text: '公开数据并不直接识别未来状态的发生概率。你可以另行填写自己的主观权重。' }
    ];
    $('model-claims').innerHTML = claims.map(function (c) { return '<article class="claim-item"><h4>' + esc(c.title || c.judgment || c.label || '模型口径') + '</h4>' + (c.status ? '<p class="claim-verdict">' + esc(c.status) + '</p>' : '') + '<p>' + esc(textOf(c.text || c.body || c.description || c.message || c.claim || c.evidence || c)) + '</p>' + (c.limitations ? '<p class="claim-limit">' + esc(textOf(c.limitations)) + '</p>' : '') + '<div class="inline-sources">' + sourceButtons(c.sourceIds) + '</div></article>'; }).join('');
    renderSources();
  }

  function methodCard(m, index) {
    var candidate = m.status === 'candidate';
    var title = m.title || m.name || m.label || m.id;
    var html = '<article class="method-card"><span class="method-index">' + String(index).padStart(2, '0') + (candidate ? ' / 待进一步研究' : ' / 可交互推演') + '</span><h3>' + esc(title) + '</h3><p>' + esc(textOf(m.logic || m.description)) + '</p>';
    if (m.formula) html += '<div class="method-formula">' + esc(textOf(m.formula)) + '</div>';
    if (m.dataNeeds) html += '<p class="method-data"><strong>需要：</strong>' + esc(textOf(m.dataNeeds)) + '</p>';
    if (m.strengths) html += '<p class="method-data"><strong>作用：</strong>' + esc(textOf(m.strengths)) + '</p>';
    html += '<p class="method-limit">' + esc(textOf(m.limits || m.limitations || m.verdict || '')) + '</p>';
    if (m.verdict && (m.limits || m.limitations)) html += '<p class="method-verdict">' + esc(textOf(m.verdict)) + '</p>';
    html += '<div class="inline-sources">' + sourceButtons(m.sourceIds) + '</div></article>';
    return html;
  }

  function prepareSources() {
    var priority = new Set();
    defs.forEach(function (d) { asArray(d.sourceIds).forEach(function (id) { priority.add(id); }); });
    asArray(DATA.methods).concat(asArray(DATA.claims), asArray(DATA.usComparables)).forEach(function (d) { asArray(d.sourceIds).forEach(function (id) { priority.add(id); }); });
    sourceCatalog = asArray(DATA.sources).map(function (source, index) { return { source: source, order: index, priority: priority.has(source.id), search: [source.id, source.title, source.publisher, source.usedFor, source.period, source.locator].map(textOf).join(' ').toLocaleLowerCase() }; }).sort(function (a, b) { return Number(b.priority) - Number(a.priority) || a.order - b.order; });
  }

  function sourceDetail(value) {
    var valueText = textOf(value);
    if (!valueText) return '';
    if (valueText.length <= 155) return esc(valueText);
    var structured = /^[\s]*[\[{]/.test(valueText), longText = valueText;
    if (structured) { try { longText = JSON.stringify(JSON.parse(valueText), null, 2); } catch (_) { structured = false; } }
    return '<details class="source-detail"><summary>' + esc(structured ? '结构化观测与研究字段 · 展开查看' : valueText.slice(0, 135) + '…') + '</summary>' + (structured ? '<pre>' + esc(longText) + '</pre>' : '<p>' + esc(longText) + '</p>') + '</details>';
  }

  function renderSources(targetId) {
    if (!sourceCatalog.length && asArray(DATA.sources).length) prepareSources();
    var q = $('source-search').value.trim().toLocaleLowerCase();
    if (q !== state.sourceQuery) { state.sourcePage = 0; state.sourceQuery = q; }
    var group = state.sourceIdsFilter && new Set(state.sourceIdsFilter);
    var sources = sourceCatalog.filter(function (row) { return (!q || row.search.includes(q)) && (!group || group.has(row.source.id)); }).map(function (row) { return row.source; });
    if (!sources.length) { $('sources-table').innerHTML = (group ? '<div class="source-group-bar">当前关联组中没有匹配资料<button type="button" class="table-action" data-clear-source-group>返回全部资料</button></div>' : '') + '<p class="empty-table">' + (q ? '没有找到匹配来源，试试其他关键词。' : '资料登记表待补充。') + '</p>'; $('source-count').textContent = ''; return; }
    var size = 20, pages = Math.ceil(sources.length / size);
    if (typeof targetId === 'string') { var targetIndex = sources.findIndex(function (s) { return s.id === targetId; }); if (targetIndex >= 0) state.sourcePage = Math.floor(targetIndex / size); }
    state.sourcePage = Math.max(0, Math.min(pages - 1, state.sourcePage));
    var pageSources = sources.slice(state.sourcePage * size, (state.sourcePage + 1) * size);
    $('sources-table').innerHTML = (group ? '<div class="source-group-bar">当前显示关联的 ' + sources.length + ' 条资料<button type="button" class="table-action" data-clear-source-group>返回全部资料</button></div>' : '') + '<table class="data-table sources-table"><thead><tr><th>资料 / 发布主体</th><th>时间与定位</th><th>用途与口径</th><th>原始链接</th></tr></thead><tbody>' + pageSources.map(function (s) {
      var url = safeUrl(s.url);
      return '<tr class="source-row' + (s.id === state.highlightedSource ? ' is-highlighted' : '') + '" id="source-' + esc(encodeURIComponent(s.id)) + '"><td class="source-title"><span class="source-id">' + esc(s.id) + '</span><br>' + esc(s.title || s.id) + '<span class="cell-note">' + esc(s.publisher || '') + '</span>' + (s.verified === false ? '<span class="small-pill source-unverified">需进一步核对</span>' : '') + '</td><td class="wrap-cell">' + esc(s.publicationDate || s.period || '以原文为准') + '<span class="cell-note">' + esc([s.period, s.locator].filter(Boolean).join(' · ')) + '</span></td><td class="wrap-cell">' + sourceDetail(s.usedFor) + '<div class="cell-note">' + sourceDetail(s.limitations) + '</div></td><td>' + (url ? '<a class="source-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">查看原文 <span aria-hidden="true">↗</span></a>' : '<span class="cell-note">链接待补充</span>') + '</td></tr>';
    }).join('') + '</tbody></table><div class="source-pagination"><button type="button" class="button button-secondary" data-source-page="' + (state.sourcePage - 1) + '"' + (state.sourcePage === 0 ? ' disabled' : '') + '>上一页</button><span>第 ' + (state.sourcePage + 1) + ' / ' + pages + ' 页</span><button type="button" class="button button-secondary" data-source-page="' + (state.sourcePage + 1) + '"' + (state.sourcePage === pages - 1 ? ' disabled' : '') + '>下一页</button></div>';
    $('source-count').textContent = '匹配 ' + sources.length + ' / ' + asArray(DATA.sources).length + ' 条资料，每页 20 条；关键参数来源优先。不同统计口径请同时阅读用途与限制。';
  }

  function navigateSource(id) {
    state.highlightedSource = id;
    state.sourceIdsFilter = null;
    $('source-search').value = '';
    showView('methods', false); renderSources(id);
    var row = $('source-' + encodeURIComponent(id));
    if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { row.classList.remove('is-highlighted'); state.highlightedSource = null; }, 4000); }
    else { $('sources-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); showToast('此来源标识未载入资料登记表：' + id); }
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var nav = event.target.closest('[data-view],[data-go-view]');
      if (nav) { showView(nav.dataset.view || nav.dataset.goView); return; }
      var source = event.target.closest('[data-source]');
      if (source) { navigateSource(source.dataset.source); return; }
      var sourceGroup = event.target.closest('[data-source-ids]');
      if (sourceGroup) { try { state.sourceIdsFilter = JSON.parse(sourceGroup.dataset.sourceIds); state.sourcePage = 0; $('source-search').value = ''; showView('methods', false); renderSources(); $('sources-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { showToast('无法读取这组来源。', true); } return; }
      var sourcePage = event.target.closest('[data-source-page]');
      if (sourcePage) { state.sourcePage = Number(sourcePage.dataset.sourcePage) || 0; renderSources(); $('sources-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (event.target.closest('[data-clear-source-group]')) { state.sourceIdsFilter = null; state.sourcePage = 0; renderSources(); return; }
      var historySeries = event.target.closest('[data-history-series]');
      if (historySeries) { updateParameter('priceSeries', historySeries.dataset.historySeries); var seriesInput = $('param-priceSeries'); if (seriesInput) seriesInput.value = historySeries.dataset.historySeries; return; }
      var historyRange = event.target.closest('[data-history-range]');
      if (historyRange) { state.historyRange = historyRange.dataset.historyRange; renderHistory(); return; }
      var method = event.target.closest('[data-price-method]');
      if (method) { updateParameter('priceMethod', method.dataset.priceMethod); return; }
      var toggle = event.target.closest('[data-toggle-series]');
      if (toggle) { var id = toggle.dataset.toggleSeries; state.hiddenSeries[id] = !state.hiddenSeries[id]; renderForecast(); return; }
      var load = event.target.closest('[data-load-scenario]');
      if (load) { var s = state.scenarios.find(function (x) { return x.id === load.dataset.loadScenario; }); if (s) { applyConfig(s.config, s.name); showToast('已载入“' + s.name + '”。'); } return; }
      var remove = event.target.closest('[data-delete-scenario]');
      if (remove) { state.scenarios = state.scenarios.filter(function (x) { return x.id !== remove.dataset.deleteScenario; }); persist(); renderScenarios(); showToast('已移除这个对比情景。'); return; }
      if (event.target.closest('[data-method-target]')) { showView('methods', false); $('valuation-method-notes').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    document.addEventListener('input', function (event) { var input = event.target.closest('[data-param]'); if (input) updateParameter(input.dataset.param, input.type === 'checkbox' ? input.checked : input.value, input); });
    $('valuation-method').addEventListener('change', function () { updateParameter('valuationMethod', this.value, this); });
    $('preset-select').addEventListener('change', function () {
      var preset = asArray(M.PRESETS).find(function (p) { return p.id === this.value; }, this);
      if (preset) {
        var patch = {};
        asArray(M.PRESETS).forEach(function (p) { Object.keys(p.changes || {}).forEach(function (key) { if (Object.prototype.hasOwnProperty.call(M.DEFAULTS, key)) patch[key] = M.DEFAULTS[key]; }); });
        Object.assign(patch, preset.changes || {});
        applyConfig(M.mergeConfig(state.config, patch), preset.name, preset.id);
        showToast('已载入“' + preset.name + '”的假设。');
      }
    });
    $('reset-config').addEventListener('click', function () { applyConfig(PAPER, '修订现金流参照：8000万头持平'); showToast('当前参数已恢复默认，保存的对比情景仍可载入。'); });
    $('mobile-parameters').addEventListener('click', function () { var panel = document.querySelector('.parameter-panel'); var collapsed = panel.classList.toggle('is-mobile-collapsed'); this.setAttribute('aria-expanded', String(!collapsed)); this.innerHTML = collapsed ? '展开 <span aria-hidden="true">⌄</span>' : '收起 <span aria-hidden="true">⌃</span>'; });
    $('load-main').addEventListener('click',function(){applyConfig(MAIN,'主线：全年20元与10倍PE');});
    $('load-paper').addEventListener('click',function(){applyConfig(PAPER,'修订现金流参照：8000万头持平');showToast('已载入1.3.0修订参照。');});
    $('load-legacy').addEventListener('click',function(){applyConfig(M.DEFAULTS,'2%增长三次：修订模型');showToast('已载入旧销量及投资配置，采用当前修订模型重算。');});
    $('load-target').addEventListener('click',function(){applyConfig(M.mergeConfig(PAPER,{companyGrowthMode:'target',targetHogs:9000,targetGrowthYears:4}),'2031年9000万头：提前投资');});
    $('sync-depletion').addEventListener('click',function(){var c=state.config;var d=(1-c.sowQ3/c.sowQ2)*100;var check=M.validate(M.mergeConfig(c,{q4DepletionPct:d}),DATA);if(check.errors.length){showToast('同速去化超出允许范围，请检查Q2/Q3输入。',true);return;} applyConfig(M.mergeConfig(c,{q4DepletionPct:d}),'Q4与Q3同速去化');});
    $('save-scenario').addEventListener('click', openScenarioDialog);
    $('cross-save-scenario').addEventListener('click', openScenarioDialog);
    $('scenario-form').addEventListener('submit', saveScenario);
    $('close-scenario-dialog').addEventListener('click', closeScenarioDialog);
    $('cancel-scenario-dialog').addEventListener('click', closeScenarioDialog);
    $('scenario-dialog').addEventListener('click', function (event) { if (event.target === this) { var r = this.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeScenarioDialog(); } });
    $('weights-inputs').addEventListener('input', function (event) { var id = event.target.dataset.weight; if (!id) return; var s = state.scenarios.find(function (x) { return x.id === id; }); if (s) { var value = event.target.value; s.weight = value !== '' && finite(Number(value)) && Number(value) >= 0 ? Number(value) : null; persist(); renderWeightedResult(); } });
    $('export-config').addEventListener('click', exportConfig);
    $('cross-export-config').addEventListener('click', exportConfig);
    $('import-config').addEventListener('click', function () { $('config-file').click(); });
    $('config-file').addEventListener('change', function () { importConfig(this.files[0]); });
    $('copy-share').addEventListener('click', copyShare);
    $('cross-copy-share').addEventListener('click', copyShare);
    $('download-results').addEventListener('click', downloadResults);
    $('download-crosschecks').addEventListener('click', downloadCrossChecks);
    $('futures-quarter').addEventListener('change', function () { updateCrossApplyButtons(currentCrossChecks()); });
    $('piglet-quarter').addEventListener('change', function () { updateCrossApplyButtons(currentCrossChecks()); });
    $('piglet-result-choice').addEventListener('change', function () { updateCrossApplyButtons(currentCrossChecks()); });
    $('apply-futures-price').addEventListener('click', function () { applyCrossPrice('futures'); });
    $('apply-piglet-price').addEventListener('click', function () { applyCrossPrice('piglet'); });
    $('source-search').addEventListener('input', renderSources);
    $('history-original').addEventListener('click', function () { setHistoryLag(false); });
    $('history-lagged').addEventListener('click', function () { setHistoryLag(true); });
    window.addEventListener('hashchange', function () { readSharedConfig(true); });
    var resizeTimer;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (state.currentView === 'simulation' && state.result) renderForecast(); if (state.currentView === 'history') renderHistory(); }, 160); });
  }
  function setHistoryLag(lagged) { state.historyLagged = lagged; ['original', 'lagged'].forEach(function (id) { var active = (id === 'lagged') === lagged; $('history-' + id).classList.toggle('is-active', active); $('history-' + id).setAttribute('aria-pressed', String(active)); }); renderHistory(); }

  function boot() {
    if (!M || !M.DEFAULTS || typeof M.calculate !== 'function') {
      $('parameter-sections').innerHTML = '<p class="loading-state">模型文件尚未载入。</p>';
      renderInvalid([{ message: '请将 index.html、styles.css、ui.js、engine.js 与 data.js 放在同一目录，再打开 index.html。' }]);
      document.querySelectorAll('[data-view],[data-go-view]').forEach(function (button) { button.addEventListener('click', function () { showView(this.dataset.view || this.dataset.goView); }); });
      renderMethods(); return;
    }
    defs = asArray(M.PARAMS).map(function (def) { var copy = Object.assign({}, def); if (def.options) copy.options = def.options.slice(); return copy; });
    var cycleDefinition = defs.find(function (def) { return def.key === 'historicalCycle'; });
    if (cycleDefinition) asArray(DATA.cycles).forEach(function (cycle) { if (!cycleDefinition.options.some(function (op) { return op.value === cycle.id; })) cycleDefinition.options.push({ value: cycle.id, label: cycle.label || cycle.id }); });
    defs.forEach(function (d) { definitionByKey[d.key] = d; });
    state.config = clone(MAIN); state.name='主线：全年20元与10倍PE';
    restore(); renderParameters(); bindEvents(); renderMethods(); recalculate();
    var meta = DATA.meta || {};
    $('data-date').textContent = meta.asOf ? '资料截点 ' + String(meta.asOf).slice(0, 10).replace(/-/g, '.') : '数据与假设透明可查';
    $('footer-version').textContent = '研究版本 ' + M.VERSION + (meta.asOf ? ' · ' + String(meta.asOf).slice(0, 10) : '');
    if (window.innerWidth <= 700) { document.querySelector('.parameter-panel').classList.add('is-mobile-collapsed'); $('mobile-parameters').setAttribute('aria-expanded', 'false'); $('mobile-parameters').innerHTML = '展开 <span aria-hidden="true">⌄</span>'; }
  }

  boot();
})();

