import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "talkbox-provider-evidence.py"
SPEC = importlib.util.spec_from_file_location("provider_evidence", SCRIPT)
provider = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provider)


def fixture_ids():
    return {str(1000 + n) for n in range(87)}, {str(3000 + n) for n in range(148)}


def fixture_pages(with_child=False):
    parents, _ = fixture_ids()
    records = [{"id": p, "name": "Synthetic", "subitems": []}
               for p in sorted(parents, key=int)]
    if with_child:
        records[0]["subitems"] = [{
            "id": "70001", "name": "Synthetic subtask",
            "parent_item": {"id": records[0]["id"]},
            "board": {"id": "18371220520"}
        }]
    return [{"cursor": None, "items": records}]


def fixture_assets():
    _, ids = fixture_ids()
    return [[{"id": i, "name": "synthetic.txt", "file_size": 17,
              "file_extension": "txt", "created_at": "2026-01-01",
              "uploaded_by": {"id": "42"}} for i in sorted(ids, key=int)]]


class ProviderEvidenceTests(unittest.TestCase):
    def test_complete_parent_set_proves_current_subitem_count(self):
        issues, _ = fixture_ids()
        result = provider.reconcile_parents(issues, fixture_pages())
        self.assertEqual(result["verified_source_parent_count"], 87)
        self.assertEqual(result["source_subitem_count"], 0)

    def test_child_identity_and_lineage_preserved(self):
        issues, _ = fixture_ids()
        result = provider.reconcile_parents(issues, fixture_pages(with_child=True))
        self.assertEqual(result["source_subitem_count"], 1)
        self.assertEqual(result["source_subitems"][0]["subitem_board_id"], "18371220520")

    def test_incomplete_pagination_is_rejected(self):
        issues, _ = fixture_ids()
        pages = fixture_pages()
        pages[0]["cursor"] = "unresolved"
        with self.assertRaisesRegex(ValueError, "pagination"):
            provider.reconcile_parents(issues, pages)

    def test_parent_id_omission_is_rejected(self):
        issues, _ = fixture_ids()
        pages = fixture_pages()
        pages[0]["items"].pop()
        with self.assertRaisesRegex(ValueError, "differs"):
            provider.reconcile_parents(issues, pages)

    def test_child_with_wrong_parent_is_rejected(self):
        issues, _ = fixture_ids()
        pages = fixture_pages(with_child=True)
        pages[0]["items"][0]["subitems"][0]["parent_item"]["id"] = "99999"
        with self.assertRaisesRegex(ValueError, "parent"):
            provider.reconcile_parents(issues, pages)

    def test_null_subitems_is_not_taken_as_zero(self):
        issues, _ = fixture_ids()
        pages = fixture_pages()
        pages[0]["items"][0]["subitems"] = None
        with self.assertRaisesRegex(ValueError, "did not enumerate"):
            provider.reconcile_parents(issues, pages)

    def test_complete_asset_metadata_does_not_claim_bytes(self):
        _, ids = fixture_ids()
        result = provider.reconcile_assets(ids, fixture_assets())
        self.assertEqual(result["metadata_count"], 148)
        self.assertEqual(result["verified_bytes_count"], 0)
        self.assertTrue(all(not row["bytes_verified"] for row in result["assets"]))
        self.assertTrue(all(row["file_sha256"] is None for row in result["assets"]))

    def test_missing_asset_is_rejected(self):
        _, ids = fixture_ids()
        batches = fixture_assets()
        batches[0].pop()
        with self.assertRaisesRegex(ValueError, "Missing"):
            provider.reconcile_assets(ids, batches)

    def test_duplicate_asset_is_rejected(self):
        _, ids = fixture_ids()
        batches = fixture_assets()
        batches[0].append(batches[0][0])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            provider.reconcile_assets(ids, batches)

    def test_invalid_file_size_is_rejected(self):
        _, ids = fixture_ids()
        batches = fixture_assets()
        batches[0][0]["file_size"] = 0
        with self.assertRaisesRegex(ValueError, "Invalid"):
            provider.reconcile_assets(ids, batches)

    def test_private_output_excludes_repository_and_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "evidence.json"
            value = {"ready_for_production": False}
            provider.save_private(target, value)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                provider.save_private(target, value)
        with self.assertRaisesRegex(ValueError, "repository"):
            provider.save_private(provider.REPOSITORY / "forbidden-private.json", value)

    def test_exact_source_inventory_expected(self):
        issues, media_ids = fixture_ids()
        manifest = {"source_board_id": provider.BOARD,
                    "workbook_sha256": provider.SOURCE_HASH,
                    "issues": [{"monday_item_id": i} for i in issues]}
        inventory = {"source_board_id": provider.BOARD,
                     "workbook_sha256": provider.SOURCE_HASH,
                     "asset_references": [{"source_asset_id": i} for i in media_ids]}
        self.assertEqual(provider.source_ids(manifest, inventory), (issues, media_ids))
        inventory["asset_references"].pop()
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            provider.source_ids(manifest, inventory)


if __name__ == "__main__":
    unittest.main()
