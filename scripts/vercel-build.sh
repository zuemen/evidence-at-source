#!/bin/sh
# Vercel's build step.
#
# The build itself is one line; everything else here exists because a failure
# on someone else's machine is only useful if it says why. Vercel truncates
# nothing, but the part a person copies out of a failed deploy is the end of
# the log — so the diagnostics print *after* the failure, not before it.
#
# Kept in a file rather than inline in vercel.json because buildCommand is
# capped at 256 characters.

if npm run build --workspace @eas/web; then
  exit 0
fi

echo ""
echo "===== BUILD DIAGNOSTICS (paste from here down) ====="
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
