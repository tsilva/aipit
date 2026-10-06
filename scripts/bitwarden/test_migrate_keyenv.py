import contextlib
import io
import json
import unittest
from types import SimpleNamespace as NS
from unittest.mock import Mock, patch
from uuid import UUID

import migrate_keyenv
from add_secret import SetupError
from test_add_secret import PROJECT, TOKEN, VALUE


def stored(name, value=VALUE, project_id=None):
    return NS(
        id=UUID("33333333-3333-4333-8333-333333333333"), key=name, value=value,
        organization_id=UUID(PROJECT["organizationId"]),
        project_id=project_id or UUID(PROJECT["id"]),
    )


def client_with(entries=()):
    client = Mock()
    client.secrets.return_value.list.return_value = NS(success=True, data=NS(data=list(entries)))
    client.secrets.return_value.create.return_value = NS(success=True, data=stored("OPENROUTER_API_KEY"))
    client.secrets.return_value.get.return_value = NS(success=True, data=stored("OPENROUTER_API_KEY"))
    return client


class KeyenvMigrationTests(unittest.TestCase):
    def test_copies_and_reads_back_value_without_output(self):
        client = client_with()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = migrate_keyenv.migrate(client, PROJECT, {"OPENROUTER_API_KEY": VALUE})
        args = client.secrets.return_value.create.call_args.args
        self.assertEqual(args[2], VALUE)
        self.assertEqual(args[4], [UUID(PROJECT["id"])])
        client.secrets.return_value.get.assert_called_once()
        self.assertEqual(status["OPENROUTER_API_KEY"], "copied; verified matching")
        self.assertNotIn(VALUE, output.getvalue())

    def test_matching_entry_is_skipped(self):
        entry = NS(id="existing", key="OPENROUTER_API_KEY", project_ids=[UUID(PROJECT["id"])])
        client = client_with([entry])
        status = migrate_keyenv.migrate(client, PROJECT, {"OPENROUTER_API_KEY": VALUE})
        client.secrets.return_value.create.assert_not_called()
        self.assertEqual(status["OPENROUTER_API_KEY"], "already present; verified matching")

    def test_conflict_prevents_all_writes_even_when_other_key_is_new(self):
        entry = NS(id="existing", key="OPENROUTER_API_KEY", project_ids=[UUID(PROJECT["id"])])
        client = client_with([entry])
        client.secrets.return_value.get.return_value.data.value = "different"
        with self.assertRaises(SetupError):
            migrate_keyenv.migrate(client, PROJECT, {"R2_ACCESS_KEY_ID": VALUE, "OPENROUTER_API_KEY": VALUE})
        client.secrets.return_value.create.assert_not_called()

    def test_duplicate_entry_prevents_writes(self):
        entry = NS(id="existing", key="OPENROUTER_API_KEY", project_ids=[UUID(PROJECT["id"])])
        client = client_with([entry, entry])
        with self.assertRaises(SetupError):
            migrate_keyenv.migrate(client, PROJECT, {"OPENROUTER_API_KEY": VALUE})
        client.secrets.return_value.create.assert_not_called()

    def test_wrong_readback_project_is_rejected(self):
        client = client_with()
        client.secrets.return_value.get.return_value.data.project_id = UUID("44444444-4444-4444-8444-444444444444")
        with self.assertRaises(SetupError):
            migrate_keyenv.migrate(client, PROJECT, {"OPENROUTER_API_KEY": VALUE})

    def test_error_response_does_not_expose_value(self):
        client = client_with()
        client.secrets.return_value.get.side_effect = RuntimeError(VALUE)
        with self.assertRaises(SetupError) as failure:
            migrate_keyenv.migrate(client, PROJECT, {"OPENROUTER_API_KEY": VALUE})
        self.assertNotIn(VALUE, str(failure.exception))

    def test_main_removes_credentials_before_metadata_and_saves_only_configuration(self):
        output = io.StringIO()
        def discover(token, server, configured_id):
            self.assertEqual(token, TOKEN)
            self.assertNotIn("OPENROUTER_API_KEY", migrate_keyenv.os.environ)
            self.assertNotIn("BWS_ACCESS_TOKEN", migrate_keyenv.os.environ)
            return PROJECT
        with patch.dict(migrate_keyenv.os.environ, {"OPENROUTER_API_KEY": VALUE, "BWS_ACCESS_TOKEN": TOKEN}, clear=True), \
             patch.object(migrate_keyenv, "configuration", return_value=({}, "https://vault.bitwarden.com")), \
             patch.object(migrate_keyenv, "discover_project", side_effect=discover), \
             patch.object(migrate_keyenv, "authenticated_client", return_value=client_with()), \
             patch.object(migrate_keyenv, "save_configuration") as save, \
             patch.object(migrate_keyenv.getpass, "getpass") as prompt, \
             contextlib.redirect_stdout(output):
            migrate_keyenv.main()
        save.assert_called_once_with(migrate_keyenv.ROOT, PROJECT, "https://vault.bitwarden.com")
        prompt.assert_not_called()
        for secret in (VALUE, TOKEN):
            self.assertNotIn(secret, output.getvalue())
        self.assertIn("R2_SECRET_ACCESS_KEY: absent from keyenv; skipped", output.getvalue())

    def test_pinned_sdk_accepts_readback_identifier(self):
        from bitwarden_sdk import BitwardenClient
        client = BitwardenClient()
        native = Mock()
        native.run_command.return_value = json.dumps({
            "success": True, "data": {
                "id": "33333333-3333-4333-8333-333333333333",
                "organizationId": PROJECT["organizationId"], "projectId": PROJECT["id"],
                "key": "OPENROUTER_API_KEY", "value": VALUE, "note": "setup",
                "creationDate": "2026-10-05T00:00:00Z", "revisionDate": "2026-10-05T00:00:00Z",
            },
        })
        client.inner = native
        migrate_keyenv.verified_secret(client, UUID("33333333-3333-4333-8333-333333333333"), PROJECT, "OPENROUTER_API_KEY", VALUE)


if __name__ == "__main__":
    unittest.main()
