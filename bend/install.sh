#!/bin/sh
set -eu
VER=2.0.38
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) target=darwin-arm64 sum=9d5331d01e82dac40dd012953e78221f533f7df7ad7e16b07f1f7bd0dcd088dd ;;
  Darwin-x86_64) target=darwin-x64 sum=870be3b91290e14259dba432788c71d7190d8984f8606255e5333c3a03896d5a ;;
  Linux-aarch64 | Linux-arm64) target=linux-arm64 sum=1f7c6e74a6ef7412cf08eee0e4d45fe5960f89d66fdaca2466f6a4856f0d400a ;;
  Linux-x86_64) target=linux-x64 sum=f19d088b079c9e1a8834ecd153b7d58c11a5f8f9ab1bdb78dbc96a6bf49aaa81 ;;
  *) echo "bend $VER has no build for $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac
home="${BEND_HOME:-$HOME/.bend}"
name="bend-$VER-$target.tar.gz"
mkdir -p "$home/bin"
tmp=$(mktemp -d "$home/tmp.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
curl --proto '=https' --tlsv1.2 -fsSL -o "$tmp/$name" "https://github.com/bendlang/bend/releases/download/v$VER/$name"
if command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$tmp/$name"); else got=$(shasum -a 256 "$tmp/$name"); fi
got=${got%% *}
[ "$got" = "$sum" ] || { echo "$name has sha256 $got, expected $sum; not installed" >&2; exit 1; }
tar -xzf "$tmp/$name" -C "$tmp"
rm -rf "$home/bend2" "$home/guide"
mv "$tmp/bend/bend2" "$tmp/bend/guide" "$home/"
mv -f "$tmp/bend/bin/bend" "$home/bin/bend"
found=$(BEND_NO_TELEMETRY=1 "$home/bin/bend" version)
[ "$found" = "bend $VER" ] || { echo "installed bend says '$found', expected 'bend $VER'" >&2; exit 1; }
echo "$found installed in $home/bin"
