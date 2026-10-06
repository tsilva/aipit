"""Copy aipit's keyenv-injected credentials into Bitwarden and verify them."""

import getpass
import hmac
import logging
import os
import sys
import warnings
from uuid import UUID

from add_secret import (
    PROJECT_NAME, ROOT, SECRET_NAMES, SetupError, authenticated_client,
    configuration, discover_project, save_configuration,
)


def verified_secret(client, identifier, project, name, expected):
    response = client.secrets().get(identifier)
    if not response.success or response.data is None:
        raise SetupError(f"Could not verify {name}. Check Bitwarden before retrying.")
    secret = response.data
    if (secret.key != name or secret.project_id != UUID(project["id"])
            or secret.organization_id != UUID(project["organizationId"])):
        raise SetupError(f"Unexpected destination for {name}; nothing was overwritten.")
    if not hmac.compare_digest(secret.value.encode(), expected.encode()):
        raise SetupError(f"Bitwarden has a different value for {name}; nothing was overwritten. Resolve it before retrying.")


def migrate(client, project, source):
    """Preflight existing entries before any writes; retry safely after partial success."""
    try:
        metadata = client.secrets().list(project["organizationId"])
        if not metadata.success or metadata.data is None:
            raise SetupError("Could not inspect the destination; nothing was added.")
        existing = {}
        for secret in metadata.data.data:
            if secret.key in source and UUID(project["id"]) in secret.project_ids:
                if secret.key in existing:
                    raise SetupError(f"Bitwarden has duplicate entries for {secret.key}; nothing was added.")
                existing[secret.key] = secret.id
        for name, identifier in existing.items():
            verified_secret(client, identifier, project, name, source[name])
        statuses = {}
        for name, value in source.items():
            if name in existing:
                statuses[name] = "already present; verified matching"
                continue
            response = client.secrets().create(
                UUID(project["organizationId"]), name, value,
                "Copied from aipit keyenv; Keychain original retained", [UUID(project["id"])],
            )
            if not response.success or response.data is None:
                raise SetupError(f"Creation of {name} was not confirmed. Check Bitwarden before retrying.")
            verified_secret(client, response.data.id, project, name, value)
            statuses[name] = "copied; verified matching"
        return statuses
    except SetupError:
        raise
    except Exception:
        raise SetupError("Transfer failed or its outcome is uncertain. Keychain originals remain. Check Bitwarden before retrying; existing matching values will be skipped.") from None


def main():
    warnings.simplefilter("error", getpass.GetPassWarning)
    logging.disable(logging.CRITICAL)
    os.environ["RUST_LOG"] = "off"
    # Remove app credentials from the environment before invoking any metadata CLI.
    source = {name: value for name in SECRET_NAMES if (value := os.environ.pop(name, None))}
    if not source:
        raise SetupError("No credentials were supplied by keyenv; nothing was added.")
    settings, server = configuration(ROOT)
    token = os.environ.pop("BWS_ACCESS_TOKEN", "").strip()
    if not token:
        if not sys.stdin.isatty() or not sys.stderr.isatty():
            raise SetupError("Supply BWS_ACCESS_TOKEN or run the migration in an interactive terminal for hidden input.")
        token = getpass.getpass("Temporary Bitwarden write token (hidden): ").strip()
    if not token:
        raise SetupError("No token supplied; nothing was added.")
    project = discover_project(token, server, os.environ.get("BWS_PROJECT_ID") or settings.get("projectId"))
    print(f"Destination: {PROJECT_NAME} on {server}", flush=True)
    client = authenticated_client(token, server)
    for name, status in migrate(client, project, source).items():
        print(f"{name}: {status}")
    for name in SECRET_NAMES:
        if name not in source:
            print(f"{name}: absent from keyenv; skipped")
    save_configuration(ROOT, project, server)
    print("Transfer verified. Keychain originals retained. Revoke the write token after testing read-only access.")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled. Keychain originals retained.", file=sys.stderr)
        sys.exit(1)
    except SetupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Transfer failed. Error details were suppressed to protect credentials. Keychain originals retained.", file=sys.stderr)
        sys.exit(1)
