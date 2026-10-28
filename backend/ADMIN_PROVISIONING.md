# One-time administrator provisioning

`npm run seed-admin` no longer contains a default administrator password. It first checks whether an admin already exists and exits without creating or changing an account if so. If no admin exists, it requires all of the following values to be injected into the process environment by a trusted local secret manager or deployment operator:

- `ADMIN_BOOTSTRAP_NAME`
- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD` (at least 16 characters)

Do not put these bootstrap values in source control, a committed example file, shell command arguments, or application logs. Prefer an ephemeral environment injection for this one command. The password is hashed before database insertion and removed from the script process environment after a successful invocation. The script does not print the configured identity or credential values. If configuration is incomplete and no admin exists, it exits without creating an account. If an admin already exists, a repeat run creates no additional admin and does not require the bootstrap values.

The script also refuses to take over an email already used by a non-admin account. Run it only against the intended database after verifying the deployment's database target through the operator's secure configuration process. Do not use this script to reset an existing administrator password.

This bootstrap procedure creates the website's database admin only. It does not deploy ProductRegistry V2, change its immutable contract admin, or grant any on-chain role.

## Credential cleanup notice

The current working copy replaces a private-key-shaped value in the tracked blockchain example file with a nonfunctional placeholder. A prior committed version of `blockchain/INTEGRATION.md` and the prior committed admin bootstrap implementation also contained credential-shaped/default credential material. No values are repeated here. Rotate the affected wallet credential if it was genuine and reset any admin account that may have used the old bootstrap password. Removing a value from the current working tree does not remove it from Git history; history cleanup is a separate, coordinated decision and is not performed here.
