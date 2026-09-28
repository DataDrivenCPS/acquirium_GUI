class TestPytestClass:
    def test_pytest(self):
        assert "Pytest working" == "Pytest working"


    @pytest.mark.integration
    def test_server_is_reachable(self):
        assert "server is working" == "server is working" 

    @pytest.mark.integration 
    def test_client_can_query(self):
        assert "query works" == "query works" 
