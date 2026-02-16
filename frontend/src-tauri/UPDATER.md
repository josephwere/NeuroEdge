# NeuroEdge Desktop Auto‑Updater

This project enables Tauri’s updater so you can publish updates in one place and all desktop users receive them.

## 1) Create signing keys (local only)
Do **not** commit private keys.

```
tauri signer generate -w ~/.config/tauri/neuroedge.key
```

It outputs:
- Public key (paste into `tauri.conf.json` `updater.pubkey`)
- Private key (keep secure)

## 1b) Add GitHub Secrets
Add these repository secrets (used by the CI workflow):
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The workflow also maps these to legacy env names for compatibility:
- `TAURI_PRIVATE_KEY`
- `TAURI_KEY_PASSWORD`

## 2) Configure update endpoint
`tauri.conf.json` is set to GitHub Releases:

```
https://github.com/josephwere/NeuroEdge/releases/latest/download/latest.json
```

If you want a different host, update this URL.

## 3) Publish releases (GitHub)
Build per OS and upload assets to GitHub Releases:

```
pnpm tauri:build
```

For each release:
- Windows: `.msi`
- macOS: `.dmg` or `.app.tar.gz`
- Linux: `.AppImage`

Also publish the update manifest (`latest.json`) signed with your private key.

## 4) Production flow
Users install once. Every new release is just:
1. Tag a release (e.g. `v0.1.1`)
2. GitHub Actions builds and uploads artifacts + `latest.json`
3. Users auto‑update
