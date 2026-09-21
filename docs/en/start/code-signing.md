# Code signing

**Current status: macOS is signed and notarized; Windows and UOS are not.** This page explains what
that means for you.

## Where things stand

| Platform | Signing status | What you hit on first launch |
| --- | --- | --- |
| macOS | Developer ID signed, Apple notarized, ticket stapled | Opens normally, no prompt. You do **not** need right-click → Open, and you should not run `xattr -cr` |
| Windows 10+ | Unsigned | SmartScreen shows "Windows protected your PC". Click More info → Run anyway |
| UOS 20 | Unsigned (Linux does not rely on code signing) | Installs normally, no extra prompt |

You can check the macOS side yourself. Both the `.app` and the `.dmg` should give this:

```bash
spctl -a -t exec -vv "/Applications/AI Agent SDX.app"
# accepted
# source=Notarized Developer ID

xcrun stapler validate "/Applications/AI Agent SDX.app"
# The validate action worked!
```

The ticket is stapled to the disk image itself so the first check does not need the network.
`electron-builder` notarizes only the `.app` and leaves the `.dmg` unsigned, so under `NOTARIZE=1`
the build script signs, submits and staples the image as a second pass.

If `spctl` says `rejected`, do not work around it. That means the package did not come from this
project's releases, or it was modified in transit.

The upstream project [cc-haha](https://github.com/NanmiCoder/cc-haha) obtained free Windows code
signing through the SignPath Foundation. **That certificate belongs to upstream and has nothing to
do with AI Agent SDX** — AI Agent SDX neither uses nor may use it.

## What proper signing would require

**macOS** — done. A Developer ID Application certificate and an app-specific password; the build
handles signing, notarization, stapling and signing-chain verification (host, sidecar and cu-helper
must share one certificate, or Computer Use's caller attestation rejects the chain).

**Windows** — two options:

- apply to the [SignPath Foundation](https://signpath.org) for free open-source signing, which
  requires a public project with some community track record;
- or buy an OV / EV code signing certificate yourself. EV clears SmartScreen immediately; OV has to
  build reputation first.

The configuration under `.github/signpath/` is inherited from upstream and must be replaced wholesale
when AI Agent SDX has its own signing channel.

## Verifying a download until then

Download only from this project's [GitHub Releases](https://github.com/berlee-max/SDX/releases) and
check the hash:

```bash
# macOS / Linux
shasum -a 256 SDX-<version>-*.dmg

# Windows PowerShell
Get-FileHash .\SDX-<version>-win-x64.exe -Algorithm SHA256
```

Each release lists the SHA-256 of every artifact. If a hash does not match, do not install it.

## Reporting a security problem

If you suspect misuse of the build process, release artifacts, or (in future) signing accounts,
report it through a [private GitHub security advisory](https://github.com/berlee-max/SDX/security/advisories/new)
or by email to [ribbernlee@gmail.com](mailto:ribbernlee@gmail.com).

See [Privacy and network access](./privacy.md) for the software's network and local-data behavior.
