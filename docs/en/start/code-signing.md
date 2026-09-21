# Code signing

**Current status: AI Agent SDX has no code signing configured.** This page explains what that means for you and what it would take to change it.

## Where things stand

| Platform | Signing status | What you hit on first launch |
| --- | --- | --- |
| macOS | Unsigned, not notarized | Gatekeeper blocks it. Right-click the icon and choose Open, or run `xattr -cr /Applications/SDX.app` first |
| Windows 10+ | Unsigned | SmartScreen shows "Windows protected your PC". Click More info → Run anyway |
| UOS 20 | Unsigned (Linux does not rely on code signing) | Installs normally, no extra prompt |

The upstream project [cc-haha](https://github.com/NanmiCoder/cc-haha) obtained free Windows code
signing through the SignPath Foundation. **That certificate belongs to upstream and has nothing to
do with AI Agent SDX** — AI Agent SDX neither uses nor may use it.

## What proper signing would require

**macOS** — an Apple Developer Program membership ($99/year) for a Developer ID Application
certificate, plus an app-specific password for notarization. The build already implements signing,
notarization and signing-chain verification (host, sidecar and cu-helper must share one certificate);
only the certificate itself is missing.

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
