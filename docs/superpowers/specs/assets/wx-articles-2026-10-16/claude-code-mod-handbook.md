# Claude Code mod 开发手册：理解・使用・开发・团队协作

> 存档：2026-10-16（调研轮 `2026-10-16-wx-three-article-research.md` 原文之一）
> 来源：微信公众号「架构师之道」2026/10/16 00:46
> 原文链接：https://mp.weixin.qq.com/s/lXZnFZbcmFF8tI_kDClMmQ
> 说明：正文全量存档（去除尾部推广）；代码块经原文排版还原，缩进以语义为准。

> 摘要：本文为 Claude Code mod 的完整技术笔记，从原理、使用、开发、团队协作四个维度系统讲解 mod 机制。mod 是驻留在 Claude Code 会话内部的轻量插件模块，依托事件钩子（hook）事件流水线，具备**观察、改写、代答**三种核心能力；区别于外部设置 Hook，它支持持久化状态、自定义 UI 渲染、干预会话事件流。

## 理解篇：讲清楚 Claude Code 的 mod 到底是什么

### 1 先从一句最直白的话说起

mod 就是一个很小的 JS 或 TS 文件。Claude Code 启动时会把它加载进来，放在自己家里跑。它能实时看到会话里发生的每一件事，能插手改变结果，还能在界面上画自己的东西。

关键词是"在内部"。它不是外部脚本，不是子进程，它跟 Claude Code 在同一个会话里活着，全程在线。

### 2 为什么要有这个东西，设置项不够用吗

Claude Code 本来就有不少可调节的地方：settings、权限规则、斜杠命令、skill、状态栏。这些的共同点是——你只能在它预留好的框框里做选择。能开什么、能关什么、能填什么，都是它替你决定好的。

mod 把这层限制去掉了。你可以改写它的行为，甚至整个替换掉它默认要做的事。你可以在任何一块界面上画自己的 UI，并让它随事件刷新。

打个比方：设置项像是装修时在预留的插座位置上接灯；mod 是给你一整面墙和配电箱，你想怎么布线怎么布线。

底层看，mod 就是打包在插件里的 hook。而"插件里的 hook 能看到会话里的每个事件"这句话，就是它全部能力的来源。

### 3 最核心的心智模型：一条链，三个动作

想象事件在一条水管里往下流。

Claude Code 发出一个事件，比如"我准备跑这条 Bash 命令"。这个事件先经过你的 hook，再经过其他插件的 hook，最后流到底——Claude Code 执行它本来就要执行的动作。你要往下传，就调 `next(e)`；不传，水就到你为止。

每个 hook 拿到的东西都一样：`$` 是整套 API（ui、session、state、fs、process、command 这些都在里面），`e` 是这次事件的输入数据，`next` 是放行按钮。

在这条链上你只有三种玩法，这三种玩法覆盖了 mod 的绝大多数用途：

**观察。** 先 `await next(e)` 让事情照常发生，然后看一眼结果。比如记录每一次文件编辑，或者每回合结束取一个读数。这种写法不会改变任何东西，最安全。

**改写。** 调 `next({...e, command: 更安全的那条})`。你自己不改，你把下游看到的输入换掉，链条后面所有插件和 Claude Code 都按新数据走。

**代答。** 根本不调 `next`，直接 `return { deny: "..." }`。事情到你就断了，由你给答案。这是拦截、护栏、以及"我自己接管这个工具"的写法。

能订阅的事件包括：工具调用、即将提交的提示词、回合的开始与结束、会话的开始与结束、斜杠命令，还有一个 `ui.render`——界面上每画一小块，都会发一次事件。最后这个值得注意，它是 mod 能"插进 UI 里画东西"的原因。

### 4 它跟"设置里的 hook"到底差在哪

这两个东西名字都像 hook，很容易混。区别很实在。

设置里的 hook 是外部的：每来一个事件，Claude Code 起一个 shell 命令，用 stdin 喂 JSON 进去，用 stdout 收结果回来。命令跑完就死了，什么都不记得。

mod 是常驻的：加载一次，整个会话都在。所以它能记住状态，能画一个随事件实时更新的界面，还能反过来调用 Claude Code——开个窗格、起个进程、注册一个斜杠命令，甚至注册一个供模型自己调用的工具。

一句话区分：设置 hook 适合"每次事件跑一下外部脚本"；mod 适合"我要一个有状态、有界面、能长期驻留的能力"。

### 5 两个坑，第一次写一定会踩

**第一个坑：状态放哪里。**

写代码的人第一反应是模块顶层放个 `let readings = []`。听着很合理，但热重载等于把模块整个重新加载一遍：`register` 再跑一次，`session.start` 再触发一次，模块变量全部归零，你的数组空了。

解决办法是放 `$.state`。这份数据由宿主进程代为保管，活满整个会话，重载丢不掉。代价是必须在类型契约里显式声明，也就是往 `types/index.d.ts` 里写清楚这个 key 的类型，并在清单里用 `"types"` 指过去。不写 `claude plugin validate` 会直接拦下你，好在报错信息里连怎么修都写明白了。

这么订阅还白送一个好处：渲染 hook 执行期间调的 `$.state.get`，会自动把这次绘制订阅上。之后任何一次 `$.state.set`，界面自己就重画了。你永远不需要手动调 `$.ui.invalidate`。

**第二个坑：没东西可画的时候要放行。**

`ui.render` 是共享的，好几个 mod 都可能挂在同一个组件上。你不画的时候必须 `return next(e)`，把这块区域让出去。另外组件的 props 一律在 `e.props` 里，不在 `e` 顶层——`hasSurvey`、`bodyColumns` 这些都得从那里读。拿 `bodyColumns` 来说，它是这块区域的真实宽度，右侧停靠了窗格时它比终端窄，排版要按它来。

### 6 三个例子，正好是三台阶

**Token Weather** 是入门台阶：只观察、只绘制。它每回合结束读一次上下文窗口占用，在输入框上方画一行播报：天气图标加百分比加词元数，外带一张最近十二回合的小图表。约 80 行，把 `ui.render`、`$.state`、`next()` 让路这三件事演示完了。

**Blast Radius** 上了第二个台阶：它会插手。Claude 要跑 `rm -rf` 这类命令时，它把调用扣住，先用 git 自己的命令算出这条命令会动到哪些文件（`git status --porcelain`、`git clean -n`，参数走 argv 数组传，所以路径里的字符不会被当 shell 代码执行），然后开一个窗格问你 Proceed 还是 Cancel。按 2，Claude 收到一条带原因的拒绝；按 1，命令原样执行。

这里有个技巧值得记住：每次派发 hook 只有 10 秒时限，但阻塞在 `$` 调用内部的时间不计入。于是它靠一次次短的 `sleep` 等你的按键，等到 `onPress` 写下决定为止。

顺便要说清它的定位：这是安全网，不是权限系统。它读的是命令文本，所以 `$(…)`、别名、内部调 `rm` 的脚本都能绕过去。真要硬拦，请用权限规则。

**Replay Theater** 是第三个台阶：它注册命令、组织界面。回合进行时它把每次 Edit 和 Write 都记下来，回合结束在输入框上方提示一句，你按 `r` 或者输 `/replay`，就有一个窗格带你一份一份 diff 地走过这次改动。它自己说过一句话很关键："我从不阻塞、也不改动任何一次编辑"——记录靠观察，展示靠 `$.command.register` 注册斜杠命令。

三个例子摆在一起，能力边界就清楚了：看界面 → 插手事件 → 主动发起 UI 和命令。

### 7 什么时候该写 mod，什么时候不该

只是想在某个事件上跑一段外部逻辑，用设置 hook，别写 mod。想给 Claude 加知识和流程规范，那是 skill、AGENTS.md、slash command 的活。想硬性禁止某些操作，用权限规则，mod 挡不住绕过它的写法。

真正适合 mod 的，是这几类需求：我要一个界面元素常驻显示某个数据；我要在某个动作发生前后做程序化的判断和干预；我要给会话加一条自己的命令；我要给模型注册一个专用工具。共同点是它们都需要"有状态、有界面、能参与事件链"，这三样恰好是外部脚本给不了的。

### 8 最短的上手路径

其实不需要先学 API。运行 `claude`，直接描述你想要什么——"在输入框上方做一条播报，显示上下文窗口用了多少，25% 以下标晴、90% 以上提醒压缩"。Claude Code 自己会写 mod，你只需要在它问要不要开热重载时说可以。

之后每次改动都原地重载，你可以继续追加需求，眼看着界面变。想留住它，把文件夹拷出来，按普通插件装上就行。

结构上也没什么神秘的：一个标准插件目录，一份 `plugin.json`，`hooks/hooks.json` 里指向那唯一一个模块，模块导出 `register(on)`，在里面 `on(event, matcher, hook)` 挂你想要的钩子。写完 `claude plugin validate` 验一遍，`claude plugin test` 跑一遍——测试里注册的 hook 排在被测试的 mod 后面，替 Claude Code 作答，所以你想让它返回什么就返回什么。

最后提醒一句安全的事：mod 是一段在你机器上、以 Claude Code 同等权限运行的代码，由发布者写的，不是 Anthropic 写的。装别人分享的 mod，请像装 npm 包一样，先看仓库源码，只从信任的人那里装。

## 使用篇：不写代码，先把它用起来

### 1 前置条件只有一条

必须是 Claude Code 2.1.287 以上版本。`claude --version` 看一眼。mod 默认就是开启的，没有任何开关需要你去拨。

### 2 拿到一个 mod 的三种方式

**方式一：让 Claude 当场给你写一个（最推荐，零门槛）**

运行 `claude` 开个会话，直接描述你要什么。注意描述里只写"我想看到什么"，不要写 API——API 那部分它自己懂。

它会问你一次：要不要为本次会话开启热重载。**一定要答应**。答应之后，它这一回合结束你就能在输入框上方看到东西，而且此后每次改动都原地重载，你可以连续追加需求（"阈值改成 70%""末尾加上花费"），界面跟着变。

有个坑必须提前知道：这种方式生成的 mod **只在当前会话加载，文件夹之后会被清理掉**。想留住它，趁会话还在，把那个文件夹整个拷出来，再按普通插件的方式装。

**方式二：本地目录挂载，跑自己的代码**

`claude --plugin-dir ./token-weather` 带着这个目录启动，插件立刻生效。目录是被监听的，保存即重载，不用重启。开发阶段就靠这一条。

**方式三：装别人发布的**

```
/plugin marketplace add your-org/my-mods
/plugin install token-weather@my-mods
/reload-plugins
```

reload 之后就开始跑。如果没出现，重启一次 Claude Code。

### 3 装之前该做的事

mod 是一段在你机器上、以 Claude Code 同等权限运行的代码，由发布者写，不是 Anthropic 写的。所以：先打开仓库读源码，再装；只从你信任的人那里装。好消息是，在你自己敲下安装命令之前，什么都不会被自动装上。

## 开发篇：自己动手写一个

### 1 先把目录架子搭起来

mod 本质就是一个标准插件，只是行为逻辑写在一个模块里：

```
my-mod/
├── .claude-plugin/
│   ├── plugin.json
│   └── types/                   ← ClaudeCode 加载时自动生成，别手改
└── hooks/
    ├── hooks.json               ← 只指一个模块
    └── my-mod.mjs
```

三份文件的最小内容：

`.claude-plugin/plugin.json`：

```json
{
  "name": "my-mod",
  "version": "0.1.0",
  "description": "……",
  "author": { "name": "You" },
  "types": "./types/index.d.ts"
}
```

用到 `$.state` 就必须写 `"types"` 这一行，指向类型契约文件。

`hooks/hooks.json`：

```json
{
  "modules": ["./my-mod.mjs"]
}
```

一个 mod 只能有一个模块。

`hooks/my-mod.mjs` —— 所有 mod 的起点都是这个形状：

```js
export function register(on, options) {
  on("事件名", { 匹配条件 }, async ($, e, next) => {
    // $     整套 API：ui / session / state / store / fs / process / clock / http / tool / command / model …
    // e     这次事件的输入数据
    // next  放行，交给链上下游的下一个插件，最后到 Claude Code
    return next(e);
  });
}
```

模块跑在独立沙箱里：**没有 DOM，也没有 Node**。要碰外面的世界，一律走 `$`。这条约束决定了 API 长什么样，写之前先接受它。

### 2 开发动作只有三种，先想清楚你要哪种

```js
// ① 观察：先放行，再看结果。不改任何东西，最安全
on("turn.complete", async ($, e, next) => {
  const r = await next(e);
  // 看一眼 r，取个读数
  return r;
});

// ② 改写：换掉下游看到的数据
on("tool.call", { tool: "Bash" }, ($, e, next) =>
  next({ ...e, command: e.command.replace("rm ", "rm -i ") })
);

// ③ 代答：根本不往下传，由你给结论
on("tool.call", { tool: "Bash" }, ($, e, next) =>
  /gitpush.*--force/.test(e.command) ? { deny: "强制推送已被 mod 拦下" } : next(e)
);
```

可订阅的事件：`tool.call`（工具调用）、`prompt.submit`（提交出去的提示词）、`turn.start` / `turn.complete`（回合）、`session.start` / `session.end`（会话）、`command.run`（斜杠命令）、`ui.render`（界面每画一块都发一次）。

### 3 常用配方

**配方 A：在输入框上方画一行常驻信息**

`AbovePrompt` 是官方自己不用的区域，最适合新手。

```js
on("ui.render", { component: "AbovePrompt" }, ($, e, next) => {
  // 元素不是全局变量，必须按当前渲染面去取
  const { Box, Text } = $.ui.resolve(e);
  return Box({
    paddingX: 1,
    children: [Text({ color: "yellow", bold: true, children: "☀ 一切正常" })],
  });
});
```

三条纪律：

- 今天不画就 `return next(e)`，把这块让给 Claude Code 和其他 mod。
- props 全在 `e.props` 上，`e` 顶层只有 `component` / `surface` / `requestId` / `viewport`。
- `bodyColumns` 是这块区域的真实宽度，右侧停了窗格时它比终端窄，排版按它算，别按终端宽度。图标用单宽字符（☀ ☂ ↯），别用 emoji，emoji 在不同终端字体下会错位。

**配方 B：把数据跨重载存住**

```js
// 由宿主持有的键，不要用模块级 let —— 热重载会清零
const readings = { plugin: "my-mod", key: "readings" };

async function save($, v) {
  const { value: history = [] } = await $.state.get(readings);
  await $.state.set(readings, [...history, v].slice(-12));
}
```

配套的类型契约写在 `types/index.d.ts`，并在清单里用 `"types"` 指过去：

```ts
// types/index.d.ts
declare module "claude-code" {
  interface PluginState {
    "my-mod": { readings: { tokens: number; percent: number }[] };
  }
}
```

漏了这步 `validate` 会拦住你，好在报错里直接告诉你怎么改。换来的收益很值：渲染期间调过的 `$.state.get` 会自动订阅，之后任何 `set` 都会自动重绘，**你永远不用手动调 `$.ui.invalidate`**。

**配方 C：读上下文窗口占用**

```js
const { context } = await $.session.usage();
// context.tokens  = 上次响应所基于的输入量（单位：词元）
// context.window  = 模型窗口总量
// context.percent = 两者之比
```

数字和状态栏完全一致。这个调用不额外花钱，只有你要 `breakdown` 时才会多发一次词元计数请求。取数时机用 `session.start` 加 `turn.complete`，并且判断 `if (!e.agentId)`——这是主循环回合，`agentId` 存在说明是子智能体的回合，别混进来。

**配方 D：加一条自己的斜杠命令**

```js
on("session.start", async ($, e, next) => {
  const r = await next(e);
  await $.command.register({ name: "replay", description: "逐步回放上一回合的文件改动" });
  return r;
});

on("command.run", { command: "replay" }, async ($, e) => ({ text: "开始回放" }));
```

**配方 E：拦下危险命令，并让人做决定**

```js
on("tool.call", { tool: "Bash" }, async ($, e, next) => {
  if (!isRisky(e.command)) return next(e);          // 其余命令一律照常放行

  // 用 --dry-run、git status 之类算出这条命令会动到什么
  const report = await measure($, e.command);
  await $.ui.open({ id: "guard", title: "确认操作", focus: true });

  // decision 由窗格里按钮的 onPress 写入
  let decision = null;
  while (decision === null && !next.signal.aborted) {
    await $.process.run(["sleep", "0.25"]);         // 等 $ 的时间不计入 hook 超时
  }
  if (decision === "proceed") return next(e);
  return { deny: `已被护栏拦下，用户选择取消。这条命令本来会：${report.summary}` };
});
```

两个关键技巧：每次派发 hook 只有 10 秒时限，但阻塞在 `$` 调用里的时间不计入，所以轮询要包在 `$.process.run(["sleep", ...])` 里而不是空转；`next.signal.aborted` 表示用户按了 Esc，必须退出，否则你死等。

再强调一遍它的定位：这是安全网，不是权限系统。你读的是命令文本，`$(…)`、别名、脚本里调 `rm`，全都绕得过去。硬拦截请用权限规则。

顺带两个安全习惯：`$.process.run` 的参数用 argv 数组传，别拼 shell 字符串，否则路径里的字符会被当代码执行；`$.ui.open` 返回 `isPlaced: false` 时说明宽度不够，同一份报告要能降级画到 `AbovePrompt`。

### 4 写完之后，两条命令跑通质量关

```
claude plugin validate ./my-mod   # 用和 Claude Code 相同的方式解析清单和源码，报告订阅了什么、调用了什么
claude plugin test ./my-mod       # 在真实运行时里跑 *.test.ts
```

测试里有个很好用的机制：**测试自己用 `on` 注册的 hook 排在被测 mod 之后，负责替 Claude Code 作答**。所以你可以让 `session.usage` 精确返回你要的假数据，验证界面确实跟着变：

```ts
import { describe, expect, test } from "claude-code/testing";

describe("my-mod", () => {
  test("播报随窗口占用变化", async ($, on) => {
    let tokens = 36_100;

    // 这里注册的 hook 排在被测 mod 之后，负责替 Claude Code 作答
    on("session.start", ($, e) => ({ cwd: e.cwd }));
    on("session.usage", () => ({
      value: {
        startedAt: 0,
        rateLimits: [],
        context: { tokens, window: 200_000, percent: Math.round(tokens / 2_000) },
      },
    }));
    on("turn.complete", () => ({ text: "" }));

    await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" } as any);
    const ui = await $.ui.mount({
      plugin: "my-mod",
      surface: "terminal",
      component: "AbovePrompt",
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
    } as any);
    expect(await ui.find({ type: "Text", text: /Clear/ })).toBeDefined();
    await ui.unmount();
  });
});
```

### 5 出问题怎么查

**画面没出来**，先 `claude --debug` 启动，在里面找有没有一行说某个 hook 返回的元素树没通过校验。绝大多数情况是元素构造器用错了（没走 `$.ui.resolve(e)`），或者 props 位置不对。

**数据莫名清零**，八成是放进了模块变量。热重载等于重新加载：`register` 再跑、`session.start` 再触发，模块状态全归零。改放 `$.state`。

**类型对不上、API 用错**，去看 mod 的 `.claude-plugin/types/` 目录。Claude Code 每次加载都会把**你这个构建版本**对应的类型声明写进去，每个事件、`$` 上每个方法、每种元素的 props 都以那里为权威。API 在版本之间会变，网上抄的代码和别的版本里的写法都不可靠，这份生成的声明才可靠。也是为什么编辑器里跑 `tsc -p` 不需要任何额外配置——把这目录用起来。

## 团队篇：团队协作与分发

mod 就是插件，所以发布链路和其他插件完全一致，没有新东西要学。把目录放进一个 GitHub 仓库，仓库里配一份 marketplace 文件，这个仓库就是你们的内部市场：

```json
{
  "name": "team-mods",
  "owner": { "name": "Your Org" },
  "plugins": [{ "name": "my-mod", "source": "./my-mod" }]
}
```

更新只需一次普通 push，同事重新 reload 就拿到了。想让非技术同事也能发现，可以提交到 Claude 目录站（`claude.ai/directory/manage`），它接受含 mod 的插件。

团队场景下有三条值得写进规范的约定：

一是 mod 由谁负责、源码放在哪个仓库。因为它们有 Claude Code 同等的本机权限，装外部 mod 要走和装依赖包一样的评审流程。

二是把 `claude plugin validate` 和 `claude plugin test` 放进 CI。护栏类 mod 一旦逻辑写错，代价是危险命令被放行或者正常命令被卡死，必须有测试兜住。

三是版本敏感。既然 API 会变，就把 `.claude-plugin/types/` 生成的声明和 Claude Code 版本号一起纳入项目文档，同事之间不会出现"我这能跑你那不能跑"。

## 最后一句判断标准

要不要写 mod，看你需不需要这三样里的任意一样：**长期驻留的状态**、**随事件刷新的界面**、**插入并改写 Claude Code 的行为链**。三样都不需要——只想在某个事件上跑一段外部逻辑，用设置里的 hook 更省事；想给 Claude 补知识和流程，那是 skill、AGENTS.md、斜杠命令的活；想硬性禁止某个操作，用权限规则。
