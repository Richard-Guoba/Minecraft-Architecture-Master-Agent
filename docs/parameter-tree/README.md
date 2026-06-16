# 字段树查看器

这个目录用于维护欧式别墅字段表的层级关系。

## 文件

- `european-villa-tree.json`：字段树数据。每个节点包含 `id`、`name`、`description`、`children`。
- `viewer.html`：可视化查看器。默认读取同目录下的 `european-villa-tree.json`。

## 打开方式

推荐在项目根目录启动一个本地静态服务：

```powershell
npx http-server . -p 8765
```

然后打开：

```text
http://127.0.0.1:8765/docs/parameter-tree/viewer.html
```

如果直接双击 `viewer.html`，浏览器可能禁止自动读取本地 JSON。此时可以点击页面里的“导入 JSON”，选择 `european-villa-tree.json`。

## 使用方式

- `子层数` 控制当前节点向下显示几层。
- 点击任意节点后，页面显示它的一个父节点、当前节点和若干层子节点。
- 搜索框可以按名称、说明或 id 查找节点。
- 右侧面板会显示当前节点说明、路径、直接子节点和当前节点 JSON。
- 修改 `european-villa-tree.json` 后刷新页面即可查看最新结构。
