def oversized(values):
    total = 0
    count = 0
    for value in values:
        total = total + value
        count = count + 1
        if count > 100:
            total = total - value
    average = total / count
    return average
