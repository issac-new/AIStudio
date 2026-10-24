package com.example.search;

import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.search.builder.SearchSourceBuilder;
import org.springframework.stereotype.Service;

/**
 * 违规样例：
 * - from(50000) 深分页超 max_result_window（fw_es_deep_pagination fail）
 * - wildcardQuery 前缀通配 *（fw_es_wildcard_prefix fail）
 */
@Service
public class EsSearchService {

    public SearchSourceBuilder buildOrderQuery(String keyword, int pageNo) {
        SearchSourceBuilder source = new SearchSourceBuilder();
        // 深分页：from+size 超 10000，协调节点堆内排序膨胀
        source.from(50000).size(20);
        // 前缀通配：退化为全 term 扫描
        source.query(QueryBuilders.wildcardQuery("orderNo", "*" + keyword));
        return source;
    }
}
