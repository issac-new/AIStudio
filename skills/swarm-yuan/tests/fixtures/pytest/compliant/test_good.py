import pytest
# compliant: function fixture + assert x == y + tmp_path
@pytest.fixture
def fresh_data():
    return {"count": 0}

def test_one(fresh_data):
    val = do_something()
    assert val == expected_value

def test_two(tmp_path):
    f = tmp_path / "data.txt"
    f.write_text("test")
