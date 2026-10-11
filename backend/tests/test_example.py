import pytest

class TestPytestClass:
    @pytest.mark.fast
    def test_pytest(self):
        assert "Pytest working" == "Pytest working"


