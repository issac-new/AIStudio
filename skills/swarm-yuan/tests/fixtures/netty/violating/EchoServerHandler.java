package com.example.netty;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;

/**
 * violating fixture handler:
 *  - channelRead 内 Thread.sleep(500) + DriverManager JDBC 查询 → 阻塞 EventLoop
 *  - msg 转 ByteBuf 读取后从不 release → 池化直接内存泄漏
 *  - 未覆写 exceptionCaught → 异常裸奔
 */
public class EchoServerHandler extends ChannelInboundHandlerAdapter {

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
        ByteBuf in = (ByteBuf) msg;
        String request = in.toString(StandardCharsets.UTF_8);

        // 模拟耗时业务：直接睡在 EventLoop 上
        Thread.sleep(500);

        // 同步 JDBC 查询，冻结整个 EventLoop 上的所有连接
        Connection conn = DriverManager.getConnection("jdbc:mysql://db:3306/app", "etl", "secret");
        ResultSet rs = conn.createStatement().executeQuery("SELECT name FROM t_order WHERE id = " + request);
        String result = rs.next() ? rs.getString(1) : "NOT_FOUND";
        conn.close();

        ctx.writeAndFlush(Unpooled.copiedBuffer(result, StandardCharsets.UTF_8));
        // 从未 release(msg) —— 引用计数不归零，ByteBuf 泄漏
    }
}
