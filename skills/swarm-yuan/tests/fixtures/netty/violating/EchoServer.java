package com.example.netty;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;

/**
 * violating fixture:
 *  - EventLoop 回调内阻塞（EchoServerHandler: Thread.sleep + JDBC）→ fw_netty_eventloop_block(fail) 主触发
 *  - ByteBuf 消费后未 release → fw_netty_bytebuf_release(fail) 主触发
 *  - 另触发多条 warn：单线程 EventLoopGroup / 无心跳 / 无帧解码器 / 无 ChannelOption / 无 shutdownGracefully
 *
 * 期望：bash run-framework-fixture.sh netty → violating 退出码 != 0（FAIL）
 */
public class EchoServer {

    public static void main(String[] args) throws Exception {
        EventLoopGroup bossGroup = new NioEventLoopGroup(1);
        EventLoopGroup workerGroup = new NioEventLoopGroup(1);
        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
         .channel(NioServerSocketChannel.class)
         .childHandler(new ChannelInitializer<SocketChannel>() {
             @Override
             public void initChannel(SocketChannel ch) {
                 ch.pipeline().addLast(new EchoServerHandler());
             }
         });
        ChannelFuture f = b.bind(8080).sync();
        f.channel().closeFuture().sync();
    }
}
