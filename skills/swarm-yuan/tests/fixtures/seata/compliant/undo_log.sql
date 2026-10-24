-- AT 模式 undo_log 建表（Seata 2.x，以所用版本官方 script 为准）
CREATE TABLE IF NOT EXISTS `undo_log`
(
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `branch_id`     BIGINT       NOT NULL,
    `xid`           VARCHAR(128) NOT NULL,
    `context`       VARCHAR(128) NOT NULL,
    `rollback_info` LONGBLOB     NOT NULL,
    `log_status`    INT          NOT NULL,
    `log_created`   DATETIME     NOT NULL,
    `log_modified`  DATETIME     NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_undo_log` (`xid`, `branch_id`)
) ENGINE = InnoDB;
