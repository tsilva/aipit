import contextlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock, patch
from uuid import UUID

import add_secret


PROJECT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "organizationId": "22222222-2222-4222-8222-222222222222",
    "name": "aipit",
}
TOKEN = "synthetic-import-token"
VALUE = "synthetic-api-key"


def client_with(secrets=()):
    client = Mock()
    client.secrets.return_value.list.return_value = NS(success=True, data=NS(data=list(secrets)))
    client.secrets.return_value.create.return_value = NS(
        success=True, data=NS(key="OPENROUTER_API_KEY", project_id=UUID(PROJECT["id"]))
    )
    return client


class SecretSetupTests(unittest.TestCase):
    def test_cli_receives_token_only_in_environment(self):
        with patch.object(add_secret.subprocess, "run", return_value=NS(stdout=json.dumps([PROJECT]))) as run:
            self.assertEqual(add_secret.discover_project(TOKEN, "https://vault.bitwarden.com", None), PROJECT)
        args, options = run.call_args
        self.assertNotIn(TOKEN, " ".join(args[0]))
        self.assertEqual(options["env"]["BWS_ACCESS_TOKEN"], TOKEN)

    def test_ambiguous_project_does_not_choose_a_destination(self):
        with patch.object(add_secret.subprocess, "run", return_value=NS(stdout=json.dumps([PROJECT, PROJECT]))):
            with self.assertRaises(add_secret.SetupError):
                add_secret.discover_project(TOKEN, "https://vault.bitwarden.com", None)

    def test_creation_uses_selected_project(self):
        client = client_with()
        add_secret.create_secret(client, PROJECT, "OPENROUTER_API_KEY", lambda _: VALUE)
        args = client.secrets.return_value.create.call_args.args
        self.assertEqual(args[0], UUID(PROJECT["organizationId"]))
        self.assertEqual(args[2], VALUE)
        self.assertEqual(args[4], [UUID(PROJECT["id"])])

    def test_duplicate_is_not_overwritten_or_prompted(self):
        client = client_with([NS(key="OPENROUTER_API_KEY", project_ids=[UUID(PROJECT["id"])])])
        prompt = Mock()
        with self.assertRaises(add_secret.SetupError):
            add_secret.create_secret(client, PROJECT, "OPENROUTER_API_KEY", prompt)
        prompt.assert_not_called()
        client.secrets.return_value.create.assert_not_called()

    def test_empty_value_is_not_written(self):
        client = client_with()
        with self.assertRaises(add_secret.SetupError):
            add_secret.create_secret(client, PROJECT, "OPENROUTER_API_KEY", lambda _: " ")
        client.secrets.return_value.create.assert_not_called()

    def test_sdk_error_does_not_reveal_value(self):
        client = client_with()
        client.secrets.return_value.create.side_effect = RuntimeError(VALUE)
        with self.assertRaises(add_secret.SetupError) as failure:
            add_secret.create_secret(client, PROJECT, "OPENROUTER_API_KEY", lambda _: VALUE)
        self.assertNotIn(VALUE, str(failure.exception))

    def test_success_saves_only_nonsecret_configuration(self):
        client = client_with()
        client.auth.return_value.login_access_token.return_value = NS(success=True, data=NS(authenticated=True))
        output = io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(add_secret, "ROOT", Path(directory)), \
                 patch.object(add_secret.sys, "argv", ["add_secret.py"]), \
                 patch.object(add_secret.sys.stdin, "isatty", return_value=True), \
                 patch.object(add_secret.sys.stderr, "isatty", return_value=True), \
                 patch.object(add_secret.getpass, "getpass", side_effect=[TOKEN, VALUE]), \
                 patch.object(add_secret, "discover_project", return_value=PROJECT), \
                 patch("bitwarden_sdk.BitwardenClient", return_value=client), \
                 patch.dict(add_secret.os.environ, {}, clear=True), \
                 contextlib.redirect_stdout(output):
                add_secret.main()
            saved = (Path(directory) / ".bitwarden.local.json").read_text()
        self.assertEqual(json.loads(saved), {"projectId": PROJECT["id"], "serverUrl": "https://vault.bitwarden.com"})
        for secret in (TOKEN, VALUE):
            self.assertNotIn(secret, saved + output.getvalue())

    def test_pinned_sdk_accepts_creation_request_types(self):
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
        result = client.secrets().create(UUID(PROJECT["organizationId"]), "OPENROUTER_API_KEY", VALUE, "setup", [UUID(PROJECT["id"])])
        self.assertEqual(result.data.project_id, UUID(PROJECT["id"]))
        request = json.loads(native.run_command.call_args.args[0])["secrets"]["create"]
        self.assertEqual(request["value"], VALUE)
        self.assertEqual(request["projectIds"], [PROJECT["id"]])


if __name__ == "__main__":
    unittest.main()
