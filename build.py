import os
from huggingface_hub import hf_hub_download
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

def pre_download_model():
    """
    Downloads the configured ML model during the build stage.
    This ensures the app starts up quickly in production without 
    stalling on the first request.
    """
    repo_id = os.environ.get('ML_MODEL_REPO', "Bingsu/adetailer")
    filename = os.environ.get('ML_MODEL_FILENAME', "deepfashion2_yolov8s-seg.pt")
    
    print(f"--- Build Stage: Downloading ML Model ---")
    print(f"Target: {repo_id}/{filename}")
    
    try:
        path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
        )
        print(f"Success: Model downloaded to {path}")
    except Exception as e:
        print(f"Error: Failed to download model during build: {e}")
        # We don't exit with 1 here to allow the build to continue if it's 
        # a transient network issue, as the app has a local fallback.

if __name__ == "__main__":
    pre_download_model()
