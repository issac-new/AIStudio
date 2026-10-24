# ruleset: netty  requires_conf: NETTY_SRC_GLOBS
# gates: fw_netty_eventloop_block(fail) fw_netty_bytebuf_release(fail) fw_netty_idle_heartbeat(warn) fw_netty_write_thread(warn) fw_netty_pipeline_order(warn) fw_netty_frame_decoder(warn) fw_netty_ssl_config(warn) fw_netty_channel_option(warn) fw_netty_eventloop_threads(warn) fw_netty_exception_caught(warn) fw_netty_sharable(warn) fw_netty_shutdown_gracefully(warn)
# harvested-from: P3（2026-07-17），规律源自 Netty 4.1.x / 4.2.x 官方文档与 wiki
_fw_netty_check() {
  echo "  [netty] Netty 4.1.x / 4.2.x 框架规律"

  # ---------- 收集源文件清单（Java 源文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${NETTY_SRC_GLOBS[@]+"${NETTY_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "netty: NETTY_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 仅保留 Java 文件
  local javaarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
    esac
  done

  if [[ ${#javaarr[@]} -eq 0 ]]; then
    warn "netty: 无 Java 源文件可检"
    return
  fi

  # 代码正文过滤辅助：调公共库 _fw_strip_comments_c（剥离行注释与块注释行，防注释中的关键字误触发/误豁免）

  # ====================================================================
  # fw_netty_eventloop_block(fail)：EventLoop 不可阻塞
  # ====================================================================
  local blk_bad=""
  for f in "${javaarr[@]}"; do
    # 入站 handler 信号：channelRead 回调或继承入站 handler 基类（基于剥离注释后的代码正文）
    if ! _fw_strip_comments_c "$f" | grep -qE 'channelRead|extends ChannelInboundHandlerAdapter|extends SimpleChannelInboundHandler|extends ChannelDuplexHandler'; then
      continue
    fi
    local ln
    ln=$(_fw_strip_comments_c "$f" | grep -nE 'Thread\.sleep|DriverManager\.getConnection|executeQuery|executeUpdate' || true)
    [[ -n "$ln" ]] && blk_bad="${blk_bad}${f}:${ln}
"
  done
  _fw_report fail fw_netty_eventloop_block "$blk_bad" "EventLoop 回调内检出阻塞调用（Thread.sleep/JDBC），耗时业务须移交独立线程池" "EventLoop 回调内未检出阻塞调用"

  # ====================================================================
  # fw_netty_bytebuf_release(fail)：ByteBuf 引用计数须配对释放
  # ====================================================================
  local buf_bad=""
  for f in "${javaarr[@]}"; do
    _fw_strip_comments_c "$f" | grep -qE 'channelRead' || continue
    _fw_strip_comments_c "$f" | grep -qE '\bByteBuf\b' || continue
    # 自动释放路径豁免：SimpleChannelInboundHandler / ReferenceCountUtil.release / finally release
    if _fw_strip_comments_c "$f" | grep -qE 'SimpleChannelInboundHandler|release\('; then
      continue
    fi
    buf_bad="${buf_bad}${f}
"
  done
  _fw_report fail fw_netty_bytebuf_release "$buf_bad" "channelRead 消费 ByteBuf 未释放（须 finally ReferenceCountUtil.release(msg) 或改用 SimpleChannelInboundHandler，池化直接内存泄漏 CWE-401）" "ByteBuf 释放路径完整"

  # ====================================================================
  # fw_netty_idle_heartbeat(warn)：IdleStateHandler 心跳
  # ====================================================================
  local has_server=0 has_idle=0
  for f in "${javaarr[@]}"; do
    if grep -qE 'ServerBootstrap' "$f" 2>/dev/null; then
      has_server=1
    fi
    if grep -qE 'IdleStateHandler|ReadTimeoutHandler' "$f" 2>/dev/null; then
      has_idle=1
    fi
  done
  if [[ "$has_server" -eq 0 ]]; then
    pass "fw_netty_idle_heartbeat: 无 ServerBootstrap，跳过"
  elif [[ "$has_idle" -eq 1 ]]; then
    pass "fw_netty_idle_heartbeat: 已装配 IdleStateHandler/ReadTimeoutHandler"
  else
    warn "fw_netty_idle_heartbeat: ServerBootstrap 未装配 IdleStateHandler（半开连接无感知，长连接服务须心跳）"
  fi

  # ====================================================================
  # fw_netty_write_thread(warn)：writeAndFlush 线程模型
  # ====================================================================
  local wt_hit=""
  for f in "${javaarr[@]}"; do
    local ln
    ln=$(grep -nE '\.writeAndFlush\(' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && wt_hit="${wt_hit}${f}:${ln}
"
  done
  _fw_report warn fw_netty_write_thread "$wt_hit" "检出 writeAndFlush（人工确认写路径线程归属：EventLoop 内直接写 / 外部线程经 eventLoop().execute 归位，禁止外部线程改 handler 非线程安全状态）" "未检出 writeAndFlush，跳过"

  # ====================================================================
  # fw_netty_pipeline_order(warn)：ChannelPipeline 装配顺序
  # ====================================================================
  local po_bad=""
  for f in "${javaarr[@]}"; do
    grep -qE 'addLast' "$f" 2>/dev/null || continue
    # 首个业务 handler（排除 Decoder/Encoder/Codec/SSL/IdleState/Logging）的 addLast 行号
    local biz_line dec_line
    biz_line=$(grep -nE 'addLast\(' "$f" 2>/dev/null \
      | grep -vE 'Decoder|Encoder|Codec|SslHandler|IdleStateHandler|LoggingHandler|ReadTimeoutHandler|WriteTimeoutHandler|LengthFieldBasedPrepender' \
      | head -1 | cut -d: -f1)
    dec_line=$(grep -nE 'addLast\([^)]*(Decoder|Codec|SslHandler)' "$f" 2>/dev/null \
      | tail -1 | cut -d: -f1)
    if [[ -n "$biz_line" && -n "$dec_line" && "$biz_line" -lt "$dec_line" ]]; then
      po_bad="${po_bad}${f}: 业务 handler(line ${biz_line}) 前置于解码器(line ${dec_line})
"
    fi
  done
  _fw_report warn fw_netty_pipeline_order "$po_bad" "业务 handler 前置于编解码器（pipeline 顺序敏感，入站须先解码后业务）" "pipeline 装配顺序合理"

  # ====================================================================
  # fw_netty_frame_decoder(warn)：TCP 粘包拆包须装配帧解码器
  # ====================================================================
  if [[ "$has_server" -eq 0 ]]; then
    pass "fw_netty_frame_decoder: 无 ServerBootstrap，跳过"
  else
    local has_frame=0 has_bizhandler=0
    for f in "${javaarr[@]}"; do
      if grep -qE 'FrameDecoder|DelimiterBasedFrameDecoder|LineBasedFrameDecoder|FixedLengthFrameDecoder|HttpServerCodec|HttpObjectDecoder|ProtobufVarint32FrameDecoder' "$f" 2>/dev/null; then
        has_frame=1
      fi
      if grep -qE 'extends ChannelInboundHandlerAdapter|extends SimpleChannelInboundHandler|extends ChannelDuplexHandler' "$f" 2>/dev/null; then
        has_bizhandler=1
      fi
    done
    if [[ "$has_bizhandler" -eq 0 ]]; then
      pass "fw_netty_frame_decoder: 无入站业务 handler，跳过"
    elif [[ "$has_frame" -eq 1 ]]; then
      pass "fw_netty_frame_decoder: 已装配帧/协议解码器"
    else
      warn "fw_netty_frame_decoder: TCP 服务有业务入站 handler 但无帧解码器（粘包拆包风险，须 LengthFieldBasedFrameDecoder 等，maxFrameLength 须设上限）"
    fi
  fi

  # ====================================================================
  # fw_netty_ssl_config(warn)：自签证书 / InsecureTrustManagerFactory
  # ====================================================================
  local ssl_bad=""
  for f in "${javaarr[@]}"; do
    local ln
    ln=$(grep -nE 'SelfSignedCertificate|InsecureTrustManagerFactory' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && ssl_bad="${ssl_bad}${f}:${ln}
"
  done
  _fw_report warn fw_netty_ssl_config "$ssl_bad" "检出自签证书/InsecureTrustManagerFactory（仅限本地测试；生产须 CA 证书 + 严格校验 CWE-295）" "未检出不安全 SSL 配置"

  # ====================================================================
  # fw_netty_channel_option(warn)：ChannelOption 调优
  # ====================================================================
  if [[ "$has_server" -eq 0 ]]; then
    pass "fw_netty_channel_option: 无 ServerBootstrap，跳过"
  else
    local has_backlog=0 has_nodelay=0
    for f in "${javaarr[@]}"; do
      grep -qE 'SO_BACKLOG' "$f" 2>/dev/null && has_backlog=1
      grep -qE 'TCP_NODELAY' "$f" 2>/dev/null && has_nodelay=1
    done
    if [[ "$has_backlog" -eq 1 || "$has_nodelay" -eq 1 ]]; then
      pass "fw_netty_channel_option: 已显式配置 ChannelOption（SO_BACKLOG/TCP_NODELAY）"
    else
      warn "fw_netty_channel_option: ServerBootstrap 未配 SO_BACKLOG/TCP_NODELAY（accept 队列与 Nagle 默认行为须按负载确认）"
    fi
  fi

  # ====================================================================
  # fw_netty_eventloop_threads(warn)：EventLoopGroup 线程数
  # ====================================================================
  local el_bad=""
  for f in "${javaarr[@]}"; do
    local ln
    ln=$(grep -nE 'new (Nio|Epoll|KQueue)EventLoopGroup\((1|[6-9][0-9]|[0-9]{3,})\)' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && el_bad="${el_bad}${f}:${ln}
"
  done
  _fw_report warn fw_netty_eventloop_threads "$el_bad" "EventLoopGroup 显式线程数异常（默认 = CPU 核数 × 2；1 线程饿连接，>64 线程徒增切换）" "EventLoopGroup 线程数配置合理（默认 CPU×2）"

  # ====================================================================
  # fw_netty_exception_caught(warn)：handler 须覆写 exceptionCaught
  # ====================================================================
  local ec_bad=""
  for f in "${javaarr[@]}"; do
    grep -qE 'extends ChannelInboundHandlerAdapter|extends ChannelDuplexHandler' "$f" 2>/dev/null || continue
    if ! grep -qE 'exceptionCaught' "$f" 2>/dev/null; then
      ec_bad="${ec_bad}${f}
"
    fi
  done
  _fw_report warn fw_netty_exception_caught "$ec_bad" "入站 handler 未覆写 exceptionCaught（异常裸奔到 TailContext 仅打日志不关连接）" "入站 handler 均覆写 exceptionCaught"

  # ====================================================================
  # fw_netty_sharable(warn)：@Sharable 线程安全
  # ====================================================================
  local sh_bad=""
  for f in "${javaarr[@]}"; do
    grep -qE '@Sharable|@ChannelHandler\.Sharable' "$f" 2>/dev/null || continue
    # 非 final 的可变成员字段（排除 static final 常量 / logger / 局部变量）
    local ln
    ln=$(sed -E 's://.*$::' "$f" 2>/dev/null \
       | grep -nE '^[[:space:]]*(private|protected|public)[[:space:]]+' \
       | grep -vE 'final|static|@' || true)
    [[ -n "$ln" ]] && sh_bad="${sh_bad}${f}:${ln}
"
  done
  _fw_report warn fw_netty_sharable "$sh_bad" "@Sharable handler 含非 final 可变成员（跨 Channel 共享实例，须确认线程安全或去掉 @Sharable 每连接 new）" "@Sharable handler 无可变实例状态"

  # ====================================================================
  # fw_netty_shutdown_gracefully(warn)：EventLoopGroup 优雅关闭
  # ====================================================================
  local has_elg=0 has_shutdown=0
  for f in "${javaarr[@]}"; do
    grep -qE 'new (Nio|Epoll|KQueue|Default)EventLoopGroup\(' "$f" 2>/dev/null && has_elg=1
    grep -qE 'shutdownGracefully' "$f" 2>/dev/null && has_shutdown=1
  done
  if [[ "$has_elg" -eq 0 ]]; then
    pass "fw_netty_shutdown_gracefully: 未自建 EventLoopGroup，跳过"
  elif [[ "$has_shutdown" -eq 1 ]]; then
    pass "fw_netty_shutdown_gracefully: 已配 shutdownGracefully 优雅关闭"
  else
    warn "fw_netty_shutdown_gracefully: 创建 EventLoopGroup 但无 shutdownGracefully（进程退出线程与直接内存不释放）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
