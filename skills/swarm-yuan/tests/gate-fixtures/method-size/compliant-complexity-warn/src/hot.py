def pack(items, flag, limit):
    total = 0
    if flag:
        total += 1
    for item in items:
        if item and limit:
            total += item
    while total > limit:
        total -= 1
    return total


def calm(x):
    return x + 1
