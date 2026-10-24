package com.example.netty;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.util.ReferenceCountUtil;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * compliant fixture handler:
 *  - 耗时业务移交独立业务线程池（EventLoop 立即返回）
 *  - ByteBuf 在 finally 中 ReferenceCountUtil.release 配对释放
 *  - 覆写 exceptionCaught：记日志 + 关连接
 *  - 无可变实例状态（executor 为 static final），可安全共享
 */
public class EchoServerHandler extends ChannelInboundHandlerAdapter {

    private static final ExecutorService BUSINESS_POOL = Executors.newFixedThreadPool(8);

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        final String request;
        try {
            ByteBuf in = (ByteBuf) msg;
            request = in.toString(StandardCharsets.UTF_8);
        } finally {
            ReferenceCountUtil.release(msg);
        }
        BUSINESS_POOL.submit(() -> {
            String result = BusinessWorker.queryOrderName(request);
            ctx.eventLoop().execute(() ->
                ctx.writeAndFlush(Unpooled.copiedBuffer(result, StandardCharsets.UTF_8)));
        });
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }
}
