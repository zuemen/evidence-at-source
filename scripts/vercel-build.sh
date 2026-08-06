#!/bin/sh
# Vercel's build step.
#
# Self-locating: the previous version assumed the working directory was the
# repo root, and a Vercel project whose Root Directory points elsewhere made
# that "No such file or directory". Everything below runs relative to where
# this script actually lives, so the caller's cwd no longer matters.
#
# The build itself is one line; everything else exists because a failure on
# someone else's machine is only useful if it says why — printed *after* the
# failure, because the end of the log is the part a person copies.

cd "$(dirname "$0")/.." || exit 1

if npm run build --workspace @eas/web; then
  exit 0
fi

echo ""
echo "===== BUILD DIAGNOSTICS (paste from here down) ====="
echo "cwd: $(pwd)"
echo "node: $(node -v)   npm: $(npm -v)"
echo "--- vite resolved? ---"
npm ls vite --workspace @eas/web || true
echo "--- react plugin resolved? ---"
npm ls @vitejs/plugin-react --workspace @eas/web || true
echo "--- browser-bundled deps resolved? ---"
npm ls snarkjs circomlibjs --workspace @eas/web || true
echo "--- circuit artifacts present? ---"
ls -l packages/web/public/zk || true
echo "===== END DIAGNOSTICS ====="

exit 1
