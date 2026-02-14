import time
from ml_models import check_for_update, load  # your internal model functions

class ModelUpdater:
    def __init__(self, registry):
        """
        registry: an object that holds ML models and provides load_model(engine_name, path)
        """
        self.registry = registry
        self.version = "v1.0"
        self.interval = 3600  # default: check every hour

    def update_model(self, engine_name: str):
        """
        Update a single model
        """
        if check_for_update(engine_name):
            print(f"♻️ Updating model for {engine_name}")
            self.registry.load_model(engine_name, f"models/{engine_name}.pt")
            print(f"✅ Model {engine_name} updated successfully")

    def auto_update_models(self):
        """
        Continuously check and update all models in registry
        """
        while True:
            for engine_name, model in self.registry.models.items():
                self.update_model(engine_name)
            time.sleep(self.interval)
