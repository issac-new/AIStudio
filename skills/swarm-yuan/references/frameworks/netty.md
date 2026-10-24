---
ruleset_id: netty
适用版本: Netty 4.1.x（现行维护线，2026-07 最新 4.1.136.Final）/ 4.2.x（2025-04-03 GA，2026-07 最新 4.2.16.Final；差异单独标注）/ 5.0 停滞于 5.0.0.Alpha5（2022-09-28 后无新版）
最后调研: 2026-07-17（来源：https://netty.io/news/ ；https://github.com/netty/netty ；https://netty.io/wiki/reference-counted-objects.html ；https://netty.io/4.1/api/io/netty/handler/timeout/IdleStateHandler.html ；https://netty.io/4.1/api/io/netty/channel/ChannelOption.html ）
深度门槛: 10
---

# Netty 规则集

<!--
本规则集覆盖 Netty 4.1.x（现行维护主线，2026-07-09 发布 4.1.136.Final）与 4.2.x（2025-04-03 首个 GA 4.2.0.Final，
2026-07-06 发布 4.2.16.Final；4.2 主要变化为模块结构调整与默认行为微调，未逐条联网核实，差异处标"待验证"）。
Netty 5.0 停滞于 5.0.0.Alpha5（2022-09-28），不作为现行版本覆盖。
调研时点：2026-07-17。无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `io.netty:netty-all` / `netty-buffer` / `netty-transport` / `netty-codec` / `netty-handler` / `netty-codec-http` | 高 |
| 注解 | `@ChannelHandler.Sharable` / `@Sharable` | 高 |
| 文件 | `**/netty/**` 包目录 / `**/*ChannelInitializer*.java` | 中（需排除仅依赖传递） |
| 配置 | `ServerBootstrap` / `Bootstrap` / `NioEventLoopGroup` / `EpollEventLoopGroup` / `ChannelOption\.` | 高 |
| 代码 | `ChannelInboundHandlerAdapter` / `SimpleChannelInboundHandler` / `ByteBuf` / `ChannelPipeline` / `writeAndFlush` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 netty 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- ChannelHandler 实现类：`grep -rlE 'extends (ChannelInboundHandlerAdapter|SimpleChannelInboundHandler|ChannelOutboundHandlerAdapter|ChannelDuplexHandler)|implements Channel(Inbound|Outbound)Handler' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：handler 实现类文件数 = `grep -l … | wc -l`）
- ChannelInitializer / Pipeline 装配：`grep -rnE 'extends ChannelInitializer|pipeline\(\)\.addLast|\.addLast\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：addLast 装配行数）
- EventLoopGroup 创建点：`grep -rnE 'new (Nio|Epoll|KQueue|Default)EventLoopGroup\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：EventLoopGroup 构造行数）
- ByteBuf 使用点：`grep -rlE '\bByteBuf\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：引用 ByteBuf 的文件数）
- IdleStateHandler 心跳装配：`grep -rnE 'IdleStateHandler|ReadTimeoutHandler|WriteTimeoutHandler' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：心跳 handler 装配行数）
- SSL/TLS 装配：`grep -rnE 'SslContextBuilder|SslHandler|SelfSignedCertificate|InsecureTrustManagerFactory' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：SSL 相关行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：EventLoop 线程不可阻塞，业务耗时操作须移交独立线程池
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: `channelRead` 等 handler 回调运行在 EventLoop 线程上，该线程同时负责该 Channel 所在 EventLoopGroup 内所有 Channel 的 I/O。在回调内执行 `Thread.sleep`、JDBC 查询、同步 HTTP 调用、`future.get()` 等阻塞操作会冻结整个 EventLoop 上全部连接。耗时业务必须移交独立业务线程池（`EventExecutorGroup` 装配 handler 或 `executor.submit` 后在回调外执行）。
- **违反后果**: 单个慢请求阻塞全部连接，吞吐量雪崩、读写超时连锁触发（Netty 官方指南明确禁止）。
- **验证方法**: `grep -rlE 'channelRead|ChannelInboundHandlerAdapter|SimpleChannelInboundHandler' --include='*.java'` 命中的文件内检出 `Thread\.sleep|DriverManager|executeQuery|executeUpdate|\.get\(\)` → fail。
- **对应门禁**: fw_netty_eventloop_block(fail)

```verify
id: netty-r1
cmd: grep -rlE 'channelRead|ChannelInboundHandlerAdapter|SimpleChannelInboundHandler' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：ByteBuf 引用计数须配对释放，防内存泄漏
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: Netty 默认池化分配（`PooledByteBufAllocator`），`ByteBuf` 实现 `ReferenceCounted`，引用计数归零才归还池。入站消息在 `channelRead` 消费后须在 `finally` 中 `ReferenceCountUtil.release(msg)`（或改用 `SimpleChannelInboundHandler` 自动释放）；出站 `writeAndFlush` 由 Netty 释放。未释放即泄漏，`-Dio.netty.leakDetection.level=PARANOID` 可探测（生产建议 SIMPLE/ADVANCED 抽检，默认 SIMPLE；待验证：4.2 是否调整默认级别）。
- **违反后果**: 直接内存泄漏直至 `OutOfDirectMemoryError`（Netty leak detector 报 LEAK 日志）。
- **验证方法**: 含 `channelRead` 且引用 `ByteBuf` 的文件中无 `release(` 且未继承 `SimpleChannelInboundHandler` → fail。
- **对应门禁**: fw_netty_bytebuf_release(fail)

```verify
id: netty-r2
cmd: 
expect: always
```

### 规律：长连接服务须配 IdleStateHandler 心跳与断线判定
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: TCP 长连接无法感知对端假死（半开连接）。服务端 pipeline 须装配 `IdleStateHandler(readerIdleTime, writerIdleTime, allIdleTime)` 并在 `userEventTriggered` 中处理 `IdleStateEvent`（关连接或发心跳），客户端配合定时心跳与断线重连。`ReadTimeoutHandler` 可在超时时直接关闭连接。
- **违反后果**: 半开连接堆积，文件描述符耗尽；客户端向死连接发数据全部超时失败。
- **验证方法**: 检出 `ServerBootstrap` 装配但无 `IdleStateHandler|ReadTimeoutHandler` → warn。
- **对应门禁**: fw_netty_idle_heartbeat(warn)

```verify
id: netty-r3
cmd: 
expect: always
```

### 规律：writeAndFlush 跨线程调用须知线程模型，外部线程写须走 EventLoop 或依赖其线程安全
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: `channel.writeAndFlush(msg)` 在 EventLoop 线程内调用直接写出；从外部线程调用时 Netty 会将其封装为任务提交到该 Channel 的 EventLoop 执行（线程安全，但入队有开销与顺序保证：按提交序）。禁止在外部线程直接操作 `ChannelHandlerContext` 的非线程安全状态；业务线程池回调写响应时建议 `channel.eventLoop().execute(...)` 显式归位，保证 handler 状态访问单线程化。
- **违反后果**: 外部线程误改 handler 共享状态 → 数据竞争；误以为 write 是同步完成 → 时序错乱。
- **验证方法**: 检出 `writeAndFlush` 使用 → warn 人工确认写路径线程归属（EventLoop 内 or 外部线程经 eventLoop().execute）。
- **对应门禁**: fw_netty_write_thread(warn)

```verify
id: netty-r4
cmd: 
expect: always
```

### 规律：ChannelPipeline 装配顺序敏感，编解码器须在业务 handler 之前
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: 入站事件按 addLast 顺序流经 handler：解码器（frame decoder → message decoder）须在业务 handler 之前，SSL 的 `SslHandler` 必须是 pipeline 第一个（先解密再解码）。顺序错置导致业务 handler 收到未解码的 ByteBuf 或密文。
- **违反后果**: ClassCastException / 协议解析错乱 / 明文数据被当密文处理。
- **验证方法**: 装配文件中业务 handler 的 `addLast` 行号先于解码器（`*Decoder`/`SslHandler`）→ warn。
- **对应门禁**: fw_netty_pipeline_order(warn)

```verify
id: netty-r5
cmd: 
expect: always
```

### 规律：TCP 粘包拆包须显式装配帧解码器
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: TCP 是字节流无消息边界，直连 `ChannelInboundHandlerAdapter` 收到的 ByteBuf 可能是半包/粘包。私有协议须按协议格式装配：`LengthFieldBasedFrameDecoder`（长度字段）、`LineBasedFrameDecoder`/`DelimiterBasedFrameDecoder`（分隔符）、`FixedLengthFrameDecoder`（定长）；HTTP/Protobuf 等有内建解码器（`HttpServerCodec`/`ProtobufVarint32FrameDecoder`）。`LengthFieldBasedFrameDecoder` 的 `maxFrameLength` 必须设上限防 OOM。
- **违反后果**: 消息切错 → 解析失败 / 协议错乱；无 maxFrameLength 上限 → 恶意长度头撑爆内存。
- **验证方法**: 检出 `ServerBootstrap` 且装配业务入站 handler，但 pipeline 无任何 `*FrameDecoder`/`HttpServerCodec`/`DelimiterBasedFrameDecoder`/`LineBasedFrameDecoder`/`FixedLengthFrameDecoder` → warn。
- **对应门禁**: fw_netty_frame_decoder(warn)

```verify
id: netty-r6
cmd: 
expect: always
```

### 规律：SSL/TLS 生产禁用自签证书与 InsecureTrustManagerFactory
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: `SslContextBuilder.forServer(...)` 生产须用 CA 签发证书；`SelfSignedCertificate` 仅限本地开发；客户端 `InsecureTrustManagerFactory.INSTANCE` 信任一切证书，等价于关闭 TLS 校验，严禁生产。`SslHandler` 须为 pipeline 首 handler。JDK 提供者可配 `SslProvider.JDK`，OpenSSL 提供者（`SslProvider.OPENSSL`，须 netty-tcnative 依赖）性能更优。
- **违反后果**: 自签/不校验证书 → 中间人攻击无感知，传输加密形同虚设（CWE-295）。
- **验证方法**: 检出 `SelfSignedCertificate|InsecureTrustManagerFactory` → warn 确认仅限测试代码。
- **对应门禁**: fw_netty_ssl_config(warn)

```verify
id: netty-r7
cmd: 
expect: always
```

### 规律：ChannelOption 须按负载调优（SO_BACKLOG / TCP_NODELAY / ALLOCATOR）
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: 服务端 `option(ChannelOption.SO_BACKLOG, ...)` 控制 accept 队列长度（Linux 高并发建议 ≥128，且受内核 `somaxconn` 上限约束）；`childOption(ChannelOption.TCP_NODELAY, true)` 关闭 Nagle 降低小包延迟（默认 false 会攒包，实时性场景必须开）；`childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT)` 池化分配（4.1 默认即池化）；`SO_KEEPALIVE` 仅 TCP 层保活，不能替代应用层心跳。
- **违反后果**: 默认 SO_BACKLOG 过小 → 突发连接被拒绝；TCP_NODELAY 未开 → 小消息延迟抖动。
- **验证方法**: 检出 `ServerBootstrap` 但无 `SO_BACKLOG`/`TCP_NODELAY` 任一 → warn。
- **对应门禁**: fw_netty_channel_option(warn)

```verify
id: netty-r8
cmd: 
expect: always
```

### 规律：EventLoopGroup 线程数按 CPU 核数 2 倍原则，禁止拍脑袋
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: `new NioEventLoopGroup()` 无参默认线程数 = `CPU 核数 × 2`（上限与 `io.netty.eventLoopThreads` 系统属性可调），这是 I/O 场景的合理默认。显式指定线程数须谨慎：`new NioEventLoopGroup(1)` 单线程无法支撑多连接并发；盲目开到数百线程只增加上下文切换。Boss（accept）通常 1 线程足够，Worker 用默认值。
- **违反后果**: 线程数过小 → 连接饥饿；过大 → 上下文切换开销、内存浪费。
- **验证方法**: 检出 `new NioEventLoopGroup\(1\)` 或显式线程数 > 64 → warn 人工确认。
- **对应门禁**: fw_netty_eventloop_threads(warn)

```verify
id: netty-r9
cmd: 
expect: always
```

### 规律：handler 必须覆写 exceptionCaught，异常不得裸奔
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: 入站 handler 未覆写 `exceptionCaught` 时，异常沿 pipeline 传播到 tail（`TailContext`），Netty 仅打印 WARN 日志而不关连接，半死状态连接持续占用资源。每个业务 handler 或 pipeline 末尾的兜底 handler 须覆写 `exceptionCaught`：记录日志 + 按协议返回错误 + `ctx.close()`。
- **违反后果**: 解码异常/业务异常导致连接悬挂，客户端无响应，问题排查无日志锚点。
- **验证方法**: 继承 `ChannelInboundHandlerAdapter`/`ChannelDuplexHandler` 的业务 handler 文件无 `exceptionCaught` → warn。
- **对应门禁**: fw_netty_exception_caught(warn)

```verify
id: netty-r10
cmd: 
expect: always
```

### 规律：@Sharable handler 必须无可变实例状态，否则每 Channel 一实例
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: `@ChannelHandler.Sharable` 标注的 handler 可被多个 pipeline 共享同一实例，其成员变量被所有 Channel 并发访问——凡可变状态（计数器、缓存、非线程安全集合）即数据竞争。有状态的 handler 不得标 @Sharable，须在 `ChannelInitializer.initChannel` 中每连接 `new` 一个实例。标了 @Sharable 的类成员必须 final/无状态或自行保证线程安全。
- **违反后果**: 跨连接状态串扰 / 数据竞争 / 计数错乱（隐蔽并发 bug）。
- **验证方法**: 检出 `@Sharable` 且类内含非 final 成员字段 → warn 人工确认线程安全。
- **对应门禁**: fw_netty_sharable(warn)

```verify
id: netty-r11
cmd: 
expect: always
```

### 规律：EventLoopGroup 必须 shutdownGracefully 优雅关闭
- **适用版本**: Netty 4.1.x / 4.2.x
- **规律**: `EventLoopGroup` 持有线程池与直接内存缓存，进程退出前必须 `shutdownGracefully()`（默认 2 秒静默期 + 15 秒超时）释放，否则 JVM 无法退出或连接被硬断。典型模式：`try { channel.closeFuture().sync(); } finally { bossGroup.shutdownGracefully(); workerGroup.shutdownGracefully(); }`。4.1.69+ 起 `shutdownGracefully` 返回的 Future 可 sync 等待（细节待验证：4.2 静默期默认值是否调整）。
- **违反后果**: 服务关停时连接被硬切 / JVM 挂住不退 / 直接内存未归还。
- **验证方法**: 创建 `EventLoopGroup` 的启动类无 `shutdownGracefully` → warn。
- **对应门禁**: fw_netty_shutdown_gracefully(warn)

```verify
id: netty-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_netty_eventloop_block | fail | handler 文件（channelRead/继承入站 handler）内检出 Thread.sleep/DriverManager/executeQuery/executeUpdate/.get() → fail (CWE-400) | NETTY_SRC_GLOBS |
| fw_netty_bytebuf_release | fail | 含 channelRead + ByteBuf 但无 release( 且非 SimpleChannelInboundHandler → fail (CWE-401) | NETTY_SRC_GLOBS |
| fw_netty_idle_heartbeat | warn | 检出 ServerBootstrap 但无 IdleStateHandler/ReadTimeoutHandler → warn (n/a) | NETTY_SRC_GLOBS |
| fw_netty_write_thread | warn | 检出 writeAndFlush → warn 人工确认写路径线程归属 (n/a) | NETTY_SRC_GLOBS |
| fw_netty_pipeline_order | warn | 业务 handler addLast 先于 Decoder/SslHandler → warn 顺序错置 (n/a) | NETTY_SRC_GLOBS |
| fw_netty_frame_decoder | warn | ServerBootstrap + 入站业务 handler 但无帧/协议解码器 → warn 粘包拆包缺失 (n/a) | NETTY_SRC_GLOBS |
| fw_netty_ssl_config | warn | 检出 SelfSignedCertificate/InsecureTrustManagerFactory → warn 仅限测试 (CWE-295) | NETTY_SRC_GLOBS |
| fw_netty_channel_option | warn | ServerBootstrap 无 SO_BACKLOG/TCP_NODELAY → warn (n/a) | NETTY_SRC_GLOBS |
| fw_netty_eventloop_threads | warn | new NioEventLoopGroup(1) 或显式线程数 >64 → warn (n/a) | NETTY_SRC_GLOBS |
| fw_netty_exception_caught | warn | 入站 handler 无 exceptionCaught 覆写 → warn (n/a) | NETTY_SRC_GLOBS |
| fw_netty_sharable | warn | @Sharable + 非 final 可变成员字段 → warn 线程安全确认 (CWE-362) | NETTY_SRC_GLOBS |
| fw_netty_shutdown_gracefully | warn | 创建 EventLoopGroup 但无 shutdownGracefully → warn (n/a) | NETTY_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_netty_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/netty.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_netty_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: netty  requires_conf: NETTY_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 EventLoop 阻塞（Thread.sleep + JDBC）+ ByteBuf 未释放 → eventloop_block/bytebuf_release 双 fail 主触发；compliant 修正（业务线程池 + finally release）→ 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| netty × spring-boot | Netty server 须在 Spring Bean 的 @PreDestroy 中 shutdownGracefully，且 Netty 线程不得调用阻塞 Spring Data 仓储 | EventLoop 阻塞 + 进程退出资源泄漏双风险 |
| netty × dubbo | Dubbo 默认用 Netty 4 作传输层，业务线程池（dubbo threadpool）与 Netty EventLoop 隔离，禁止在 EventLoop 直接跑业务 | Dubbo 已做线程模型隔离，自定义 Netty handler 插入时须遵守 |
| netty × jackson | 自定义 MessageToByteEncoder 中用 Jackson 序列化时 ObjectMapper 须为 static final 单例（线程安全） | 每消息 new ObjectMapper 性能极差；非单例共享未配置时不安全 |
| netty × kettle | Carte/集群场景底层通信与数据流不经过用户自定义 Netty 层时，二者无强交互 | 仅当用 Netty 自研 ETL 数据通道时才需同时遵守两套规律 |

<!--
无强交互的框架组合省略；本表聚焦 netty 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Netty 4.1.x | 现行维护主线（2026-07 最新 4.1.136.Final）；默认池化分配器；默认 EventLoopGroup 线程数 = CPU×2 | 本规则集规律以 4.1 API 为基准陈述 |
| Netty 4.2.0 | 2025-04-03 首个 GA；模块结构调整（netty-all 聚合方式变化，待验证细节）；部分 API 弃用清理 | 待验证：4.2 默认行为微调须人工核实，升级时逐条对照本规则集 |
| Netty 5.0.0.Alpha5 | 2022-09-28 后停滞，无 GA；API 破坏性重构（handler 签名变更） | 5.x 不作为生产目标；新工程选 4.1 或 4.2 |
| Netty 4.1.68+ | DnsNameResolver 默认行为调整；JDK9+ 模块名固化 | 升级小版本仍须跑集成测试 |
| netty-tcnative | 用 OPENSSL 提供者须额外引入 netty-tcnative 对应版本（2.x 与 netty 版本配对） | 版本错配 → UnsatisfiedLinkError 启动失败 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
