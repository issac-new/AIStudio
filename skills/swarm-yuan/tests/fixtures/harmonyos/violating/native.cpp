// harmonyos fixture violating native (NDK): napi 调用无注册 + malloc 无 free + napi_create_reference 无 delete
#include <napi/native_api.h>
#include <stdlib.h>

static napi_value Add(napi_env env, napi_callback_info info) {
  int* p = (int*)malloc(sizeof(int));  // 分配无 free
  *p = 10;
  napi_value result;
  napi_create_int32(env, *p, &result);
  napi_create_reference(env, result, 1, nullptr);  // 无 napi_delete_reference
  return result;
}

// 无 napi_module / napi_define_properties 注册
