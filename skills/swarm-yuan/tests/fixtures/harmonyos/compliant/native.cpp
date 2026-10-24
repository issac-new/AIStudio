// harmonyos fixture compliant native (NDK): napi 注册 + malloc 配对 free + napi_create_reference 配对 delete
#include <napi/native_api.h>
#include <stdlib.h>

static napi_value Add(napi_env env, napi_callback_info info) {
  int* p = (int*)malloc(sizeof(int));
  if (p == nullptr) return nullptr;
  *p = 10;
  napi_value result;
  napi_create_int32(env, *p, &result);
  free(p);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
    {"add", nullptr, Add, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 1, desc);
  return exports;
}

static napi_module demoModule = {
  .nm_version = 1,
  .nm_register_func = Init,
  .nm_modname = "demo",
};

extern "C" __attribute__((constructor)) void RegisterDemoModule() {
  napi_module_register(&demoModule);
}
