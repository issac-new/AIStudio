#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    char buf[100];
    char *name = "world";

    strcpy(buf, name);
    gets(buf);
    printf(buf);

    char *ptr = malloc(1024);

    char *p = NULL;
    int *ip = (int *)ptr;

    return 0;
}
