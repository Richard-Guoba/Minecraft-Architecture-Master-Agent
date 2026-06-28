# 推荐 Prompt 库

这些 prompt 适合用来生成课程报告或 GitHub 展示页里的真实运行截图。优先使用 `--prompt-id`，因为精选 prompt 自带固定 seed，结果更容易复现。

## 截图优先推荐

| 用途 | 命令 |
| --- | --- |
| 现代滨水别墅，适合外观总览 | `npm start -- --mode mock --prompt-id modern-waterfront-villa-reference` |
| 日式庭院住宅，适合展示庭院和屋顶 | `npm start -- --mode mock --prompt-id japanese-courtyard-retreat-reference` |
| 古典轴线庄园，适合展示对称立面 | `npm start -- --mode mock --prompt-id classical-axis-manor-reference` |
| 中世纪云杉住宅，适合展示木石细节 | `npm start -- --mode mock --prompt-id medieval-spruce-home-reference` |
| 哥特山坡宅邸，适合展示塔楼和竖向节奏 | `npm start -- --mode mock --prompt-id gothic-hill-manor-reference` |
| 河边水磨坊住宅，适合展示水边场地 | `npm start -- --mode mock --prompt-id watermill-riverside-home-reference` |

## 直接中文 Prompt

如果不用精选 prompt，也可以直接复制下面的中文描述：

```text
建一个现代两层家庭别墅，宽31深21，大玻璃窗，入口门厅，开放厨房，客厅，餐厅，三间卧室，书房，阳光房和彩色内饰，要有地毯、彩烛、盆栽、展示柜和清晰空间层次。
```

```text
建一个日式一层庭院住宅，宽29深23，木格栅，玄关，客厅，茶室，榻榻米卧室，小厨房，卫生间和枯山水庭院，要求内饰温暖缤纷，有灯笼、竹制家具、盆景和彩色地毯。
```

```text
建一个欧式三层大别墅，宽39深29，对称侧翼，门廊，车库，客厅，餐厅，厨房，书房，四间卧室，阳台和卫生间，内饰豪华缤纷，有彩色地毯、旗帜、彩烛、盆栽和展示柜。
```

```text
建一个海滨架空度假住宅，宽33深21，抗风，抬高防潮，大露台，大玻璃客厅，厨房，餐厅，主卧，客房和书房，要求蓝白明亮内饰、户外座椅、信箱、无障碍坡道和遮雨平台。
```

## 截图建议

每次运行后，终端会打印输出目录。建议优先补三类图：

- `preview.html` 总览截图：说明系统确实生成了可视化结果。
- Minecraft 外观截图：展示体块、屋顶、入口和场地。
- Minecraft 室内或入口路径截图：展示房间、门洞、楼梯和装饰。

安装数据包后，在 Minecraft 中执行：

```text
/reload
/function architect:run
```

`/reload` 只刷新数据包，真正建造入口是 `/function architect:run`。
