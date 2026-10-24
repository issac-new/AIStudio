#include <stdio.h>
#include <string>
#include <memory>

const char* greet(const std::string& name) {
    return name.c_str();
}

int main() {
    char buf[100];
    snprintf(buf, sizeof(buf), "%s", "hello");

    auto ptr = std::make_unique<int>(42);
    int* p = nullptr;

    printf("%s\n", greet("world"));
    return 0;
}
