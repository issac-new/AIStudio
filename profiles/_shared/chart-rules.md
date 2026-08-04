# 绘图规则

> 本文件是所有 Hermes agent profile 的共享绘图工具规则。
> 修改本文件全集群自动生效（每个 SOUL.md 末尾引用 `shared-rules-reference.md`）。

---

## 🔴 强制规则：绘图工具优先级

### 1. 交互式 / Web 图表（首选）

| 优先级 | 工具 | 适用场景 | 输出格式 |
|--------|------|----------|----------|
| **P0** | **ECharts** | 柱状图/折线图/饼图/散点图/地图/关系图/树图/仪表盘/富交互图表 | HTML（含 echarts.min.js CDN） |
| **P0** | **AntV** | 关系图(G6)/地理图(L7)/矩形树图/桑基图/图分析 | HTML（含 antv CDN） |
| P1 | Vega/Vega-Lite | 声明式数据可视化（markdown-viewer skill 已内置） | Markdown 嵌入 |
| P2 | Mermaid | 流程图/时序图/类图/Gantt/简单架构图 | Markdown 代码块 |
| P2 | PlantUML | UML 类图/组件图/部署图（markdown-viewer skill 已内置） | Markdown 嵌入 |

### 2. 静态 / 文档图表

| 优先级 | 工具 | 适用场景 | 输出格式 |
|--------|------|----------|----------|
| P1 | matplotlib + seaborn | 科学论文/学术论文/统计图（需精确控制 LaTeX 标注） | PNG/PDF/SVG |
| P1 | graphviz | 依赖图/调用图/AST/DAG（命令行 dot） | PNG/SVG |
| P2 | d2lang | 声明式架构图（比 graphviz 更简洁） | PNG/SVG |

### 3. 决策流程

```
用户要求绘图
    ├─ 交互式/Web 场景？
    │   ├─ 关系图/图分析/地理图 → AntV (G6/L7)
    │   ├─ 标准数据图表 → ECharts
    │   └─ 声明式/Markdown 内嵌 → Vega-Lite
    ├─ UML/架构图？
    │   ├─ 简单流程 → Mermaid
    │   └─ 正式 UML → PlantUML
    └─ 科学/静态？
        ├─ 统计/论文 → matplotlib + seaborn
        └─ 依赖/DAG → graphviz
```

### 4. 规则

1. **默认首选 ECharts 和 AntV**——除非场景明确需要 UML/科学论文/声明式 Markdown。
2. **ECharts 模板**：生成独立 HTML 文件，内含 `<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>`，`<div id="chart">` + `echarts.init()`。文件存到 `workspace/` 或 `/tmp/`。
3. **AntV 模板**：G6 用 `https://gw.alipayobjects.com/os/lib/antv/g6/4.x/dist/g6.min.js`，L7 用对应 CDN。
4. **不生成 base64 内联图片**——输出 HTML 文件路径，用户用浏览器打开。
5. **数据驱动**：图表数据从真实工具调用获取（terminal/read_file/search_files），不编造数据。
6. **中文优先**：图表标题/轴标签/图例默认中文（除非用户明确要求英文）。

---

## 🔴 强制规则：A4 页面适配与视觉布局

### 5. A4 画布约束

所有图表**必须适配 A4 纸面**（210mm × 297mm），确保打印 / PDF 导出时不溢出、不裁切、不空洞。

| 参数 | 值 | 说明 |
|------|-----|------|
| **A4 横向画布** | 1123px × 794px | @96dpi，含 10mm 安全边距 |
| **A4 纵向画布** | 794px × 1123px | @96dpi，含 10mm 安全边距 |
| **安全内容区** | 1054px × 724px（横向）/ 724px × 1054px（纵向） | 四边各留 35px (≈10mm) |
| **最小字号** | 11px | 任何文字不得低于此值 |
| **标题字号** | 16-20px | 主标题 18-20px，副标题 14-16px |
| **正文字号** | 12-13px | 轴标签/图例/数据标签 |
| **最小元素间距** | 8px | 元素之间不重叠、不挤压 |

### 6. 尺寸选择决策

```
数据系列数 / 图表类型 → 选择画布方向
    ├─ ≤3 系列 + 柱状/饼图 → A4 纵向（高度 > 宽度）
    ├─ ≥4 系列 或 时间序列 → A4 横向（宽度 > 高度）
    ├─ 关系图/网络图 → A4 横向（充分利用宽度）
    ├─ 单一 KPI / 指标卡 → A4 纵向，占 1/2 或 1/3 页
    └─ 多图组合仪表盘 → A4 横向，grid 布局
```

### 7. 布局设计规则

1. **画布尺寸固定**：HTML 容器 `width: 1123px; height: 794px;`（横向）或 `794px × 1123px`（纵向），不使用 `width: 100%`。ECharts `init` 时传入固定尺寸。
2. **安全边距**：容器内 `padding: 35px`，图表实际绘制区 = 安全内容区。
3. **字号自适应**：根据数据密度调整字号，但不得低于 11px 下限。
   - 数据点 ≤20：轴标签 13px，数据标签 12px
   - 数据点 21-50：轴标签 12px，数据标签 11px
   - 数据点 >50：隐藏数据标签，轴标签 11px，开启 `dataZoom` 缩放
4. **图例位置**：图例放右侧或底部，宽度 ≤150px，不挤压主图区。
5. **多图组合**：用 CSS Grid（非 flex）布局，每个子图固定宽高，间距 12px。
6. **颜色对比度**：文字与背景对比度 ≥4.5:1（WCAG AA）。深色背景用浅色文字。
7. **避免空旷**：图表如果数据少导致大片空白，缩小画布或增加注释/说明文字填充。
8. **避免拥挤**：图表如果数据多导致重叠，增大画布或拆分为多个子图。

### 8. ECharts A4 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>图表标题</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  @page { size: A4; margin: 10mm; }
  body { margin: 0; padding: 0; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  .page { width: 1123px; height: 794px; padding: 35px; box-sizing: border-box; }
  .title { font-size: 20px; font-weight: bold; margin-bottom: 8px; text-align: center; }
  .subtitle { font-size: 14px; color: #666; margin-bottom: 16px; text-align: center; }
  #chart { width: 1054px; height: 654px; }
  .footer { font-size: 11px; color: #999; margin-top: 8px; text-align: right; }
</style>
</head>
<body>
<div class="page">
  <div class="title">图表标题</div>
  <div class="subtitle">副标题 / 数据来源说明</div>
  <div id="chart"></div>
  <div class="footer">生成时间：2026-08-03 | 数据来源：xxx</div>
</div>
<script>
  const chart = echarts.init(document.getElementById('chart'), null, {
    width: 1054, height: 654
  });
  const option = {
    textStyle: { fontFamily: "PingFang SC", fontSize: 12 },
    title: { show: false },  // 标题已在 HTML 中
    grid: { left: 60, right: 30, top: 20, bottom: 40 },
    xAxis: { axisLabel: { fontSize: 12 } },
    yAxis: { axisLabel: { fontSize: 12 } },
    legend: { right: 10, top: 'middle', width: 120, textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
    series: [
      // 数据从真实工具调用获取，不编造
    ]
  };
  chart.setOption(option);
</script>
</body>
</html>
```
