# Tests

```
./.venv/bin/python -m pytest
```

Our TDD workflow should be:
- Write failing tests to ensure desired function implementation.
- Implement functions to pass tests.
    - Ensure other unrelated tests do not fail as a result of implementation.
- Refactor!

Make sure your test file names are prefixed with 'test_' so pytest can discover new tests. Additionally, test functions should start with 'test_'. Pytest will search nested directories recursively unless specified otherwise.

<https://docs.pytest.org/en/stable/explanation/goodpractices.html#test-discovery>