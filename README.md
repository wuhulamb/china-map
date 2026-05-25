# 中国城市地图 - 交互式可视化

将中国城市行政区划数据渲染为交互式地图，支持浏览、搜索和猜城市游戏。

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | **最终成品**，浏览器可直接打开 |
| `china_data.js` | 地理数据（由 TopoJSON 生成），211 KB |
| `china.topo.json` | 经 mapshaper 简化后的 TopoJSON 数据，178 KB |
| `中国_市.geojson` | 原始 GeoJSON 数据，4.1 MB（388 个要素） |
| `generate_data.py` | 数据生成脚本：TopoJSON → `china_data.js` |

## 使用方法

无需服务器和网络（仅首次加载 Leaflet/topojson 库需联网），直接用浏览器打开：

```bash
open index.html   # macOS
start index.html  # Windows
xdg-open index.html  # Linux
```

## 功能

### 浏览模式（默认）

- **搜索框** — 输入城市名称，实时模糊匹配，按 ↑/↓ 方向键选择，回车确认
- **鼠标悬停** — 显示城市名称
- **鼠标点击** — 侧边栏显示城市详情（名称、行政区划代码、类型、估算面积）
- **滚轮缩放** — 标准地图拖拽缩放

### 游戏模式

点击右上角 **「开始游戏」** 进入猜城市模式：

- 输入城市名称自动匹配（支持短名，如输入"合肥"匹配"合肥市"）
- 匹配成功 → 城市高亮绿色 + 计分 + 清空输入框
- 重复输入 → 忽略，不计分
- 全部猜完 → 自动祝贺并结束游戏
- 随时点击 **「结束游戏」** 退出，显示得分

颜色说明：
- 橙色 = 有数据的城市区域
- 绿色（游戏模式）= 已猜中的城市
- 灰色 = 境界线

## 数据

- 数据来源：`中国_市.geojson` — 375 个城市区域 + 13 条境界线
- 使用 mapshaper 简化 10% 后转为 TopoJSON，体积缩小 95%
- 浏览器端通过 `topojson-client` 解压为 GeoJSON 渲染

## 重新生成

```bash
# 1. 安装 mapshaper（如果未安装）
npm install -g mapshaper

# 2. 简化并转换 TopoJSON
mapshaper 中国_市.geojson \
  -simplify 10% keep-shapes \
  -o format=topojson china.topo.json

# 3. 生成 JS 数据文件
python3 generate_data.py
```

## 技术栈

- **Leaflet** — 地图渲染引擎
- **TopoJSON** — 经拓扑压缩的地理数据格式
- **topojson-client** — TopoJSON 转 GeoJSON