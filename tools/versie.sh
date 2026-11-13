#!/bin/sh
# Zet een nieuw versienummer achter alle eigen scripts en de stylesheet,
# zodat browsers na een update meteen de nieuwe bestanden laden.
# Gebruik: sh tools/versie.sh   (vóór elke commit met wijzigingen in js/ of css/)
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M%S)
for f in js/*.js js/pages/*.js; do
  sed -i -E "s#(['\"])(\.{1,2}/[A-Za-z0-9_./-]+\.js)(\?v=[0-9]+)?\1#\1\2?v=$V\1#g" "$f"
done
sed -i -E "s#(js/app\.js|css/style\.css|js/vendor/lucide\.min\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" index.html
echo "versie $V"
