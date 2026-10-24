package com.example.netty;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;

/**
 * compliant fixture 业务 worker：
 *  - JDBC 阻塞调用在独立业务线程池执行，不触碰 EventLoop
 *  - 非 Netty handler（无 channelRead / 不入站基类），eventloop_block 门禁不误伤
 */
public final class BusinessWorker {

    private BusinessWorker() {
    }

    public static String queryOrderName(String orderId) {
        try {
            Connection conn = DriverManager.getConnection("jdbc:mysql://db:3306/app", "etl", "secret");
            ResultSet rs = conn.createStatement().executeQuery("SELECT name FROM t_order WHERE id = ?");
            String result = rs.next() ? rs.getString(1) : "NOT_FOUND";
            conn.close();
            return result;
        } catch (Exception e) {
            return "ERROR";
        }
    }
}
