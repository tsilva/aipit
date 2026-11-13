"""Check transport, readback and application isolation."""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from common import Infisical, SecretError

PROJECT = "533e0bdd-5b7d-493e-abbc-d3935a9bce7b"
VALUE = "dummy-only '$HOME' \"quoted\"\\backslash\nsecond line\n"


def row(value=VALUE, **overrides):
    return {
        "key": "SENTRY_AUTH_TOKEN",
        "value": value,
        "workspace": PROJECT,
        "secretPath": "/",
        "type": "shared",
        **overrides,
    }


class AdministrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.client = Infisical(self.root)

    def test_transport_is_stdin_only_and_exact(self):
        calls = []

        def cli(args, **kwargs):
            calls.append((args, kwargs))
            payload = [] if len(calls) == 1 else [row()]
            return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")

        with patch("common.subprocess.run", side_effect=cli):
            self.assertIn(
                "verified", self.client.create_and_verify("SENTRY_AUTH_TOKEN", VALUE)
            )
        args, kwargs = calls[1]
        self.assertNotIn(VALUE, " ".join(args))
        self.assertIn("SENTRY_AUTH_TOKEN=@/dev/stdin", args)
        self.assertEqual(kwargs["input"], VALUE)
        self.assertTrue(kwargs["capture_output"])
        self.assertIn("--expand=false", calls[0][0])
        self.assertIn("--secret-overriding=false", calls[0][0])


    def test_identical_existing_value_causes_no_write(self):
        with (
            patch.object(
                self.client, "read", return_value={"SENTRY_AUTH_TOKEN": VALUE}
            ),
            patch.object(self.client, "command") as command,
        ):
            self.assertIn(
                "already present",
                self.client.create_and_verify("SENTRY_AUTH_TOKEN", VALUE),
            )
            command.assert_not_called()


    def test_changed_readback_fails(self):
        with (
            patch.object(
                self.client,
                "read",
                side_effect=[{}, {"SENTRY_AUTH_TOKEN": "different"}],
            ),
            patch.object(self.client, "command"),
        ):
            with self.assertRaisesRegex(SecretError, "Readback"):
                self.client.create_and_verify("SENTRY_AUTH_TOKEN", VALUE)


    def test_destination_identity_and_duplicates_are_rejected(self):
        for rows in (
            [row(workspace="other-project")],
            [row(secretPath="/other")],
            [row(type="personal")],
            [row(), row()],
        ):
            with patch.object(self.client, "command", return_value=json.dumps(rows)):
                with self.assertRaises(SecretError):
                    self.client.read()


    def test_provider_error_details_never_escape(self):
        response = subprocess.CompletedProcess([], 1, VALUE, VALUE)
        with patch("common.subprocess.run", return_value=response):
            with self.assertRaises(SecretError) as error:
                self.client.read()
        self.assertNotIn(VALUE, str(error.exception))


if __name__ == "__main__": unittest.main()
