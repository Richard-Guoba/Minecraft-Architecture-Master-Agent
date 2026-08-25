# Architecture Playbook P3 — Capability-Deny Audit Design

日期：2026-08-25  
状态：用户已批准
上游：`docs/superpowers/specs/2026-08-25-architecture-playbook-v0-1-design.md`  
替代范围：P3 的 JavaScript 依赖边界扫描策略与公开路径泄漏匹配策略

## 1. 背景与根因

P3 门禁必须证明 `src/playbook/manual/` 不依赖 `src/construction/`，且公开秘籍产物不泄漏本地文件引用。现实现尝试通过 AST taint 传播理解任意 JavaScript loader 数据流。

连续复审已经用实际执行证明，这种策略会被普通 JavaScript 形式绕过，包括长别名链、computed member、默认参数、隐式返回、跨模块导出、CJS loader 成员和 Node 内部 loader 入口。每次扩展传播规则都会增加新的控制流、作用域和收敛问题。

根因不是缺少某几个语法分支，而是安全目标定义错误：门禁不需要理解任意动态加载程序，只需要证明受审代码使用了一个可静态验证的依赖子集。无法证明的形式必须阻断，而不是继续推测其运行时含义。

## 2. 决策

采用 capability-deny 审计：

1. 允许一个很小、明确、可静态解析的模块依赖语言；
2. 对动态 loader 能力在来源处阻断，不追踪其任意数据流；
3. 对不受支持或无法证明安全的语法统一产生稳定的 unresolved fact；
4. 只保留审计器自身解析 CJS specifier 所需的一个结构化例外；
5. 路径泄漏检测先规范化文本，再在同一坐标系内计算高优先级文件引用和 HTTPS 例外。

安全门的成功条件仍是：

```text
import_boundary_violation_count = 0
import_boundary_unresolved_count = 0
public_leak_count = 0
```

## 3. 非目标

- 不构建通用 JavaScript taint 引擎；
- 不支持任意 loader alias、反射、运行时拼接或跨模块 factory 传递；
- 不执行受审模块；
- 不改变 P3 的 21 条规则、15/6 教学角色、P2 血缘、五个生成物或零运行时权限；
- 不修改 construction、runtime、resource registry 或建筑生成流程；
- 不承诺接受所有语义安全但写法复杂的 JavaScript。安全边界允许保守拒绝。

## 4. 依赖审计模型

### 4.1 允许的依赖形式

受审模块只允许：

- `import ... from "literal"`；
- `export ... from "literal"` 与 `export * from "literal"`；
- `import("literal")`；
- 未被词法绑定遮蔽的直接 `require("literal")`；
- 未被词法绑定遮蔽的直接 `module.require("literal")`，仅在 CJS 文件中允许。

literal 必须是普通字符串字面量。模板字符串、拼接、变量、computed callee、`.call`、`.apply`、`.bind`、sequence 或容器传递均不属于允许语言。

允许形式产生确定的 dependency edge。edge 使用现有 Node-aware ESM/CJS resolver 解析，然后执行 realpath、项目根包含关系和 construction 根检查。

### 4.2 被拒绝的能力来源

以下任一形式在受审业务模块中出现即产生 unresolved fact，无需追踪其后续数据流：

- 从 `node:module` 或 `module` 导入、导出或 require `createRequire`、默认 namespace 或未允许成员；
- 将未遮蔽的 `require`、`module.require` 当作值读取、赋值、返回、导出或传参；
- 非字面量 `require`、`module.require` 或 dynamic `import()`；
- `process.getBuiltinModule`、`module.constructor`、`Module._load` 等替代 loader 入口；
- 未遮蔽的 `eval`、`Function` 或等价动态执行入口；
- 任何无法归类为第 4.1 节允许形式、但涉及模块加载能力的表达式。

该规则在能力来源处触发，因此 alias 链长度、函数返回、默认参数、解构赋值、闭包、throw/catch 和跨模块 export 不再影响正确性。

### 4.3 词法作用域

扫描器只需要回答“这个标识符是否是未遮蔽的全局能力”，不再传播 taint。

必须正确处理：

- program、function、block、catch 和 loop/switch scope；
- `var` 的 function/program 提升范围；
- `let`、`const`、class、function declaration、import 与参数绑定；
- identifier、array/object destructuring、rest 与 assignment pattern；
- 局部 `require`、`module`、`process`、`eval`、`Function` 和 `Module` 的遮蔽。

遮蔽只避免把局部同名变量误判为全局能力；它不会使来自 `node:module` 的显式 import/require 合法化。

### 4.4 审计器自举例外

`manualDependencyBoundary.js` 自身需要 `createRequire(...).resolve(...)` 解析 CJS 字面量依赖。该能力不是对所有受审代码开放的通用例外。

例外必须同时满足：

- 物理文件 realpath 精确等于审计器文件；
- import 精确为从 `node:module` 命名导入 `createRequire` 与 `isBuiltin`；
- `createRequire` 只出现在 `createRequire(pathToFileURL(importerPath)).resolve(dependency.specifier)` 结构中；
- 返回值只用于解析 dependency edge，不作为 loader 调用、返回、导出或容器值；
- 同文件任何额外 `createRequire`、`require` alias 或动态执行能力都会产生 unresolved。

审计器的普通静态 imports 仍进入依赖图，construction/outside-project 检查仍适用。测试必须修改临时副本验证例外不能扩张。

## 5. 扫描器结构

`manualDependencyBoundary.js` 拆成四个内部阶段，公开返回合同不变：

1. `parseModule`：Acorn 解析并建立父节点/词法绑定索引；
2. `collectStaticDependencies`：只提取第 4.1 节的依赖边；
3. `collectDeniedCapabilities`：对第 4.2 节能力产生去重、稳定排序的 unresolved facts；
4. `resolveAndClassifyEdges`：解析文件、realpath、检测 construction/outside-project，并递归遍历支持的模块文件。

删除 taint bitmask、fixed-point 传播、factory/loader 容器推断和跨模块值传播。扫描复杂度应与 AST 节点数和静态 dependency edge 数近似线性相关；不再存在传播轮数或不收敛状态。

## 6. 公开路径泄漏模型

### 6.1 统一规范化

每个受审字符串生成一个 bounded normalization view：

- 最多 8 轮解码合法 ASCII `%HH`；
- 每个规范化字符保留到原始区间的映射；
- malformed 编码不抛异常；
- 第 8 轮后仍包含可解码 `%HH` 时产生保守泄漏事实；
- 所有 file、UNC、绝对路径和 HTTPS 检测都使用同一个规范化 view。

禁止混用 raw HTTPS ranges 与 normalized file ranges。

### 6.2 高优先级文件引用

以下形式均计为泄漏，且不能被 HTTPS 例外覆盖：

- 大小写不敏感的 `file:`，后接 1 个或多个 `/` 或 `\`；
- 两个或更多混合 `/`、`\` 开头的 UNC 引用；
- Windows extended UNC：`\\?\UNC\...` 及等价混合分隔符；
- 现有 Unix、Windows drive 与已知私有目录匹配。

file/UNC token 在空白、引号、括号或 URL 分隔边界结束，不能贪婪吞并后续独立引用。去重以映射回原始文本后的区间为准。

### 6.3 HTTPS 例外

HTTPS token 也从规范化 view 计算。普通 HTTPS URL 中的路径片段不作为本地绝对路径泄漏；但 URL query/fragment 内显式出现 `file:` 或 UNC token 时，高优先级规则仍计泄漏。

完全编码、部分编码和大小写变体遵循同一规则。

## 7. 错误与输出合同

- 解析失败、目录/read/realpath/resolve 失败继续 fail-closed；
- unresolved facts 使用稳定代码，不包含绝对路径或私有文本；
- 同一文件同类根因去重，但两个不同 construction edge 或两个不同泄漏区间分别计数；
- audit 结果继续 deep-freeze；
- audit 不读取网络、不执行受审模块、不运行用户表达式。

## 8. 测试策略

### 8.1 依赖 RED/GREEN 矩阵

必须保留并覆盖所有已发现执行型绕过：

- 21+ alias 链；
- default/named namespace、computed member、`Module._load`、`module.constructor`、`process.getBuiltinModule`；
- declaration/assignment destructuring、默认参数、显式/隐式 return、throw/catch；
- ESM/CJS export/re-export；
- call/apply/bind/sequence/container；
- reassignment与嵌套词法作用域。

每个恶意 fixture 先在隔离子进程中证明返回 `construction-executed`，再断言 audit 为 violation 或 unresolved，绝不允许 `0/0`。

安全控制包括：

- 静态 ESM/CJS 字面量依赖；
- 从 `node:module` 命名导入后直接调用 `isBuiltin`；默认 namespace 仍因同时暴露 loader 能力而被拒绝；
- 局部同名变量和参数遮蔽；
- 审计器唯一 resolver 例外；
- marker 证明 audit 未执行 construction target。

### 8.2 泄漏矩阵

覆盖 file 1/2/3 slash、大小写、正反斜杠、mixed/repeated/partial encoding、extended UNC、HTTPS 普通路径与内嵌 file/UNC、malformed、解码预算耗尽、重叠去重和多个独立引用。

### 8.3 回归门

完成条件：

- changed suites 全绿；
- 既有 playbook focused suites 全绿；
- `npm run playbook:manual -- check` 为 current、5 artifacts、drift 0；
- `npm test` 全绿；
- `git diff --check` 无输出；
- `.local/architecture-playbook` 无 tracked 文件；
- 独立审查无法用执行型 fixture 获得 construction-executed + audit 0/0。

## 9. 迁移与提交边界

实施从当前 `ee4cbf6` 前进，不重写历史：

1. 先提交覆盖 reviewer 最终 33+24 诊断矩阵的 RED 测试；
2. 用 capability-deny scanner 替换 taint/fixed-point 实现；
3. 收敛 normalized range/token 规则；
4. 更新残余修复报告，明确旧 taint 方案被替代；
5. 运行独立定向复审和最终全量验证。

若 capability-deny 实现仍出现 execution-proven `0/0`，不得继续添加 taint 传播；应将对应能力来源加入 deny 集，或把 P3 状态降为 dependency-boundary-unverified。

## 10. 验收结论边界

通过本设计只能宣称：受审代码的依赖写法属于允许的静态子集，所有解析出的依赖均未进入 construction，未支持的加载能力会阻断，公开产物未发现定义范围内的文件引用。

它仍不证明秘籍改善建筑质量，也不赋予 P3 规则任何运行时权限。
