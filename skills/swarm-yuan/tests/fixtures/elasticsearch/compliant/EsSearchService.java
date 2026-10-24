package com.example.search;

import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch.core.SearchRequest;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 合规样例：
 * - 深翻页用 search_after + PIT（配合 sort 稳定游标）
 * - 精确过滤放 filter 上下文（免 score 且可缓存）
 */
@Service
public class EsSearchService {

    public SearchRequest buildOrderQuery(String tenantId, List<String> searchAfter) {
        SearchRequest.Builder builder = new SearchRequest.Builder()
                .index("orders")
                .size(20)
                .sort(s -> s.field(f -> f.field("createTime").order(SortOrder.Desc)))
                .sort(s -> s.field(f -> f.field("_id").order(SortOrder.Asc)))
                .query(q -> q.bool(b -> b
                        .filter(f -> f.term(t -> t.field("tenantId").value(tenantId)))
                        .filter(f -> f.term(t -> t.field("status").value("PAID")))));
        if (searchAfter != null && !searchAfter.isEmpty()) {
            builder.searchAfter(searchAfter);
        }
        return builder.build();
    }
}
