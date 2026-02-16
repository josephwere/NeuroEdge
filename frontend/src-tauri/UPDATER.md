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

## 2) Configure update endpoint
`tauri.conf.json` is set to:

```
https://releases.goldegelabs.com/neuroedge/{{target}}/{{current_version}}
```

You can replace this with:
- GitHub Releases endpoint
- Your own release server

## 3) Publish releases
Build per OS and upload assets to the endpoint used above:

```
pnpm tauri:build
```

For each release, publish:
- Windows: `.msi`
- macOS: `.dmg` or `.app.tar.gz`
- Linux: `.AppImage`

Also publish the update manifest (`latest.json`) for each target, signed with your private key.

## 4) Production flow
Users install once. Every new release is just:
1. Build per OS
2. Upload artifacts + manifest
3. Users auto‑update
