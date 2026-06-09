# Minecraft 建筑智能体

输入一句中文需求，生成一个 Minecraft Java 数据包。把数据包放进世界后，就可以用函数命令建造房子。

当前代码导出的是 **Minecraft Java 1.21** 数据包，`pack_format` 为 `48`。如果你的世界是 1.20.1，数据包可能无法加载，需要换 1.21 世界，或修改导出版本支持 1.20.1。

## 准备

1. 安装 Node.js 20 或更高版本。
2. 在项目目录安装依赖：

```powershell
npm install
```

3. 准备一个 Minecraft Java 世界。建议使用创造模式、超平坦、开启作弊。

## 只生成数据包

```powershell
npm start -- "建一个欧式大房子"
```

输出会在：

```text
out/<时间戳>/
```

主要文件：

- `architect_datapack/`：要放进 Minecraft 世界的 datapack。
- `preview.html`：浏览器预览。
- `run_report.md`：运行报告和使用步骤。
- `blueprint.json`：结构化建筑蓝图。

## 自动安装并建造

如果想让程序直接把 datapack 装进某个世界：

```powershell
npm start -- --world "世界名" --auto-build "建一个欧式大房子"
```

如果你的世界不在默认 `.minecraft` 目录，可以直接传世界存档目录：

```powershell
npm start -- --world "D:\Games\.minecraft\saves\DemoWorld" --auto-build "建一个欧式大房子"
```

自动模式会做两件事：

1. 复制 datapack 到：

```text
<世界目录>\datapacks\architect_datapack
```

2. 在 datapack 中生成自动建造函数。进入世界后，数据包会在第一个玩家当前位置执行：

```text
function architect:clear
function architect:build
```

如果世界已经打开，运行完命令后回到游戏执行：

```text
/reload
```

然后等待自动建造触发。

注意：自动建造的位置是玩家当前位置附近，不会根据玩家朝向旋转。建筑主要向世界坐标的东、南方向展开。

## 手动安装数据包

先生成：

```powershell
npm start -- "建一个欧式大房子"
```

然后把：

```text
out/<时间戳>\architect_datapack
```

复制到：

```text
<世界目录>\datapacks\architect_datapack
```

进入世界后依次执行：

```text
/reload
/function architect:clear
/function architect:build
```

## 常用命令

查看默认 Minecraft 目录下能识别的世界：

```powershell
npm start -- --list-worlds
```

使用最近修改过的世界：

```powershell
npm start -- --world latest --auto-build "建一个欧式大房子"
```

指定 Minecraft 根目录：

```powershell
npm start -- --minecraft-dir "D:\Games\.minecraft" --world "DemoWorld" --auto-build "建一个欧式大房子"
```

打开启动器或 Minecraft：

```powershell
npm start -- --world "DemoWorld" --auto-build --launch "建一个欧式大房子"
```

使用 `--launch` 前，需要在 `.env` 里配置：

```text
MINECRAFT_LAUNCH_COMMAND="D:\path\to\launcher.exe"
```

`--launch` 只负责打开启动器或 Minecraft，不负责自动选择世界。

## 支持的描述

可以写风格、层数、尺寸、材质和附加元素，例如：

```powershell
npm start -- "建一个现代两层房子，宽31深17，白色混凝土墙，大玻璃窗，平屋顶，带室内楼梯和灯"
```

```powershell
npm start -- "建一个江南两层小院，白墙黑瓦，门在南侧，带阳台和水池，室内有卧室客厅厨房"
```

常见可识别内容：

- 风格：欧式、现代、江南、中式、木屋。
- 层数：一层、两层、三层。
- 尺寸：宽31深17、尺寸25x21、层高6。
- 材质：白色混凝土墙、石英地板、黑瓦、玻璃窗、铁门。
- 元素：阳台、庭院、花园、水池、喷泉、卧室、客厅、厨房、室内楼梯。

## API 配置

不配置 API key 也可以运行，系统会使用规则模板兜底。

如果要使用智谱 API，创建 `.env`：

```text
ZHIPU_API_KEY=你的 key
ZHIPU_BASE_URL=智谱 chat completions 地址
ZHIPU_MODEL=模型名
```

## 测试

```powershell
npm test
```
