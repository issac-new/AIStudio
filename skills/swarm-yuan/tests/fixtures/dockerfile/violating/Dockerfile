# violating fixture Dockerfile:
#  - FROM :latest → fw_dockerfile_latest_base(fail)
#  - 无 USER → fw_dockerfile_root_user(fail)
#  - ENV PASSWORD=xxx → fw_dockerfile_hardcoded_secret(fail)
#  - 无 HEALTHCHECK → fw_dockerfile_no_healthcheck(warn)
#  - 单 FROM → fw_dockerfile_no_multistage(warn)
#  - 同级无 .dockerignore → fw_dockerfile_no_dockerignore(warn)
#  - apt-get install 无 --no-install-recommends + 无清缓存 → fw_dockerfile_apt_cleanup(warn)
#  - COPY 无 --chown → fw_dockerfile_copy_no_chown(warn)
#  - 无 EXPOSE → fw_dockerfile_no_expose(warn)
#  - 仅 CMD 无 ENTRYPOINT → fw_dockerfile_entrypoint_cmd_split(warn)
#
# 期望：dockerfile fixture violating → 退出码 != 0（FAIL，因 latest_base/root_user/hardcoded_secret 3 fail 主触发）

FROM ubuntu:latest

RUN apt-get update && apt-get install -y curl nginx

ENV PASSWORD=Sup3rSecret!
ENV API_KEY=sk-1234567890abcdef

COPY app/ /app/
COPY config/ /etc/app/

CMD ["nginx", "-g", "daemon off;"]
