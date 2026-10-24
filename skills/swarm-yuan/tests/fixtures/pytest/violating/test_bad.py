import pytest
# violating: session fixture 含可变 append + 仅 assert x + tmpdir
@pytest.fixture(scope="session")
def shared_list():
    result = []
    result.append("init")  # session fixture 可变操作
    return result

def test_one(shared_list):
    val = do_something()
    assert val  # truthy-only 断言

def test_two(tmpdir):
    f = tmpdir.join("data.txt")
    f.write("test")
