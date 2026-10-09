"""
test_inventory_cache.py - Unit and Integration Tests for Inventory Cache.

Verifies SQLite persistent inventory cache, immediate launch loading,
HTTP delta updates, schema corruption recovery, query speeds, and thread safety.
"""

import os
import tempfile
import threading
import time
import unittest
from inventory_cache import InventoryCache, CURRENT_SCHEMA_VERSION


class TestInventoryCache(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".sqlite")
        self.temp_db.close()
        self.db_path = self.temp_db.name
        self.cache = InventoryCache(self.db_path)

    def tearDown(self):
        if os.path.exists(self.db_path):
            try:
                os.remove(self.db_path)
            except OSError:
                pass

    def test_immediate_launch_loading(self):
        # Empty launch load
        loaded = self.cache.load_cached_inventory()
        self.assertEqual(loaded["folder_count"], 0)
        self.assertEqual(loaded["item_count"], 0)
        self.assertIsNone(loaded["update_token"])

        # Populate full inventory
        full_data = {
            "folders": [
                {"folder_id": "f1", "parent_id": None, "name": "Objects", "type_default": 6},
                {"folder_id": "f2", "parent_id": "f1", "name": "Clothing", "type_default": 5}
            ],
            "items": [
                {"item_id": "i1", "folder_id": "f1", "name": "Shirt", "asset_id": "a1", "type": 5},
                {"item_id": "i2", "folder_id": "f2", "name": "Pants", "asset_id": "a2", "type": 5}
            ]
        }
        self.cache.reload_full_inventory(full_data, new_token="token_v1")

        # Create new cache instance pointing to same DB (simulating launch)
        new_cache_instance = InventoryCache(self.db_path)
        start_time = time.time()
        launch_loaded = new_cache_instance.load_cached_inventory()
        elapsed = time.time() - start_time

        self.assertEqual(launch_loaded["folder_count"], 2)
        self.assertEqual(launch_loaded["item_count"], 2)
        self.assertEqual(launch_loaded["update_token"], "token_v1")
        self.assertLess(elapsed, 0.05)  # Fast launch loading under 50ms

    def test_http_delta_updates(self):
        # Initial state
        full_data = {
            "folders": [{"folder_id": "f1", "parent_id": None, "name": "Root"}],
            "items": [{"item_id": "i1", "folder_id": "f1", "name": "Hat", "asset_id": "a1"}]
        }
        self.cache.reload_full_inventory(full_data, new_token="token_v1")

        # Apply delta update
        delta = {
            "folders_to_add_or_update": [{"folder_id": "f2", "parent_id": "f1", "name": "Subfolder"}],
            "items_to_add_or_update": [{"item_id": "i2", "folder_id": "f2", "name": "Shoes", "asset_id": "a2"}],
            "items_to_remove": ["i1"]
        }
        success = self.cache.apply_delta_update(delta, new_token="token_v2")
        self.assertTrue(success)

        self.assertEqual(self.cache.get_update_token(), "token_v2")
        self.assertIsNone(self.cache.get_item("i1"))  # Removed
        self.assertIsNotNone(self.cache.get_item("i2"))  # Added
        self.assertEqual(len(self.cache.get_folder_items("f2")), 1)

    def test_schema_mismatch_recovery(self):
        # Corrupt / modify schema_version table manually
        conn = self.cache._get_connection()
        conn.execute("UPDATE schema_version SET version = 999;")
        conn.commit()
        conn.close()

        # Initializing new instance should detect mismatch, wipe, and recreate cleanly
        new_cache = InventoryCache(self.db_path)
        loaded = new_cache.load_cached_inventory()
        self.assertEqual(loaded["folder_count"], 0)
        self.assertFalse(new_cache.is_corrupted())

    def test_database_corruption_recovery(self):
        # Overwrite file with corrupt bytes
        with open(self.db_path, "wb") as f:
            f.write(b"NOT_A_VALID_SQLITE_DATABASE_FILE")

        # Instantiating InventoryCache should handle corruption gracefully
        corrupt_cache = InventoryCache(self.db_path)
        loaded = corrupt_cache.load_cached_inventory()
        self.assertEqual(loaded["folder_count"], 0)

    def test_thread_safety(self):
        errors = []

        def worker_writer(thread_id):
            try:
                for i in range(20):
                    folder_id = f"f_{thread_id}_{i}"
                    item_id = f"i_{thread_id}_{i}"
                    delta = {
                        "folders_to_add_or_update": [{"folder_id": folder_id, "parent_id": None, "name": f"Folder {i}"}],
                        "items_to_add_or_update": [{"item_id": item_id, "folder_id": folder_id, "name": f"Item {i}", "asset_id": f"asset_{i}"}]
                    }
                    self.cache.apply_delta_update(delta, new_token=f"token_{thread_id}_{i}")
            except Exception as e:
                errors.append(e)

        def worker_reader():
            try:
                for _ in range(20):
                    self.cache.load_cached_inventory()
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)

        threads = []
        for t in range(3):
            threads.append(threading.Thread(target=worker_writer, args=(t,)))
            threads.append(threading.Thread(target=worker_reader))

        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(len(errors), 0, f"Thread safety errors encountered: {errors}")

    def test_cascading_deletes_and_deduplication(self):
        full_data = {
            "folders": [
                {"folder_id": "f_root", "parent_id": None, "name": "Root Folder"},
                {"folder_id": "f_sub", "parent_id": "f_root", "name": "Sub Folder"}
            ],
            "items": [
                {"item_id": "i_1", "folder_id": "f_sub", "name": "Item 1", "asset_id": "a1"},
                {"item_id": "i_2", "folder_id": "f_sub", "name": "Item 2", "asset_id": "a2"}
            ]
        }
        self.cache.reload_full_inventory(full_data, new_token="token_v1")
        self.assertEqual(len(self.cache.get_folder_items("f_sub")), 2)

        # Move item i_1 from f_sub to f_root
        delta_move = {
            "items_to_add_or_update": [{"item_id": "i_1", "folder_id": "f_root", "name": "Item 1", "asset_id": "a1"}]
        }
        self.cache.apply_delta_update(delta_move, new_token="token_v2")
        self.assertEqual(len(self.cache.get_folder_items("f_sub")), 1)
        self.assertEqual(len(self.cache.get_folder_items("f_root")), 1)

        # Cascading delete of folder f_sub
        delta_delete = {
            "folders_to_remove": ["f_sub"]
        }
        self.cache.apply_delta_update(delta_delete, new_token="token_v3")
        self.assertIsNone(self.cache.get_item("i_2"))  # Cascaded deletion
        self.assertIsNotNone(self.cache.get_item("i_1"))  # Preserved in f_root

    def test_chunked_full_inventory_reload(self):
        # 1. Dataset spanning multiple chunks (250 items, chunk_size=100)
        folders = [{"folder_id": f"f_{i}", "parent_id": None, "name": f"Folder {i}"} for i in range(250)]
        items = [{"item_id": f"i_{i}", "folder_id": f"f_{i}", "name": f"Item {i}", "asset_id": f"a_{i}"} for i in range(250)]
        full_data = {"folders": folders, "items": items}

        success = self.cache.reload_full_inventory(full_data, new_token="token_chunk_250", chunk_size=100)
        self.assertTrue(success)

        loaded = self.cache.load_cached_inventory()
        self.assertEqual(loaded["folder_count"], 250)
        self.assertEqual(loaded["item_count"], 250)
        self.assertEqual(loaded["update_token"], "token_chunk_250")
        self.assertEqual(self.cache.get_item("i_249")["name"], "Item 249")

        # 2. Dataset exact multiple of chunk size (200 items, chunk_size=100)
        folders_200 = [{"folder_id": f"f_{i}", "parent_id": None, "name": f"Folder {i}"} for i in range(200)]
        items_200 = [{"item_id": f"i_{i}", "folder_id": f"f_{i}", "name": f"Item {i}", "asset_id": f"a_{i}"} for i in range(200)]
        full_data_200 = {"folders": folders_200, "items": items_200}

        success_200 = self.cache.reload_full_inventory(full_data_200, new_token="token_chunk_200", chunk_size=100)
        self.assertTrue(success_200)

        loaded_200 = self.cache.load_cached_inventory()
        self.assertEqual(loaded_200["folder_count"], 200)
        self.assertEqual(loaded_200["item_count"], 200)

        # 3. Small dataset smaller than chunk size (5 items, chunk_size=100)
        folders_5 = [{"folder_id": f"f_{i}", "parent_id": None, "name": f"Folder {i}"} for i in range(5)]
        items_5 = [{"item_id": f"i_{i}", "folder_id": f"f_{i}", "name": f"Item {i}", "asset_id": f"a_{i}"} for i in range(5)]
        full_data_5 = {"folders": folders_5, "items": items_5}

        success_5 = self.cache.reload_full_inventory(full_data_5, new_token="token_chunk_5", chunk_size=100)
        self.assertTrue(success_5)

        loaded_5 = self.cache.load_cached_inventory()
        self.assertEqual(loaded_5["folder_count"], 5)
        self.assertEqual(loaded_5["item_count"], 5)

        # 4. Empty dataset
        success_empty = self.cache.reload_full_inventory({"folders": [], "items": []}, new_token="token_empty", chunk_size=100)
        self.assertTrue(success_empty)
        loaded_empty = self.cache.load_cached_inventory()
        self.assertEqual(loaded_empty["folder_count"], 0)
        self.assertEqual(loaded_empty["item_count"], 0)

    def test_chunked_delta_updates_across_boundaries(self):
        # Populate initial inventory
        initial_folders = [{"folder_id": f"f_{i}", "parent_id": None, "name": f"Folder {i}"} for i in range(150)]
        initial_items = [{"item_id": f"i_{i}", "folder_id": f"f_{i}", "name": f"Item {i}", "asset_id": f"a_{i}"} for i in range(150)]
        self.cache.reload_full_inventory({"folders": initial_folders, "items": initial_items}, new_token="token_v1")

        # Apply delta: update existing 150 items, add 100 new items (total 250), remove 100 items
        delta = {
            "folders_to_add_or_update": [{"folder_id": f"f_{i}", "parent_id": None, "name": f"Updated Folder {i}"} for i in range(150, 250)],
            "items_to_add_or_update": [{"item_id": f"i_{i}", "folder_id": f"f_0", "name": f"Updated Item {i}", "asset_id": f"a_{i}"} for i in range(150, 250)],
            "items_to_remove": [f"i_{i}" for i in range(100)]
        }

        success = self.cache.apply_delta_update(delta, new_token="token_v2", chunk_size=30)
        self.assertTrue(success)

        # Verify removals
        for i in range(100):
            self.assertIsNone(self.cache.get_item(f"i_{i}"))

        # Verify additions
        for i in range(150, 250):
            item = self.cache.get_item(f"i_{i}")
            self.assertIsNotNone(item)
            self.assertEqual(item["name"], f"Updated Item {i}")

    def test_chunk_size_invalid_fallback(self):
        folders = [{"folder_id": "f_1", "parent_id": None, "name": "Folder 1"}]
        items = [{"item_id": "i_1", "folder_id": "f_1", "name": "Item 1", "asset_id": "a_1"}]
        
        # Test chunk_size <= 0
        success_reload = self.cache.reload_full_inventory({"folders": folders, "items": items}, new_token="token_invalid", chunk_size=0)
        self.assertTrue(success_reload)
        self.assertEqual(self.cache.load_cached_inventory()["item_count"], 1)

        delta = {
            "items_to_add_or_update": [{"item_id": "i_2", "folder_id": "f_1", "name": "Item 2", "asset_id": "a_2"}]
        }
        success_delta = self.cache.apply_delta_update(delta, new_token="token_invalid_2", chunk_size=-10)
        self.assertTrue(success_delta)
        self.assertEqual(self.cache.load_cached_inventory()["item_count"], 2)


if __name__ == "__main__":
    unittest.main()
