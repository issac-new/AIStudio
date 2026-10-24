#!/usr/bin/env bats
# spec-first-lib 单元测试（WP8 示范：库级 bats 化——纯函数、秒级、无夹具依赖）
# 运行：bats swarm-yuan/tests/bats/spec-first-lib.bats
# 独立示范，未入 sweep/CI——bats 非三平台 CI 预装，接入前须先加安装步骤或优雅降级。

setup() {
  LIB="$BATS_TEST_DIRNAME/../../assets/spec-first-lib.sh"
  CONF=$(mktemp)
}

teardown() { rm -f "$CONF"; }

@test "spf_conf_val plain_value" {
  printf 'SPEC_REQUIRED=1\n' > "$CONF"
  source "$LIB"
  [ "$(spf_conf_val "$CONF" SPEC_REQUIRED)" = 1 ]
}

@test "spf_conf_val strip_inline_comment" {
  printf 'SPEC_GLOB=docs/specs/*.md  # 说明\n' > "$CONF"
  source "$LIB"
  [ "$(spf_conf_val "$CONF" SPEC_GLOB)" = "docs/specs/*.md" ]
}

@test "spf_conf_val hash_inside_quotes_preserved" {
  printf "SPEC_GLOB='a#b/*.md'\n" > "$CONF"
  source "$LIB"
  [ "$(spf_conf_val "$CONF" SPEC_GLOB)" = 'a#b/*.md' ]
}

@test "spf_conf_val double_quote_strip_keep_spaces" {
  printf 'DIRS="src lib  x"\n' > "$CONF"
  source "$LIB"
  [ "$(spf_conf_val "$CONF" DIRS)" = "src lib  x" ]
}

@test "spf_conf_val single_quote_strip" {
  printf "KEY='hello world'\n" > "$CONF"
  source "$LIB"
  [ "$(spf_conf_val "$CONF" KEY)" = "hello world" ]
}

@test "spf_conf_val last_definition_wins" {
  printf 'K=1\nK=2\n' > "$CONF"
  source "$LIB"
  [ "$(spf_conf_val "$CONF" K)" = 2 ]
}

@test "spf_conf_val missing_file_empty_rc0" {
  source "$LIB"
  run spf_conf_val "$CONF.missing" K
  [ "$status" = 0 ]
  [ -z "$output" ]
}

@test "spf_conf_val unset_key_empty" {
  printf 'OTHER=1\n' > "$CONF"
  source "$LIB"
  [ -z "$(spf_conf_val "$CONF" K)" ]
}
