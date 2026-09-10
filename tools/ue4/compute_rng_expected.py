def mulberry32(seed):
    a = seed & 0xFFFFFFFF

    def next():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return next


for seed in (42, 7, 123456):
    n = mulberry32(seed)
    vals = [n() for _ in range(5)]
    print("seed %d: %.15f %.15f %.15f %.15f %.15f" % (seed, *vals))
