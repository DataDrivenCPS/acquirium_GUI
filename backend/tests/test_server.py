import time
from fastapi.testclient import TestClient
from src.server import app

class TestServerClass:

    test_client = None

    @classmethod
    def setup_class(self):
        
        # Defines the server we are testing
        self.test_client = TestClient(app=app)

    # Assert that we can access the FastAPI root endpoint at least 5 seconds after it is started
    def test_fastapi_server_start(self):

        time.sleep(5.0)
        response = self.test_client.get("/")
        assert response.status_code == 200
        assert response.json() == {"description": "Acquirium GUI Backend"}

    # Assert that we can reach the Acquirium Server through the FastAPI Server
    # at least 5 minutes after starting the FastAPI server via polling a health endpoint
    def test_fastapi_acquirium_integration(self):

        timeout = 300.0  # 5 minute timeout
        start_time = time.time()
        response = None

        # polling health endpoint for response
        while time.time() - start_time < timeout:
            try:
                response = self.test_client.get("/server-health")
                if response.status_code == 200:
                    break
            except Exception:
                pass  # continue to wait for response
            time.sleep(5.0)

        assert response is not None
        assert response.status_code == 200
        assert response.json() == {"status": "OK"}