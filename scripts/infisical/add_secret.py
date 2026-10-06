"""Add an optional server key through a hidden prompt and verify the destination."""

import getpass
import sys

from common import Infisical, KEYS, SecretError


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in KEYS:
        raise SecretError("Specify one key declared in .keyenv.toml, for example OPENROUTER_API_KEY.")
    destination = Infisical()
    key = sys.argv[1]
    if key in destination.read():
        raise SecretError("That key already exists. Manage intentional updates in the Infisical dashboard.")
    if not sys.stdin.isatty():
        raise SecretError("Use an interactive terminal for the hidden secret prompt.")
    value = getpass.getpass(f"{key} (hidden): ")
    if not value.strip():
        raise SecretError("An empty secret cannot be added.")
    print(f"{key}: {destination.create_and_verify(key, value)}")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("Secret entry cancelled.", file=sys.stderr)
        sys.exit(130)
    except SecretError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Could not add secret; credential details suppressed.", file=sys.stderr)
        sys.exit(1)
