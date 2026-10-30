from unittest.mock import patch

@patch('wearwise_app.routes.detection.detect_clothing')
def test_detect_oversized_image(mock_detect_clothing, authenticated_client):
    """Test that an image payload over 13MB returns 413 and skips processing."""
    # Create a dummy payload string that is exactly 13,000,001 characters long
    large_payload = {
        "image": "a" * 13_000_001
    }

    # Send the request to the detection route
    response = authenticated_client.post('/detect', json=large_payload)

    # Assert that the server correctly rejects it with a 413 Payload Too Large
    assert response.status_code == 413

    # Assert that the expensive ML function was completely bypassed
    mock_detect_clothing.assert_not_called()
